"use client";

import { useEffect, useState } from "react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { registerEnokiWallets, type EnokiWallet } from "@mysten/enoki";

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") as "testnet" | "mainnet";

/** The Google zkLogin wallet, registered once per component. The sign-in redirect URI stays <origin>/signin. */
export function useEnokiWallet(): EnokiWallet | null {
  const [wallet, setWallet] = useState<EnokiWallet | null>(null);
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_ENOKI_API_KEY;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!apiKey || !clientId) return;
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;
    const { wallets, unregister } = registerEnokiWallets({
      apiKey,
      providers: { google: { clientId, redirectUrl: `${origin}/signin` } },
      client: new SuiGrpcClient({ network: NETWORK, baseUrl: `https://fullnode.${NETWORK}.sui.io:443` }),
      network: NETWORK,
    });
    setWallet(wallets.google ?? null);
    return unregister;
  }, []);
  return wallet;
}
