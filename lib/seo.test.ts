import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ALLERGENS } from "./guides/allergens.ts";
import { ALLERGEN_PAGES, PAGES, PRIVATE_ROUTES, TITLE_SUFFIX, HOME } from "./pages.ts";
import { articleLd, breadcrumbLd, faqLd, jsonLd } from "./seo.ts";

const ROOT = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("titles and descriptions fit what search results show, and are unique", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const p of PAGES) {
    const full = p === HOME ? HOME.absoluteTitle : `${p.title}${TITLE_SUFFIX}`;
    assert.ok(full.length <= 60, `${p.path}: title is ${full.length} chars: ${full}`);
    assert.ok(p.description.length >= 70 && p.description.length <= 165, `${p.path}: description is ${p.description.length} chars`);
    assert.ok(!titles.has(full), `${p.path}: duplicate title`);
    assert.ok(!descriptions.has(p.description), `${p.path}: duplicate description`);
    titles.add(full);
    descriptions.add(p.description);
  }
});

test("every public page has a route file, and every guide page is in the registry", () => {
  for (const p of PAGES) {
    const dir = p.path === "/" ? "app" : `app${p.path}`;
    const dynamic = ALLERGEN_PAGES.some((a) => a.path === p.path);
    const file = dynamic ? "app/guides/allergy-safe-nigerian-meals/[allergen]/page.tsx" : `${dir}/page.tsx`;
    assert.ok(existsSync(join(ROOT, file)), `${p.path} has no ${file}`);
  }
  assert.equal(ALLERGEN_PAGES.length, ALLERGENS.length);
});

test("allergen guides are complete and always carry the safety framing", () => {
  const slugs = new Set<string>();
  for (const a of ALLERGENS) {
    assert.ok(!slugs.has(a.slug), `duplicate slug ${a.slug}`);
    slugs.add(a.slug);
    assert.ok(a.hides.length >= 5 && a.safer.length >= 2 && a.ask.length >= 2 && a.faq.length >= 2, `${a.slug} is thin`);
    assert.match(a.tellFuuud.stored, /^\d{4}-\d{2}-\d{2} \| (allergy|condition) \| /, `${a.slug}: example must match the real stored format`);
    const words = [a.intro, ...a.hides.map((h) => h.note), ...a.faq.map((f) => f.a)].join(" ").split(/\s+/).length;
    assert.ok(words >= 180, `${a.slug}: only ${words} words of substance`);
  }
  const page = read("app/guides/allergy-safe-nigerian-meals/[allergen]/page.tsx");
  assert.ok(page.includes("MEDICAL_NOTE"), "the per-allergen page must render the not-medical-advice note");
});

test("JSON-LD cannot close its own script tag", () => {
  const out = jsonLd({ text: "</script><script>alert(1)</script>" });
  assert.ok(!out.includes("</script"));
  assert.equal(JSON.parse(out).text, "</script><script>alert(1)</script>");
});

test("structured data has the fields search engines require", () => {
  const a = articleLd(ALLERGEN_PAGES[0]);
  for (const k of ["headline", "datePublished", "author", "publisher", "image", "mainEntityOfPage"]) assert.ok(k in a, `Article missing ${k}`);
  const crumbs = breadcrumbLd([["Guides", "/guides"]]);
  assert.equal(crumbs.itemListElement.length, 2);
  assert.equal(crumbs.itemListElement[0].position, 1);
  const faq = faqLd([{ q: "Q?", a: "A." }]);
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "A.");
});

/* ------------------------------- private pages ------------------------------- */

const pageFiles = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) pageFiles(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
};

test("every signed-in or transactional page is noindex", () => {
  const files = pageFiles(join(ROOT, "app")).map((f) => relative(ROOT, f));
  const privateFiles = files.filter((f) => PRIVATE_ROUTES.some((r) => r !== "/api" && f.startsWith(`app${r}/`)));
  assert.ok(privateFiles.length >= 7, `found ${privateFiles.length} private pages; the guard would be vacuous`);
  for (const f of privateFiles) {
    const src = read(f);
    assert.ok(/export const metadata/.test(src) && src.includes("NOINDEX"), `${f} must export metadata with NOINDEX`);
  }
});

test("public pages are never marked noindex, and are not in the private list", () => {
  for (const p of PAGES) {
    assert.ok(!PRIVATE_ROUTES.some((r) => p.path === r || p.path.startsWith(`${r}/`)), `${p.path} is public but under a private route`);
  }
});

test("robots disallows every private route and keeps OAuth discovery crawlable", () => {
  const robots = read("app/robots.ts");
  assert.ok(robots.includes("PRIVATE_ROUTES"));
  assert.ok(!/well-known/.test(robots.replace(/\/\*[\s\S]*?\*\//g, "")), "/.well-known must not be disallowed");
});

test("both standing-record reads skip the relevance floor (a stored dislike or allergy must never be hidden)", () => {
  const core = read("lib/memory-core.ts");
  for (const name of ["recallSafety", "recallPreferences"]) {
    const line = core.split("\n").find((l) => l.startsWith(`export const ${name} =`)) ?? "";
    assert.ok(line.includes("floor: false"), `${name} must read with { floor: false }`);
  }
});
