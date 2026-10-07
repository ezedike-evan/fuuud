import { jsonLd } from "@/lib/seo";

/** One JSON-LD block. The payload is serialized by jsonLd(), which escapes `<`. */
export default function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
