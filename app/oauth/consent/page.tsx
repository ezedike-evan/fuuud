import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { requireAccount } from "@/lib/require-account.ts";
import { readClient } from "@/lib/oauth/clients.ts";
import { readPending } from "@/lib/oauth/pending.ts";
import { redirectLabel } from "@/lib/oauth/redirect.ts";
import { devMockEnabled } from "@/lib/oauth/dev.ts";
import Wordmark from "@/components/wordmark";
import OAuthConsent from "@/components/oauth-consent";

export const dynamic = "force-dynamic";

// Anti-framing is enforced by HTTP headers in next.config.ts. (A <meta> CSP tag cannot
// carry frame-ancestors, so it would look like protection and do nothing.)

async function ConsentPageInner() {
  const pending = await readPending();
  if (!pending) redirect("/oauth/error?reason=expired");

  // The pending cookie survives both detours, and sign-in / setup send the person back here.
  const address = await getOwnerAddress();
  if (!address) redirect("/signin");
  requireAccount();

  const client = readClient(pending.clientId);
  if (!client) redirect("/oauth/error?reason=unknown_client");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-12">
      <Link href="/"><Wordmark size={28} /></Link>
      <OAuthConsent
        address={address}
        clientName={client.name}
        destination={redirectLabel(pending.redirectUri)}
        scopes={pending.scopes}
        nonce={pending.nonce}
        devMock={devMockEnabled()}
      />
    </div>
  );
}

// Wrapped so the person's memory account is in scope for everything above (see inScope).
export default function ConsentPage() {
  return inScope(ConsentPageInner);
}
