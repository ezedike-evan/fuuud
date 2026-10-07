import { streamText, StreamData } from "ai";
import { chatModel, describeModel } from "@/lib/model.ts";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { buildPlanWeek } from "@/lib/plan-week.ts";
import { describeMemoryFailure } from "@/lib/memory-errors.ts";
import { composeSystem, persist, recallAll, type StoredReport } from "@/lib/chat-core.ts";

/*
 * 300s, not 60. A turn does a recall, a model call and a write, and the write
 * alone is allowed INDEX_TIMEOUT_MS (120s) because it embeds, encrypts,
 * uploads to Walrus and indexes. Against a 60s budget the platform killed the
 * whole invocation — FUNCTION_INVOCATION_TIMEOUT — which returns nothing at
 * all, not even the answer that had already been generated.
 */
export const maxDuration = 300;

/*
 * How long the FIRST TOKEN will wait for the write report.
 *
 * Reporting what was saved is worth a short pause; it is not worth a blank
 * screen. If the write has not finished by now the answer streams anyway and
 * the turn reports `pending` — the memory rail refreshes when the stream ends,
 * by which point the write has landed, so the truth arrives either way.
 */
const WRITE_REPORT_DEADLINE_MS = 10_000;





async function postHandler(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const { messages } = await req.json();
  const latest: string = messages.at(-1)?.content ?? "";
  /*
   * The agent's previous turn. Needed because it now ASKS about allergies
   * before suggesting anything, so the reply that matters most is usually a
   * bare "none that I know of" — meaningless to the extractor on its own.
   */
  const asked: string = [...messages]
    .slice(0, -1)
    .reverse()
    .find((m: { role: string }) => m.role === "assistant")?.content ?? "";

  /*
   * ONE recall pass per turn, in parallel. Never recall per-route.
   *
   * The health namespace is read with a STABLE query, never the person's turn.
   * Recall is a similarity search with a relevance floor, so querying with
   * "something light for dinner" pushed `allergy | groundnuts - hives` below
   * the floor and the agent answered as though no allergy existed — while the
   * memory rail, which has always used a fixed query, sat next to it showing
   * that same allergy. An allergy is not relevant only when it is mentioned.
   *
   * Feedback is read twice and merged: a stable query so standing dislikes
   * always apply, plus the person's own words so something they rejected last
   * time surfaces when it comes up again.
   *
   * This FAILS CLOSED. If the record is unreachable we do not quietly answer as
   * though the person had no conditions — a blind meal suggestion is exactly the
   * hazard this app exists to remove. Say so and stop.
   */
  let health, feedback;
  try {
    ({ health, feedback } = await recallAll(address, latest));
  } catch (error) {
    if (error instanceof Error && error.name === "MemwalSetupRequired") {
      return new Response("Create your memory account first at /setup.", { status: 428 });
    }
    console.error("recall failed", error);
    const failure = describeMemoryFailure(error);
    // Fails CLOSED with the real reason. A refused key needs a different action from a slow relayer.
    return new Response(
      failure.kind === "key-refused"
        ? "I can't read your memory: Walrus Memory refused this app's key for your account, so I won't guess at your conditions. Set it up again at /setup, or reload in a minute if you changed nothing."
        : "I can't reach your memory right now, so I won't guess at your conditions. Try again in a moment.",
      { status: failure.kind === "key-refused" ? 409 : 503 },
    );
  }

  // Kicked off here so extraction overlaps everything below it.
  const writing = persist(address, latest, asked);

  const { system, activeHealth, activeFeedback } = composeSystem(health, feedback);

  // Resolve the model BEFORE starting the write path, so a missing provider key
  // is one readable sentence instead of an opaque 500. This is the first thing
  // anyone running the project from a fresh clone will hit.
  let model, described;
  try {
    model = await chatModel();
    described = await describeModel();
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "No model provider configured.",
      { status: 503 },
    );
  }

  /*
   * Ship the provenance with the answer. The UI renders one chip per fact the
   * reply was actually built from, so "it remembered" is something the person
   * can see and check rather than take on trust — and if the agent gets it
   * wrong, the chips show exactly which stored fact misled it.
   */
  /*
   * The write runs CONCURRENTLY with recall and model resolution, but its
   * result is reported in the FIRST annotation — the one sent before a single
   * token streams.
   *
   * It used to be appended in `onFinish`, immediately before `data.close()`,
   * and that report never reached the browser: a turn that saved two facts and
   * a turn that failed to save looked identical, because neither chip
   * rendered. The write path was the least reliable part of this app and the
   * only one with no diagnostic. The first annotation is a delivery path we
   * know works — it is how the recalled facts arrive.
   *
   * The cost is that the first token waits for extraction. Extraction is one
   * small call and it overlaps the recall above, so in practice it is close to
   * free; and being told what was saved is worth more than shaving that.
   */
  const stored = await Promise.race([
    writing,
    new Promise<StoredReport>((resolve) =>
      setTimeout(() => resolve({ written: [], skipped: [], failed: null, pending: true }), WRITE_REPORT_DEADLINE_MS),
    ),
  ]);

  const data = new StreamData();
  data.appendMessageAnnotation({
    recalled: [...activeHealth, ...activeFeedback].map((f) => ({
      text: f.text,
      distance: f.distance,
    })),
    provider: described.provider,
    model: described.chat,
    stored,
  });

  const result = streamText({
    model,
    system,
    messages,
    /*
     * THE WRITE MUST OUTLIVE THE ANSWER, AND THE FUNCTION MUST OUTLIVE BOTH.
     *
     * A serverless function is frozen the moment its response stream closes.
     * Closing here without awaiting the write kills it mid-flight: the answer
     * arrives, the fact is never stored, and the turn reports "still saving…"
     * forever because that chip was a snapshot taken at the report deadline and
     * nothing ever updates it.
     *
     * So the stream stays open until the write settles. It costs nothing the
     * reader can see — the answer has already streamed — and it is bounded by
     * maxDuration above. The client refreshes its memory rail when the stream
     * ends, which is now guaranteed to be after the fact has landed.
     */
    onFinish: async () => {
      try {
        // The first annotation was a snapshot taken at the report deadline. Send
        // the settled result too, so a late write ends as "saved N facts" (or a
        // real error) instead of staying "saving".
        data.appendMessageAnnotation({ stored: await writing });
      } catch (error) {
        // Already reported to the caller and logged inside persist(); swallow
        // it here so a failed write can never leave the stream hanging open.
        console.error("[fuuud] write did not settle before close:", error);
      }
      // A newly stored fact can make a scheduled meal unsafe. Re-reading the
      // plan re-screens it and cancels any reminder that no longer passes.
      try {
        const report = await writing;
        if (report.written.length) await buildPlanWeek(address);
      } catch {
        // Best effort: the next calendar load runs the same sweep.
      }
      data.close();
    },
  });
  return result.toDataStreamResponse({ data });
}

// Wrapped so the person's memory account is in scope (see inScope in lib/session.ts).
export const POST = (req: Request) => inScope(() => postHandler(req));
