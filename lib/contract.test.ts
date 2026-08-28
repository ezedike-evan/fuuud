import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFact, formatTombstone, factProbe, idempotencyKeyFor, isOffTheRecord,
  resolveConflicts, retractionTarget, factDate, unionFacts, sameFact, factKind,
} from "./facts.ts";
import {
  screenReply, buildSafetyConstraintsText, findFlags,
  resolveAllergens, normalizeConditions, allergyStatusKnown, resolveObservances,
} from "./safety.ts";
import { rankConsultants } from "./consultants.ts";
import { healthNs, feedbackNs } from "./namespaces.ts";
import { resolveModels, keyFor } from "./model-select.ts";
import { parsePlan, formatPlanClaim, screenPlan, planFromFacts, weekFrom } from "./plan.ts";
import { ORDER, PROVIDERS } from "./providers.ts";

test("namespaces are lowercase, scoped, and never collide", () => {
  assert.equal(healthNs("0xABC"), "kitchen:health:0xabc");
  assert.notEqual(healthNs("0xabc"), feedbackNs("0xabc"));
});

test("off-the-record turns are refused before any write", () => {
  assert.equal(isOffTheRecord("I'm diabetic but don't save that"), true);
  assert.equal(isOffTheRecord("I'm diabetic"), false);
});

test("stored facts carry a date and can name what they replace", () => {
  const f = formatFact("allergy", "groundnuts - hives");
  assert.match(f, /^\d{4}-\d{2}-\d{2} \| allergy \| groundnuts - hives$/);
  assert.match(formatFact("allergy", "resolved", "old entry"), /SUPERSEDES: old entry$/);
});

test("newer date wins when two stored facts disagree", () => {
  const { active, superseded } = resolveConflicts([
    { text: "2026-08-27 | allergy | groundnuts", distance: 0.1, blobId: "a" },
    { text: "2026-09-02 | allergy | groundnuts", distance: 0.2, blobId: "b" },
  ]);
  assert.equal(active.length, 1);
  assert.equal(active[0].blobId, "b");
  assert.equal(superseded[0].blobId, "a");
});

/**
 * RETRACTION. There is no delete in the SDK, so "forget that" is a tombstone
 * that outranks the claim it names. These rules are the whole reason a
 * retracted fact stops reaching the model.
 */
test("a tombstone names the claim it retracts, without its date or kind", () => {
  const stone = formatTombstone("2026-08-27 | allergy | groundnuts - hives");
  assert.match(stone, /^\d{4}-\d{2}-\d{2} \| tombstone \| groundnuts - hives - RETRACTED$/);
  assert.equal(retractionTarget(stone), "groundnuts - hives");
  assert.equal(retractionTarget("2026-08-27 | allergy | groundnuts - hives"), "");
});

/**
 * The tombstone leads with the CLAIM, not with boilerplate, so it embeds near
 * the fact it kills. Measured against the live relayer, the original
 * `RETRACTS: <claim>` shape sat at distance 0.805 from "what am I allergic to?"
 * while the allergy itself sat at 0.519 — so a 0.6 floor kept the allergy and
 * discarded its retraction. Tombstones written in the old shape must still be
 * honoured, or a retraction made before this change would silently come undone.
 */
test("both tombstone shapes resolve to the same claim", () => {
  assert.equal(retractionTarget("2026-08-20 | tombstone | RETRACTS: groundnuts - hives"), "groundnuts - hives");
  assert.equal(retractionTarget("2026-08-20 | tombstone | groundnuts - hives - RETRACTED"), "groundnuts - hives");
});

test("an old-shape tombstone still retracts its fact", () => {
  const { active, retracted } = resolveConflicts([
    { text: "2026-08-01 | allergy | groundnuts - hives", distance: 0.1, blobId: "a" },
    { text: "2026-08-20 | tombstone | RETRACTS: groundnuts - hives", distance: 0.9, blobId: "t" },
  ]);
  assert.deepEqual(active, []);
  assert.equal(retracted[0].blobId, "a");
});

