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
        className="flex flex-col justify-between border-r border-line-soft bg-recess px-14 py-13"
        style={{ background: "radial-gradient(50rem 34rem at 12% 8%, var(--c-accent-wash), transparent 62%), var(--c-recess)" }}
      >
        <Link href="/"><Wordmark size={28} /></Link>

        <div className="py-12">
          <h1 className="max-w-[13ch] font-display font-medium text-[62px] leading-[1.02] tracking-[-0.03em]">
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

      <div className="flex flex-col justify-center px-16 py-13">
        <SignIn />
      </div>
    </div>
  );
}
