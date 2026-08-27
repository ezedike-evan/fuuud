/**
 * Bring your own key.
 *
 * Nothing in this project is tied to one model vendor. Set whichever provider
 * key you already have and the app uses it; set several and pin one with
 * KM_MODEL_PROVIDER. This is not decoration — a health agent someone else is
 * meant to run should not force them to open an account with a company they
 * have no relationship with.
 *
 * Two jobs, deliberately separated:
 *   chatModel()    — talks to the person. Wants the best model available.
 *   extractModel() — the write gate. Reads one turn and emits structured JSON.
 *                    A small fast model is correct here, and it runs on every
 *                    single turn, so the cheap tier is the right default.
 */
import "server-only";
import type { LanguageModelV1 } from "ai";

export type Provider = "anthropic" | "openai" | "google" | "xai";

/** Env var carrying each provider's key, and the models we ask it for. */
const PROVIDERS: Record<Provider, { key: string; chat: string; extract: string }> = {
  anthropic: {
    key: "ANTHROPIC_API_KEY",
    chat: "claude-opus-5",
    extract: "claude-haiku-4-5",
  },
  openai: {
    key: "OPENAI_API_KEY",
    chat: "gpt-4o",
    extract: "gpt-4o-mini",
  },
  google: {
    key: "GOOGLE_GENERATIVE_AI_API_KEY",
    chat: "gemini-2.5-pro",
    extract: "gemini-2.5-flash",
  },
  xai: {
    key: "XAI_API_KEY",
    chat: "grok-3",
    extract: "grok-3-mini",
  },
};

/**
 * Preference order when several keys are present and none is pinned. Anthropic
 * first because the extraction step asks for strict JSON against a schema and
 * Claude is reliable at it, but any of these work — that is the point.
 */
const ORDER: Provider[] = ["anthropic", "openai", "google", "xai"];

export function availableProviders(): Provider[] {
  return ORDER.filter((p) => Boolean(process.env[PROVIDERS[p].key]?.trim()));
}

/**
 * Which provider this process will use. Pinned by KM_MODEL_PROVIDER when set,
 * otherwise inferred from whichever key is present.
 */
export function resolveProvider(): Provider {
  const pinned = process.env.KM_MODEL_PROVIDER?.trim().toLowerCase();
  if (pinned) {
    if (!(pinned in PROVIDERS)) {
      throw new Error(
        `KM_MODEL_PROVIDER="${pinned}" is not one of: ${ORDER.join(", ")}`,
      );
    }
    const provider = pinned as Provider;
    if (!process.env[PROVIDERS[provider].key]?.trim()) {
      throw new Error(
        `KM_MODEL_PROVIDER is "${provider}" but ${PROVIDERS[provider].key} is not set.`,
      );
    }
    return provider;
  }

  const found = availableProviders()[0];
  if (!found) {
    throw new Error(
      `No model provider key found. Set any one of: ${ORDER.map((p) => PROVIDERS[p].key).join(", ")}.`,
    );
  }
  return found;
}

// The provider factories read their own key from the environment, so they are
// only constructed once we know that key exists.
async function factory(provider: Provider) {
  switch (provider) {
    case "anthropic":
      return (await import("@ai-sdk/anthropic")).anthropic;
    case "openai":
      return (await import("@ai-sdk/openai")).openai;
    case "google":
      return (await import("@ai-sdk/google")).google;
    case "xai":
      return (await import("@ai-sdk/xai")).xai;
  }
}

async function model(role: "chat" | "extract"): Promise<LanguageModelV1> {
  const provider = resolveProvider();
  const create = await factory(provider);
  const id = process.env[role === "chat" ? "KM_CHAT_MODEL" : "KM_EXTRACT_MODEL"]?.trim()
    || PROVIDERS[provider][role];
  return create(id);
}

/** The model that answers the person. */
export const chatModel = () => model("chat");

/** The model behind the write gate. Runs on every turn — keep it small. */
export const extractModel = () => model("extract");

/** For startup logging and the settings page: who is answering, on what. */
export function describeModel() {
  const provider = resolveProvider();
  return {
    provider,
    chat: process.env.KM_CHAT_MODEL?.trim() || PROVIDERS[provider].chat,
    extract: process.env.KM_EXTRACT_MODEL?.trim() || PROVIDERS[provider].extract,
  };
}
