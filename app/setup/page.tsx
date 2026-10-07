import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerAddress } from "@/lib/session.ts";
import { currentScope } from "@/lib/memwal-scope.ts";
import { hasPending } from "@/lib/oauth/pending.ts";
import Wordmark from "@/components/wordmark";
import MemorySetup from "@/components/memory-setup";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  if (currentScope()?.creds) redirect((await hasPending()) ? "/oauth/consent" : "/agent");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <Link href="/"><Wordmark size={28} /></Link>
      <MemorySetup address={address} />
    </div>
  );
}
