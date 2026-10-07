import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Social card: dark lit stage, the mark, the page title. Rendered once at build and served
 * as a static image. Fonts and the mark are read from committed files, so it needs no network.
 */
export async function ogCard({ kicker, title }: { kicker: string; title: string }) {
  const [display, body, mark] = await Promise.all([
    readFile(join(process.cwd(), "app/fonts/og-expose-500.woff")),
    readFile(join(process.cwd(), "app/fonts/og-roboto-400.woff")),
    readFile(join(process.cwd(), "brand/mark-512.png")),
  ]);
  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "72px 84px",
          background: "radial-gradient(120% 110% at 18% 12%, #2b2415 0%, #120f09 48%, #070604 100%)",
          color: "#f6edd6",
          fontFamily: "Roboto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 48 }}>
          <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: "#c9a45c" }}>{kicker}</div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontFamily: "Expose",
              fontSize: title.length > 48 ? 64 : 78,
              lineHeight: 1.06,
              letterSpacing: -2,
              color: "#fbf4e2",
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", marginTop: 40, fontSize: 30, color: "#a89c80" }}>Fuuud · fuuud.site</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markSrc} width={300} height={300} alt="" />
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Expose", data: display, weight: 500, style: "normal" },
        { name: "Roboto", data: body, weight: 400, style: "normal" },
      ],
    },
  );
}
