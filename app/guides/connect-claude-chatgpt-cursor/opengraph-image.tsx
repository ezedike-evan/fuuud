import { ogCard, OG_SIZE } from "@/lib/og";

export const alt = "Connect Fuuud to Claude, ChatGPT and Cursor";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ kicker: "Connect your AI app", title: "Connect Fuuud to Claude, ChatGPT and Cursor" });
}
