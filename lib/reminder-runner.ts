import "server-only";
import { allUsers, getRecord, saveRecord } from "./notify-store.ts";
import { dueReminders, reminderText } from "./reminders.ts";
import { sendTelegramMessage } from "./telegram.ts";
import { pushConfigured, sendPush } from "./push.ts";

/**
 * Send whatever is due. Called by /api/cron/reminders, which the GitHub
 * Actions workflow pings on a schedule.
 *
 * WHAT THIS CANNOT DO: re-screen a meal at send time. It has no request, no
 * cookie and no delegate key, so it cannot read the person's record. The screen
 * ran when the reminder was scheduled and re-runs on every plan read and every
 * chat turn that stores a fact (lib/reminders-sync); a change made in between
 * can be at most one run interval behind.
 *
 * Safe to run twice at once or to overlap: a reminder is marked sent only after
 * a channel accepted it, and a sent reminder is never picked up again.
 */
export async function runDueReminders(): Promise<{ sent: number; failed: number }> {
  const now = Date.now();
  let sent = 0;
  let failed = 0;

  for (const address of await allUsers()) {
    const record = await getRecord(address);
    if (!record) continue;
    const due = dueReminders(record.reminders, now);
    if (!due.length) continue;

    let next = { ...record };
    for (const reminder of due) {
      const text = reminderText(reminder);
      let delivered = false;

      if (next.telegramChatId) {
        await sendTelegramMessage(next.telegramChatId, text).then(
          () => (delivered = true),
          (e) => { failed++; console.error("[fuuud] reminder telegram:", e.message); },
        );
      }
      if (next.push && pushConfigured()) {
        const result = await sendPush(next.push, { title: "Fuuud", body: text, url: "/calendar" }).catch((e) => { failed++; console.error("[fuuud] reminder push:", e.message); return null; });
        if (result === "sent") delivered = true;
        if (result === "gone") next = { ...next, push: undefined };
      }
      // Marked sent only if a channel took it; otherwise it is retried next run, inside the grace window.
      if (delivered) {
        sent++;
        next = { ...next, reminders: next.reminders.map((r) => (r.id === reminder.id ? { ...r, sentAt: now } : r)) };
      }
    }
    await saveRecord(address, next);
  }
  return { sent, failed };
}
