"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { openKeysPanel } from "./api-keys-menu";
import { NO_KEY_CODE } from "@/lib/providers";
import { announceSaving } from "@/lib/save-events";
import MemoryUnavailable from "./memory-unavailable";
import type { MemoryFailure } from "@/lib/memory-errors";
import { useElapsed, walrusStage } from "@/lib/use-elapsed";
import { useWriteJobs, type JobRef } from "@/lib/use-write-jobs";
import { isSettled, overall, stageLabel } from "@/lib/write-stages";
import Markdown from "./markdown";
import { useDictation } from "@/lib/use-dictation";

const STARTERS = [
  "I'm diabetic and groundnuts give me hives",
  "What should I eat today?",
  "Something light for dinner",
];

/** Shape of the provenance the route attaches to each assistant message. */
type Recalled = { text: string; distance: number };
type Stored = { written: string[]; skipped: string[]; failed: string | null; pending?: boolean; jobs?: JobRef[] };
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

/**
 * Follows the relayer jobs behind one reply's saved facts and shows the real stage,
 * ending in either "saved" or the reason it failed. It never reports saved on the
 * strength of the relayer merely accepting the write.
 */
function SaveChip({ jobs, onSettled, onActive }: { jobs: JobRef[]; onSettled: () => void; onActive: (active: boolean) => void }) {
  const views = useWriteJobs(jobs);
  const states = jobs.map((j) => views[j.jobId]?.state);
  const unknown = states.some((s) => s === "unknown");
  const state = overall(states);
  const settled = unknown || isSettled(state);
  const active = !settled;
  const failure = jobs.map((j) => views[j.jobId]).find((v) => v && (v.state === "failed" || v.state === "not_found" || v.state === "unknown"));
  const seconds = useElapsed(active);

  useEffect(() => {
    onActive(active);
    return () => onActive(false);
  }, [active, onActive]);
  useEffect(() => {
    if (state === "done") onSettled();
  }, [state, onSettled]);

  if (state === "failed" || unknown) {
    return (
      <span
        role="alert"
        className="rounded-full px-2.5 py-1 text-[11px] text-danger"
        style={{ background: "color-mix(in oklab, var(--c-danger) 12%, transparent)" }}
        title={failure?.error ?? undefined}
      >
        {unknown ? "still saving — check the panel" : `could not save${failure?.error ? `: ${failure.error}` : ""}`}
      </span>
    );
  }
  if (state === "done") {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-[11px]"
        style={{ background: "color-mix(in oklab, var(--c-accent) 14%, transparent)", color: "var(--c-accent)" }}
      >
        saved {jobs.length} fact{jobs.length === 1 ? "" : "s"} to Walrus
      </span>
    );
  }
  return (
    <span role="status" aria-live="polite" className="saving inline-flex items-center gap-2 rounded-full bg-surface-hi px-2.5 py-1 text-[11px] text-ink-muted">
      <span aria-hidden className="saving-dot size-[5px] rounded-full bg-accent" />
      <span className="tabular-nums">{stageLabel(state)}… {seconds}s</span>
    </span>
  );
}

