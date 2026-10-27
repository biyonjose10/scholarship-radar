// Prompts for the three model roles. Each returns JSON; the code checks everything after.
import type { CheckedScholarship, Profile } from "./types";
import { inr } from "./checker";

const LEVELS = { school: "school", diploma: "diploma/polytechnic", ug: "undergraduate", pg: "postgraduate", phd: "PhD" } as const;

export function describeProfile(p: Profile): string {
  return [
    `State of domicile: ${p.state}`,
    `Course: ${p.course} (${LEVELS[p.courseLevel]}), year ${p.year}`,
    `Category: ${p.category}${p.kaGroup ? ` (Karnataka backward-class group ${p.kaGroup})` : ""}${p.minority ? ", religious minority" : ""}`,
    `Annual family income: ${inr(p.familyIncome)}`,
    `Marks in last qualifying exam: ${p.marksPercent}%`,
    `Gender: ${p.gender}${p.disability ? ", has a disability" : ""}`,
  ].join("\n");
}

// ---- Scout (Nemotron 3.5 Lightning) ----

export const SCOUT_SYSTEM = `You plan web searches that find scholarships an Indian student can apply for in the 2026-27 academic year.
Reply with JSON only: {"queries": [6 strings], "official": [3 strings]}.
- "queries": general web searches. Cover, in this order: the student's state government schemes for their category (for Karnataka: the SSP portal and the department for their category, e.g. Backward Classes Welfare, Social Welfare, Minorities Welfare); central government schemes on the National Scholarship Portal that fit their category/minority status; AICTE schemes if the course is technical (engineering, diploma); private or CSR foundation scholarships that fit their course, income and gender.
- "official": short searches meant for government websites only (.gov.in), naming the specific scheme.
- Put "2026-27" or "2026" in most queries. Name concrete schemes when you know them. No explanations.`;

export function scoutUser(p: Profile): string {
  return `Student:\n${describeProfile(p)}`;
}

// Used only if the Scout call fails, so a run still completes; the UI says so.
export function fallbackQueries(p: Profile): { queries: string[]; official: string[] } {
  const cat = p.minority ? "minority" : p.category;
  const course = p.courseLevel === "diploma" ? "diploma polytechnic" : p.course;
  return {
    queries: [
      `${p.state} SSP post matric scholarship ${cat} eligibility income limit 2026-27`,
      `National Scholarship Portal ${cat} post matric scholarship 2026-27 last date`,
      `AICTE scholarship ${course} 2026-27 eligibility`,
      `scholarship for ${course} students India family income below ${Math.ceil(p.familyIncome / 100000)} lakh 2026`,
      `private foundation scholarship ${p.gender === "female" ? "girls " : ""}${course} India 2026 apply`,
      `${p.state} government scholarship ${cat} college students 2026-27`,
    ],
    official: [`${p.state} post matric scholarship ${cat}`, `${cat} scholarship ${course} guidelines`, `AICTE scholarship scheme guidelines`],
  };
}

// ---- Reader (Nemotron 3 Super) ----

