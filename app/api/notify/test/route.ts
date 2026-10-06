import { getOwnerAddress } from "@/lib/session.ts";
import { getRecord } from "@/lib/notify-store.ts";
import { sendTelegramMessage } from "@/lib/telegram.ts";
import { sendPush } from "@/lib/push.ts";

/** Sends one harmless line to every connected channel, so setup can be checked without waiting for a meal. */
export async function POST() {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });
  const record = await getRecord(address);
  if (!record) return Response.json({ sent: [], note: "No channel connected." });

  const sent: string[] = [];
  const failed: string[] = [];
  if (record.telegramChatId) {
    await sendTelegramMessage(record.telegramChatId, "Test from Fuuud. Reminders will arrive here.").then(() => sent.push("telegram"), (e) => failed.push(`telegram: ${e.message}`));
  }
  if (record.push) {
    await sendPush(record.push, { title: "Fuuud", body: "Test notification. Reminders will arrive here.", url: "/calendar" }).then(
      (r) => (r === "sent" ? sent.push("push") : failed.push("push: subscription expired")),
      (e) => failed.push(`push: ${e.message}`),
    );
  }
  return Response.json({ sent, failed });
}
