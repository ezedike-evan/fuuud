import "server-only";
import { generateText } from "ai";
import { chatModel } from "./model.ts";
import { composeSystem, persist, recallAll, type StoredReport } from "./chat-core.ts";
import { buildPlanWeek } from "./plan-week.ts";
import { kvGet, kvIncr, kvSet, kvSetNX } from "./kv.ts";
import { describeMemoryFailure } from "./memory-errors.ts";
import { namespaceOfKind, writeStatus } from "./memory-core.ts";
import { runInScope } from "./memwal-scope.ts";
import { NO_KEY_CODE } from "./providers.ts";
import { credsOf, getGrant } from "./oauth/grants.ts";
import { isDevMockCreds, devMockEnabled } from "./oauth/dev.ts";
import { bindingKey, downloadTelegramFile, ensureCommands, sendTelegramMessage, type ChatBinding, type TelegramVoice, type Update } from "./telegram.ts";
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "./stt.ts";
import { TranscribeError, transcribe } from "./transcribe.ts";
import { formatMemory, parseCommand, splitMessage, toPlain } from "./telegram-text.ts";

/**
 * Chatting with Fuuud inside Telegram.
 *
 * The same turn as the website (lib/chat-core): recall, one model call, the write
 * gate. What differs is who is speaking. A Telegram message carries no browser
 * session, so the chat acts with ITS OWN delegate key - minted in the browser when
 * the person pressed Connect Telegram, stored sealed on the server as a grant, and
 * revocable on its own (Settings -> Connected apps, or remove the key onchain).
 *
 * Fails closed like the web app: if the record cannot be read, the bot says so and
 * does not guess at conditions.
 */

const MESSAGES_PER_MINUTE = 8;
const LAST_REPLY_TTL_S = 900;
const FOLLOW_UP_MS = 120_000;
const POLL_MS = 2_000;

const send = (chatId: string, text: string) =>
  Promise.all(splitMessage(toPlain(text)).map((part) => sendTelegramMessage(chatId, part))).then(() => undefined);

const sendHtml = (chatId: string, html: string) =>
  Promise.all(splitMessage(html).map((part) => sendTelegramMessage(chatId, part, { html: true }))).then(() => undefined);

