/**
 * A deliberately small markdown reader for model replies: paragraphs, bullet and
 * numbered lists, headings, **bold**, *italic*, `code`. It produces a tree, never
 * HTML, so the renderer builds React elements and nothing a model says can inject
 * markup. Anything it does not recognise stays as literal text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: Inline[] }
  | { t: "em"; v: Inline[] }
  | { t: "code"; v: string };

export type Block =
  | { t: "p"; v: Inline[] }
  | { t: "h"; v: Inline[] }
  | { t: "ul"; v: Inline[][] }
  | { t: "ol"; v: Inline[][] };

const TOKEN = /(\*\*[^*\n]+?\*\*|`[^`\n]+?`|\*[^*\s][^*\n]*?\*)/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  for (const part of src.split(TOKEN)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      out.push({ t: "bold", v: parseInline(part.slice(2, -2)) });
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      out.push({ t: "code", v: part.slice(1, -1) });
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      out.push({ t: "em", v: parseInline(part.slice(1, -1)) });
    } else {
      out.push({ t: "text", v: part });
    }
  }
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", v: parseInline(para.join("\n")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, v: list.items.map(parseInline) });
    list = null;
  };

  for (const line of src.replace(/\r\n?/g, "\n").split("\n")) {
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    const h = HEADING.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      blocks.push({ t: "h", v: parseInline(h[1]) });
    } else if (b || n) {
      flushPara();
      const kind = b ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((b ?? n)![1]);
    } else if (list && /^\s+\S/.test(line)) {
      // A wrapped continuation of the previous list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