export default function Chat({ unavailable }: { unavailable?: MemoryFailure }) {
  const router = useRouter();
  /*
   * The memory rail is rendered by the /agent server component at page load.
   * Nothing re-ran it, so a fact written during the conversation stayed
   * invisible until a manual reload — the rail said "nothing stored yet" for
   * the entire session no matter what was saved. The route awaits its writes
   * before closing the stream, so by the time this fires the fact has landed.
   */
  /*
   * A typed message must never vanish. The draft is mirrored to sessionStorage as
   * it is typed, kept in `sent` while a request is in flight, and put back in the
   * box (with the failed turn removed) if the request fails.
   */
  const DRAFT_KEY = "fuuud:draft";
  const sent = useRef("");
  const { messages, input, setInput, handleInputChange, handleSubmit, status, append, error, setMessages } =
    useChat({
      api: "/api/chat",
      // The stream now closes as soon as the answer is done; saving is followed per job.
      onFinish: () => router.refresh(),
      onError: () => {
        setMessages((prev) => (prev.at(-1)?.role === "user" ? prev.slice(0, -1) : prev));
        if (sent.current) setInput(sent.current);
      },
    });
  const inputRef = useRef<HTMLInputElement>(null);
  const dictation = useDictation((text) => {
    setInput((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text));
    inputRef.current?.focus();
  });
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) setInput((cur) => cur || saved);
    } catch {}
    // restore once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (input) sessionStorage.setItem(DRAFT_KEY, input);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [input]);
  const busy = status === "streaming" || status === "submitted";

  /*
   * A write is in flight when the turn is still open AFTER the report deadline
   * passed without the write finishing (stored.pending). The route keeps the
   * stream open until the write settles, so `busy` going false is the end of it.
   * The chip and the rail's placeholder card both key off this one flag.
   */
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastStored = annotationOf(lastAssistant?.annotations)?.stored;
  const writing = busy && Boolean(lastStored?.pending);
  const writeSeconds = useElapsed(writing);
  const [jobsActive, setJobsActive] = useState(false);
  useEffect(() => {
    announceSaving(writing || jobsActive);
    return () => announceSaving(false);
  }, [writing, jobsActive]);
  const refresh = useCallback(() => router.refresh(), [router]);

  // Which message's provenance is expanded. Chips are a summary; the full
  // stored line, distance and all, is one click away.
  const [openOn, setOpenOn] = useState<string | null>(null);

  /*
   * Follow a streaming reply.
   *
   * The message list is its own scroll region now, so unlike a page that grows
   * downward it does not follow new content on its own — a long answer would
   * stream in below the fold with no indication anything was happening.
   *
   * It only follows while the reader is already at the bottom. Scroll up to
   * re-read something and the view stays where you put it, which is the whole
   * reason this is a ref and not state: it must not re-render on every scroll
   * event mid-stream.
   */
  const listRef = useRef<HTMLOListElement>(null);
  const followStream = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !followStream.current) return;
    // `behavior: auto` on purpose — the container sets scroll-behavior: smooth
    // for ordinary scrolling, but animating every token of a stream stutters.
    list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
  }, [messages, status]);

  return (
    /*
      The chat column is exactly the height of its grid cell. Only the message
      list scrolls: the composer below is a sibling, not a `sticky` child, so it
      cannot drift with the content or overlap the last reply.
    */
    <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 sm:px-6">
      {messages.length === 0 ? (
        <div className="scroll-quiet flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-8 sm:py-16">
          <h1 className="font-display text-[32px] font-medium leading-[1.05] tracking-[-0.03em] text-balance sm:text-[44px]">
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
                onClick={() => {
                  sent.current = s;
                  void append({ role: "user", content: s });
                }}
                className="chip"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            // A little slack, so a stray pixel does not count as "scrolled away".
            followStream.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="scroll-quiet flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto py-10"
        >
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <li key={m.id} className="flex justify-end">
                  <p className="max-w-[88%] whitespace-pre-wrap rounded-[10px] bg-surface-hi px-4 py-3 text-[15px] leading-normal sm:max-w-[78%]">
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

                <div className="card min-w-0 flex-1 px-4 py-3.5 sm:px-5 sm:py-4">
                  <Markdown text={m.content} />

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

                  {open && stored?.failed && (
                    <p className="fact mt-3 rounded-[8px] border border-danger-line bg-recess px-3.5 py-3 text-danger">
                      {stored.failed}
                    </p>
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
                        /*
                          A tooltip is the wrong place for the only copy of an
                          error. "could not save this turn" tells you something
                          broke but not what, and the reason is the whole point
                          — it names the model or the relayer call that failed.
                        */
                        <button
                          type="button"
                          onClick={() => setOpenOn(open ? null : m.id)}
                          aria-expanded={open}
                          className="rounded-full px-2.5 py-1 text-[11px] text-danger"
                          style={{ background: "color-mix(in oklab, var(--c-danger) 12%, transparent)" }}
                        >
                          could not save this turn — why?
                        </button>
                      ) : stored?.jobs?.length ? (
                        <SaveChip jobs={stored.jobs} onSettled={refresh} onActive={setJobsActive} />
                      ) : stored?.written.length ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px]"
                          style={{ background: "color-mix(in oklab, var(--c-accent) 14%, transparent)", color: "var(--c-accent)" }}
                          title={stored.written.join("\n")}
                        >
                          saved {stored.written.length} fact{stored.written.length === 1 ? "" : "s"}
                        </span>
                      ) : stored?.pending ? (
                        /*
                          The write outran the report deadline rather than
                          failing. While the turn is open it is still running,
                          and says so with a live count; once the stream closes
                          the write has settled and the rail shows what landed.
                        */
                        m.id === lastAssistant?.id && busy ? (
                          <span
                            role="status"
                            aria-live="polite"
                            className="saving inline-flex items-center gap-2 rounded-full bg-surface-hi px-2.5 py-1 text-[11px] text-ink-muted"
                          >
                            <span aria-hidden className="saving-dot size-[5px] rounded-full bg-accent" />
                            <span className="tabular-nums">{walrusStage(writeSeconds)}… {writeSeconds}s</span>
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-surface-hi px-2.5 py-1 text-[11px] text-ink-muted"
                            title="The write finished after this answer. The memory panel on the right shows what landed."
                          >
                            saved — see the panel
                          </span>
                        )
                      ) : stored?.skipped.length ? (
                        <span
                          className="rounded-full bg-surface-hi px-2.5 py-1 text-[11px] text-ink-muted"
                          title={stored.skipped.join("\n")}
                        >
                          already knew {stored.skipped.length}
                        </span>
                      ) : stored ? (
                        /*
                          The write path must never be silent. A turn with
                          nothing worth keeping is the common case and says so
                          quietly — but saying nothing at all is what made a
                          broken write look identical to an ordinary turn.
                        */
                        <span className="rounded-full px-2.5 py-1 text-[11px] text-ink-faint">
                          nothing to save
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
          : /failed to fetch|load failed|network ?error|networkerror/i.test(error.message)
            ? "Lost the connection before the answer came back."
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
              <span className="text-ink-faint">Your message is back in the box.</span>
            )}
          </p>
        );
      })()}

      {/* No spacer and no `sticky`: the message list above owns the free space
          and does the scrolling, so the composer simply sits at the bottom of
          a fixed column. */}
      {unavailable && (
        <div className="mb-3 shrink-0"><MemoryUnavailable failure={unavailable} compact /></div>
      )}

      <form
        onSubmit={(e) => {
          sent.current = input;
          handleSubmit(e);
        }}
        className="shrink-0 bg-canvas pb-4 pt-3 sm:pb-6">
        <div className="card px-3 pb-3 pt-3.5">
          <input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            aria-label="Message"
            disabled={Boolean(unavailable)}
            placeholder={unavailable ? "Your memory has to be readable before it can answer safely." : "Ask, or tell it a condition…"}
            className="w-full bg-transparent px-2 pb-3 text-base text-ink placeholder:text-ink-faint focus:outline-none sm:text-[15px]"
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
            <div className="flex items-center gap-2.5">
            {dictation.supported && (
              <button
                type="button"
                onClick={dictation.state === "recording" ? dictation.stop : dictation.start}
                disabled={dictation.state === "transcribing" || Boolean(unavailable)}
                aria-pressed={dictation.state === "recording"}
                aria-label={dictation.state === "recording" ? "Stop recording" : "Dictate a message"}
                title={dictation.state === "recording" ? "Stop and transcribe" : "Dictate with your voice"}
                className={`grid size-11 shrink-0 place-items-center rounded-full border transition-colors sm:size-9 ${
                  dictation.state === "recording" ? "border-danger-line text-danger" : "border-line text-ink-muted hover:text-ink"
                } disabled:opacity-40`}
              >
                {dictation.state === "recording" ? (
                  <span aria-hidden className="size-3 rounded-[3px] bg-danger" />
                ) : dictation.state === "transcribing" ? (
                  <span aria-hidden className="saving-dot size-[7px] rounded-full bg-accent" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !input.trim() || Boolean(unavailable)}
              aria-label="Send"
              className="cta grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-25 sm:size-9"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
              </svg>
            </button>
            </div>
          </div>
          {/* Dictation status: what it is doing, and why it failed if it did. */}
          <p role="status" aria-live="polite" className="min-h-0 px-2 pt-2 text-[12px] text-ink-faint empty:hidden">
            {dictation.state === "recording"
              ? `Listening… ${dictation.seconds}s. Press the square to stop.`
              : dictation.state === "transcribing"
                ? "Writing down what you said…"
                : dictation.error ?? ""}
          </p>
        </div>
      </form>
    </div>
  );
}
