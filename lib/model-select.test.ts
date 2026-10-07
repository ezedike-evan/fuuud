import { test } from "node:test";
import assert from "node:assert/strict";
import { modelId, ownProviders, resolveModels, resolveProvider, type KeyBag } from "./model-select.ts";

const bag = (keys: KeyBag["keys"] = {}, extra: Partial<KeyBag> = {}): KeyBag => ({ keys, models: {}, ...extra });

test("with only the deployment's Groq key, Groq answers", () => {
  assert.equal(resolveProvider(bag(), { GROQ_API_KEY: "ops" }), "groq");
});

test("a visitor's own key is used WITHOUT choosing it as active", () => {
  assert.equal(resolveProvider(bag({ anthropic: "mine" }), { GROQ_API_KEY: "ops" }), "anthropic");
});

test("...even when the deployment has a key for a provider that sorts EARLIER", () => {
  // ORDER is anthropic, openai, google, xai, groq. The operator's Anthropic key must not beat the visitor's Groq key.
  assert.equal(resolveProvider(bag({ groq: "mine" }), { ANTHROPIC_API_KEY: "ops" }), "groq");
  assert.equal(resolveProvider(bag({ xai: "mine" }), { OPENAI_API_KEY: "ops", GOOGLE_GENERATIVE_AI_API_KEY: "ops" }), "xai");
});

test("...and even when the operator pinned a provider with KM_MODEL_PROVIDER", () => {
  assert.equal(resolveProvider(bag({ anthropic: "mine" }), { GROQ_API_KEY: "ops", KM_MODEL_PROVIDER: "groq" }), "anthropic");
});

test("an explicit choice still wins over another of their own keys", () => {
  assert.equal(resolveProvider(bag({ anthropic: "a", openai: "o" }, { active: "openai" }), {}), "openai");
});

test("they can deliberately choose the deployment's provider over their own key", () => {
  assert.equal(resolveProvider(bag({ anthropic: "mine" }, { active: "groq" }), { GROQ_API_KEY: "ops" }), "groq");
});

test("an 'active' pointing at a provider with no key anywhere is ignored, not trusted", () => {
  assert.equal(resolveProvider(bag({ anthropic: "mine" }, { active: "openai" }), {}), "anthropic");
});

test("removing their only key falls back to the deployment's, and the pin applies again", () => {
  assert.equal(resolveProvider(bag(), { GROQ_API_KEY: "ops", OPENAI_API_KEY: "ops", KM_MODEL_PROVIDER: "groq" }), "groq");
  assert.equal(resolveProvider(bag(), { GROQ_API_KEY: "ops", OPENAI_API_KEY: "ops" }), "openai");
});

test("blank or whitespace keys are not keys", () => {
  assert.deepEqual(ownProviders(bag({ anthropic: "", openai: "   ", groq: "g" })), ["groq"]);
  assert.equal(resolveProvider(bag({ anthropic: "  " }), { GROQ_API_KEY: "ops" }), "groq");
});

test("no key anywhere is the 'add a key' error, not a crash", () => {
  assert.throws(() => resolveProvider(bag(), {}), /NO_PROVIDER_KEY/);
});

test("the server's model override is NOT applied to a visitor's key for another provider", () => {
  const env = { GROQ_API_KEY: "ops", KM_CHAT_MODEL: "openai/gpt-oss-120b", KM_EXTRACT_MODEL: "openai/gpt-oss-20b" };
  const r = resolveModels(bag({ anthropic: "mine" }), env);
  assert.equal(r.provider, "anthropic");
  assert.equal(r.chat, "claude-opus-5", "Anthropic must get its own default, not a Groq model id");
  assert.equal(r.extract, "claude-opus-5");
});

test("...but it still applies to the deployment's own key", () => {
  const env = { GROQ_API_KEY: "ops", KM_CHAT_MODEL: "openai/gpt-oss-20b" };
  assert.equal(resolveModels(bag(), env).chat, "openai/gpt-oss-20b");
});

test("a visitor's chosen model wins, and extraction follows it", () => {
  const r = resolveModels(bag({ groq: "mine" }, { models: { groq: "llama-3.3-70b-versatile" } }), { KM_CHAT_MODEL: "other" });
  assert.equal(r.chat, "llama-3.3-70b-versatile");
  assert.equal(r.extract, "llama-3.3-70b-versatile");
});

test("the Groq default is gpt-oss-120b", () => {
  assert.equal(modelId("groq", "chat", bag(), {}), "openai/gpt-oss-120b");
});
