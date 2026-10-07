import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "Fuuud guides";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Guides", title: "Eating safely with a memory you own" });
}
