// Run: npm test
// Conflicts, follow-up merging, the document checklist and run cost: all plain code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScholarship } from "./checker";
import { findConflicts } from "./conflicts";
import { followUpQuery, mergeFollowUp, pickFollowUps, unsettled } from "./followup";
import { canonicalDoc, documentChecklist } from "./kit";
import { formatCost, runCost } from "./pricing";
import { normalize } from "./text";
import { PERSONAS } from "./personas";
import type { ModelCall, Scholarship } from "./types";

const [kavya] = PERSONAS; // Karnataka, OBC 2A, ₹95,000
const TODAY = "2026-10-28";

const OFFICIAL_PAGE = `Post-Matric Scholarship for Backward Classes 2026-27. Students of Karnataka.
Family income up to ₹1 lakh for Categories 2A, 3A and 3B. Backward Classes Welfare Department: last date 31/10/2026`;
const AGG_PAGE = `Post Matric Scholarship Karnataka for backward classes. Last date to apply: December 31, 2026.
Annual family income should not exceed ₹2 lakh for Category 2A students.`;

const official: Scholarship = {
  id: "bcw",
  name: "Post-Matric Scholarship for Backward Classes",
  provider: "BCWD Karnataka",
  amount: { value: null, text: "Fees", period: "per-year" },
  deadline: { date: "2026-10-31", text: "31/10/2026", quote: "Backward Classes Welfare Department: last date 31/10/2026" },
  cycle: "2026-27",
  criteria: [{ kind: "income_max", value: 100000, forCategories: ["2A", "3A", "3B"], quote: "Family income up to ₹1 lakh for Categories 2A, 3A and 3B" }],
  documents: ["Income certificate", "Caste certificate"],
  applyUrl: "https://ssp.karnataka.gov.in",
  sourceUrl: "https://bcwd.karnataka.gov.in/pms",
  sourceKind: "official",
};
const aggregator: Scholarship = {
  ...official,
  deadline: { date: "2026-12-31", text: "December 31, 2026", quote: "Last date to apply: December 31, 2026" },
  criteria: [{ kind: "income_max", value: 200000, forCategories: ["2A"], quote: "should not exceed ₹2 lakh for Category 2A students" }],
  sourceUrl: "https://www.buddy4study.com/bcw",
  sourceKind: "aggregator",
};
const norms = new Map([
  [official.sourceUrl, normalize(OFFICIAL_PAGE)],
  [aggregator.sourceUrl, normalize(AGG_PAGE)],
]);

test("conflict: secondary site's later deadline is flagged against the official one", () => {
  const c = findConflicts(official, [official, aggregator], norms);
  const d = c.find((x) => x.field === "deadline");
  assert.ok(d, "deadline conflict found");
  assert.match(d.official, /31 Oct 2026/);
  assert.match(d.secondary, /31 Dec 2026/);
  assert.equal(d.secondaryHost, "buddy4study.com");
});

test("conflict: different group lists are not compared, and unquoted facts never count", () => {
  // The aggregator's income rule names only 2A; the official one names 2A/3A/3B, so no income conflict.
  assert.equal(findConflicts(official, [aggregator], norms).filter((x) => x.field === "income").length, 0);
  // A deadline the aggregator page doesn't actually say is ignored.
  const invented = { ...aggregator, deadline: { ...aggregator.deadline, quote: "Last date: 15 January 2027" } };
  assert.equal(findConflicts(official, [invented], norms).length, 0);
  // Only an official copy can be the reference.
  assert.equal(findConflicts(aggregator, [official], norms).length, 0);
});

test("follow-up: a group's missing income limit is searched for, then settled from a quoted official page", () => {
  const secondaryPage = `Post-Matric Scholarship for Backward Classes. Family income up to ₹2.5 lakh for Category I. Last date 31/10/2026 for 2026-27`;
  const partial: Scholarship = {
    ...official,
    criteria: [{ kind: "income_max", value: 250000, forCategories: ["Cat-1"], quote: "Family income up to ₹2.5 lakh for Category I" }],
    deadline: { date: "2026-10-31", text: "", quote: "Last date 31/10/2026 for 2026-27" },
    sourceUrl: "https://www.buddy4study.com/x",
    sourceKind: "aggregator",
  };
  const before = checkScholarship(kavya, partial, secondaryPage, TODAY);
  assert.equal(before.eligibility, "likely");
  assert.equal(unsettled(before), 1);
  assert.deepEqual(pickFollowUps([before]).length, 1);
  assert.match(followUpQuery(before, kavya), /income limit category 2A Karnataka 2026-27/);

  const merged = mergeFollowUp(partial, normalize(secondaryPage), official, normalize(OFFICIAL_PAGE));
  const after = checkScholarship(kavya, merged, `${secondaryPage}\n\n${OFFICIAL_PAGE}`, TODAY);
  assert.equal(unsettled(after), 0);
  assert.equal(after.eligibility, "eligible"); // ₹95,000 is within the quoted ₹1 lakh for 2A
});

test("follow-up: a quoted original rule is never replaced, and an unquoted new rule never added", () => {
  const page = normalize(OFFICIAL_PAGE);
  const other = { ...aggregator, criteria: [{ kind: "income_max" as const, value: 999999, forCategories: ["2A" as const, "3A" as const, "3B" as const], quote: "not on the page at all" }] };
  const merged = mergeFollowUp(official, page, other, normalize(AGG_PAGE));
  assert.deepEqual(merged.criteria, official.criteria);
});