test("a retracted fact leaves active memory entirely", () => {
  const { active, retracted, superseded } = resolveConflicts([
    { text: "2026-08-01 | allergy | groundnuts - hives", distance: 0.1, blobId: "a" },
    { text: "2026-08-20 | tombstone | groundnuts - hives - RETRACTED", distance: 0.2, blobId: "t" },
  ]);
  assert.deepEqual(active, []);
  assert.equal(retracted[0].blobId, "a");
  assert.deepEqual(superseded, []);
});

test("a tombstone is never readable as a claim of its own", () => {
  const { active } = resolveConflicts([
    { text: "2026-08-20 | tombstone | something not recalled - RETRACTED", distance: 0.2, blobId: "t" },
  ]);
  assert.deepEqual(active, []);
});

test("re-asserting a claim after retracting it brings it back", () => {
  const { active, retracted } = resolveConflicts([
    { text: "2026-08-01 | allergy | groundnuts - hives", distance: 0.1, blobId: "a" },
    { text: "2026-08-20 | tombstone | groundnuts - hives - RETRACTED", distance: 0.2, blobId: "t" },
    { text: "2026-09-05 | allergy | groundnuts - hives", distance: 0.1, blobId: "c" },
  ]);
  assert.equal(active.length, 1);
  assert.equal(active[0].blobId, "c");
  assert.deepEqual(retracted, []);
});

test("a retraction wins on a same-day tie — you only retract what exists", () => {
  const { active, retracted } = resolveConflicts([
    { text: "2026-08-20 | allergy | groundnuts - hives", distance: 0.1, blobId: "a" },
    { text: "2026-08-20 | tombstone | groundnuts - hives - RETRACTED", distance: 0.2, blobId: "t" },
  ]);
  assert.deepEqual(active, []);
  assert.equal(retracted[0].blobId, "a");
});

/**
 * Regression, found only against the live relayer. Dedupe searched with the
 * bare claim while storage adds a `date | kind |` prefix, so the embedding
 * distance between query and stored line exceeded DUPLICATE_DISTANCE and every
 * duplicate was written as a new fact. The mock's token-overlap scoring made
 * the two strings look nearly identical and hid it completely.
 */
test("the dedupe probe has the same shape as a stored fact", () => {
  const probe = factProbe("allergy", "groundnuts - hives");
  const stored = formatFact("allergy", "groundnuts - hives");
  assert.equal(probe, stored);
  assert.match(probe, /^\d{4}-\d{2}-\d{2} \| allergy \| groundnuts - hives$/);
  // Same claim, different kind, must not collide.
  assert.notEqual(probe, factProbe("condition", "groundnuts - hives"));
});

test("one claim written twice carries one idempotency key", () => {
  const ns = "kitchen:health:0xabc";
  assert.equal(
    idempotencyKeyFor(ns, "allergy", "groundnuts - hives"),
    idempotencyKeyFor(ns, "allergy", "  Groundnuts - Hives  "),
  );
  assert.notEqual(
    idempotencyKeyFor(ns, "allergy", "groundnuts - hives"),
    idempotencyKeyFor(ns, "allergy", "groundnut allergy resolved"),
  );
  // Two people's records must never collapse onto one write.
  assert.notEqual(
    idempotencyKeyFor(ns, "allergy", "groundnuts - hives"),
    idempotencyKeyFor("kitchen:health:0xdef", "allergy", "groundnuts - hives"),
  );
});

test("a reply naming a stored allergen is refused", () => {
  const profile = { allergies: ["groundnuts"], conditions: ["diabetes"] };
  assert.equal(screenReply("Try kuli kuli with pap", profile).safe, false);
  assert.equal(screenReply("Boiled yam with efo sauce", profile).safe, true);
});

test("garden egg does not trip the egg allergen rule", () => {
  assert.deepEqual(findFlags("Boiled plantain with garden egg sauce", ["egg"]), []);
});

