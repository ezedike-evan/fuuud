/**
 * Provider metadata shared by the server (which calls the model) and the
 * settings UI (which collects the key). Deliberately free of `server-only` and
 * of any provider SDK import, so the client bundle can render the form without
 * dragging four vendor packages into it.
 */

export type Provider = "anthropic" | "openai" | "google" | "xai" | "groq";

export type ProviderInfo = {
  label: string;
  /** Env var the same key is read from when the operator sets it server-side. */
  env: string;
  /**
   * Default model, used for BOTH the conversation and the extraction gate
   * until the person picks one. There is deliberately no separate extract
   * default: a second id this repo guessed at, running on every turn, is how
   * the write gate ended up failing silently against a model nobody chose.
   */
  chat: string;
  /** Where a person goes to mint one of these. */
  console: string;
  /** Shown as the input placeholder so a pasted key can be eyeballed. */
  hint: string;
  /**
   * Models offered in the picker. For Groq this is only the fallback: once a
   * key is present we ask Groq itself what that account can reach, because the
   * roster moves faster than any list hardcoded here.
   */
  models: string[];
};

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: {
    label: "Anthropic",
    env: "ANTHROPIC_API_KEY",
    chat: "claude-opus-5",
    console: "https://console.anthropic.com/settings/keys",
    hint: "sk-ant-…",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  openai: {
    label: "OpenAI",
    env: "OPENAI_API_KEY",
    chat: "gpt-4o",
    console: "https://platform.openai.com/api-keys",
    hint: "sk-…",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  google: {
    label: "Google Gemini",
    env: "GOOGLE_GENERATIVE_AI_API_KEY",
    chat: "gemini-2.5-pro",
    console: "https://aistudio.google.com/apikey",
    hint: "AIza…",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  xai: {
    label: "xAI Grok",
    env: "XAI_API_KEY",
    chat: "grok-3",
    console: "https://console.x.ai",
    hint: "xai-…",
    models: ["grok-4", "grok-3", "grok-3-mini"],
  },
  groq: {
    label: "Groq",
    env: "GROQ_API_KEY",
    chat: "openai/gpt-oss-120b",
    console: "https://console.groq.com/keys",
    hint: "gsk_…",
    // Groq's production models. gpt-oss-120b is the default: the write gate
    // needs a model that follows a long, rule-heavy schema prompt, and it is one
    // of the models Groq can hold to a strict JSON schema (the installed
    // @ai-sdk/groq does not ask for strict mode yet, so today it is best-effort
    // JSON checked by zod). Preview models are
    // left out on purpose - Groq says they are for evaluation only.
    models: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
    ],
  },
};

/**
 * Preference order when several keys are present and none is pinned. Anthropic
 * first because the extraction step asks for strict JSON against a schema and
 * Claude is reliable at it; Groq last only because it is the newest arrival,
 * not because it is worse - any of these work, which is the point.
 */
export const ORDER: Provider[] = ["anthropic", "openai", "google", "xai", "groq"];

export function isProvider(value: string): value is Provider {
  return (ORDER as string[]).includes(value);
}

/** Marker the chat route prefixes onto the "you have no key" failure. */
export const NO_KEY_CODE = "NO_PROVIDER_KEY";
