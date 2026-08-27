"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { openKeysPanel } from "./api-keys-menu";
import { NO_KEY_CODE } from "@/lib/providers";

const STARTERS = [
  "I'm diabetic and groundnuts give me hives",
  "What should I eat today?",
  "Something light for dinner",
];

/** Shape of the provenance the route attaches to each assistant message. */
type Recalled = { text: string; distance: number };
type Stored = { written: string[]; failed: string | null };
type Annotation = { recalled?: Recalled[]; provider?: string; model?: string; stored?: Stored };

/** `2026-08-27 | allergy | groundnuts - hives` → its three parts. */
function parseFact(stored: string) {
  const [date, kind, ...rest] = stored.split("|").map((p) => p.trim());
  return {
    date: date ?? "",
    kind: kind ?? "fact",
    claim: (rest.join(" | ") || stored).split(" - SUPERSEDES:")[0].trim(),
  };
}

/**
 * The route annotates a message TWICE: provenance when the answer starts, and
 * what memory did with the turn when it finishes. Reading only `[0]` silently
 * dropped the second one, so a saved fact never reached the UI.
 */
function annotationOf(annotations: unknown[] | undefined): Annotation | null {
  if (!annotations?.length) return null;
  const merged = annotations.reduce<Annotation>((acc, entry) => {
    return entry && typeof entry === "object" ? { ...acc, ...(entry as Annotation) } : acc;
  }, {});
  return Object.keys(merged).length ? merged : null;
}

export default function Chat() {
  const router = useRouter();
  /*
   * The memory rail is rendered by the /agent server component at page load.
   * Nothing re-ran it, so a fact written during the conversation stayed
   * invisible until a manual reload — the rail said "nothing stored yet" for
   * the entire session no matter what was saved. The route awaits its writes
   * before closing the stream, so by the time this fires the fact has landed.
   */
  const { messages, input, handleInputChange, handleSubmit, status, append, error, reload } =
    useChat({ api: "/api/chat", onFinish: () => router.refresh() });
  const busy = status === "streaming" || status === "submitted";

  // Which message's provenance is expanded. Chips are a summary; the full
  // stored line, distance and all, is one click away.
  const [openOn, setOpenOn] = useState<string | null>(null);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-col px-6">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-16">
          <h1 className="font-display text-[44px] font-medium leading-[1.05] tracking-[-0.03em]">
            What should you eat?
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            I already know what you avoid. Ask me anything about food.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => append({ role: "user", content: s })}
                className="chip"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-7 overflow-y-auto py-10">
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[78%] whitespace-pre-wrap rounded-[10px] bg-surface-hi px-4 py-3 text-[15px] leading-normal">
                    {m.content}
                  </p>
                </li>
              );
            }

            const note = annotationOf(m.annotations);
            const recalled = note?.recalled ?? [];
            const stored = note?.stored;
            const open = openOn === m.id;

            return (
              <li key={m.id} className="flex gap-3.5">
                <span
                  aria-hidden
                  className="mt-1 size-6 shrink-0 rounded-full"
                  style={{ background: "linear-gradient(140deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 45%, #000))" }}
                />

                <div className="card min-w-0 flex-1 px-5 py-4">
                  <p className="whitespace-pre-wrap text-[15px] leading-[1.65]">{m.content}</p>

                  {recalled.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {recalled.map((fact, i) => {
                        const { kind, claim } = parseFact(fact.text);
                        return (
                          <button
                            key={`${m.id}-${i}`}
                            type="button"
                            onClick={() => setOpenOn(open ? null : m.id)}
                            aria-expanded={open}
                            className="chip"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                              <ellipse cx="12" cy="6" rx="7.5" ry="3" />
                              <path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
                              <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
                            </svg>
                            <span className="font-mono uppercase tracking-[0.06em] text-[10.5px] text-ink-faint">{kind}</span>
                            <span className="truncate max-w-[22ch]">{claim}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {open && recalled.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5 rounded-[8px] border border-line-soft bg-recess px-3.5 py-3">
                      {recalled.map((fact, i) => (
                        <li key={`${m.id}-full-${i}`} className="fact flex items-baseline justify-between gap-4 text-ink-muted">
                          <span className="truncate">{fact.text}</span>
                          <span className="shrink-0 text-ink-faint">{fact.distance.toFixed(3)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/*
                    Reading and writing are different events and this footer used
                    to conflate them: it printed "nothing stored yet" whenever
                    the turn RECALLED nothing, which is also true of every first
                    turn and of a turn that just saved an allergy. Report the two
                    separately, and never claim the record is empty on the
                    strength of a recall.
                  */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft pt-3">
                    <span className="text-[11.5px] text-ink-faint">
                      {note?.model ? `${note.model}` : ""}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {stored?.failed ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] text-danger"
                          style={{ background: "color-mix(in oklab, var(--c-danger) 12%, transparent)" }}
                          title={stored.failed}
                        >
                          could not save this turn
                        </span>
                      ) : stored?.written.length ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{ background: "color-mix(in oklab, var(--c-accent) 14%, transparent)", color: "var(--c-accent)" }}
                          title={stored.written.join("\n")}
                        >
                          saved {stored.written.length} fact{stored.written.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-surface-hi px-2.5 py-1 text-[11px] text-ink-muted">
                        {recalled.length
                          ? `recalled ${recalled.length} fact${recalled.length === 1 ? "" : "s"}`
                          : "recalled nothing"}
                      </span>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}

          {busy && (
            <li className="flex items-center gap-1.5 pl-10 text-ink-faint" aria-live="polite">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${d}ms` }} />
              ))}
            </li>
          )}
        </ol>
      )}

      {/* A failed turn must never look like a silent one. The route fails closed
          when memory is unreachable, so this is the only place the person finds
          out the agent is answering blind — say it, don't swallow it. */}
      {error && (() => {
        /*
         * A missing model key is not a transient failure, so offering "Try
         * again" is a lie — retrying calls the same route with the same absent
         * key and fails identically. Send the person to the thing that
         * actually fixes it instead.
         */
        const needsKey = error.message.includes(NO_KEY_CODE);
        const text = needsKey
          ? error.message.split(`${NO_KEY_CODE}:`).pop()!.trim()
          : error.message || "Something went wrong.";

        return (
          <p
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-dashed px-4 py-3.5 text-[13px] leading-relaxed text-ink-muted"
            style={{ borderColor: needsKey ? "var(--c-warn-line)" : "var(--c-line)" }}
          >
            {text}
            {needsKey ? (
              <button type="button" onClick={() => openKeysPanel()} className="chip">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="3.1" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
                </svg>
                Add a model key
              </button>
            ) : (
              <button type="button" onClick={() => reload()} className="chip">
                Try again
              </button>
            )}
          </p>
        );
      })()}

      <div className="flex-1" />

      <form onSubmit={handleSubmit} className="sticky bottom-0 bg-canvas pb-6 pt-3">
        <div className="card px-3 pb-3 pt-3.5">
          <input
            value={input}
            onChange={handleInputChange}
            aria-label="Message"
            placeholder="Tell it about a condition, or just ask what to eat…"
            className="w-full bg-transparent px-2 pb-3 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="chip pointer-events-none">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: "var(--c-accent)" }}
              />
              Memory on
            </span>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="cta grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-25"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