test("safety constraints name the user's own allergens", () => {
  const text = buildSafetyConstraintsText({ allergies: ["groundnuts"], conditions: ["diabetes"] });
  assert.match(text, /Peanuts \/ groundnuts/);
  assert.match(text, /Sugary drinks/);
});

test("consultants rank off recalled conditions and explain why", () => {
  const ranked = rankConsultants(["type 2 diabetes"]);
  assert.equal(ranked[0].slug, "dietitian-ifeanyi");
  assert.match(ranked[0].reason, /diabetes/);
  assert.equal(rankConsultants([])[0].score, 0);
});

/**
 * Regression. Facts leave memory in the shape the person said them —
 * "groundnuts - hives", not the bare synonym "groundnuts". An exact-match-only
 * resolver returned [] for that and the screen cleared a meal containing the
 * person's own allergen. Every assertion here uses the STORED shape.
 */
test("allergens resolve from a stored claim, not just a bare synonym", () => {
  assert.deepEqual(resolveAllergens(["groundnuts - hives"]), ["peanut"]);
  assert.deepEqual(resolveAllergens(["cashew - throat swells"]), ["tree_nut"]);
  assert.deepEqual(resolveAllergens(["seafood - stomach cramps"]).sort(), ["fish", "shellfish"]);
  assert.deepEqual(resolveAllergens(["nothing recognisable"]), []);
});

test("conditions resolve from a stored claim that carries extra words", () => {
  assert.deepEqual(normalizeConditions(["type 2 diabetes, diagnosed 2024"]), ["diabetes"]);
  assert.deepEqual(normalizeConditions(["high blood pressure since 2019"]), ["hypertension"]);
  // Unrecognised conditions survive verbatim so the UI can still show them.
  assert.deepEqual(normalizeConditions(["something the rules don't know"]), ["something the rules don't know"]);
});

test("a meal is screened against the stored form of the allergy", () => {
  const stored = { allergies: ["groundnuts - hives"], conditions: ["type 2 diabetes, diagnosed 2024"] };
  assert.equal(screenReply("Jollof rice with kuli kuli and grilled titus", stored).safe, false);
  assert.equal(screenReply("Chilled malt drink", stored).safe, false);
  assert.equal(screenReply("Boiled yam with efo riro", stored).safe, true);
  // The false-positive guards must survive the looser matching.
  assert.equal(screenReply("Garden egg sauce with sweet potato", stored).safe, true);
});


/*
 * The ask-first gate.
 *
 * Reported from a live run: with nothing stored, the agent produced a full
 * day's menu for someone whose allergies it had never asked about — because an
 * empty profile fell through to "keep meals balanced, mild and
 * vegetable-forward", which reads as permission to plan.
 */
