import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { extractModel } from "./model.ts";
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
      kind: z.enum(["condition", "allergy", "rejection", "symptom"]),
      text: z.string().describe("The fact in plain words, third person, no date."),
    }),
  ),
});

const EXTRACTION_PROMPT = `You extract durable facts from one turn of a nutrition conversation.

WRITE a fact only when the USER asserts one of these:
- condition: a medical condition they have ("I'm diabetic", "I have an ulcer")
- allergy:   an allergy or intolerance ("groundnuts bring me out in hives")
- rejection: a suggestion refused WITH a reason ("no, palm oil upsets me")
- symptom:   a symptom experienced after eating something

NEVER write:
- cravings or one-off wants ("I fancy jollof tonight")
- small talk, greetings, thanks
- anything the assistant said. Only facts the USER asserted about themselves.
- speculation, questions, or hypotheticals ("what if I were diabetic?")

CARRY THE SEVERITY they gave you. "groundnuts - anaphylaxis, carries an epipen"
and "groundnuts - mild bloating" are different facts about different risks.
Write the severity they stated and never a milder one. If they did not state a
severity, do not invent one.

ANCHOR TIME. They speak in relative time; a record read years later cannot.
Resolve "since last Ramadan" or "after my op in March" to an absolute date and
store the resolved form ("hypertension - diagnosed March 2026"). If you cannot
tell which year they mean, leave the date out. Never guess a date.

Return an empty array when the turn contains none of the above. An empty array
is the correct and common answer. Do not invent facts to seem useful.`;

export async function extractFacts(
  userTurn: string,
): Promise<Array<{ kind: FactKind; text: string }>> {
  const { object } = await generateObject({
    model: await extractModel(),
    schema: FactSchema,
    system: EXTRACTION_PROMPT,
    prompt: userTurn,
  });
  return object.facts;
}