export const READER_SYSTEM = `You read one web page about Indian scholarships and extract each scholarship's rules as JSON. You never decide eligibility; you only copy rules out accurately.

Reply with JSON only:
{"scholarships": [{
  "name": string,
  "provider": string,
  "amount": {"value": number|null, "text": string, "period": "one-time"|"per-year"|"per-month"|"unknown"},
  "deadline": {"date": "YYYY-MM-DD"|null, "text": string, "quote": string|null},
  "cycle": string|null,
  "criteria": [criterion, ...],
  "documents": [string, ...],
  "applyUrl": string|null
}]}

criterion is one of:
{"kind":"income_max","value":number,"forCategories":[tags]?,"quote":string}
{"kind":"categories","values":[tags],"quote":string}
{"kind":"minority_only","quote":string}
{"kind":"states","values":[state names or "All India"],"quote":string}
{"kind":"course_levels","values":["school"|"diploma"|"ug"|"pg"|"phd"],"quote":string}
{"kind":"years","values":[numbers],"quote":string}
{"kind":"min_marks","value":number,"quote":string}
{"kind":"genders","values":["female"|"male"|"other"],"quote":string}
{"kind":"disability_only","quote":string}
{"kind":"other","text":string,"quote":string}

tags are: "General","OBC","SC","ST","EWS","Cat-1","2A","2B","3A","3B","Minority".

Rules:
1. Every "quote" must be copied EXACTLY, word for word, from the page: one contiguous phrase of 6-30 words. Never paraphrase. Code will reject any rule whose quote is not on the page.
2. Income in rupees as a number: "₹2.5 lakh" = 250000, "₹1 lakh" = 100000, "8 LPA" = 800000.
3. If income limits differ by group (e.g. Karnataka Category-I vs 2A/3A/3B), write one income_max per group with forCategories.
4. If a scheme has tiers with different benefits, write one scholarship per tier.
5. Deadline: the last date to apply in the current cycle, as YYYY-MM-DD, with the exact quote. Indian pages write dates day-first: "31/10/2026" and "10.07.2025" are 31 October 2026 and 10 July 2025. If the page gives dates by department, pick the department matching the scheme. If none, date null.
6. cycle: the academic year the page's dates belong to, e.g. "2026-27"; null if not stated.
7. amount.value: annual rupees if the page says so; null if it is fee reimbursement or unclear (put the wording in "text").
8. Only include scholarships the student could plausibly be eligible for: college-level (skip school-only), their state or all-India. At most 6. If the page has none, return {"scholarships": []}.
9. Rules you cannot quote go in "other" with the closest quote, or are left out. Do not invent anything.
10. Pages may be partly in Kannada or another Indian language. Read them, write names and reasons in English, but copy each quote exactly in the page's original language and script. Known Karnataka departments: Social Welfare (SC), Tribal Welfare (ST), Backward Classes Welfare (OBC), Minorities Welfare, Technical Education.
11. A notice that applications "for the year 2024-25" closed on some date is an old cycle: set cycle "2024-25".`;

export function readerUser(p: Profile, url: string, text: string): string {
  return `Student (only to judge relevance, not eligibility):\n${describeProfile(p)}\n\nSource URL: ${url}\n\nPage text:\n"""\n${text}\n"""`;
}

// ---- Judge (Nemotron 3 Ultra) ----

export const JUDGE_SYSTEM = `You advise an Indian college student on which scholarships to apply for first and what to do this week. Code has already checked each rule; you must not contradict its verdicts.

Reply with JSON only:
{"ranked": [{"id": string, "why": string}], "steps": [{"when": string, "action": string}], "summary": string}

- ranked: the candidates worth applying for, best first. Weigh: money, how soon the deadline is, how certain eligibility is (eligible beats likely), and source reliability (official beats secondary). "why" is one sentence a student understands.
- For "likely" candidates, say exactly which unverified rule to confirm and where (college scholarship cell or the official portal).
- steps: 3-6 concrete actions in order, with "when" like "Today", "This week", "Before 15 Nov". Include getting documents that take time (income and caste certificates from the local Nadakacheri / tahsildar office can take weeks), and the portal registration.
- summary: two sentences, plain English, no hype, no guarantees.
- Never invent amounts, dates or rules that are not in the input.`;

export function judgeUser(p: Profile, list: CheckedScholarship[], todayIso: string): string {
  const items = list.map((c) => ({
    id: c.scholarship.id,
    name: c.scholarship.name,
    provider: c.scholarship.provider,
    eligibility: c.eligibility,
    unverified: c.results.filter((r) => r.verdict === "unknown").map((r) => r.reason),
    deadline: c.scholarship.deadline.date,
    deadlineStatus: c.deadlineStatus,
    daysLeft: c.daysLeft,
    amount: c.scholarship.amount.text,
    documents: c.scholarship.documents,
    source: c.scholarship.sourceKind,
    warnings: c.flags,
  }));
  return `Today is ${todayIso}.\n\nStudent:\n${describeProfile(p)}\n\nCandidates (checked by code):\n${JSON.stringify(items, null, 1)}`;
}
