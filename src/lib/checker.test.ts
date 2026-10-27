// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScholarship, claimableTotal } from "./checker";
import { focusText, normalize, quoteInText } from "./text";
import { PERSONAS } from "./personas";
import type { Scholarship } from "./types";

const [kavya, arjun, sana] = PERSONAS;
const TODAY = "2026-10-28";

// Short excerpt in the shape Tavily returns (markdown, bold, link targets).
const PAGE = `
Application deadlines fall for Karnataka’s SSP scholarship 2026-27 across various departments between **September 30, 2026, and January 31, 2027**.
[Post-Matric Scholarship for Backward Classes](https://www.buddy4study.com/scholarship/bcwd-post-matric-scholarship-karnataka)Family income up to ₹2.5 lakh for Category I; up to ₹1 lakh for Categories 2A, 3A and 3B.
Post-Matric Scholarship for Minorities Enrolled in Class 11, 12, graduation, post-graduation or a technical/vocational course. Family income up to ₹2.5 lakh from all sources.
Backward Classes Welfare: December 31, 2026
`;

const bcw: Scholarship = {
  id: "bcw-post-matric",
  name: "Post-Matric Scholarship for Backward Classes",
  provider: "Backward Classes Welfare Department, Karnataka",
  amount: { value: null, text: "Fee reimbursement + maintenance", period: "per-year" },
  deadline: { date: "2026-12-31", text: "December 31, 2026", quote: "Backward Classes Welfare: December 31, 2026" },
  cycle: "2026-27",
  criteria: [
    { kind: "states", values: ["Karnataka"], quote: "Karnataka’s SSP scholarship 2026-27" },
    { kind: "categories", values: ["Cat-1", "2A", "3A", "3B"], quote: "up to ₹1 lakh for Categories 2A, 3A and 3B" },
    { kind: "income_max", value: 250000, forCategories: ["Cat-1"], quote: "Family income up to ₹2.5 lakh for Category I" },
    { kind: "income_max", value: 100000, forCategories: ["2A", "3A", "3B"], quote: "up to ₹1 lakh for Categories 2A, 3A and 3B" },
  ],
  documents: ["Income certificate", "Caste certificate"],
  applyUrl: "https://ssp.karnataka.gov.in",
  sourceUrl: "https://www.buddy4study.com/article/ssp-scholarship",
  sourceKind: "aggregator",
};

test("quotes survive markdown, links and curly quotes", () => {
  const page = normalize(PAGE);
  assert.ok(quoteInText("Family income up to Rs. 2.5 lakh for Category I", page));
  assert.ok(quoteInText("between September 30, 2026, and January 31, 2027", page));
  assert.ok(!quoteInText("Family income up to ₹8 lakh for all students", page));
});

test("Kavya (2A, ₹95k) qualifies: the 2A limit applies, the Cat-1 limit is ignored", () => {
  const r = checkScholarship(kavya, bcw, PAGE, TODAY);
  assert.equal(r.eligibility, "eligible");
  assert.equal(r.results.filter((x) => x.criterion.kind === "income_max").length, 1);
  assert.equal(r.deadlineStatus, "open");
  assert.equal(r.daysLeft, 64);
});

test("Kavya above the 2A limit is not eligible", () => {
  const r = checkScholarship({ ...kavya, familyIncome: 150000 }, bcw, PAGE, TODAY);
  assert.equal(r.eligibility, "not_eligible");
});

test("Arjun (SC) fails the category rule", () => {
  const r = checkScholarship(arjun, bcw, PAGE, TODAY);
  assert.equal(r.eligibility, "not_eligible");
  assert.ok(r.results.some((x) => x.criterion.kind === "categories" && x.verdict === "fail"));
});

test("a rule the model invented (not on the page) never decides", () => {
  const invented: Scholarship = {
    ...bcw,
    criteria: [{ kind: "min_marks", value: 95, quote: "Minimum 95% marks in the qualifying exam" }],
  };
  const r = checkScholarship(kavya, invented, PAGE, TODAY);
  assert.equal(r.results[0].verdict, "unknown");
  assert.equal(r.eligibility, "likely");
});

test("old-cycle dates are flagged, not presented as live", () => {
  const old: Scholarship = { ...bcw, cycle: "2023-24", deadline: { date: "2023-12-31", text: "31 Dec 2023", quote: null } };
  const r = checkScholarship(kavya, old, PAGE, TODAY);
  assert.equal(r.deadlineStatus, "check_portal");
  assert.ok(r.flags.some((f) => f.includes("2023-24")));
});

test("past deadline on the page is closed; within 21 days is closing soon", () => {
  const closed = checkScholarship(kavya, { ...bcw, deadline: { date: "2026-09-30", text: "", quote: "September 30, 2026" } }, PAGE, TODAY);
  assert.equal(closed.deadlineStatus, "closed");
  const soon = checkScholarship(kavya, { ...bcw, deadline: { date: "2026-11-10", text: "", quote: "Backward Classes Welfare: December 31, 2026" } }, PAGE, TODAY);
  assert.equal(soon.deadlineStatus, "closing_soon");
});

test("minority scheme: Sana qualifies, Kavya does not", () => {
  const minority: Scholarship = {
    ...bcw,
    id: "minority-post-matric",
    amount: { value: 10000, text: "₹10,000", period: "per-year" },
    criteria: [
      { kind: "minority_only", quote: "Post-Matric Scholarship for Minorities" },
      { kind: "income_max", value: 250000, quote: "Family income up to ₹2.5 lakh from all sources" },
    ],
  };
  assert.equal(checkScholarship(sana, minority, PAGE, TODAY).eligibility, "eligible");
  assert.equal(checkScholarship(kavya, minority, PAGE, TODAY).eligibility, "not_eligible");
  const total = claimableTotal([checkScholarship(sana, minority, PAGE, TODAY)]);
  assert.equal(total.total, 10000);
});

test("focusText drops menus and keeps eligibility paragraphs", () => {
  const menu = Array.from({ length: 50 }, (_, i) => `[Link ${i}](https://x.com/${i})`).join(" ");
  const body = "Eligibility: family income up to 2.5 lakh. Last date: 31 December 2026.";
  const out = focusText(`${menu}\n\n${body}\n\n${"filler text ".repeat(5000)}`, 2000);
  assert.ok(out.includes("Eligibility"));
  assert.ok(!out.includes("Link 49"));
  assert.ok(out.length <= 2100);
});
