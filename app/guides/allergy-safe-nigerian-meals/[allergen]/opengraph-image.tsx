import { ogCard, OG_SIZE } from "@/lib/og";
import { ALLERGENS, allergenBySlug } from "@/lib/guides/allergens";

export const alt = "Allergy guide";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return ALLERGENS.map((a) => ({ allergen: a.slug }));
}

export default async function Image({ params }: { params: Promise<{ allergen: string }> }) {
  const { allergen } = await params;
  const a = allergenBySlug(allergen);
  return ogCard({ kicker: "Allergy guide", title: a?.title ?? "Allergy-safe Nigerian meals" });
}