test("document checklist merges spellings and ranks by how many schemes need it", () => {
  assert.equal(canonicalDoc("Income Certificate (Tahsildar)"), "Income certificate");
  assert.equal(canonicalDoc("Bank passbook copy"), "Bank account (Aadhaar-linked)");
  assert.equal(canonicalDoc("Aadhaar-linked bank account"), "Bank account (Aadhaar-linked)");
  assert.equal(canonicalDoc("Aadhaar card copy"), "Aadhaar card");
  const a = checkScholarship(kavya, official, OFFICIAL_PAGE, TODAY);
  const b = { ...a, scholarship: { ...official, id: "b", name: "Other scheme", documents: ["income cert.", "Aadhaar"] } };
  const kit = documentChecklist([a, b]);
  assert.equal(kit[0].doc, "Income certificate");
  assert.equal(kit[0].schemes.length, 2);
  assert.equal(kit[0].firstDeadline, "2026-10-31");
  // Schemes the student can't apply for add nothing.
  assert.equal(documentChecklist([{ ...a, eligibility: "not_eligible" }]).length, 0);
});

test("run cost uses list prices and skips calls without token counts", () => {
  const call = (model: string, i: number, o: number): ModelCall => ({ step: "read", model, requestId: "r", ms: 1, promptTokens: i, completionTokens: o, cachedTokens: 0, ok: true });
  const { usd, priced, unpriced } = runCost([
    call("nvidia/nemotron-3-super-120b-a12b", 1_000_000, 0), // $0.30
    call("nvidia/Nemotron-3-Ultra-550b-a55b", 0, 100_000), // $0.30
    { ...call("unknown/model", 10, 10) },
    { ...call("nvidia/Nemotron-3_5-Lightning", 5, 5), ok: false },
  ]);
  assert.equal(priced, 2);
  assert.equal(unpriced, 1);
  assert.ok(Math.abs(usd - 0.6) < 1e-9);
  assert.match(formatCost(0.0042), /^\$0\.0042 \(≈ ₹0\.37\)$/);
});

test("eval scoring: matches schemes by name, counts found, extra and quoted-extra rules", async () => {
  const { scorePage, sameScheme } = await import("./evalScore");
  assert.ok(sameScheme("SC Post-Matric Scholarship", "Post-Matric Scholarship for SC students (Social Welfare)"));
  assert.ok(!sameScheme("ST Post-Matric Scholarship", "Pragati Scholarship for Girls"));
  const page = "Family income up to ₹2.5 lakh. Students must have 60% marks. Only for SC students.";
  const got: Scholarship = {
    ...official,
    name: "SC Post-Matric Scholarship (Social Welfare)",
    deadline: { date: "2027-01-31", text: "", quote: null },
    criteria: [
      { kind: "income_max", value: 250000, quote: "Family income up to ₹2.5 lakh" },
      { kind: "min_marks", value: 60, quote: "Students must have 60% marks" }, // not in gold, but on the page
      { kind: "genders", values: ["female"], quote: "girls only" }, // invented and unquoted
    ],
  };
  const s = scorePage(
    [
      { name: "SC Post-Matric Scholarship", deadline: "2027-01-31", rules: [{ kind: "categories", values: ["SC"] }, { kind: "income_max", value: 250000 }] },
      { name: "ST Post-Matric Scholarship", rules: [{ kind: "income_max", value: 250000 }] },
    ],
    [got],
    page,
  );
  assert.equal(s.goldRules, 3);
  assert.equal(s.found, 1);
  assert.equal(s.extra, 2);
  assert.equal(s.extraPassedVerifier, 1);
  assert.equal(s.deadlinesRight, 1);
  assert.deepEqual(s.schemesMissed, ["ST Post-Matric Scholarship"]);
});

test("criteria shaper maps model spellings and never lets an unknown value exclude a student", async () => {
  const { cleanCriteria } = await import("./shape");
  const out = cleanCriteria([
    { kind: "categories", values: ["obc", "Category-I", "2a"], quote: "q" },
    { kind: "years", values: ["1st year", 2], quote: "q" },
    { kind: "genders", values: ["Girls"], quote: "q" },
    { kind: "course_levels", values: ["Undergraduate", "Diploma"], quote: "q" },
    { kind: "income_max", value: "2,50,000", forCategories: ["Cat-I"], quote: "q" },
    { kind: "categories", values: ["Vokkaliga"], quote: "q" }, // unknown group: becomes "other"
    { kind: "min_marks", value: "sixty", quote: "q" }, // dropped
    { kind: "nonsense", quote: "q" }, // dropped
  ]);
  assert.deepEqual(out[0], { kind: "categories", values: ["OBC", "Cat-1", "2A"], quote: "q" });
  assert.deepEqual(out[1], { kind: "years", values: [1, 2], quote: "q" });
  assert.deepEqual(out[2], { kind: "genders", values: ["female"], quote: "q" });
  assert.deepEqual(out[3], { kind: "course_levels", values: ["ug", "diploma"], quote: "q" });
  assert.deepEqual(out[4], { kind: "income_max", value: 250000, forCategories: ["Cat-1"], quote: "q" });
  assert.equal(out[5].kind, "other");
  assert.equal(out.length, 6);
  // Kavya (OBC 2A) passes the shaped category rule instead of failing on "obc".
  const s = { ...official, criteria: [out[0]], sourceUrl: "x" };
  const page = "q is a placeholder quote text that is long enough";
  assert.notEqual(checkScholarship(kavya, { ...s, criteria: [{ ...out[0], quote: "q is a placeholder quote" }] }, page, TODAY).eligibility, "not_eligible");
});
