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

test("merge: one scheme under three names; the newest official date wins and the older one is noted", async () => {
  const { mergeCopies, schemeKey } = await import("./merge");
  const dept: Scholarship = {
    ...official,
    name: "Post Matric Scholarship",
    provider: "Backward Classes Welfare Department, Government of Karnataka",
    deadline: { date: "2026-08-31", text: "", quote: "Last date to apply: 31.08.2026" },
    cycle: "2026-27",
    sourceUrl: "https://bcwd.karnataka.gov.in/163",
  };
  const portal: Scholarship = {
    ...official,
    name: "Post-Matric Scholarship (Backward Classes Welfare Department)",
    provider: "Backward Classes Welfare Department",
    criteria: [],
    deadline: { date: "2026-10-31", text: "", quote: "ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026" },
    cycle: "2026-27",
    sourceUrl: "https://ssp.karnataka.gov.in/ssp_post_home",
  };
  const site: Scholarship = { ...aggregator, name: "Post-Matric Scholarship for Backward Classes", provider: "" };
  assert.equal(schemeKey(dept), "post-bc");
  assert.equal(schemeKey(portal), "post-bc");
  assert.equal(schemeKey(site), "post-bc");
  assert.notEqual(schemeKey({ name: "Vidyasiri Scholarship", provider: "Backward Classes Welfare" }), "post-bc");

  const texts = new Map([
    [dept.sourceUrl, `${OFFICIAL_PAGE}\nLast date to apply: 31.08.2026`],
    [portal.sourceUrl, "## Financial Year: 2026-27\nಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026"],
    [site.sourceUrl, AGG_PAGE],
  ]);
  const m = mergeCopies([site, dept, portal], texts);
  assert.equal(m.base.sourceUrl, dept.sourceUrl); // rules from the department page
  assert.equal(m.base.deadline.date, "2026-10-31"); // date from the portal
  assert.equal(m.extendedFrom, "2026-08-31");
  const c = checkScholarship(kavya, m.base, m.text, TODAY);
  assert.equal(c.deadlineStatus, "closing_soon"); // quote verified against the portal text
  assert.equal(c.daysLeft, 3);
  // The secondary site's 31 Dec is flagged against the official 31 Oct.
  const conflicts = findConflicts(m.base, [site, dept, portal], new Map([...texts].map(([u, t]) => [u, normalize(t)]).concat([[m.base.sourceUrl, m.norm]]) as [string, string][]));
  assert.ok(conflicts.some((x) => x.field === "deadline" && /31 Oct 2026/.test(x.official)));
});

test("merge: an official date-only notice borrows quoted rules from a secondary copy, and says so", async () => {
  const { mergeCopies } = await import("./merge");
  const portal: Scholarship = {
    ...official,
    name: "Post-Matric Scholarship (Backward Classes Welfare Department)",
    criteria: [],
    deadline: { date: "2026-10-31", text: "", quote: "ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026 ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ" },
    sourceUrl: "https://ssp.karnataka.gov.in/ssp_post_home",
  };
  const site: Scholarship = {
    ...aggregator,
    name: "Post-Matric Scholarship for Backward Classes",
    criteria: [{ kind: "income_max", value: 100000, forCategories: ["2A", "3A", "3B"], quote: "Family income up to ₹1 lakh for Categories 2A, 3A and 3B" }],
  };
  const texts = new Map([
    [portal.sourceUrl, "ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026 ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ"],
    [site.sourceUrl, "Family income up to ₹1 lakh for Categories 2A, 3A and 3B. Last date to apply: December 31, 2026."],
  ]);
  const m = mergeCopies([portal, site], texts);
  assert.equal(m.base.sourceKind, "official");
  assert.equal(m.base.deadline.date, "2026-10-31");
  assert.equal(m.base.criteria.length, 2); // the borrowed income rule + "for backward classes" from the notice
  assert.equal(m.rulesFrom, "buddy4study.com");
  const c = checkScholarship(kavya, m.base, m.text, TODAY);
  assert.equal(c.eligibility, "eligible"); // ₹95,000 within the quoted ₹1 lakh for 2A
  assert.equal(c.deadlineStatus, "closing_soon");
});

test("merge: a date-only notice that names its department becomes a quoted category rule", async () => {
  const { mergeCopies } = await import("./merge");
  const { PERSONAS } = await import("./personas");
  const arjun = PERSONAS[1]; // SC
  const quote = "ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026";
  const portal: Scholarship = {
    ...official,
    name: "Post-Matric Scholarship (Backward Classes Welfare Department)",
    criteria: [],
    deadline: { date: "2026-10-31", text: "", quote },
    sourceUrl: "https://ssp.karnataka.gov.in/ssp_post_home",
  };
  const m = mergeCopies([portal], new Map([[portal.sourceUrl, quote]]));
  assert.equal(m.base.criteria[0].kind, "categories");
  assert.equal(checkScholarship(arjun, m.base, m.text, TODAY).eligibility, "not_eligible");
  assert.equal(checkScholarship(kavya, m.base, m.text, TODAY).eligibility, "eligible");
});

test("SSP notice board: only this year's section, every department, exact quotes", async () => {
  const { parseSspNotices } = await import("./notices");
  const page = [
    "2024-25ನೇ ಸಾಲಿಗೆ ಸಮಾಜ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಧಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 10/07/2025.",
    "## Financial Year: 2026-27",
    "![](Images/new.gif)",
    "ಸಮಾಜ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/01/2027",
    "ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026",
    "ಅಲ್ಪಸಂಖ್ಯಾತರ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 30/11/2026",
    "## Financial Year: 2025-26",
    "ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 16/05/2026",
  ].join("\n");
  const got = parseSspNotices(page, "https://ssp.karnataka.gov.in/ssp_post_home");
  assert.deepEqual(got.map((s) => [s.provider, s.deadline.date, s.cycle]), [
    ["Social Welfare Department", "2027-01-31", "2026-27"],
    ["Backward Classes Welfare Department", "2026-10-31", "2026-27"],
    ["Minorities Welfare Department", "2026-11-30", "2026-27"],
  ]);
  const { schemeKey, mergeCopies } = await import("./merge");
  const bc = got[1];
  assert.equal(schemeKey(bc), "post-bc");
  const m = mergeCopies([bc], new Map([[bc.sourceUrl, page]]));
  const c = checkScholarship(kavya, m.base, m.text, TODAY);
  assert.equal(c.eligibility, "eligible");
  assert.equal(c.deadlineStatus, "closing_soon");
});
