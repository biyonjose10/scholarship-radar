// DEVELOPMENT ONLY. Replays a labelled sample run so the interface can be laid out
// before model access exists. The API route refuses to use it in production builds.
// The scholarships are hand-written, modelled on real 2026-27 pages (the BCW 31/10/2026 date matches
// ssp.karnataka.gov.in on 28 Oct 2026); the checker and verifier output is real.
import type { Profile, RunEvent, Scholarship } from "./types";
import { baseOrder, checkScholarship } from "./checker";
import { findConflicts } from "./conflicts";
import { normalize } from "./text";

const PAGE = `
Application deadlines fall for Karnataka’s SSP scholarship 2026-27 across various departments between September 30, 2026, and January 31, 2027.
Post-Matric Scholarship for Backward Classes: Family income up to ₹2.5 lakh for Category I; up to ₹1 lakh for Categories 2A, 3A and 3B.
Post-Matric Scholarship for Minorities Enrolled in Class 11, 12, graduation, post-graduation or a technical/vocational course. Family income up to ₹2.5 lakh from all sources.
Backward Classes Welfare Department: last date 31/10/2026
Minorities Welfare: November 15, 2026
Backward Classes Welfare Department Scheme September 30, 2026 (extended)
AICTE Pragati Scholarship for girls admitted to first year of degree or diploma, or second year through lateral entry. Family income not more than ₹8 lakh per annum. Scholarship of ₹50,000 per annum. Last date: 31 October 2026.
`;

const base = { documents: ["Income certificate", "Caste certificate", "Previous marks card", "Aadhaar-linked bank account"], cycle: "2026-27" };

const SAMPLE: Scholarship[] = [
  {
    ...base,
    id: "bcw-post-matric",
    name: "Post-Matric Scholarship for Backward Classes",
    provider: "Backward Classes Welfare Department, Karnataka",
    amount: { value: null, text: "Fee reimbursement + maintenance", period: "per-year" },
    deadline: { date: "2026-10-31", text: "31 Oct 2026", quote: "Backward Classes Welfare Department: last date 31/10/2026" },
    criteria: [
      { kind: "states", values: ["Karnataka"], quote: "Karnataka’s SSP scholarship 2026-27" },
      { kind: "categories", values: ["Cat-1", "2A", "3A", "3B"], quote: "up to ₹1 lakh for Categories 2A, 3A and 3B" },
      { kind: "income_max", value: 250000, forCategories: ["Cat-1"], quote: "Family income up to ₹2.5 lakh for Category I" },
      { kind: "income_max", value: 100000, forCategories: ["2A", "3A", "3B"], quote: "up to ₹1 lakh for Categories 2A, 3A and 3B" },
    ],
    applyUrl: "https://ssp.karnataka.gov.in",
    sourceUrl: "https://bcwd.karnataka.gov.in/153/post-metric-scholarship-2025-26/en",
    sourceKind: "official",
  },
  {
    ...base,
    id: "aicte-pragati",
    name: "AICTE Pragati Scholarship for Girls",
    provider: "AICTE",
    amount: { value: 50000, text: "₹50,000 per year", period: "per-year" },
    deadline: { date: "2026-10-31", text: "31 Oct 2026", quote: "Last date: 31 October 2026" },
    criteria: [
      { kind: "genders", values: ["female"], quote: "AICTE Pragati Scholarship for girls" },
      { kind: "years", values: [1], quote: "admitted to first year of degree or diploma" },
      { kind: "income_max", value: 800000, quote: "Family income not more than ₹8 lakh per annum" },
    ],
    applyUrl: "https://scholarships.gov.in",
    sourceUrl: "https://www.buddy4study.com/article/pragati-scholarship",
    sourceKind: "aggregator",
  },
  {
    ...base,
    id: "minority-post-matric",
    name: "Post-Matric Scholarship for Minorities",
    provider: "Minorities Welfare Department, Karnataka",
    amount: { value: 10000, text: "Up to ₹10,000 per year", period: "per-year" },
    deadline: { date: "2026-11-15", text: "15 Nov 2026", quote: "Minorities Welfare: November 15, 2026" },
    criteria: [
      { kind: "minority_only", quote: "Post-Matric Scholarship for Minorities" },
      { kind: "income_max", value: 250000, quote: "Family income up to ₹2.5 lakh from all sources" },
    ],
    applyUrl: "https://ssp.karnataka.gov.in",
    sourceUrl: "https://www.buddy4study.com/article/ssp-scholarship",
    sourceKind: "aggregator",
  },
  {
    ...base,
    id: "merit-cum-means",
    name: "Merit-cum-Means Scholarship for Professional Courses",
    provider: "Ministry of Minority Affairs",
    amount: { value: 30000, text: "₹30,000 per year", period: "per-year" },
    cycle: "2024-25",
    deadline: { date: "2024-10-31", text: "31 Oct 2024", quote: null },
    criteria: [{ kind: "other", text: "Admission through a competitive exam is required", quote: "" }],
    applyUrl: null,
    sourceUrl: "https://www.example.org/old-page",
    sourceKind: "other",
  },
];

