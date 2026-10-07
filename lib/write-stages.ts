/** Relayer job states, in order. `done` is the only one that means saved and searchable. */
export const STAGES = ["pending", "running", "uploaded", "done"] as const;
export type JobState = (typeof STAGES)[number] | "failed" | "not_found" | "unknown";

export const isSettled = (s: JobState | undefined) => s === "done" || s === "failed" || s === "not_found";

const LABEL: Record<string, string> = {
  pending: "Queued",
  running: "Encrypting and uploading to Walrus",
  uploaded: "On Walrus, indexing",
  done: "Saved",
};

export function stageLabel(state: JobState | undefined): string {
  return (state && LABEL[state]) || "Sending to Walrus";
}

/** The least-advanced state among several jobs, so one slow fact keeps the chip honest. */
export function overall(states: (JobState | undefined)[]): JobState | undefined {
  if (states.some((s) => s === "failed" || s === "not_found")) return "failed";
  if (states.every((s) => s === "done")) return "done";
  const idx = states.map((s) => (s ? STAGES.indexOf(s as (typeof STAGES)[number]) : -1));
  const min = Math.min(...idx);
  return min < 0 ? undefined : STAGES[min];
}
