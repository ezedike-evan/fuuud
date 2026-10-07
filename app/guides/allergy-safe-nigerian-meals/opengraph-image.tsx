import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "Allergy-safe Nigerian meals";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Allergy guide", title: "Allergy-safe Nigerian meals" });
}
