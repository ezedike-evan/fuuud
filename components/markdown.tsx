import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.t === "bold") return <strong key={i} className="font-semibold">{inline(n.v)}</strong>;
    if (n.t === "em") return <em key={i}>{inline(n.v)}</em>;
    if (n.t === "code") return <code key={i} className="fact rounded bg-recess px-1 py-0.5">{n.v}</code>;
    return n.v;
  });
}

/** Model replies as real formatting. Builds elements from a parsed tree; never raw HTML. */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-[1.65]">
      {parseMarkdown(text).map((b, i) => {
        if (b.t === "p") return <p key={i} className="whitespace-pre-wrap">{inline(b.v)}</p>;
        if (b.t === "h") return <p key={i} className="font-semibold">{inline(b.v)}</p>;
        const Tag = b.t === "ul" ? "ul" : "ol";
        return (
          <Tag key={i} className={`flex flex-col gap-1 pl-5 ${b.t === "ul" ? "list-disc" : "list-decimal"}`}>
            {b.v.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </Tag>
        );
      })}
    </div>
  );
}
