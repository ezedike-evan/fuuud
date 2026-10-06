import "server-only";
import webpush, { type PushSubscription } from "web-push";

/**
 * Web Push (VAPID). Works with the tab closed on Chrome, Firefox and Edge, and
 * on iOS only once the site is installed to the home screen.
 *
 *   npx web-push generate-vapid-keys
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https:)
 */
export const vapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
export const pushConfigured = () => Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY?.trim());

let ready = false;
function init() {
  if (ready) return;
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!pushConfigured() || !subject) throw new Error("Web Push needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.");
  webpush.setVapidDetails(subject, vapidPublicKey()!, process.env.VAPID_PRIVATE_KEY!.trim());
  ready = true;
}

export const isSubscription = (v: unknown): v is PushSubscription => {
  const s = v as PushSubscription | null;
  return Boolean(s && typeof s.endpoint === "string" && s.endpoint.startsWith("https://") && s.keys?.p256dh && s.keys?.auth);
};

/** Returns "gone" when the browser has dropped the subscription (404/410), so the caller can forget it. */
export async function sendPush(sub: PushSubscription, payload: { title: string; body: string; url?: string }): Promise<"sent" | "gone"> {
  init();
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 });
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    throw error;
  }
}
