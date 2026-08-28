/**
 * "Do you have any allergies or conditions?" → "none".
 *
 * This exchange is the hinge of the whole app: it is the moment a person is
 * told they only have to answer once, and the moment that promise is either
 * kept or quietly broken. Leaving it entirely to the extraction model means
 * the promise holds only as often as a small model classifies a two-word reply
 * correctly — and in a live run it did not.
 *
 * So the LLM gate still runs and still does the nuanced work, but this pure
 * recogniser runs alongside it as a floor. If the agent asked about allergies
 * and the person plainly said no, the clearance is written whatever the model
 * decided.
 *
 * Deliberately conservative. It only fires when BOTH halves are unambiguous:
 * a question that really was about allergies or conditions, and an answer that
 * is a bare negative and nothing else. "No, but groundnuts upset me" is not a
 * bare negative and is left to the model.
 */

/** Did the assistant just ask about allergies or medical conditions? */
export function isRestrictionQuestion(assistantTurn: string): boolean {
  const text = assistantTurn.toLowerCase();
  if (!text.includes("?")) return false;
  return /\ballerg|\bintoleran|\bmedical condition|\bhealth condition|\bconditions?\b/.test(text);
}

/*
 * A bare negative. Punctuation and politeness are stripped first, so "None,
 * sir." and "nope!" both reduce to the same thing.
 */
const BARE_NEGATIVES = new Set([
  "no", "none", "nope", "nah", "nothing", "negative", "no none", "none at all",
  "no allergies", "no allergy", "no conditions", "no condition",
  "none that i know of", "none that i know", "not that i know of",
  "not that i know", "none i know of", "no not that i know of",
  "i have none", "i have no allergies", "i have no conditions",
  "i dont have any", "i dont have any allergies", "i dont have any conditions",
  "i dont think so", "i dont think i have any", "no i dont think so",
  "i dont think i am allergic to anything", "im not allergic to anything",
  "not allergic to anything", "no allergies or conditions",
  "nothing at all", "none whatsoever", "no none at all",
]);

/** Words that carry no meaning here and only get in the way of matching. */
const FILLER = /\b(sir|ma'?am|please|thanks|thank you|actually|really|just|well|um|erm|i think|i guess)\b/g;

function normalise(answer: string): string {
  return answer
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[.,!;:—–-]/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is this reply a plain "no" and nothing more? */
export function isBareNegative(answer: string): boolean {
  const text = normalise(answer);
  if (!text) return false;
  // A long reply is never a bare negative — it is carrying other information
  // that only the model should be trusted to read.
  if (text.split(" ").length > 8) return false;
  return BARE_NEGATIVES.has(text);
}

/**
 * Should we record a clearance for this turn regardless of what the model said?
 * Both halves must be unambiguous.
 */
export function answersNoRestrictions(assistantTurn: string, userTurn: string): boolean {
  return isRestrictionQuestion(assistantTurn) && isBareNegative(userTurn);
}

/** What gets written when it does. */
export const CLEARANCE_CLAIM = "no known allergies";