test("an empty profile is a question to ask, not a default to apply", () => {
  const text = buildSafetyConstraintsText({});
  assert.equal(allergyStatusKnown({}), false);
  assert.match(text, /DO NOT KNOW this person's allergies/);
  assert.match(text, /Do not name a single specific dish, meal or menu/);
  // The vegetable bias nobody asked for must be gone.
  assert.doesNotMatch(text, /vegetable-forward/);
});

test("no recalled allergies is not the same as no allergies", () => {
  // Never asked.
  assert.equal(allergyStatusKnown({ allergies: [] }), false);
  // They said they have none — a fact we stored.
  assert.equal(allergyStatusKnown({ cleared: true }), true);
  // They named one.
  assert.equal(allergyStatusKnown({ allergies: ["groundnuts - hives"] }), true);
});

test("a stored clearance stops the agent asking again", () => {
  const text = buildSafetyConstraintsText({ cleared: true });
  assert.match(text, /no known allergies\. Do not keep asking/);
  assert.doesNotMatch(text, /DO NOT KNOW/);
});

test("a dislike shapes suggestions and is never hidden in a dish", () => {
  const text = buildSafetyConstraintsText({ cleared: true, dislikes: ["most vegetables"] });
  assert.match(text, /They dislike: most vegetables/);
  assert.match(text, /Do not hide a disliked food inside a dish/);
});

test("a dislike is never a safety rule", () => {
  // Someone who dislikes vegetables is not endangered by one. The screen must
  // not start refusing meals over a preference — that would make the safety
  // signal meaningless exactly where it matters.
  const profile = { conditions: [], allergies: [], dislikes: ["most vegetables"] };
  assert.equal(screenReply("Jollof rice with carrots and peas", profile).safe, true);
  assert.match(
    buildSafetyConstraintsText({ cleared: true, dislikes: ["most vegetables"] }),
    /never override an allergy/,
  );
});

test("a dislike never outranks a real allergy", () => {
  // Disliking vegetables must not soften the groundnut rule.
  const profile = { allergies: ["groundnuts - hives"], dislikes: ["most vegetables"] };
  assert.equal(screenReply("Akamu with groundnut paste", profile).safe, false);
});


/*
 * A duplicate written because the dedupe probe was unreachable must be
 * invisible downstream — that is what makes "write anyway" the safe choice
 * when the probe fails. See rememberFact in memory-core.
 */
test("a duplicate claim collapses to one active fact", () => {
  const { active, superseded } = resolveConflicts([
    { text: "2026-08-27 | allergy | suspected groundnut allergy", distance: 0.1, blobId: "b1" },
    { text: "2026-08-28 | allergy | suspected groundnut allergy", distance: 0.1, blobId: "b2" },
  ]);
  assert.equal(active.length, 1);
  assert.equal(factDate(active[0].text), "2026-08-28");
  assert.equal(superseded.length, 1);
});

test("a suspected allergy still screens meals", () => {
  // The hedge must not weaken the block — someone who says "I think I might be
  // allergic to groundnut" cannot be served groundnut while they find out.
  const profile = { allergies: ["suspected groundnut allergy"] };
  assert.equal(screenReply("Akamu with groundnut paste", profile).safe, false);
  assert.equal(screenReply("Jollof rice with grilled chicken", profile).safe, true);
});


/*
 * THE TWO JOBS MUST NEVER DRIFT APART.
 *
 * The conversation and the write gate are separate calls, and for a while they
 * resolved to different models: chat used the model the person picked, while
 * extraction used a per-provider default this repo guessed at and never
 * checked against the provider's live roster. The result was a healthy-looking
 * conversation in which every single turn failed to save.
 *
 * `bag` here is what a person's own settings look like — their key, their
 * model — for whichever provider they chose. `env: {}` proves none of this
 * leans on the deployment's environment.
 */
for (const provider of ORDER) {
  test(`${provider}: chat and extraction share provider, key and model`, () => {
    const bag = {
      keys: { [provider]: `test-key-for-${provider}` },
      models: {},
      active: provider,
    };
    const r = resolveModels(bag, {});
    assert.equal(r.provider, provider);
    assert.equal(r.apiKey, `test-key-for-${provider}`);
    assert.equal(r.chat, PROVIDERS[provider].chat);
    // The property that was broken: the gate runs on the same model.
    assert.equal(r.extract, r.chat);
  });

  test(`${provider}: a chosen model is used for extraction too`, () => {
    const picked = "some-model-they-picked";
    const bag = {
      keys: { [provider]: "k" },
      models: { [provider]: picked },
      active: provider,
    };
    const r = resolveModels(bag, {});
    assert.equal(r.chat, picked);
    assert.equal(r.extract, picked);
  });
}

test("the person's own key beats the deployment's", () => {
  const bag = { keys: { anthropic: "theirs" }, models: {}, active: "anthropic" as const };
  const env = { ANTHROPIC_API_KEY: "the deployment's" };
  assert.equal(keyFor("anthropic", bag, env), "theirs");
  // ...and the deployment's key still works when they have not set one.
  assert.equal(keyFor("anthropic", { keys: {}, models: {} }, env), "the deployment's");
});

test("an env key alone is enough to resolve a provider", () => {
  const r = resolveModels({ keys: {}, models: {} }, { GOOGLE_GENERATIVE_AI_API_KEY: "g" });
  assert.equal(r.provider, "google");
  assert.equal(r.apiKey, "g");
  assert.equal(r.extract, r.chat);
});

test("KM_EXTRACT_MODEL is the only thing that splits the two", () => {
  const bag = { keys: { groq: "k" }, models: { groq: "big-model" }, active: "groq" as const };
  const r = resolveModels(bag, { KM_EXTRACT_MODEL: "small-model" });
  assert.equal(r.chat, "big-model");
  assert.equal(r.extract, "small-model");
});

test("no key anywhere fails with the code the chat UI branches on", () => {
  assert.throws(
    () => resolveModels({ keys: {}, models: {} }, {}),
    /NO_PROVIDER_KEY/,
  );
});


/*
 * Allergies must not be retrieved by relevance to the question.
 *
 * The chat route used to recall the health namespace with the person's own
 * turn as the query. Recall is a similarity search with a relevance floor, so
 * "something light for dinner" pushed a stored groundnut allergy below the
 * floor and the agent answered as though it did not exist — while the memory
 * rail, which has always used a fixed query, showed that same allergy on the
 * page beside it.
 */
test("the safety query is fixed, not the user's question", async () => {
  const { SAFETY_QUERY, PREFERENCE_QUERY } = await import("./memory-core.ts");
  // Both name what they are looking for, so a stored allergy embeds near them
  // whatever the person happened to type.
  assert.match(SAFETY_QUERY, /allerg/i);
  assert.match(SAFETY_QUERY, /condition/i);
  assert.match(PREFERENCE_QUERY, /dislike/i);
});

test("merged recalls list a fact once, at its best distance", () => {
  const a = [{ text: "2026-08-27 | allergy | groundnuts - hives", distance: 0.55, blobId: "b1" }];
  const b = [
    { text: "2026-08-27 | allergy | groundnuts - hives", distance: 0.21, blobId: "b1" },
    { text: "2026-08-27 | dislike | most vegetables", distance: 0.4, blobId: "b2" },
  ];
  const merged = unionFacts(a, b);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].distance, 0.21, "keeps the closer match");
  assert.equal(merged.filter((f) => f.text.includes("groundnuts")).length, 1, "no duplicate");
});

