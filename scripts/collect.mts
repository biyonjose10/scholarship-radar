// Dev helper: runs Tavily search + extract for sample queries and saves pages to .cache/pages
// so the Reader prompt and the checker can be designed against real text. Not used by the app.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { search, extract, rankSources } from "../src/lib/tavily";

for (const line of readFileSync(resolve(import.meta.dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2];
}

const queries = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Karnataka SSP post matric scholarship OBC eligibility income limit 2026-27",
      "scholarship for engineering students India family income below 2.5 lakh 2026",
      "AICTE pragati scholarship girls 2026-27 eligibility last date",
      "private foundation scholarship BE BTech students India 2026 apply last date",
    ];

const log = (c: unknown) => console.log(JSON.stringify(c));
const hits = (await Promise.all(queries.map((q) => search(q, "search", log)))).flat();
const ranked = rankSources(hits, "Karnataka");
console.log(`\n${ranked.length} unique sources:`);
for (const h of ranked) console.log(`  [${h.kind}] ${h.url}`);
const top = ranked.slice(0, 10).map((h) => h.url);
const pages = await extract(top, "extract", log);
const dir = resolve(import.meta.dirname, "../.cache/pages");
mkdirSync(dir, { recursive: true });
for (const p of pages) {
  const name = p.url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 80);
  writeFileSync(resolve(dir, name + ".md"), `SOURCE: ${p.url}\n\n${p.text}`);
  console.log(`saved ${name}.md (${p.text.length} chars)`);
}
