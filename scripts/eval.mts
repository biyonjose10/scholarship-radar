// Measures the Reader (Nemotron 3 Super) on hand-labelled pages: npx tsx scripts/eval.mts
// Needs NEBIUS_API_KEY in ../../.env and the saved pages in eval/pages (not committed:
// third-party text; re-save them with scripts/collect.mts if missing). One Super call per page.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chatJson, MODELS } from "../src/lib/nebius";
import { focusText } from "../src/lib/text";
import { READER_SYSTEM, readerUser } from "../src/lib/prompts";
import { cleanCriteria } from "../src/lib/shape";
import { scorePage, type GoldScholarship, type PageScore } from "../src/lib/evalScore";
import { PERSONAS } from "../src/lib/personas";
import type { Scholarship } from "../src/lib/types";

for (const line of readFileSync(resolve(import.meta.dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2];
}
if (!process.env.NEBIUS_API_KEY) throw new Error("NEBIUS_API_KEY is needed in ../.env");

const root = resolve(import.meta.dirname, "../eval");
const gold = JSON.parse(readFileSync(resolve(root, "gold.json"), "utf8")) as { pages: { file: string; url: string; scholarships: GoldScholarship[] }[] };
const { blurb: _b, ...profile } = PERSONAS[0];
void _b;

const total: PageScore = { goldRules: 0, found: 0, extra: 0, extraPassedVerifier: 0, deadlines: 0, deadlinesRight: 0, schemesMissed: [] };
for (const p of gold.pages) {
  const text = readFileSync(resolve(root, "pages", p.file), "utf8");
  const out = await chatJson<{ scholarships?: Scholarship[] }>({
    model: MODELS.super,
    thinking: false, // copying text out, not reasoning
    step: "read",
    system: READER_SYSTEM,
    // Measuring extraction, not relevance: the app's Reader also skips schemes that don't fit the student.
    user: readerUser(profile, p.url, focusText(text)) + "\n\nEvaluation run: include every college-level scholarship on this page, whether or not it fits this student (up to 8).",
    maxTokens: 6000,
    onCall: (c) => console.log(`  ${c.model} ${c.ms} ms, ${c.promptTokens}/${c.completionTokens} tokens, ${c.requestId}`),
  });
  // The same shaping the app applies before checking.
  const got = (out.scholarships ?? []).map((s) => ({ ...s, criteria: cleanCriteria(s.criteria), deadline: s.deadline ?? { date: null, text: "", quote: null } }));
  for (const g of got) console.log(`    read: ${g.name} | ${g.deadline.date} | ${g.criteria.map((c) => c.kind + ("value" in c ? "=" + c.value + ("forCategories" in c && c.forCategories ? "[" + c.forCategories.join("/") + "]" : "") : "values" in c ? "=" + c.values.join("/") : "")).join(", ")}`);
  const s = scorePage(p.scholarships, got, text);
  console.log(`${p.file}: ${s.found}/${s.goldRules} rules, ${s.deadlinesRight}/${s.deadlines} deadlines, ${s.extra} extra (${s.extraPassedVerifier} quoted), missed: ${s.schemesMissed.join(", ") || "none"}`);
  for (const k of ["goldRules", "found", "extra", "extraPassedVerifier", "deadlines", "deadlinesRight"] as const) total[k] += s[k];
  total.schemesMissed.push(...s.schemesMissed);
}
console.log(
  `\nTOTAL: ${total.found} of ${total.goldRules} labelled rules read correctly; ${total.deadlinesRight} of ${total.deadlines} deadlines right; ` +
    `${total.extra} extra rules, ${total.extra - total.extraPassedVerifier} of them stopped by the verifier (not on the page).`,
);