test("an allergy recalled on an unrelated question still blocks the meal", () => {
  // The end of the chain: whatever the person asked, once the allergy is in
  // the profile the screen refuses a groundnut meal.
  const profile = { allergies: claimsOfKindText(["2026-08-27 | allergy | groundnuts - hives"]) };
  assert.equal(screenReply("Akamu with groundnut paste", profile).safe, false);
});

/** Mirror of how the route turns recalled lines into a profile. */
function claimsOfKindText(lines: string[]) {
  return lines.map((l) => l.split("|").slice(2).join("|").trim());
}


/*
 * The synonym tables are a safety NET, not the set of things a person is
 * allowed to have. Anything outside them used to vanish before the model saw
 * it: "asthma" plus a mango allergy produced an empty constraints block and
 * the agent suggested meals as though neither had been mentioned.
 */
test("a condition outside the known tables still reaches the model", () => {
  const text = buildSafetyConstraintsText({ conditions: ["sickle cell"], allergies: [] });
  assert.match(text, /sickle cell/);
});

test("an allergy outside the known tables still reaches the model", () => {
  const text = buildSafetyConstraintsText({ conditions: [], allergies: ["mango - itchy throat"] });
  assert.match(text, /allergic to: mango - itchy throat/);
  // And the model is told nothing downstream will catch it.
  assert.match(text, /No automatic ingredient check exists for: mango/);
});

test("known conditions keep their mechanical avoid-list too", () => {
  const text = buildSafetyConstraintsText({ conditions: ["type 2 diabetes"], allergies: ["groundnuts - hives"] });
  assert.match(text, /they have: type 2 diabetes/);      // verbatim
  assert.match(text, /For diabetes, avoid:/);            // and the derived rules
  assert.match(text, /Peanuts \/ groundnuts/);
  // A screened allergen must NOT be flagged as unscreened.
  assert.doesNotMatch(text, /No automatic ingredient check exists for: groundnuts/);
});

