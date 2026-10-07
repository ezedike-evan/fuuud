"use client";

import { useEffect, useState } from "react";
import { isSettled, type JobState } from "./write-stages";

export type JobView = { state: JobState | undefined; error: string | null };
export type JobRef = { jobId: string; kind: string };

const POLL_MS = 1000;
const GIVE_UP_MS = 180_000;

/**
 * Follow relayer write jobs to the end, polling the way the Walrus Memory demo does.
 * A transient poll failure retries; it never turns into "saved". Past GIVE_UP_MS the
 * state becomes `unknown` so the chip says so instead of spinning forever.
 */
export function useWriteJobs(jobs: JobRef[] | undefined): Record<string, JobView> {
  const [views, setViews] = useState<Record<string, JobView>>({});
  const key = (jobs ?? []).map((j) => `${j.kind}:${j.jobId}`).join(",");

  useEffect(() => {
    if (!jobs?.length) return;
    let stopped = false;
    const started = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const follow = (job: JobRef) => {
      const tick = async () => {
        if (stopped) return;
        let view: JobView | null = null;
        try {
          const res = await fetch(`/api/memory/job?id=${encodeURIComponent(job.jobId)}&kind=${encodeURIComponent(job.kind)}`, { cache: "no-store" });
          if (res.ok) {
            const body = (await res.json()) as { state: JobState; error: string | null };
            view = { state: body.state, error: body.error };
          }
        } catch {
          // network blip: keep polling
        }
        if (stopped) return;
        if (view) setViews((v) => ({ ...v, [job.jobId]: view! }));
        if (view && isSettled(view.state)) return;
        if (Date.now() - started > GIVE_UP_MS) {
          setViews((v) => ({ ...v, [job.jobId]: { state: "unknown", error: "Walrus is taking longer than expected. Check the memory panel in a minute." } }));
          return;
        }
        timers.push(setTimeout(tick, POLL_MS));
      };
      void tick();
    };
    jobs.forEach(follow);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
    // `key` captures the job list identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return views;
}
