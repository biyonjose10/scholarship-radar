// Scores the Reader against hand-labelled pages (eval/gold.json). Plain code, so the
// number in the README is reproducible: rules found, rules wrong, and the one that
// matters most, invented rules that would have got past the verifier.
import type { CategoryTag, Criterion, Scholarship } from "./types";
import { normalize, quoteInText } from "./text";

export interface GoldRule {
  kind: Criterion["kind"];
  value?: number;
  values?: (string | number)[];
  forCategories?: CategoryTag[];
}
export interface GoldScholarship {
  name: string;
  deadline?: string;
  amount?: number;
  rules: GoldRule[];
}

export interface PageScore {
  goldRules: number;
  found: number; // gold rules the Reader returned correctly
  extra: number; // returned rules on matched schemes with no gold counterpart
  extraPassedVerifier: number; // ...of which were quoted word-for-word (the dangerous ones)
  deadlines: number;
  deadlinesRight: number;
  schemesMissed: string[];
}

function words(s: string): Set<string> {
  return new Set(normalize(s).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 1 && !["scholarship", "scheme", "the", "for", "of"].includes(w)));
}

// Gold names are short ("SC Post-Matric Scholarship"); match on shared words, and short
// codes (SC, ST, OBC) must all be present so SC and ST schemes are never confused.
export function sameScheme(gold: string, got: string): boolean {
  const a = words(gold);
  const b = words(got);
  if (a.size === 0) return false;
  let shared = 0;
  for (const w of a) {
    if (b.has(w)) shared++;
    else if (w.length <= 3) return false;
  }
  return shared / a.size >= 0.6;
}

const sorted = (x?: (string | number)[]) => [...(x ?? [])].map(String).sort().join(",");

export function ruleMatches(g: GoldRule, c: Criterion): boolean {
  if (g.kind !== c.kind) return false;
  switch (c.kind) {
    case "income_max":
      return c.value === g.value && sorted(c.forCategories) === sorted(g.forCategories);
    case "min_marks":
      return c.value === g.value;
    case "years":
      // Any non-empty subset of the accepted years counts (e.g. [1] for "1st year or 2nd via lateral entry").
      return c.values.length > 0 && c.values.every((v) => (g.values ?? []).map(Number).includes(v));
    case "categories":
    case "states":
    case "course_levels":
    case "genders":
      return sorted(c.values) === sorted(g.values);
    default:
      return true;
  }
}

export function scorePage(gold: GoldScholarship[], got: Scholarship[], pageText: string): PageScore {
  const page = normalize(pageText);
  const s: PageScore = { goldRules: 0, found: 0, extra: 0, extraPassedVerifier: 0, deadlines: 0, deadlinesRight: 0, schemesMissed: [] };
  for (const g of gold) {
    s.goldRules += g.rules.length;
    if (g.deadline) s.deadlines++;
    const m = got.find((x) => sameScheme(g.name, x.name));
    if (!m) {
      s.schemesMissed.push(g.name);
      continue;
    }
    const used = new Set<number>();
    for (const r of g.rules) {
      const i = m.criteria.findIndex((c, j) => !used.has(j) && ruleMatches(r, c));
      if (i >= 0) {
        used.add(i);
        s.found++;
      }
    }
    m.criteria.forEach((c, j) => {
      if (used.has(j) || c.kind === "other") return;
      s.extra++;
      if (quoteInText(c.quote, page)) s.extraPassedVerifier++;
    });
    if (g.deadline && m.deadline.date === g.deadline) s.deadlinesRight++;
  }
  return s;
}
