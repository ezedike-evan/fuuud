import type { NextConfig } from "next";

/**
 * Pages that carry a consent decision must not be frameable: a transparent iframe
 * of /oauth/consent over a decoy button is how a person gets tricked into approving.
 * Both headers are sent because older browsers only honour X-Frame-Options.
 */
const NO_FRAMING = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mysten-incubation/memwal"],
  async headers() {
    return [
      { source: "/oauth/consent", headers: NO_FRAMING },
      { source: "/oauth/error", headers: NO_FRAMING },
      { source: "/oauth/authorize", headers: NO_FRAMING },
    ];
  },
};

export default nextConfig;