test("an unknown condition alone is never an empty constraint block", () => {
  const text = buildSafetyConstraintsText({ conditions: ["asthma"], allergies: [] });
  const bullets = text.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(bullets.length > 0, "constraints must never be a bare header");
});


/*
 * THE MEAL CALENDAR.
 *
 * A plan is screened against the record as it stands NOW, not as it stood when
 * the meal was scheduled. That is the whole feature: tell the agent about an
 * allergy today and next week's calendar reacts.
 */
test("a planned meal round-trips through the stored line", () => {
  const meal = { date: "2026-08-30", slot: "lunch" as const, meal: "jollof rice with grilled chicken" };
  const stored = formatFact("plan", formatPlanClaim(meal));
  assert.deepEqual(parsePlan(stored), meal);
  // The line records BOTH days: written today, eaten on the 30th.
  assert.equal(factDate(stored), new Date().toISOString().slice(0, 10));
});

test("a fact that is not a plan never parses as one", () => {
  assert.equal(parsePlan("2026-08-27 | allergy | groundnuts - hives"), null);
  assert.equal(parsePlan("2026-08-27 | plan | not-a-date | lunch | jollof"), null);
  assert.equal(parsePlan("2026-08-27 | plan | 2026-08-30 | brunch | jollof"), null, "unknown slot");
});

test("a new allergy retroactively flags a meal already planned", () => {
  const meals = [
    { date: "2026-08-30", slot: "breakfast" as const, meal: "akamu with groundnut paste" },
    { date: "2026-08-30", slot: "lunch" as const, meal: "jollof rice with grilled chicken" },
  ];

  // Planned when the record was empty: both fine.
  const before = screenPlan(meals, {});
  assert.deepEqual(before.map((m) => m.safe), [true, true]);

  // They tell the agent about groundnuts. The calendar reacts.
  const after = screenPlan(meals, { allergies: ["groundnuts - hives"] });
  assert.equal(after[0].safe, false, "the groundnut breakfast must flag");
  assert.ok(after[0].flags.length > 0, "and name what clashes");
  assert.equal(after[1].safe, true, "the jollof lunch is untouched");
});

test("a suspected allergy flags the calendar just as hard", () => {
  const meals = [{ date: "2026-08-30", slot: "dinner" as const, meal: "groundnut soup with pounded yam" }];
  assert.equal(screenPlan(meals, { allergies: ["suspected groundnut allergy"] })[0].safe, false);
});

test("the newest write wins for a given date and slot", () => {
  const plan = planFromFacts([
    { text: "2026-08-27 | plan | 2026-08-30 | lunch | egusi soup", distance: 0.1, blobId: "b1" },
    { text: "2026-08-28 | plan | 2026-08-30 | lunch | ofada rice", distance: 0.1, blobId: "b2" },
  ]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].meal, "ofada rice");
});

test("the week is seven consecutive local dates and rolls over a month end", () => {
  // Local components, not a UTC instant: weekFrom deliberately returns the
  // dates as the person's own calendar shows them.
  const week = weekFrom(new Date(2026, 7, 28, 12, 0, 0));
  assert.equal(week.length, 7);
  assert.equal(week[0], "2026-08-28");
  assert.equal(week[6], "2026-09-03", "must roll across a month boundary");
  assert.equal(new Set(week).size, 7, "no repeats");
});


/*
 * Reported from a live run: "I have insomnia", "I'm cutting back on sugar" and
 * "I like more veggies" were all lost. Two of them had no fact kind that could
 * hold them, so the gate correctly stored nothing — the contract was the bug.
 */
test("a stated like reaches the model, not just a dislike", () => {
  const text = buildSafetyConstraintsText({ cleared: true, likes: ["vegetables"] });
  assert.match(text, /They like: vegetables/);
  assert.match(text, /rather than merely avoiding what they cannot have/);
});

