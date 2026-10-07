import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "Fuuud, a nutrition agent that remembers your health";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Nutrition agent", title: "Remembers what you can't eat" });
}
