import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders, dueReminders, reminderInstant, GRACE_MS } from "./reminders.ts";
import { buildIcs, googleCalendarUrl } from "./ics.ts";
import type { ScreenedMeal } from "./plan.ts";

const meal = (over: Partial<ScreenedMeal> = {}): ScreenedMeal => ({
  date: "2026-09-02", slot: "lunch", meal: "jollof rice with chicken", safe: true, flags: [], ...over,
});
const NOW = Date.UTC(2026, 8, 1, 10, 0);

test("Lagos (UTC+1, offset -60) lunch at 12:30 local is 11:30 UTC", () => {
  assert.equal(reminderInstant("2026-09-02", "lunch", -60), Date.UTC(2026, 8, 2, 11, 30));
});

test("an unsafe meal never becomes a reminder", () => {
  const { reminders } = buildReminders([meal({ safe: false, flags: ["peanut"] })], -60, [], NOW);
  assert.equal(reminders.length, 0);
});

test("a meal that turns unsafe cancels its pending reminder", () => {
  const first = buildReminders([meal()], -60, [], NOW);
  const second = buildReminders([meal({ safe: false, flags: ["peanut"] })], -60, first.reminders, NOW);
  assert.equal(second.reminders.length, 0);
  assert.deepEqual(second.cancelled.map((r) => r.id), ["2026-09-02:lunch"]);
});

test("a sent reminder is not re-sent, and is not reported as cancelled", () => {
  const first = buildReminders([meal()], -60, [], NOW).reminders.map((r) => ({ ...r, sentAt: NOW }));
  const again = buildReminders([meal()], -60, first, NOW);
  assert.equal(again.reminders[0].sentAt, NOW);
  assert.equal(again.cancelled.length, 0);
});

test("a changed meal is a new, unsent reminder", () => {
  const first = buildReminders([meal()], -60, [], NOW).reminders.map((r) => ({ ...r, sentAt: NOW }));
  const again = buildReminders([meal({ meal: "ofada rice" })], -60, first, NOW);
  assert.equal(again.reminders[0].sentAt, undefined);
});

test("due = past, inside the grace window, unsent", () => {
  const [r] = buildReminders([meal()], -60, [], NOW).reminders;
  assert.equal(dueReminders([r], r.at - 1).length, 0);
  assert.equal(dueReminders([r], r.at).length, 1);
  assert.equal(dueReminders([r], r.at + GRACE_MS + 1).length, 0);
  assert.equal(dueReminders([{ ...r, sentAt: r.at }], r.at).length, 0);
});

test("ics escapes, folds and stays CRLF", () => {
  const ics = buildIcs([{ date: "2026-09-02", slot: "dinner", meal: "egusi soup, semo; with ".padEnd(120, "x") }]);
  assert.ok(ics.includes("\r\n"));
  assert.ok(ics.includes("DTSTART:20260902T183000"));
  assert.ok(ics.includes("\\,"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test("google link carries the window", () => {
  const url = googleCalendarUrl({ date: "2026-09-02", slot: "breakfast", meal: "akamu" });
  assert.ok(url.includes("20260902T073000%2F20260902T081500"));
});