const typing = (chatId: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return Promise.resolve();
  return fetch(`${process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org"}/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).then(() => undefined, () => undefined);
};

const HELP =
  "Ask me anything about food. Tell me an allergy, a condition or something you dislike and I will remember it.\n\n" +
  "/memory - what I know about you\n/help - this message\n\n" +
  "To forget something or disconnect me, open Settings in Fuuud. I am not a doctor.";

/** Entry point for every non-link update. Never throws: a webhook handler must not make Telegram retry. */
export async function handleChatUpdate(update: Update): Promise<void> {
  const msg = update.message;
  if (!msg || msg.chat.type !== "private" || (!msg.text && !msg.voice)) return;
  const chatId = String(msg.chat.id);
  try {
    void ensureCommands();
    await respond(update.update_id, chatId, msg.text ?? null, msg.voice ?? null);
  } catch (error) {
    console.error("[fuuud] telegram chat failed:", error instanceof Error ? error.message : error);
    await send(chatId, "Something went wrong on my side. Try again in a moment.").catch(() => {});
  }
}

async function respond(updateId: number, chatId: string, typed: string | null, voice: TelegramVoice | null) {
  // Telegram redelivers an update it thinks failed; answering twice would also write twice.
  if (!(await kvSetNX(`tg:upd:${updateId}`, 1, 3600).catch(() => true))) return;

  const minute = Math.floor(Date.now() / 60_000);
  const count = await kvIncr(`tg:rl:${chatId}:${minute}`, 120).catch(() => 0);
  if (count > MESSAGES_PER_MINUTE) {
    if (count === MESSAGES_PER_MINUTE + 1) await send(chatId, "One moment, I am getting messages faster than I can answer.");
    return;
  }

  const binding = await kvGet<ChatBinding>(bindingKey(chatId));
  if (!binding) {
    await send(chatId, "This chat is not connected to a Fuuud account. Open Settings in Fuuud and press Connect Telegram.");
    return;
  }
  const grant = binding.grantId ? await getGrant(binding.grantId) : null;
  const creds = grant && grant.owner === binding.address.toLowerCase() ? credsOf(grant) : null;
  if (!grant || !creds || creds.owner !== binding.address.toLowerCase()) {
    await send(chatId, "I can no longer reach your memory from this chat. Open Settings in Fuuud and connect Telegram again.");
    return;
  }
  const mock = isDevMockCreds(creds);
  if (mock && !devMockEnabled()) return;

  // A voice note becomes text here, AFTER the checks above, so a stranger's audio is never sent for transcription.
  let text = typed ?? "";
  if (voice) {
    const heard = await hear(chatId, voice);
    if (!heard) return;
    text = heard;
  }

  const command = parseCommand(text);
  if (command?.cmd === "help" || command?.cmd === "start") return void (await send(chatId, HELP));

  void typing(chatId);
  await runInScope({ creds: mock ? null : creds, maxWaitMs: 20_000 }, async () => {
    if (command?.cmd === "memory") return void (await describeMemory(chatId, binding.address));
    if (command) return void (await send(chatId, "I do not know that command. /help lists them."));
    await chatTurn(chatId, binding.address, text);
  });
}

/**
 * Voice note -> text. The transcript is echoed back before the agent answers: a misheard
 * allergy is the one error this app cannot afford, and the echo lets the person see it
 * and say it again. Returns null after telling the person why when it cannot continue.
 */
async function hear(chatId: string, voice: TelegramVoice): Promise<string | null> {
  if ((voice.duration ?? 0) > MAX_AUDIO_SECONDS || (voice.file_size ?? 0) > MAX_AUDIO_BYTES) {
    await send(chatId, `That voice note is too long. Keep it under ${MAX_AUDIO_SECONDS} seconds, or type it.`);
    return null;
  }
  void typing(chatId);
  try {
    const { bytes } = await downloadTelegramFile(voice.file_id);
    // Telegram voice notes are Ogg/Opus. There is no browser here, so the deployment's key is used.
    const said = await transcribe(bytes, "audio/ogg", { useCookieKey: false });
    if (!said) {
      await send(chatId, "I could not make out any words in that. Try again a little closer to the phone, or type it.");
      return null;
    }
    await send(chatId, `🎙 I heard: “${said}”\n\nIf that is not right, say it again.`);
    return said;
  } catch (error) {
    console.error("[fuuud] telegram voice failed:", error instanceof Error ? error.message : error);
    await send(
      chatId,
      error instanceof TranscribeError && error.code === "no-key"
        ? "Voice notes are not switched on for this server yet. Type your message instead."
        : "I could not read that voice note. Try again, or type it.",
    );
    return null;
  }
}

async function describeMemory(chatId: string, address: string) {
  let recalled;
  try {
    recalled = await recallAll(address, "everything I should know");
  } catch (error) {
    return void (await send(chatId, describeMemoryFailure(error).message));
  }
  const { activeHealth, activeFeedback } = composeSystem(recalled.health, recalled.feedback);
  await sendHtml(chatId, formatMemory([...activeHealth, ...activeFeedback].map((f) => f.text)));
}

async function chatTurn(chatId: string, address: string, text: string) {
  const asked = (await kvGet<string>(`tg:last:${chatId}`).catch(() => null)) ?? "";

  let recalled;
  try {
    recalled = await recallAll(address, text);
  } catch (error) {
    console.error("[fuuud] telegram recall failed:", error instanceof Error ? error.message : error);
    const failure = describeMemoryFailure(error);
    await send(
      chatId,
      failure.kind === "key-refused"
        ? "I cannot read your memory: Walrus Memory refused this chat's key, so I will not guess at your conditions. Open Settings in Fuuud and connect Telegram again."
        : "I cannot reach your memory right now, so I will not guess at your conditions. Try again in a moment.",
    );
    return;
  }

  const writing = persist(address, text, asked);
  const { system } = composeSystem(recalled.health, recalled.feedback);

  let reply: string;
  try {
    const { text: answer } = await generateText({
      model: await chatModel(),
      system: asked ? `${system}\n\nYour previous message in this chat was:\n"""\n${asked}\n"""` : system,
      messages: [{ role: "user", content: text }],
    });
    reply = answer.trim() || "I did not have an answer for that. Try rephrasing.";
  } catch (error) {
    await writing.catch(() => undefined);
    const noKey = error instanceof Error && error.message.includes(NO_KEY_CODE);
    console.error("[fuuud] telegram model failed:", error instanceof Error ? error.message : error);
    await send(chatId, noKey ? "No model key is configured on this server, so I cannot answer yet." : "I could not generate an answer. Try again in a moment.");
    return;
  }

  const stored = await writing;
  await send(chatId, `${reply}${receipt(stored)}`);
  await kvSet(`tg:last:${chatId}`, reply, LAST_REPLY_TTL_S).catch(() => undefined);

  if (stored.written.length) {
    // A new fact can make a scheduled meal unsafe: re-screen the plan, as the web chat does.
    await buildPlanWeek(address).catch(() => undefined);
    if (stored.jobs?.length) await followUp(chatId, address, stored);
  }
}

/** What happened to the write, in a line. Never says saved before Walrus confirms. */
function receipt(stored: StoredReport): string {
  if (stored.failed) return `\n\n⚠ I could not save that: ${stored.failed}`;
  if (stored.jobs?.length) return `\n\n⏳ Saving ${stored.written.length} fact${stored.written.length === 1 ? "" : "s"} to Walrus…`;
  if (stored.written.length) return `\n\n✓ Saved ${stored.written.length} fact${stored.written.length === 1 ? "" : "s"} to Walrus.`;
  return "";
}

/** Follow the relayer jobs and say how they ended, like the website's save chip. */
async function followUp(chatId: string, address: string, stored: StoredReport) {
  const jobs = stored.jobs ?? [];
  const deadline = Date.now() + FOLLOW_UP_MS;
  const state = new Map<string, string>();
  let problem: string | null = null;

  while (Date.now() < deadline && jobs.some((j) => state.get(j.jobId) !== "done") && !problem) {
    for (const job of jobs) {
      if (state.get(job.jobId) === "done") continue;
      const namespace = namespaceOfKind(job.kind, address);
      if (!namespace) continue;
      try {
        const { state: s, error } = await writeStatus(namespace, job.jobId);
        state.set(job.jobId, s);
        if (s === "failed" || s === "not_found") problem = error ?? s;
      } catch {
        // transient: keep polling
      }
    }
    if (jobs.some((j) => state.get(j.jobId) !== "done") && !problem) await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (problem) await send(chatId, `⚠ Walrus did not finish saving: ${problem}`);
  else if (jobs.every((j) => state.get(j.jobId) === "done")) await send(chatId, `✓ Saved ${jobs.length} fact${jobs.length === 1 ? "" : "s"} to Walrus.`);
  else await send(chatId, "Still saving to Walrus. The Settings page shows it once it lands.");
}
