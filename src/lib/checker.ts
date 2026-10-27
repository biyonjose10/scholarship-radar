// The Checker and Verifier. Plain code, no model: a model reads the rules out of the
// page, but whether a student qualifies is decided here, rule by rule, and every rule
// must be traceable to a sentence on the source page.
import type {
  CategoryTag,
  CheckedScholarship,
  Criterion,
  CriterionResult,
  DeadlineStatus,
  Eligibility,
  Profile,
  Scholarship,
} from "./types";
import { normalize, quoteInText } from "./text";

export const CURRENT_CYCLE_YEARS = ["2026", "2027"];
export const CLOSING_SOON_DAYS = 21;

const LEVEL_NAMES = { school: "school", diploma: "diploma", ug: "undergraduate", pg: "postgraduate", phd: "PhD" } as const;

export function inr(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} lakh`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function profileTags(p: Profile): CategoryTag[] {
  const tags: CategoryTag[] = [p.category];
  if (p.kaGroup) tags.push(p.kaGroup);
  if (p.minority) tags.push("Minority");
  return tags;
}

function sameState(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const ALL_INDIA = /^(all ?india|india|pan[- ]?india|all states|any state)$/i;

export function checkCriterion(p: Profile, c: Criterion): { verdict: CriterionResult["verdict"]; reason: string } {
  switch (c.kind) {
    case "income_max":
      return p.familyIncome <= c.value
        ? { verdict: "pass", reason: `Family income ${inr(p.familyIncome)} is within the ${inr(c.value)} limit` }
        : { verdict: "fail", reason: `Family income ${inr(p.familyIncome)} is above the ${inr(c.value)} limit` };
    case "categories": {
      const tags = profileTags(p);
      const hit = c.values.find((v) => tags.includes(v));
      return hit
        ? { verdict: "pass", reason: `Open to ${hit}` }
        : { verdict: "fail", reason: `Only for ${c.values.join(", ")}` };
    }
    case "minority_only":
      return p.minority
        ? { verdict: "pass", reason: "For minority-community students" }
        : { verdict: "fail", reason: "Only for minority-community students" };
    case "states":
      if (c.values.some((v) => ALL_INDIA.test(v.trim()))) return { verdict: "pass", reason: "Open across India" };
      return c.values.some((v) => sameState(v, p.state))
        ? { verdict: "pass", reason: `Open to ${p.state} students` }
        : { verdict: "fail", reason: `Only for students from ${c.values.join(", ")}` };
    case "course_levels":
      return c.values.includes(p.courseLevel)
        ? { verdict: "pass", reason: `Covers ${LEVEL_NAMES[p.courseLevel]} courses` }
        : { verdict: "fail", reason: `Only for ${c.values.map((v) => LEVEL_NAMES[v]).join(", ")} courses` };
    case "years":
      return c.values.includes(p.year)
        ? { verdict: "pass", reason: `Open to year ${p.year}` }
        : { verdict: "fail", reason: `Only for year ${c.values.join(" or ")} students` };
    case "min_marks":
      return p.marksPercent >= c.value
        ? { verdict: "pass", reason: `Your ${p.marksPercent}% meets the ${c.value}% minimum` }
        : { verdict: "fail", reason: `Needs at least ${c.value}%; you have ${p.marksPercent}%` };
    case "genders":
      return c.values.includes(p.gender)
        ? { verdict: "pass", reason: `Open to ${p.gender} students` }
        : { verdict: "fail", reason: `Only for ${c.values.join(", ")} students` };
    case "disability_only":
      return p.disability
        ? { verdict: "pass", reason: "For students with a disability" }
        : { verdict: "fail", reason: "Only for students with a disability" };
    case "other":
      return { verdict: "unknown", reason: c.text };
  }
}

// Income limits that name groups only count for students in those groups.
function applicable(p: Profile, criteria: Criterion[]): { use: Criterion[]; missingIncome: boolean } {
  const tags = profileTags(p);
  const incomes = criteria.filter((c) => c.kind === "income_max");
  const use = criteria.filter(
    (c) => c.kind !== "income_max" || !c.forCategories?.length || c.forCategories.some((t) => tags.includes(t)),
  );
  const missingIncome = incomes.length > 0 && !use.some((c) => c.kind === "income_max");
  return { use, missingIncome };
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

export function checkScholarship(p: Profile, s: Scholarship, pageText: string, todayIso: string): CheckedScholarship {
  const page = normalize(pageText);
  const flags: string[] = [];
  const { use, missingIncome } = applicable(p, s.criteria);

  const results: CriterionResult[] = use.map((c) => {
    const quoteFound = quoteInText(c.quote, page);
    const r = checkCriterion(p, c);
    if (!quoteFound && r.verdict !== "unknown") {
      // A rule we can't find on the page is never trusted to include or exclude anyone.
      return { criterion: c, verdict: "unknown", reason: `${r.reason} (rule not found word-for-word on the source page)`, quoteFound };
    }
    return { criterion: c, ...r, quoteFound };
  });
  if (missingIncome) {
    results.push({
      criterion: { kind: "other", text: "Income limit for your group is not stated", quote: "" },
      verdict: "unknown",
      reason: "The source gives income limits only for other groups",
      quoteFound: false,
    });
  }
  if (results.length === 0) flags.push("No eligibility rules could be read from the source");

  const eligibility: Eligibility = results.some((r) => r.verdict === "fail")
    ? "not_eligible"
    : results.length === 0 || results.some((r) => r.verdict === "unknown")
      ? "likely"
      : "eligible";

  // Verifier: is the deadline current, dated and actually on the page?
  let deadlineStatus: DeadlineStatus = "check_portal";
  let daysLeft: number | null = null;
  const oldCycle = s.cycle !== null && !CURRENT_CYCLE_YEARS.some((y) => s.cycle!.includes(y));
  const deadlineQuoted = quoteInText(s.deadline.quote, page);
  if (oldCycle) {
    flags.push(`Dates on the source are for ${s.cycle}; this year's dates aren't published there yet`);
  } else if (!s.deadline.date) {
    flags.push("No last date on the source");
  } else if (!deadlineQuoted) {
    flags.push("The last date couldn't be found word-for-word on the source page");
  } else {
    daysLeft = daysBetween(todayIso, s.deadline.date);
    deadlineStatus = daysLeft < 0 ? "closed" : daysLeft <= CLOSING_SOON_DAYS ? "closing_soon" : "open";
  }
  if (s.sourceKind === "aggregator" || s.sourceKind === "other") {
    flags.push("Read from a secondary site, not the official portal; confirm on the official page before applying");
  }

  return { scholarship: s, results, eligibility, deadlineStatus, daysLeft, flags };
}

// Deterministic ordering, used before (and if) the Judge ranks: claimable first,
// then soonest deadline, then biggest amount.
export function baseOrder(a: CheckedScholarship, b: CheckedScholarship): number {
  const el = { eligible: 0, likely: 1, not_eligible: 2 } as const;
  const dl = { closing_soon: 0, open: 1, check_portal: 2, closed: 3 } as const;
  return (
    el[a.eligibility] - el[b.eligibility] ||
    dl[a.deadlineStatus] - dl[b.deadlineStatus] ||
    (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) ||
    (b.scholarship.amount.value ?? 0) - (a.scholarship.amount.value ?? 0)
  );
}

// The headline number: only what the student can still claim this cycle.
export function claimableTotal(list: CheckedScholarship[]): { total: number; count: number; closingSoon: number } {
  const live = list.filter(
    (c) => c.eligibility !== "not_eligible" && (c.deadlineStatus === "open" || c.deadlineStatus === "closing_soon"),
  );
  return {
    total: live.reduce((sum, c) => sum + annualValue(c.scholarship), 0),
    count: live.length,
    closingSoon: live.filter((c) => c.deadlineStatus === "closing_soon").length,
  };
}

export function annualValue(s: Scholarship): number {
  const v = s.amount.value ?? 0;
  return s.amount.period === "per-month" ? v * 10 : v; // 10 academic months
}
