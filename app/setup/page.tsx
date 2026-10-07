import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { currentScope } from "@/lib/memwal-scope.ts";
import { hasPending } from "@/lib/oauth/pending.ts";
import Wordmark from "@/components/wordmark";
import MemorySetup from "@/components/memory-setup";

export const dynamic = "force-dynamic";

async function SetupPageInner({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  // `?refused=1` means the key we hold was refused: do NOT bounce to /agent (it would fail the same way);
  // let the person register a new key on their existing account instead.
  const refused = (await searchParams).refused === "1";
  if (currentScope()?.creds && !refused) redirect((await hasPending()) ? "/oauth/consent" : "/agent");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <Link href="/"><Wordmark size={28} /></Link>
      <MemorySetup address={address} refused={refused} staleKey={refused ? currentScope()?.creds?.delegatePublicKey : undefined} />
    </div>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function SetupPage(props: { searchParams: Promise<{ refused?: string }> }) {
  return inScope(() => SetupPageInner(props));
}

// Signed-in or transactional: never indexed (see lib/pages.ts PRIVATE_ROUTES).
export const metadata: Metadata = { title: "Set up your memory", ...NOINDEX };
