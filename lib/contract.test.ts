import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFact, formatTombstone, factProbe, idempotencyKeyFor, isOffTheRecord,
  resolveConflicts, retractionTarget,
} from "./facts.ts";
import {
  screenReply, buildSafetyConstraintsText, findFlags,
  resolveAllergens, normalizeConditions, allergyStatusKnown,
} from "./safety.ts";
import { rankConsultants } from "./consultants.ts";
import { healthNs, feedbackNs } from "./namespaces.ts";

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
    /never overrides an allergy or a condition/,
  );
});

test("a dislike never outranks a real allergy", () => {
  // Disliking vegetables must not soften the groundnut rule.
  const profile = { allergies: ["groundnuts - hives"], dislikes: ["most vegetables"] };
  assert.equal(screenReply("Akamu with groundnut paste", profile).safe, false);
});
