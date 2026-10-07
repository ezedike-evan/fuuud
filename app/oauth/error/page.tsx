import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import Link from "next/link";
import Wordmark from "@/components/wordmark";

export const dynamic = "force-dynamic";

/** Fixed messages keyed by a short code: nothing from the request is ever echoed onto this page. */
const MESSAGES: Record<string, string> = {
  unknown_client: "That app is not registered here, or its registration is no longer valid. Remove the connection in the app and add it again.",
  bad_redirect: "That app asked to send you somewhere this service does not allow, so the request was stopped before anything was shared.",
  invalid_request: "That connection request was malformed.",
  expired: "That connection request expired. Start again from the app you are connecting.",
  forbidden: "That request did not come from this site, so it was stopped.",
  not_configured: "This server has not been set up to accept connections from other apps yet. Nothing was shared.",
};

export default async function OAuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = (reason && MESSAGES[reason]) || "That connection request could not be completed.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <Link href="/"><Wordmark size={28} /></Link>
      <div className="w-full max-w-md">
        <p className="eyebrow">Connection stopped</p>
        <h1 className="mt-3.5 text-2xl font-medium leading-tight tracking-[-0.015em]">Nothing was shared.</h1>
        <p role="alert" className="mt-2.5 text-sm leading-relaxed text-ink-muted">{message}</p>
        <Link href="/agent" className="mt-6 inline-block text-[13px] underline underline-offset-2 text-ink-muted hover:text-ink">Back to Fuuud</Link>
      </div>
    </div>
  );
}

// Signed-in or transactional: never indexed (see lib/pages.ts PRIVATE_ROUTES).
export const metadata: Metadata = { title: "Connection problem", ...NOINDEX };
