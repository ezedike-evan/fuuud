import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerAddress } from "@/lib/session.ts";
import { hasPending } from "@/lib/oauth/pending.ts";
import Wordmark from "@/components/wordmark";
import SignIn from "@/components/sign-in";

export const dynamic = "force-dynamic";

const PROMISES = [
  "Tell it your conditions once. It never asks again.",
  "Encrypted to your own Sui address, not our database.",
  "Revoke this app onchain and the agent goes blind.",
];

export default async function SignInPage() {
  if (await getOwnerAddress()) redirect((await hasPending()) ? "/oauth/consent" : "/agent");

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div
        className="flex flex-col justify-between border-r border-line-soft bg-recess px-6 py-10 sm:px-14 sm:py-13"
        style={{ background: "radial-gradient(50rem 34rem at 12% 8%, var(--c-accent-wash), transparent 62%), var(--c-recess)" }}
      >
        <Link href="/"><Wordmark size={28} /></Link>

        <div className="py-12">
          <h1 className="max-w-[13ch] font-display font-medium text-[40px] sm:text-[62px] leading-[1.02] tracking-[-0.03em]">
            Never declare your allergy <em className="italic text-accent">twice</em>.
          </h1>
          <p className="mt-[22px] max-w-[44ch] text-base leading-[1.62] text-ink-muted">
            A nutrition agent that remembers your conditions across every session — and a record you
            own outright, not one we keep for you.
          </p>
        </div>

        <ul className="flex flex-col gap-[15px]">
          {PROMISES.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="mt-px shrink-0 text-accent">
                <path d="M5 12.5l4.2 4.2L19 7" />
              </svg>
              <span className="text-[13.5px] leading-normal text-ink-muted">{p}</span>
            </li>
          ))}
        </ul>
      </div>

      <main id="main" className="flex flex-col justify-center gap-8 px-6 py-12 sm:px-16 lg:py-13">
        <SignIn />
        <p className="max-w-[44ch] text-[12.5px] leading-relaxed text-ink-faint">
          By continuing you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-ink">terms</Link> and
          have read the <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">privacy policy</Link>.
          Fuuud gives food guidance, not medical advice.
        </p>
      </main>
    </div>
  );
}

// Signed-in or transactional: never indexed (see lib/pages.ts PRIVATE_ROUTES).
export const metadata: Metadata = { title: "Sign in", ...NOINDEX };
