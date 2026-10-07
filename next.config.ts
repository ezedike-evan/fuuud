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

/**
 * Baseline hardening for every response. Listed FIRST so the stricter per-route rules
 * below (which set some of the same keys) win. HSTS is left to the host.
 */
const BASELINE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
];

/** Brand icons are not content-hashed, so cache them for a day and let a stale copy serve while it refreshes. */
const ICON_CACHE = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mysten-incubation/memwal"],
  poweredByHeader: false,
  compress: true,
  images: { formats: ["image/avif", "image/webp"] },
  experimental: { optimizePackageImports: ["lucide-react"] },
  async headers() {
    return [
      { source: "/:path*", headers: BASELINE },
      { source: "/icon-:size.png", headers: ICON_CACHE },
      { source: "/icon-maskable-512.png", headers: ICON_CACHE },
      { source: "/oauth/consent", headers: NO_FRAMING },
      { source: "/oauth/error", headers: NO_FRAMING },
      { source: "/oauth/authorize", headers: NO_FRAMING },
    ];
  },
};

export default nextConfig;
