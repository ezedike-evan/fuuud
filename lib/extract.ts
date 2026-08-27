import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { extractModel, chatModel, describeModel } from "./model.ts";
import type { FactKind } from "./memory-contract.ts";

/**
 * The WRITE GATE.
 *
 * Deliberately NOT `withMemWal({ autoSave: true })`. Auto-save extracts facts
 * from every turn, which would happily persist "I fancy jollof tonight" into a
 * medical record. The rules below are the graded part of this project, so they
 * are enforced explicitly rather than delegated to middleware.
 */

const FactSchema = z.object({
  facts: z.array(
    z.object({
      kind: z.enum(["condition", "allergy", "rejection", "symptom", "dislike", "clearance"]),
      text: z.string().describe("The fact in plain words, third person, no date."),
    }),
  ),
});

const EXTRACTION_PROMPT = `You extract durable facts from one turn of a nutrition conversation.

WRITE a fact only when the USER asserts one of these:
- condition: a medical condition they have ("I'm diabetic", "I have an ulcer")
- allergy:   an allergy or intolerance ("groundnuts bring me out in hives")
- clearance: an explicit statement that they have NO allergies or NO conditions
             ("I don't have any allergies", "no known conditions"). Write it as
             "no known allergies" or "no known medical conditions".
             This is a real fact, not an absence of one. Recording it is what
             stops the agent asking the same question every session.
- rejection: a suggestion refused WITH a reason ("no, palm oil upsets me")
- symptom:   a symptom experienced after eating something
- dislike:   a STANDING food preference, not a one-off mood ("I don't like a
             lot of vegetables", "I can't stand okra", "I hate fish"). Write
             only the THING disliked, not a sentence: "most vegetables",
             "okra", "fish". The kind already says it is a dislike.

TELL A DISLIKE FROM A CRAVING. A dislike is durable and about them ("I don't
eat pork", "I'm not a veg person"). A craving is about right now ("I fancy
jollof tonight", "not in the mood for rice"). Write the first, never the second.
When it is genuinely unclear, do not write.

A SUSPECTED ALLERGY IS STILL AN ALLERGY. "I think I might be allergic to
groundnut", "groundnut may not agree with me", "I'm not sure but nuts seem to
affect me" ALL get written, as an allergy, with the doubt kept in the text:
"suspected groundnut allergy". Do not discard it as speculation. Getting this
wrong means the agent keeps serving someone the thing they just flagged, and
the cost of storing a suspicion that turns out to be nothing is that they
correct it later.

The same applies to a hedged condition: "I think I'm becoming diabetic" is a
condition, written as "suspected diabetes".

NEVER write:
- cravings or one-off wants ("I fancy jollof tonight")
- small talk, greetings, thanks
- anything the assistant said. Only facts the USER asserted about themselves.
- hypotheticals about a state they do NOT claim ("what if I were diabetic?",
  "is jollof bad for someone with an ulcer?"). The line is whether they are
  talking about their own body. "I might be allergic" is about them - write it.
  "What if I were allergic" is not - skip it.

CARRY THE SEVERITY they gave you. "groundnuts - anaphylaxis, carries an epipen"
and "groundnuts - mild bloating" are different facts about different risks.
Write the severity they stated and never a milder one. If they did not state a
severity, do not invent one.

ANCHOR TIME. They speak in relative time; a record read years later cannot.
Resolve "since last Ramadan" or "after my op in March" to an absolute date and
store the resolved form ("hypertension - diagnosed March 2026"). If you cannot
tell which year they mean, leave the date out. Never guess a date.

ONE TURN CAN CARRY TWO FACTS. "I have no allergies but I don't like veg" is a
clearance AND a dislike — return both. Do not stop at the first.

RESOLVE SHORT ANSWERS AGAINST THE QUESTION. You may be given the assistant's
previous question. A reply like "none that I know of", "no", "nope none" or
"just the groundnut one" only means something next to what was asked. If the
question asked about allergies and conditions and they answer "none that I know
of", that is a clearance: "no known allergies".

The question is CONTEXT ONLY. Never write a fact the assistant suggested or
implied - only what the USER asserted about themselves in their own turn.

Return an empty array when the turn contains none of the above. An empty array
is the correct and common answer. Do not invent facts to seem useful.`;

/**
 * `assistantAsked` is the agent's previous turn.
 *
 * Without it a short answer is unextractable. The agent now asks about
 * allergies before it suggests anything, so the most important turn in the
 * whole conversation is usually a bare "none that I know of" — which, read on
 * its own, asserts nothing at all. It was being dropped for exactly that
 * reason. The question is passed as context so the answer can be resolved
 * against it, and the prompt forbids treating anything in the question itself
 * as a fact.
 */
export async function extractFacts(
  userTurn: string,
  assistantAsked?: string,
): Promise<Array<{ kind: FactKind; text: string }>> {
  const prompt = assistantAsked?.trim()
    ? `The assistant asked:\n"""\n${assistantAsked.trim()}\n"""\n\nThe user replied:\n"""\n${userTurn}\n"""`
    : userTurn;

  const run = async (model: Awaited<ReturnType<typeof extractModel>>) => {
    const { object } = await generateObject({
      model,
      schema: FactSchema,
      system: EXTRACTION_PROMPT,
      prompt,
    });
    return object.facts;
  };

  const described = await describeModel().catch(() => null);

  try {
    return await run(await extractModel());
  } catch (error) {
    // Extraction now follows the chosen chat model, so the two ids are usually
    // identical. Retrying the same model on the same prompt is not a fallback,
    // it is just a second bill — only retry when KM_EXTRACT_MODEL actually
    // pointed the gate somewhere else.
    if (!described || described.extract === described.chat) throw error;
    /*
     * The extraction model is a per-provider DEFAULT written into
     * lib/providers.ts, not something the person chose — and unlike the chat
     * model it is never checked against the provider's live roster. When that
     * id is retired or unavailable on their account, every single turn fails
     * to save while the conversation itself looks perfectly healthy. That is
     * exactly the failure this fallback exists for.
     *
     * The chat model is known good: it just answered. Extraction is a small
     * job, so running it there costs a little more but keeps memory working,
     * which is the entire product.
     */
    console.warn(
      `[fuuud] extraction model ${described?.extract ?? "(unknown)"} failed ` +
        `(${error instanceof Error ? error.message : String(error)}) — ` +
        `retrying on the chat model ${described?.chat ?? ""}.`,
    );
    try {
      return await run(await chatModel());
    } catch (fallbackError) {
      const first = error instanceof Error ? error.message : String(error);
      const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(
        `extraction failed on ${described?.extract ?? "extract model"} (${first}); ` +
          `retry on ${described?.chat ?? "chat model"} also failed (${second})`,
      );
    }
  }
}
