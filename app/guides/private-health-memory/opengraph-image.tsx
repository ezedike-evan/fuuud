import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "How Fuuud keeps your health memory private";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Private memory", title: "How Fuuud keeps your health memory private" });
}
