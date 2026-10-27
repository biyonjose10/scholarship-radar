// Shared shapes for the whole pipeline. The checker and verifier work only on these,
// so the eligibility decision never depends on free text from a model.

export type CourseLevel = "school" | "diploma" | "ug" | "pg" | "phd";
export type Category = "General" | "OBC" | "SC" | "ST" | "EWS";
// Karnataka splits backward classes into groups with different income limits.
export type KaGroup = "Cat-1" | "2A" | "2B" | "3A" | "3B";
export type Gender = "female" | "male" | "other";

// Every tag a category criterion can name: the national category, the Karnataka group, or "Minority".
export type CategoryTag = Category | KaGroup | "Minority";

export interface Profile {
  label: string; // persona name, display only
  state: string; // domicile state, e.g. "Karnataka"
  courseLevel: CourseLevel;
  course: string; // e.g. "B.E. Computer Science"
  year: number; // year of study, 1-based
  category: Category;
  kaGroup: KaGroup | null; // only for Karnataka OBC students
  minority: boolean; // religious minority (Muslim, Christian, Sikh, Buddhist, Jain, Parsi)
  familyIncome: number; // INR per year
  marksPercent: number; // last qualifying exam
  gender: Gender;
  disability: boolean;
}

export type Criterion =
  // forCategories: the limit applies only to these groups (e.g. ₹2.5 L for Cat-1, ₹1 L for 2A/3A/3B)
  | { kind: "income_max"; value: number; forCategories?: CategoryTag[]; quote: string }
  | { kind: "categories"; values: CategoryTag[]; quote: string }
  | { kind: "minority_only"; quote: string }
  | { kind: "states"; values: string[]; quote: string }
  | { kind: "course_levels"; values: CourseLevel[]; quote: string }
  | { kind: "years"; values: number[]; quote: string }
  | { kind: "min_marks"; value: number; quote: string }
  | { kind: "genders"; values: Gender[]; quote: string }
  | { kind: "disability_only"; quote: string }
  | { kind: "other"; text: string; quote: string };

export interface Scholarship {
  id: string;
  name: string;
  provider: string;
  amount: { value: number | null; text: string; period: "one-time" | "per-year" | "per-month" | "unknown" };
  deadline: { date: string | null; text: string; quote: string | null }; // date is ISO yyyy-mm-dd
  cycle: string | null; // e.g. "2026-27"
  criteria: Criterion[];
  documents: string[];
  applyUrl: string | null;
  sourceUrl: string;
  sourceKind: SourceKind;
}

export type SourceKind = "official" | "foundation" | "aggregator" | "other";

export type Verdict = "pass" | "fail" | "unknown";

export interface CriterionResult {
  criterion: Criterion;
  verdict: Verdict;
  reason: string; // plain-language explanation produced by code
  quoteFound: boolean; // the quote really appears in the extracted page text
}

export type Eligibility = "eligible" | "likely" | "not_eligible";

export type DeadlineStatus = "open" | "closing_soon" | "closed" | "check_portal";

export interface CheckedScholarship {
  scholarship: Scholarship;
  results: CriterionResult[];
  eligibility: Eligibility;
  deadlineStatus: DeadlineStatus;
  daysLeft: number | null;
  flags: string[]; // verifier warnings, shown to the student
}

// Events streamed from the server to the timeline.
export type StepId = "scout" | "search" | "extract" | "read" | "check" | "verify" | "judge" | "act";

export interface ModelCall {
  step: StepId;
  model: string;
  requestId: string | null;
  ms: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  ok: boolean;
  error?: string;
}

export interface ToolCall {
  step: StepId;
  tool: "tavily.search" | "tavily.extract";
  detail: string;
  ms: number;
  credits: number | null;
  ok: boolean;
  error?: string;
}

export interface Plan {
  ranked: { id: string; why: string }[];
  steps: { when: string; action: string }[];
  summary: string;
}

export type RunEvent =
  | { type: "step"; step: StepId; status: "running" | "done" | "failed" | "skipped"; actor: string; detail?: string }
  | { type: "queries"; queries: string[] }
  | { type: "sources"; sources: { url: string; title: string; kind: SourceKind }[] }
  | { type: "model_call"; call: ModelCall }
  | { type: "tool_call"; call: ToolCall }
  | { type: "results"; checked: CheckedScholarship[] }
  | { type: "plan"; plan: Plan }
  | { type: "error"; message: string }
  | { type: "done" };
