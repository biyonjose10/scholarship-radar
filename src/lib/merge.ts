// Several pages describe the same scheme under different names: a department page calls it
// "Post Matric Scholarship", a scholarship site "Post-Matric Scholarship for Backward Classes",
// and the state portal lists it by department in Kannada. This groups those copies, keeps the
// best-supported rules, and takes the last date from the newest official notice: deadlines
// are extended, never brought forward, and department pages often still show the first date.
import type { Criterion, Scholarship, SourceKind } from "./types";
import { normalize, quoteInText } from "./text";
import { CURRENT_CYCLE_YEARS } from "./checker";

// Department words in English and Kannada, as Karnataka pages write them.
const DEPARTMENTS: [RegExp, string][] = [
  [/backward class|\bbcw|\bbcwd\b|ಹಿಂದುಳಿದ/, "bc"],
  [/minorit|ಅಲ್ಪಸಂಖ್ಯಾತ/, "min"],
  [/social welfare|scheduled caste|\bsc\b|ಸಮಾಜ ಕಲ್ಯಾಣ/, "sc"],
  [/tribal|scheduled tribe|\bst\b|ಪರಿಶಿಷ್ಟ ಪಂಗಡ/, "st"],
  [/technical education|ತಾಂತ್ರಿಕ ಶಿಕ್ಷಣ/, "tech"],
  [/disab|differently abled|ವಿಕಲಚೇತನ/, "dis"],
  [/brahmin|ಬ್ರಾಹ್ಮಣ/, "brahmin"],
  [/arya vyshya|ಆರ್ಯ ವೈಶ್ಯ/, "arya"],
];

export function nameKey(name: string): string {
  return normalize(name)
    .replace(/\b(scholarship|scheme|programme|program|for|the|of|and|20\d\d(-\d\d)?)\b/g, " ")
    .replace(/[^a-z0-9ಀ-೿]+/g, " ")
    .trim();
}

// "post-bc" for every copy of the Backward Classes post-matric scheme; the plain name otherwise.
export function schemeKey(s: Pick<Scholarship, "name" | "provider">): string {
  const text = normalize(`${s.name} ${s.provider}`);
  const level = /post[\s-]*(matric|metric)|ಮೆಟ್ರಿಕ್ ನಂತರ/.test(text) ? "post" : /pre[\s-]*(matric|metric)|ಮೆಟ್ರಿಕ್ ಪೂರ್ವ/.test(text) ? "pre" : null;
  const dept = DEPARTMENTS.find(([re]) => re.test(text))?.[1] ?? null;
  return level && dept ? `${level}-${dept}` : nameKey(s.name);
}

// Who a department's scheme is for. Used only when the official notice names the department
// and states no rules: the quoted notice itself ("Backward Classes Welfare Department's
// post-matric scholarship ... last date") is the evidence.
const DEPARTMENT_RULE: Record<string, (quote: string) => Criterion> = {
  bc: (quote) => ({ kind: "categories", values: ["OBC", "Cat-1", "2A", "2B", "3A", "3B"], quote }),
  sc: (quote) => ({ kind: "categories", values: ["SC"], quote }),
  st: (quote) => ({ kind: "categories", values: ["ST"], quote }),
  min: (quote) => ({ kind: "minority_only", quote }),
  dis: (quote) => ({ kind: "disability_only", quote }),
  brahmin: (quote) => ({ kind: "other", text: "Only for students from the Brahmin community", quote }),
  arya: (quote) => ({ kind: "other", text: "Only for students from the Arya Vyshya community", quote }),
};

const WHO_KINDS = new Set(["categories", "minority_only", "disability_only"]);

function departmentOf(text: string): string | null {
  const t = normalize(text);
  return DEPARTMENTS.find(([re]) => re.test(t))?.[1] ?? null;
}

const KIND_RANK: Record<SourceKind, number> = { official: 0, foundation: 1, aggregator: 2, other: 3 };

