// Follow-up: when the checker can't settle a rule (not stated for the student's group, or
// not found word-for-word on the page), the agent searches government sites once more for
// that one rule and re-checks. Choosing what to look for and merging the answer is code;
// the new page is read by the same Reader, and its rules must be quoted on that page.
import type { CheckedScholarship, Criterion, CriterionResult, Profile, Scholarship } from "./types";
import { quoteInText } from "./text";

export const MAX_FOLLOW_UPS = 2;

const MISSING_GROUP_INCOME = "Income limit for your group is not stated";

// Rules a search can settle. Free-text "other" rules need a person, except our own
// "income limit for your group is not stated" marker.
function searchable(r: CriterionResult): boolean {
  if (r.verdict !== "unknown") return false;
  if (r.criterion.kind !== "other") return true;
  return r.criterion.text === MISSING_GROUP_INCOME;
}

export function unsettled(c: CheckedScholarship): number {
  return c.results.filter(searchable).length;
}

export function pickFollowUps(list: CheckedScholarship[]): CheckedScholarship[] {
  return list.filter((c) => c.eligibility === "likely" && c.deadlineStatus !== "closed" && unsettled(c) > 0).slice(0, MAX_FOLLOW_UPS);
}

const HINT: Record<Criterion["kind"], string> = {
  income_max: "income limit",
  categories: "eligible categories",
  minority_only: "minority eligibility",
  states: "domicile eligibility",
  course_levels: "eligible courses",
  years: "eligible year of study",
  min_marks: "minimum marks",
  genders: "eligibility",
  disability_only: "disability eligibility",
  other: "eligibility",
};

export function followUpQuery(c: CheckedScholarship, p: Profile): string {
  const r = c.results.find(searchable)!;
  const group = p.kaGroup ? `category ${p.kaGroup}` : p.category;
  const hint = r.criterion.kind === "other" ? `income limit ${group}` : r.criterion.kind === "income_max" ? `income limit ${group}` : HINT[r.criterion.kind];
  return `${c.scholarship.name} ${hint} ${p.state} 2026-27`.replace(/\s+/g, " ").trim();
}

function key(c: Criterion): string {
  return c.kind === "income_max" ? `income_max|${[...(c.forCategories ?? [])].sort().join(",")}` : c.kind;
}

// Adds the rules the new page states word-for-word, replacing same-kind rules the
// original page couldn't back up. Original rules that were quoted are never replaced.
export function mergeFollowUp(orig: Scholarship, origPageNorm: string, found: Scholarship, newPageNorm: string): Scholarship {
  const fresh = found.criteria.filter((c) => c.kind !== "other" && quoteInText(c.quote, newPageNorm));
  const freshKeys = new Set(fresh.map(key));
  const kept = orig.criteria.filter((c) => quoteInText(c.quote, origPageNorm) || !freshKeys.has(key(c)));
  const keptKeys = new Set(kept.filter((c) => quoteInText(c.quote, origPageNorm)).map(key));
  return {
    ...orig,
    criteria: [...kept, ...fresh.filter((c) => !keptKeys.has(key(c)))],
    documents: [...new Set([...orig.documents, ...found.documents])].slice(0, 12),
  };
}
