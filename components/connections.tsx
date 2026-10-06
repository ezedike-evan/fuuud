"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  telegram: { configured: boolean; linked: boolean };
  push: { configured: boolean; publicKey: string | null; subscribed: boolean };
  pending: number;
};

const urlBase64ToUint8Array = (b64: string) => {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const btn =
  "rounded-[8px] border border-line px-[13px] py-[7px] text-[12.5px] transition-[background-color,transform] duration-200 hover:bg-surface active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

/**
 * Where reminders go. Nothing is stored until a channel is connected, and
 * disconnecting both deletes the queue. What the server keeps, in plain words:
 * the chat id, the push subscription, and the names and times of upcoming meals.
 */
export default function Connections() {
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async (poll = false) => {
    const res = await fetch(`/api/notify/status${poll ? "?poll=1" : ""}`);
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    // Tell the server our UTC offset so "lunch 12:30" means 12:30 where you are.
    fetch("/api/notify/tz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tz: new Date().getTimezoneOffset() }),
    }).catch(() => {});
  }, [refresh]);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  const connectTelegram = () =>
    run("telegram", async () => {
      const res = await fetch("/api/notify/telegram", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.open(url, "_blank", "noopener");
      setNote("Press Start in Telegram. This page checks for it every few seconds.");
      // The webhook may be doing the work already; polling covers local dev.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await fetch("/api/notify/status?poll=1");
        if (s.ok) {
          const next: Status = await s.json();
          setStatus(next);
          if (next.telegram.linked) {
            setNote("Telegram connected.");
            return;
          }
        }
      }
      setNote("Still waiting. Press Start in Telegram, then reload this page.");
    });

  const enablePush = () =>
    run("push", async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("This browser does not support web push. On iPhone, add the site to your home screen first.");
      }
      if (!status?.push.publicKey) throw new Error("Push is not configured on the server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in the browser, then try again.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.push.publicKey),
      });
      const res = await fetch("/api/notify/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), tz: new Date().getTimezoneOffset() }),
      });
      if (!res.ok) throw new Error(await res.text());
      await refresh();
      setNote("Browser notifications on.");
    });

  const disablePush = () =>
    run("push", async () => {
      const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      await fetch("/api/notify/push", { method: "DELETE" });
      await refresh();
    });

  const unlinkTelegram = () =>
    run("telegram", async () => {
      await fetch("/api/notify/telegram", { method: "DELETE" });
      await refresh();
    });

  const test = () =>
    run("test", async () => {
      const res = await fetch("/api/notify/test", { method: "POST" });
      const out = await res.json();
      setNote(out.sent?.length ? `Sent to ${out.sent.join(" and ")}.` : out.note ?? "Nothing was sent.");
      if (out.failed?.length) setError(out.failed.join(" · "));
    });

  const disconnectAll = () =>
    run("all", async () => {
      const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      await fetch("/api/notify/status", { method: "DELETE" });
      await refresh();
      setNote("Disconnected. The queued reminders were deleted.");
    });

  const connected = status && (status.telegram.linked || status.push.subscribed);

  return (
    <section className="rounded-[10px] border border-line px-5 py-[18px] lg:col-span-2">
      <h2 className="mb-1.5 text-sm font-medium">Reminders and calendar</h2>
      <p className="mb-4 max-w-[68ch] text-[12.5px] leading-relaxed text-ink-muted">
        A reminder is a message you cannot take back, so only meals that pass your current record are
        queued, and the queue is rebuilt whenever the record changes. To send on a schedule, the server
        keeps a chat id or push subscription and the names and times of your upcoming meals — nothing
        else, and nothing until you connect a channel.
      </p>

      <div className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3">
        <div className="flex flex-col justify-between gap-3 bg-canvas p-4">
          <div>
            <p className="eyebrow">Telegram</p>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              {!status ? "Checking…" : !status.telegram.configured ? "Not set up on this server." : status.telegram.linked ? "Connected." : "A message before each planned meal."}
            </p>
          </div>
          {status?.telegram.configured &&
            (status.telegram.linked ? (
              <button type="button" className={btn} disabled={busy !== null} onClick={unlinkTelegram}>Disconnect</button>
            ) : (
              <button type="button" className={btn} disabled={busy !== null} onClick={connectTelegram}>
                {busy === "telegram" ? "Waiting for Start…" : "Connect Telegram"}
              </button>
            ))}
        </div>

        <div className="flex flex-col justify-between gap-3 bg-canvas p-4">
          <div>
            <p className="eyebrow">This browser</p>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              {!status ? "Checking…" : !status.push.configured ? "Not set up on this server." : status.push.subscribed ? "Notifications on." : "Works with the tab closed."}
            </p>
          </div>
          {status?.push.configured &&
            (status.push.subscribed ? (
              <button type="button" className={btn} disabled={busy !== null} onClick={disablePush}>Turn off</button>
            ) : (
              <button type="button" className={btn} disabled={busy !== null} onClick={enablePush}>Turn on notifications</button>
            ))}
        </div>

        <div className="flex flex-col justify-between gap-3 bg-canvas p-4">
          <div>
            <p className="eyebrow">Calendar</p>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              Download the week as an .ics file for Google, Apple or Outlook. No account link needed.
            </p>
          </div>
          <a href="/api/calendar/ics" className={`${btn} inline-block text-center`}>Download .ics</a>
        </div>
      </div>

      {connected && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={btn} disabled={busy !== null} onClick={test}>Send a test</button>
          <button type="button" className={`${btn} text-danger`} disabled={busy !== null} onClick={disconnectAll}>Disconnect everything</button>
          <span className="font-mono text-[11.5px] tabular-nums text-ink-faint">{status?.pending ?? 0} queued</span>
        </div>
      )}

      <div aria-live="polite">
        {note && <p className="mt-3 text-[12.5px] text-ink-muted">{note}</p>}
        {error && <p role="alert" className="mt-3 text-[12.5px] text-danger">{error}</p>}
      </div>
    </section>
  );
}
