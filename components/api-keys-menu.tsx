"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getKeySettings,
  saveProviderKey,
  removeProviderKey,
  setActiveProvider,
  setChatModel,
  listGroqModels,
  type KeySettings,
  type ProviderStatus,
} from "@/app/actions/keys";

/**
 * Anything on the page can ask for this panel by dispatching the event below.
 * The chat's "no key yet" state needs to offer it, and chat sits in a different
 * branch of the tree — a window event beats threading a context provider
 * through a server component just to carry one boolean.
 */
export const OPEN_KEYS_EVENT = "km:open-keys";

export function openKeysPanel() {
  window.dispatchEvent(new CustomEvent(OPEN_KEYS_EVENT));
}

export default function ApiKeysMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<KeySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await getKeySettings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_KEYS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_KEYS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const unset = settings?.empty ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="AI model and API keys"
        title="AI model and API keys"
        className="relative grid size-[33px] place-items-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3.1" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
        {/* A missing key is not a preference, it is a broken app. Say so on the
            icon so it is visible before the first message fails. */}
        {unset && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2 rounded-full"
            style={{ background: "var(--c-warn)" }}
          />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 pt-[8vh]"
          style={{ background: "color-mix(in oklab, var(--c-canvas) 72%, transparent)", backdropFilter: "blur(3px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Model keys"
            className="card w-full max-w-[560px] p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="eyebrow">Settings</p>
                <h2 className="mt-2.5 text-[21px] font-medium leading-tight tracking-[-0.015em]">
                  Bring your own model key
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface-hi hover:text-ink"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
              Your key is encrypted and kept in a cookie only this browser holds — it is never
              written to our database and never sent back to the page. It is not hidden from
              whoever runs this server, though: the key has to be decrypted here to call the
              provider. Use a scoped key you can revoke.
            </p>

            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-danger-line px-3 py-2.5 text-[13px] text-danger">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              {settings?.providers.map((p) => (
                <ProviderRow
                  key={p.provider}
                  status={p}
                  active={settings.active === p.provider}
                  onChanged={setSettings}
                  onError={setError}
                />
              ))}
              {!settings && !error && (
                <p className="py-6 text-center text-sm text-ink-faint">Loading…</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProviderRow({
  status, active, onChanged, onError,
}: {
  status: ProviderStatus;
  active: boolean;
  onChanged: (s: KeySettings) => void;
  onError: (e: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [models, setModels] = useState<string[]>(status.models);
  const [modelNote, setModelNote] = useState<string | null>(null);

  const configured = status.mine || status.fromEnv;

  async function run(fn: () => Promise<KeySettings>) {
    setBusy(true);
    onError(null);
    try {
      onChanged(await fn());
      setDraft("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  /*
   * Groq ships and retires models faster than this repo can track, so the
   * dropdown is filled from the account itself rather than a list frozen at
   * commit time. The static list in lib/providers.ts is only the fallback for
   * before a key exists.
   */
  const refreshGroq = useCallback(async () => {
    setBusy(true);
    const { models: live, error } = await listGroqModels();
    setModels(live);
    setModelNote(error);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (status.provider === "groq" && expanded && status.mine) void refreshGroq();
  }, [status.provider, status.mine, expanded, refreshGroq]);

  return (
    <div
      className="rounded-[10px] border px-4 py-3.5 transition-colors"
      style={{
        borderColor: active ? "var(--c-accent)" : "var(--c-line)",
        background: active ? "color-mix(in oklab, var(--c-accent) 5%, transparent)" : "transparent",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!configured || busy || active}
          onClick={() => void run(() => setActiveProvider(status.provider))}
          aria-label={`Use ${status.label}`}
          className="grid size-[17px] shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-default"
          style={{ borderColor: active ? "var(--c-accent)" : "var(--c-line)" }}
        >
          {active && <span className="size-[7px] rounded-full" style={{ background: "var(--c-accent)" }} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-tight">{status.label}</p>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-ink-faint">
            {status.fromEnv && !status.mine
              ? `set on the server · ${status.env}`
              : status.mine
                ? `your key · ••••${status.tail}`
                : "no key"}
          </p>
        </div>

        {status.mine && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removeProviderKey(status.provider))}
            className="shrink-0 text-[12px] text-ink-faint transition-colors hover:text-danger disabled:opacity-40"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="chip shrink-0 text-[12px]"
        >
          {status.mine ? "Replace" : "Add key"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3.5 border-t border-line-soft pt-3.5">
          <label className="eyebrow" htmlFor={`key-${status.provider}`}>
            {status.env}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={`key-${status.provider}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={status.hint}
              className="min-w-0 flex-1 rounded-[8px] border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] text-ink placeholder:text-ink-faint focus:border-ink-faint focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void run(() => saveProviderKey(status.provider, draft))}
              className="cta shrink-0 px-4 py-2 text-[13px] disabled:opacity-30"
            >
              Save
            </button>
          </div>
          <a
            href={status.console}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-[11.5px] text-ink-faint underline underline-offset-2 hover:text-ink-muted"
          >
            Get a {status.label} key ↗
          </a>

          {configured && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <label className="eyebrow" htmlFor={`model-${status.provider}`}>Chat model</label>
                {status.provider === "groq" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void refreshGroq()}
                    className="text-[11.5px] text-ink-faint underline underline-offset-2 hover:text-ink-muted disabled:opacity-40"
                  >
                    {busy ? "Loading…" : "Refresh from Groq"}
                  </button>
                )}
              </div>
              <select
                id={`model-${status.provider}`}
                value={models.includes(status.model) ? status.model : ""}
                onChange={(e) => void run(() => setChatModel(status.provider, e.target.value))}
                className="mt-2 w-full rounded-[8px] border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] text-ink focus:border-ink-faint focus:outline-none"
              >
                {!models.includes(status.model) && (
                  <option value="">{status.model} (not in list)</option>
                )}
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {modelNote && <p className="mt-2 text-[11.5px] text-warn">{modelNote}</p>}
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
                This model answers you <em>and</em> reads each turn for facts worth remembering. It
                used to be two models — the gate ran on a small default nobody picked, and when that
                one could not produce the required JSON, every turn failed to save while the
                conversation looked fine. Set <code className="font-mono">KM_EXTRACT_MODEL</code> to
                split them again.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