test("a dietary goal reaches the model", () => {
  const text = buildSafetyConstraintsText({ cleared: true, goals: ["cutting back on sugar"] });
  assert.match(text, /working toward: cutting back on sugar/);
  assert.match(text, /do not talk them out of it/);
});

test("insomnia is a recognised condition with real dietary advice", () => {
  assert.deepEqual(normalizeConditions(["insomnia"]), ["insomnia"]);
  assert.deepEqual(normalizeConditions(["trouble sleeping"]), ["insomnia"]);
  const text = buildSafetyConstraintsText({ conditions: ["insomnia"], cleared: true });
  assert.match(text, /For insomnia, avoid:/);
  assert.match(text, /Coffee, tea and energy drinks/);
});

test("a caffeinated meal is screened against insomnia", () => {
  const profile = { conditions: ["insomnia"], allergies: [] };
  assert.equal(screenReply("Suya with a cold cola before bed", profile).safe, false);
  assert.equal(screenReply("Akamu with moi moi", profile).safe, true);
});

test("likes and goals are preferences, never safety rules", () => {
  const text = buildSafetyConstraintsText({
    cleared: true, likes: ["vegetables"], goals: ["cutting back on sugar"], dislikes: ["okra"],
  });
  assert.match(text, /never override an allergy/);
  // A liked food is never a reason to call something unsafe.
  assert.equal(screenReply("Efo riro with vegetables", { likes: ["vegetables"] }).safe, true);
});

test("all three of the reported statements now have a home", () => {
  // insomnia -> condition, cutting back on sugar -> goal, likes veg -> preference
  const text = buildSafetyConstraintsText({
    conditions: ["insomnia"], allergies: [], cleared: true,
    goals: ["cutting back on sugar"], likes: ["vegetables"],
  });
  for (const expected of [/insomnia/, /cutting back on sugar/, /vegetables/]) {
    assert.match(text, expected);
  }
});


/*
 * An observance is a rule, not a taste. Storing "I don't eat pork" as a dislike
 * was the only option before, and the agent is told to work AROUND a dislike
 * where it can — the wrong treatment entirely for a religious rule.
 */
test("an observance is screened as strictly as an allergen", () => {
  const profile = { observances: ["halal"] };
  assert.equal(screenReply("Jollof rice with bacon", profile).safe, false);
  assert.deepEqual(screenReply("Jollof rice with bacon", profile).observanceFlags, ["bacon"]);
  assert.equal(screenReply("Jollof rice with grilled chicken", profile).safe, true);
});

test("observance synonyms resolve to one rule", () => {
  assert.deepEqual(resolveObservances(["halal"]), ["no_pork"]);
  assert.deepEqual(resolveObservances(["no pork"]), ["no_pork"]);
  assert.deepEqual(resolveObservances(["vegetarian"]), ["vegetarian"]);
});

test("a vegetarian observance blocks meat and fish", () => {
  const profile = { observances: ["vegetarian"] };
  assert.equal(screenReply("Egusi soup with goat meat", profile).safe, false);
  assert.equal(screenReply("Egusi soup with stockfish", profile).safe, false);
  assert.equal(screenReply("Moi moi with garden egg salad", profile).safe, true);
});

test("an observance is stated as a hard rule, never as a preference", () => {
  const text = buildSafetyConstraintsText({ observances: ["halal"], cleared: true });
  assert.match(text, /exactly as strictly as an allergy/);
  assert.match(text, /Never include anything that breaks: No pork/);
  // It must not be swept into the preferences disclaimer.
  assert.doesNotMatch(text, /observance.{0,40}are preferences/i);
});

test("budget and time constraints reach the model", () => {
  const text = buildSafetyConstraintsText({
    cleared: true, practical: ["tight budget", "20 minutes on weeknights"],
  });
  assert.match(text, /tight budget; 20 minutes on weeknights/);
  assert.match(text, /cannot afford or cannot cook is not a suggestion/);
});

