"use server";

import { revalidatePath } from "next/cache";
import { getOwnerAddress } from "@/lib/session.ts";
import { getGrant, listGrants, revokeGrant } from "@/lib/oauth/grants.ts";
import { oauthConfigured } from "@/lib/seal.ts";

export type ConnectedApp = {
  id: string;
  name: string;
  scopes: string[];
  status: "pending" | "active";
  created: number;
  publicKey: string;
};

async function requireOwner() {
  const address = await getOwnerAddress();
  if (!address) throw new Error("Sign in first.");
  return address;
}

/** The apps connected to the signed-in person's memory. Only ever their own. */
export async function listConnectedApps(): Promise<{ enabled: boolean; apps: ConnectedApp[]; error?: string }> {
  const owner = await requireOwner();
  if (!oauthConfigured()) return { enabled: false, apps: [] };
  try {
    const grants = await listGrants(owner);
    return {
      enabled: true,
      apps: grants
        .sort((a, b) => b.created - a.created)
        .map((g) => ({ id: g.id, name: g.clientName, scopes: g.scopes, status: g.status, created: g.created, publicKey: g.publicKey })),
    };
  } catch (error) {
    console.error("[fuuud] could not list connected apps:", error instanceof Error ? error.message : error);
    return { enabled: true, apps: [], error: "Could not read your connected apps. Try again." };
  }
}

/**
 * Stops the app immediately. The grant id alone is not enough: it must belong to
 * the signed-in person, so one user can never disconnect (or probe) another's.
 *
 * This does NOT remove the app's key from the account onchain - that needs the
 * person's wallet, so the public key is handed back and the browser offers it.
 * Until it is removed the key still exists, but nothing on this server holds it
 * any more.
 */
export async function disconnectApp(id: string): Promise<{ publicKey: string }> {
  const owner = await requireOwner();
  const grant = await getGrant(id);
  if (!grant || grant.owner !== owner.toLowerCase()) throw new Error("That connection no longer exists.");
  await revokeGrant(id);
  revalidatePath("/settings");
  return { publicKey: grant.publicKey };
}
