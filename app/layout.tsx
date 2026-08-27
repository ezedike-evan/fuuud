import "./globals.css";
import type { Metadata } from "next";
import ThemeScript from "@/components/theme-script";

/*
 * Fonts load via a stylesheet link rather than next/font/google on purpose.
 * next/font downloads the files at BUILD time, so a flaky network fails the
 * whole build — which is the wrong failure mode for a repo someone clones on
 * conference wifi. This costs a runtime request and a little FOUT; the
 * fallbacks below carry the page until the faces land.
 */
const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2" +
  "?family=Roboto:wght@300;400;500;700" +
  "&family=IBM+Plex+Mono:wght@400;500" +
  "&display=swap";

// Expose carries the headings. Fontshare serves it free for commercial use.
const FONTSHARE = "https://api.fontshare.com/v2/css?f[]=expose@400,500,700&display=swap";

export const metadata: Metadata = {
  title: "Fuuud",
  description:
    "A nutrition agent that remembers your health profile — and a record that stays yours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={{
        ["--f-display" as string]: `'Expose', 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif`,
        ["--f-sans" as string]: `'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif`,
        ["--f-mono" as string]: `'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace`,
      }}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
        <link rel="stylesheet" href={FONTSHARE} />
        <ThemeScript />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