function current(s: Scholarship): boolean {
  return s.cycle === null || CURRENT_CYCLE_YEARS.some((y) => s.cycle!.includes(y));
}

function verified(s: Scholarship, norm: string): number {
  return s.criteria.filter((c) => quoteInText(c.quote, norm)).length;
}

export interface Merged {
  base: Scholarship; // rules from the best-supported copy, last date from the newest official notice
  text: string; // page text the checker verifies quotes against (base page + the date's page)
  norm: string; // the same, normalised, for the conflict check
  extendedFrom: string | null; // ISO date an older official page still shows
  rulesFrom: string | null; // host of a secondary page the rules came from, when official pages state none
}

export function mergeCopies(copies: Scholarship[], textByUrl: Map<string, string>): Merged {
  const norm = (s: Scholarship) => normalize(textByUrl.get(s.sourceUrl) ?? "");
  // Rules: official before secondary, this year's cycle before old ones, then most quoted rules.
  const base = [...copies].sort(
    (a, b) => KIND_RANK[a.sourceKind] - KIND_RANK[b.sourceKind] || Number(current(b)) - Number(current(a)) || verified(b, norm(b)) - verified(a, norm(a)),
  )[0];

  // Last date: the latest quoted date on any official page for this year's cycle.
  const dated = copies.filter((s) => s.sourceKind === "official" && current(s) && s.deadline.date && quoteInText(s.deadline.quote, norm(s)));
  const newest = dated.sort((a, b) => b.deadline.date!.localeCompare(a.deadline.date!))[0];

  let text = textByUrl.get(base.sourceUrl) ?? "";
  let merged = base;
  let extendedFrom: string | null = null;
  let rulesFrom: string | null = null;

  // An official page that lists only the date (the state portal's notice board) has no rules;
  // then use the copy with the most rules quoted word-for-word on its own page, and say so.
  if (verified(base, norm(base)) === 0) {
    const donor = copies
      .filter((s) => s !== base && verified(s, norm(s)) > 0)
      .sort((a, b) => KIND_RANK[a.sourceKind] - KIND_RANK[b.sourceKind] || verified(b, norm(b)) - verified(a, norm(a)))[0];
    if (donor) {
      merged = { ...merged, criteria: donor.criteria, documents: merged.documents.length ? merged.documents : donor.documents };
      text = `${text}

${textByUrl.get(donor.sourceUrl) ?? ""}`;
      if (donor.sourceKind !== "official") {
        try {
          rulesFrom = new URL(donor.sourceUrl).hostname.replace(/^www./, "");
        } catch {
          rulesFrom = donor.sourceUrl;
        }
      }
    }
  }
  if (newest && newest.deadline.date !== base.deadline.date) {
    const baseDated = base.sourceKind === "official" && current(base) && base.deadline.date && quoteInText(base.deadline.quote, norm(base));
    if (baseDated && base.deadline.date! < newest.deadline.date!) extendedFrom = base.deadline.date;
    if (!baseDated || base.deadline.date! < newest.deadline.date!) {
      merged = { ...merged, deadline: newest.deadline, cycle: newest.cycle ?? base.cycle, applyUrl: base.applyUrl ?? newest.applyUrl };
      if (newest.sourceUrl !== base.sourceUrl) text = `${text}\n\n${textByUrl.get(newest.sourceUrl) ?? ""}`;
    }
  }
  // The official date quote names the department ("Backward Classes Welfare Department's
  // post-matric scholarship..."): unless the rules already say who it is for, that does.
  if (merged.sourceKind === "official" && merged.deadline.quote && !merged.criteria.some((c) => WHO_KINDS.has(c.kind))) {
    const dept = departmentOf(merged.deadline.quote);
    if (dept && DEPARTMENT_RULE[dept]) merged = { ...merged, criteria: [...merged.criteria, DEPARTMENT_RULE[dept](merged.deadline.quote)] };
  }
  return { base: merged, text, norm: normalize(text), extendedFrom, rulesFrom };
}