// The same scheme as listed on a secondary site. This mismatch is real: buddy4study.com/article/ssp-scholarship
// (saved 28 Oct 2026) gives the BCW post-matric date as 30 Sep 2026, while ssp.karnataka.gov.in says 31/10/2026.
const BCW_ON_AGGREGATOR: Scholarship = {
  ...SAMPLE[0],
  deadline: { date: "2026-09-30", text: "September 30, 2026 (extended)", quote: "Backward Classes Welfare Department Scheme September 30, 2026 (extended)" },
  sourceUrl: "https://www.buddy4study.com/article/ssp-scholarship",
  sourceKind: "aggregator",
};

export function fixtureEvents(p: Profile, today: string): RunEvent[] {
  const tag = " (dev fixture — not a real run)";
  const norm = normalize(PAGE);
  const norms = new Map([...SAMPLE, BCW_ON_AGGREGATOR].map((s) => [s.sourceUrl, norm]));
  const checked = SAMPLE.map((s) => {
    const c = checkScholarship(p, s, PAGE, today);
    const conflicts = s.id === "bcw-post-matric" ? findConflicts(s, [BCW_ON_AGGREGATOR], norms) : [];
    return conflicts.length ? { ...c, conflicts } : c;
  }).sort(baseOrder);
  return [
    { type: "step", step: "scout", status: "done", actor: "Nemotron 3.5 Lightning" + tag, detail: "9 searches planned" },
    { type: "queries", queries: ["Karnataka SSP post matric scholarship OBC 2A income limit 2026-27", "AICTE pragati scholarship 2026-27 (gov.in only)"] },
    { type: "step", step: "search", status: "done", actor: "Tavily Search" + tag, detail: "25 sources, 4 official" },
    { type: "step", step: "extract", status: "done", actor: "Tavily Extract" + tag, detail: "6 of 7 pages had scholarship text" },
    { type: "step", step: "read", status: "done", actor: "Nemotron 3 Super" + tag, detail: `${SAMPLE.length} scholarships read` },
    { type: "step", step: "check", status: "done", actor: "Rule checker (code, no model)", detail: "checker output is real" },
    { type: "step", step: "verify", status: "done", actor: "Source verifier (code, no model)", detail: "verifier output is real" },
    { type: "results", checked },
    { type: "step", step: "followup", status: "skipped", actor: "Tavily + Nemotron 3 Super" + tag, detail: "No follow-up searches in fixture mode" },
    { type: "step", step: "judge", status: "skipped", actor: "Nemotron 3 Ultra" + tag, detail: "No plan in fixture mode" },
    { type: "step", step: "act", status: "done", actor: "Calendar file (code)" },
    { type: "done" },
  ];
}
