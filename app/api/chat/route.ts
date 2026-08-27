import { streamText, StreamData } from "ai";
import { chatModel, describeModel } from "@/lib/model.ts";
import { getOwnerAddress } from "@/lib/session.ts";
import { recallHealth, recallFeedback, resolveConflicts, rememberFact, isOffTheRecord, claimsOfKind } from "@/lib/memory-contract.ts";
import { extractFacts } from "@/lib/extract.ts";
import { buildSafetyConstraintsText } from "@/lib/safety.ts";

export const maxDuration = 60;

const BASE_PROMPT = [
  "You are Kitchen Memory, a cautious food and nutrition assistant for users in Nigeria.",
  "Suggest meals people actually eat here - jollof, ofada, moi moi, egusi, akamu, plantain, garden egg - never generic Western meal plans.",
  // The failure this exists to stop: a full day's menu produced for someone
  // whose allergies were never asked about. Suggesting food is the whole point
  // of the app, so the rule has to be explicit or the model does it anyway.
  "ASK BEFORE YOU SUGGEST. If you have not been told this person's allergies and conditions, your first reply is a question, not a meal. One short question covering both, and say they only have to tell you once.",
  "Do not pad that question with a sample menu, an example day, or 'in the meantime you could try'. A suggestion attached to the question defeats it.",
  "Once you know - including when they tell you they have none - suggest food normally and do not ask again.",
  "Respect what they dislike. Do not serve a disliked food, and do not blend, puree or hide it in a dish and present that as a solution. Suggest something else.",
  "You do not diagnose and you are not a doctor. Whenever a condition is involved, say the guidance is not medical advice and suggest seeing a practitioner.",
  "If the user says a stored fact is wrong or asks you to forget it, tell them to retract it on the settings page - deciding privately to stop mentioning it changes nothing, because the record outlives this conversation.",
  "Keep every reply under 110 words.",
].join(" ");

export async function POST(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const { messages } = await req.json();
  const latest: string = messages.at(-1)?.content ?? "";

  // ONE recall per turn, both namespaces in parallel. Never recall per-route.
  //
  // This FAILS CLOSED. If the record is unreachable we do not quietly answer as
  // though the person had no conditions — a blind meal suggestion is exactly the
  // hazard this app exists to remove. Say so and stop.
  let health, feedback;
  try {
    [health, feedback] = await Promise.all([
      recallHealth(address, latest),
      recallFeedback(address, latest),
    ]);
  } catch (error) {
    console.error("recall failed", error);
    return new Response(
      "I can't reach your memory right now, so I won't guess at your conditions. Try again in a moment.",
      { status: 503 },
    );
  }

  const activeHealth = resolveConflicts(health).active;
  const activeFeedback = resolveConflicts(feedback).active;
  const profile = {
    conditions: claimsOfKind(activeHealth, "condition"),
    allergies: claimsOfKind(activeHealth, "allergy"),
    dislikes: claimsOfKind(activeFeedback, "dislike"),
    // An explicit "I have no allergies" is a fact we stored. Without reading it
    // back, the agent cannot distinguish "they told us they are clear" from
    // "we never asked", and would interrogate them again every session.
    cleared: claimsOfKind(activeHealth, "clearance").length > 0,
  };

  const memoryBlock = [...activeHealth, ...activeFeedback].length
    ? `WHAT YOU ALREADY KNOW ABOUT THIS USER (from their own stored memory):\n${
        [...activeHealth, ...activeFeedback].map((f) => `- ${f.text}`).join("\n")
      }\nUse these without asking the user to repeat them. If two facts disagree, trust the newer date and say so out loud.`
    : "You have no stored facts about this user yet.";

  const system = [
    BASE_PROMPT,
    memoryBlock,
    buildSafetyConstraintsText(profile),
  ].join("\n\n");

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
  const data = new StreamData();
  data.appendMessageAnnotation({
    recalled: [...activeHealth, ...activeFeedback].map((f) => ({
      text: f.text,
      distance: f.distance,
    })),
    provider: described.provider,
    model: described.chat,
  });

  // Write path runs alongside generation, gated by the extraction rules.
  void persist(address, latest);

  const result = streamText({
    model,
    system,
    messages,
    onFinish: () => void data.close(),
  });
  return result.toDataStreamResponse({ data });
}

async function persist(address: string, userTurn: string) {
  try {
    if (!userTurn.trim() || isOffTheRecord(userTurn)) return;
    const facts = await extractFacts(userTurn);
    for (const fact of facts) {
      await rememberFact(address, fact.kind, fact.text, { userTurn });
    }
  } catch (error) {
    console.error("memory write failed", error);
  }
}
