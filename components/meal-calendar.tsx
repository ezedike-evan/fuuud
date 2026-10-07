"use client";

import { useState, useTransition } from "react";
import { generatePlanWeek, removeMeal, declareNoRestrictions, type PlanWeek } from "@/app/actions/plan";
import { SLOTS, dayLabel } from "@/lib/plan";
import { googleCalendarUrl } from "@/lib/ics";
import MemoryUnavailable from "./memory-unavailable";

/**
 * The week, screened against the record as it stands right now.
 *
 * A red cell is the feature, not an error state: it means the agent learned
 * something about you AFTER this meal was planned, and reached back into work
 * already done. Nothing silently rewrites the plan — it is shown, and removing
 * it is the person's call.
 */
export default function MealCalendar({ initial }: { initial: PlanWeek }) {
  const [week, setWeek] = useState(initial);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<PlanWeek>) {
    setError(null);
    startTransition(async () => {
      try {
        setWeek(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  // The record could not be read: say so INSTEAD of the plan. An empty week here would look
  // like "no allergies" and invite the person to plan on top of nothing.
  if (week.unavailable) {
    return (
      <>
        <h1 className="font-display font-medium text-[40px] leading-[1.05] tracking-[-0.03em]">Your week</h1>
        <div className="mt-6 max-w-2xl"><MemoryUnavailable failure={week.unavailable} /></div>
      </>
    );
  }

  const clashes = week.meals.filter((m) => !m.safe);
  const mealAt = (date: string, slot: string) =>
    week.meals.find((m) => m.date === date && m.slot === slot);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display font-medium text-[40px] leading-[1.05] tracking-[-0.03em]">
            Your week
          </h1>
          <p className="mt-2.5 max-w-[58ch] text-[14.5px] leading-relaxed text-ink-muted">
            {week.blocked
              ? "Before it plans seven days of food, it needs to know whether there is anything you cannot eat. If there is nothing, say so once and it will not ask again."
              : "Every meal here is checked against your record each time this page loads, not just when it was planned."}
          </p>
        </div>

        {week.blocked ? (
          /*
            Having nothing to declare is an ANSWER. Without this the calendar
            was effectively gated behind having a diagnosis, which is exactly
            backwards — most people have no restrictions and still want the
            week planned.
          */
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(declareNoRestrictions)}
              className="cta h-11 px-5 text-[14px] disabled:opacity-40"
            >
              {busy ? "Planning…" : "I have no allergies or conditions"}
            </button>
            <a href="/agent" className="text-[12px] text-ink-faint underline underline-offset-2 hover:text-ink-muted">
              I do have something to declare →
            </a>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(generatePlanWeek)}
            className="cta h-11 shrink-0 px-5 text-[14px] disabled:opacity-40"
          >
            {busy ? "Planning…" : week.meals.length ? "Plan again" : "Plan my week"}
          </button>
        )}
      </div>

      {/* What the plan was built from. The memory doing visible work. */}
      {!week.blocked && (week.profile.allergies.length || week.profile.conditions.length || week.profile.dislikes.length || week.profile.likes.length || week.profile.goals.length ||
        week.profile.observances.length || week.profile.practical.length) ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {week.profile.allergies.map((a) => (
            <span key={`a-${a}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-danger">allergy</span>
              {a}
            </span>
          ))}
          {week.profile.conditions.map((c) => (
            <span key={`c-${c}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-accent">condition</span>
              {c}
            </span>
          ))}
          {week.profile.observances.map((o) => (
            <span key={`o-${o}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-danger">rule</span>
              {o}
            </span>
          ))}
          {week.profile.practical.map((pr) => (
            <span key={`p-${pr}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-ink-faint">limit</span>
              {pr}
            </span>
          ))}
          {week.profile.likes.map((l) => (
            <span key={`l-${l}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-accent">likes</span>
              {l}
            </span>
          ))}
          {week.profile.goals.map((g) => (
            <span key={`g-${g}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-accent">goal</span>
              {g}
            </span>
          ))}
          {week.profile.dislikes.map((d) => (
            <span key={`d-${d}`} className="chip text-[12px]">
              <span className="font-mono uppercase tracking-[0.06em] text-[10px] text-ink-faint">dislike</span>
              {d}
            </span>
          ))}
        </div>
      ) : null}

      {clashes.length > 0 && (
        <p
          role="alert"
          className="mt-6 rounded-[10px] border border-danger-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-muted"
        >
          <strong className="font-medium text-danger">
            {clashes.length} planned {clashes.length === 1 ? "meal clashes" : "meals clash"} with what your
            agent now knows.
          </strong>{" "}
          These were safe when they were planned. Something you have told it since says otherwise, so they
          are flagged rather than quietly rewritten.
        </p>
      )}

      {week.remindersCancelled.length > 0 && (
        <p role="status" className="mt-6 rounded-[10px] border border-warn-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-muted">
          <strong className="font-medium text-warn">
            {week.remindersCancelled.length} {week.remindersCancelled.length === 1 ? "reminder was" : "reminders were"} cancelled.
          </strong>{" "}
          {week.remindersCancelled.join("; ")} no longer passes your record, so nothing will be sent for it.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-[10px] border border-danger-line px-4 py-3.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* PHONE: one card per day. An eight-column week cannot be read at 390px, and the desktop cells hide
          Remove / + Calendar until hover, which a touch screen never produces: here they are always visible. */}
      <ol className="mt-6 flex flex-col gap-3 sm:hidden">
        {week.dates.map((date) => {
          const { weekday, day } = dayLabel(date);
          return (
            <li key={date} className="overflow-hidden rounded-[10px] border border-line">
              <div className="flex items-baseline justify-between bg-surface px-4 py-2.5">
                <p className="eyebrow">{weekday}</p>
                <p className="font-mono text-[12px] tabular-nums text-ink-muted">{day}</p>
              </div>
              <ul className="divide-y divide-line-soft">
                {SLOTS.map((slot) => {
                  const meal = mealAt(date, slot);
                  return (
                    <li
                      key={slot}
                      className="flex items-start justify-between gap-3 px-4 py-3"
                      style={meal && !meal.safe ? { background: "color-mix(in oklab, var(--c-danger) 9%, transparent)" } : undefined}
                    >
                      <div className="min-w-0">
                        <p className="eyebrow">{slot}</p>
                        {meal ? (
                          <>
                            <p className={`mt-1 text-[14px] leading-snug ${meal.safe ? "text-ink" : "text-danger"}`}>{meal.meal}</p>
                            {!meal.safe && (
                              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-danger">
                                {meal.flags.slice(0, 2).join(", ") || "clashes"}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="mt-1 text-[13px] text-ink-faint">Nothing planned</p>
                        )}
                      </div>
                      {meal && (
                        <div className="flex shrink-0 flex-col items-end">
                          {meal.safe && (
                            <a
                              href={googleCalendarUrl(meal)}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`Add ${slot} on ${date} to Google Calendar`}
                              className="flex min-h-10 items-center px-1 text-[12.5px] text-ink-muted underline underline-offset-2"
                            >
                              + Calendar
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => removeMeal(date, slot))}
                            aria-label={`Remove ${slot} on ${date}`}
                            className="flex min-h-10 items-center px-1 text-[12.5px] text-ink-faint hover:text-danger disabled:opacity-30"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 hidden overflow-x-auto sm:block">
        <div className="grid min-w-[52rem] grid-cols-[86px_repeat(7,minmax(0,1fr))] gap-px rounded-[10px] border border-line bg-line">
          <div className="bg-surface px-3 py-2.5" />
          {week.dates.map((d) => {
            const { weekday, day } = dayLabel(d);
            return (
              <div key={d} className="bg-surface px-3 py-2.5">
                <p className="eyebrow">{weekday}</p>
                <p className="mt-1 font-mono text-[12px] tabular-nums text-ink-muted">{day}</p>
              </div>
            );
          })}

          {SLOTS.map((slot) => (
            <div key={slot} className="contents">
              <div className="flex items-center bg-surface px-3 py-3">
                <span className="eyebrow">{slot}</span>
              </div>
              {week.dates.map((date) => {
                const meal = mealAt(date, slot);
                return (
                  <div
                    key={`${date}-${slot}`}
                    className="min-h-[76px] bg-canvas px-2.5 py-2.5"
                    style={meal && !meal.safe ? { background: "color-mix(in oklab, var(--c-danger) 9%, transparent)" } : undefined}
                  >
                    {meal ? (
                      <div className="group flex h-full flex-col justify-between gap-1.5">
                        <p className={`text-[12.5px] leading-snug ${meal.safe ? "text-ink" : "text-danger"}`}>
                          {meal.meal}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          {meal.safe ? (
                            <span aria-hidden />
                          ) : (
                            <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-danger">
                              {meal.flags.slice(0, 2).join(", ") || "clashes"}
                            </span>
                          )}
                          {meal.safe && (
                            <a
                              href={googleCalendarUrl(meal)}
                              target="_blank"
                              rel="noreferrer noopener"
                              aria-label={`Add ${slot} on ${date} to Google Calendar`}
                              className="text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-accent focus:opacity-100 group-hover:opacity-100"
                            >
                              + Calendar
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => removeMeal(date, slot))}
                            aria-label={`Remove ${slot} on ${date}`}
                            className="text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[12px] text-ink-faint">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-[70ch] text-[12px] leading-relaxed text-ink-faint">
        Meals are stored in their own namespace, separate from your health record, so a plan is never
        mistaken for something you told the agent about your body. Removing one writes a retraction — the
        encrypted entry stays on Walrus until its storage period expires, like every other fact here.
      </p>
    </>
  );
}
