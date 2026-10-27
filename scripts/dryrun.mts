// Dev helper: runs the real Search + Extract steps (Tavily only, no model) for each persona
// with the built-in fallback queries, and reports how many usable pages each would read.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { search, extract, rankSources, OFFICIAL_DOMAINS } from "../src/lib/tavily";
import { fallbackQueries } from "../src/lib/prompts";
import { PERSONAS } from "../src/lib/personas";
import { signalScore, focusText } from "../src/lib/text";

for (const line of readFileSync(resolve(import.meta.dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2];
}
const only = process.argv[2];
let credits = 0;
const log = (c: { credits: number | null; ok: boolean; error?: string }) => {
  credits += c.credits ?? 0;
  if (!c.ok) console.log("  tool error:", c.error);
};
for (const p of PERSONAS.filter((x) => !only || x.label === only)) {
  const t0 = Date.now();
  const q = fallbackQueries(p);
  const hits = (
    await Promise.all([
      ...q.queries.map((x) => search(x, "search", log)),
      ...q.official.map((x) => search(x, "search", log, { includeDomains: OFFICIAL_DOMAINS, maxResults: 5 })),
    ])
  ).flat();
  const ranked = rankSources(hits, p.state);
  const official = ranked.filter((h) => h.kind === "official").slice(0, 4);
  const chosen = [...official, ...ranked.filter((h) => h.kind !== "official").slice(0, 7 - official.length)];
  const pages = await extract(chosen.map((h) => h.url), "extract", log);
  console.log(`\n== ${p.label}: ${ranked.length} sources (${ranked.filter((h) => h.kind === "official").length} official), ${Date.now() - t0} ms`);
  for (const h of chosen) {
    const pg = pages.find((x) => x.url === h.url);
    const sig = pg ? signalScore(pg.text) : -1;
    console.log(`  [${h.kind}] ${pg ? `${pg.text.length} chars, signal ${sig}, focused ${focusText(pg.text).length}` : "NOT EXTRACTED"}  ${h.url}`);
  }
}
console.log(`\nTavily credits used (approx): ${credits}`);
