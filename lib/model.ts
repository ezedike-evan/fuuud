/**
 * Bring your own key.
 *
 * Nothing in this project is tied to one model vendor. A key can arrive two
 * ways and both are first class:
 *
 *   1. From the person using the app, entered in Settings and held encrypted
 *      in their own cookie (lib/keys.ts). This is what a visitor to a deployed
 *      instance uses — they spend their own credit, not the operator's.
 *   2. From the environment, set by whoever deployed it. This is what a local
 *      clone or a single-tenant deployment uses.
 *
 * The person's own key wins when both exist, because they are the one paying
 * for it and the one who just chose it.
 *
 * Two jobs, deliberately separated:
 *   chatModel()    — talks to the person. Wants the best model available.
 *   extractModel() — the write gate. Reads one turn and emits structured JSON.
 *                    A small fast model is correct here, and it runs on every
 *                    single turn, so the cheap tier is the right default.
 */
import "server-only";
import type { LanguageModelV1 } from "ai";
import { PROVIDERS, ORDER, isProvider, NO_KEY_CODE, type Provider } from "./providers.ts";
import { readKeyBag, type KeyBag } from "./keys.ts";

export type { Provider };

/** The key for one provider, and where it came from. */
function keyFor(provider: Provider, bag: KeyBag): string | null {
  const own = bag.keys[provider]?.trim();
  if (own) return own;
  const env = process.env[PROVIDERS[provider].env]?.trim();
  return env || null;
}

export function availableProviders(bag: KeyBag): Provider[] {
  return ORDER.filter((p) => Boolean(keyFor(p, bag)));
}

/**
 * Which provider answers this request. The person's pinned choice wins, then
 * KM_MODEL_PROVIDER for a deployment that wants to force one, then whichever
 * key happens to exist.
 */
export function resolveProvider(bag: KeyBag): Provider {
  const chosen = bag.active;
  if (chosen && keyFor(chosen, bag)) return chosen;

  const pinned = process.env.KM_MODEL_PROVIDER?.trim().toLowerCase();
  if (pinned) {
    if (!isProvider(pinned)) {
      throw new Error(`KM_MODEL_PROVIDER="${pinned}" is not one of: ${ORDER.join(", ")}`);
    }
    if (!keyFor(pinned, bag)) {
      throw new Error(`KM_MODEL_PROVIDER is "${pinned}" but no key for it is set.`);
    }
    return pinned;
  }

  const found = availableProviders(bag)[0];
  if (!found) {
    /*
     * Prefixed with a code the UI can branch on. Without it the browser gets a
     * sentence it can only print — and "add a key" is an action, not a message,
     * so the chat needs to be able to offer the settings panel instead of a
     * useless Try again.
     */
    throw new Error(
      `${NO_KEY_CODE}: No model key yet. Add one in Settings, or set any of ` +
        `${ORDER.map((p) => PROVIDERS[p].env).join(", ")} on the server.`,
    );
  }
  return found;
}

// Each factory is given the key explicitly rather than left to read the
// environment, because the key usually is not in the environment — it came
// from the person's cookie.
async function factory(provider: Provider, apiKey: string) {
  switch (provider) {
    case "anthropic":
      return (await import("@ai-sdk/anthropic")).createAnthropic({ apiKey });
    case "openai":
      return (await import("@ai-sdk/openai")).createOpenAI({ apiKey });
    case "google":
      return (await import("@ai-sdk/google")).createGoogleGenerativeAI({ apiKey });
    case "xai":
      return (await import("@ai-sdk/xai")).createXai({ apiKey });
    case "groq":
      return (await import("@ai-sdk/groq")).createGroq({ apiKey });
  }
}

async function model(role: "chat" | "extract"): Promise<LanguageModelV1> {
  const bag = await readKeyBag();
  const provider = resolveProvider(bag);
  const apiKey = keyFor(provider, bag);
  if (!apiKey) throw new Error(`${NO_KEY_CODE}: No key for ${provider}.`);

  const create = await factory(provider, apiKey);
  const id = modelId(provider, role, bag);
  return create(id) as LanguageModelV1;
}

/**
 * The model id for a role.
 *
 * Extraction follows the model the person actually chose. It used to run on a
 * separate small default per provider, which was a guess this repo made on
 * their behalf and never checked against the provider's live roster — so the
 * write gate could fail on every single turn while the conversation itself
 * looked perfectly healthy, because the two ran on different models. The
 * chosen model is known to work: it just answered.
 *
 * KM_EXTRACT_MODEL still overrides, for anyone who would rather pay the cheap
 * tier for the gate. That is the trade being made here — extraction runs on
 * every turn, so following the chat model costs more per turn than a small
 * fixed one. Correctness first: a cheaper gate that silently drops someone's
 * allergy is not a saving.
 */
function modelId(provider: Provider, role: "chat" | "extract", bag: KeyBag): string {
  const chat =
    bag.models[provider]?.trim() ||
    process.env.KM_CHAT_MODEL?.trim() ||
    PROVIDERS[provider].chat;

  if (role === "extract") return process.env.KM_EXTRACT_MODEL?.trim() || chat;
  return chat;
}

/** The model that answers the person. */
export const chatModel = () => model("chat");

/** The model behind the write gate. Runs on every turn — keep it small. */
export const extractModel = () => model("extract");

/** For the answer's provenance chip: who is answering, on what. */
export async function describeModel() {
  const bag = await readKeyBag();
  const provider = resolveProvider(bag);
  return {
    provider,
    chat: modelId(provider, "chat", bag),
    extract: modelId(provider, "extract", bag),
  };
}
