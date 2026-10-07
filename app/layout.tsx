import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ThemeScript from "@/components/theme-script";
import { HOME } from "@/lib/pages";
import { SITE, siteUrl } from "@/lib/seo";

/*
 * Fonts are self-hosted through next/font/local: the files ship from our own origin
 * (no request to Google Fonts or Fontshare, no extra DNS and TLS handshakes), are
 * preloaded, and get a size-adjusted fallback so the swap does not shift the layout.
 * Only the weights the app really uses are included: body 400/500/600, display 500,
 * mono 400/500. The files are committed, so a build never needs the network for fonts.
 *
 * Expose (display) comes from Fontshare; Roboto and IBM Plex Mono are OFL.
 */
const sans = localFont({
  src: [
    { path: "./fonts/roboto-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/roboto-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/roboto-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const display = localFont({
  src: [{ path: "./fonts/expose-500.woff2", weight: "500", style: "normal" }],
  variable: "--font-expose",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Roboto", "system-ui", "sans-serif"],
});

const mono = localFont({
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false, // only the memory ledger and chips use it, never above the fold on the landing page
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: HOME.absoluteTitle, template: `%s · ${SITE.name}` },
  description: HOME.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: siteUrl() }],
  creator: SITE.name,
  publisher: SITE.name,
  keywords: ["food allergy", "Nigerian food", "nutrition agent", "health memory", "Walrus", "MCP connector"],
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: SITE.locale,
    title: HOME.absoluteTitle,
    description: HOME.description,
  },
  twitter: { card: "summary_large_image", title: HOME.absoluteTitle, description: HOME.description },
  formatDetection: { email: false, address: false, telephone: false },
  manifest: "/manifest.webmanifest",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-NG"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      style={{
        ["--f-display" as string]: `var(--font-expose), 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif`,
        ["--f-sans" as string]: `var(--font-roboto), system-ui, -apple-system, 'Segoe UI', sans-serif`,
        ["--f-mono" as string]: `var(--font-plex-mono), ui-monospace, 'SF Mono', Menlo, monospace`,
      }}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[8px] focus:bg-accent focus:px-3.5 focus:py-2 focus:text-[13px] focus:text-accent-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