test("who they cook for reaches the model", () => {
  const text = buildSafetyConstraintsText({ cleared: true, household: ["cooks for four"] });
  assert.match(text, /They cook for: cooks for four/);
  assert.match(text, /respect anyone else's stated rules/);
});

test("a preference can never make a meal unsafe, but a rule can", () => {
  assert.equal(screenReply("Suya", { likes: ["suya"], practical: ["tight budget"] }).safe, true);
  assert.equal(screenReply("Pork suya", { observances: ["no pork"] }).safe, false);
});


/*
 * Reported from a live run: "I like more veggies" was stored, then "I do not
 * like much vegetables" saved nothing at all. The dedupe probe compared claim
 * bodies and ignored the kind, so the reversal looked like a duplicate of the
 * fact it contradicted — the record could not express a change of mind.
 */
test("a reversal is a contradiction, not a duplicate", () => {
  const stored = "2026-08-27 | preference | vegetables";
  // Same claim, same kind -> genuinely a duplicate.
  assert.equal(sameFact(stored, "vegetables", "preference"), true);
  // Same claim, opposite kind -> must NOT be skipped as a duplicate.
  assert.equal(sameFact(stored, "vegetables", "dislike"), false);
});

test("sameFact without a kind still behaves as before", () => {
  // forgetFact only has a claim to go on, so the kindless form must not change.
  assert.equal(sameFact("2026-08-27 | allergy | groundnuts - hives", "groundnuts - hives"), true);
});

test("a same-day reversal is decided by the SUPERSEDES stamp, not luck", () => {
  const { active, superseded } = resolveConflicts([
    { text: "2026-08-28 | preference | vegetables", distance: 0.1, blobId: "b1" },
    { text: "2026-08-28 | dislike | vegetables - SUPERSEDES: vegetables", distance: 0.1, blobId: "b2" },
  ]);
  assert.equal(active.length, 1);
  assert.equal(factKind(active[0].text), "dislike", "the later, superseding fact wins the tie");
  assert.equal(superseded.length, 1);
});

test("a reversal on a later day still wins on date alone", () => {
  const { active } = resolveConflicts([
    { text: "2026-08-28 | dislike | vegetables", distance: 0.1, blobId: "b2" },
    { text: "2026-08-27 | preference | vegetables", distance: 0.1, blobId: "b1" },
  ]);
  assert.equal(factKind(active[0].text), "dislike");
});

test("a preparation dislike screens and reads like any other", () => {
  // "less pepper" had no home before: it is neither a food nor a condition.
  const text = buildSafetyConstraintsText({ cleared: true, dislikes: ["a lot of pepper"] });
  assert.match(text, /They dislike: a lot of pepper/);
});


/*
 * Reported from a live run: the meal planner refused to work for someone with
 * no allergies and no conditions. Having nothing to declare is an ANSWER, and
 * gating a meal planner behind having a diagnosis is exactly backwards.
 */
test("someone with nothing to declare gets a usable plan, not a refusal", () => {
  const healthy = { conditions: [], allergies: [], cleared: true };
  assert.equal(allergyStatusKnown(healthy), true);

  const text = buildSafetyConstraintsText(healthy);
  // No refusal to name a dish...
  assert.doesNotMatch(text, /Do not name a single specific dish/);
  assert.doesNotMatch(text, /DO NOT KNOW/);
  // ...and nothing is blocked, so any ordinary meal screens clean.
  for (const meal of ["Jollof rice with grilled chicken", "Egusi soup with pounded yam", "Akamu with moi moi"]) {
    assert.equal(screenReply(meal, healthy).safe, true, meal);
  }
});

test("a plan for a cleared person is still screened once they add a condition", () => {
  // The clearance is not permanent permission — a later fact re-tightens it.
  const before = { cleared: true, allergies: [] };
  const after = { cleared: true, allergies: ["groundnuts - hives"] };
  assert.equal(screenReply("Akamu with groundnut paste", before).safe, true);
  assert.equal(screenReply("Akamu with groundnut paste", after).safe, false);
});
