"use client";

import { useState, useTransition } from "react";
import { generatePlanWeek, removeMeal, type PlanWeek } from "@/app/actions/plan";
import { SLOTS, dayLabel } from "@/lib/plan";

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
              ? "Nothing planned yet. The agent will not plan a week of meals before it knows your allergies — tell it once and come back."
              : "Every meal here is checked against your record each time this page loads, not just when it was planned."}
          </p>
        </div>

        {!week.blocked && (
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

      {error && (
        <p role="alert" className="mt-6 rounded-[10px] border border-danger-line px-4 py-3.5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
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
