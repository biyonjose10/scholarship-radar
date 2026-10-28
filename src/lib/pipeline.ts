// The agent run: Scout -> Search -> Extract -> Read -> Check -> Verify -> Follow up -> Judge -> Act.
// Each step reports which model or tool did the work, so the timeline can show it.
import type { CheckedScholarship, ModelCall, Plan, Profile, RunEvent, Scholarship, SourceKind, StepId, ToolCall } from "./types";
import { search, extract, rankSources, OFFICIAL_DOMAINS, type ExtractedPage, type SearchHit } from "./tavily";
import { chatJson, labelOf, MODELS } from "./nebius";
import { focusText, normalize, quoteInText, signalScore } from "./text";
import { baseOrder, checkScholarship } from "./checker";
import { findConflicts } from "./conflicts";
import { followUpQuery, mergeFollowUp, pickFollowUps, unsettled } from "./followup";
import { cacheGet, cacheSet, hash } from "./cache";
import { cleanCriteria } from "./shape";
import { describeProfile, fallbackQueries, JUDGE_SYSTEM, judgeUser, READER_SYSTEM, readerUser, SCOUT_SYSTEM, scoutUser } from "./prompts";

const MAX_PAGES = 7;
const MAX_OFFICIAL_PAGES = 4;
const READ_CONCURRENCY = 4;
const MAX_JUDGE_CANDIDATES = 10;
// The route allows 300 s; skip the follow-up if the main run was slow, so Judge still fits.
const FOLLOW_UP_BUDGET_MS = 150_000;

type Emit = (e: RunEvent) => void;

export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// Same scheme found on two pages: keep the copy from the better source with more verifiable rules.
export function nameKey(name: string): string {
  return normalize(name)
    .replace(/\b(scholarship|scheme|programme|program|for|the|of|and|20\d\d(-\d\d)?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const KIND_RANK: Record<SourceKind, number> = { official: 0, foundation: 1, aggregator: 2, other: 3 };

function verifiedRules(s: Scholarship, pageNorm: string): number {
  return s.criteria.filter((c) => quoteInText(c.quote, pageNorm)).length;
}


type Period = Scholarship["amount"]["period"];
const PERIODS: Period[] = ["one-time", "per-year", "per-month", "unknown"];

function toScholarships(raw: Partial<Scholarship>[] | undefined, url: string, kind: SourceKind): Scholarship[] {
  return (raw ?? []).slice(0, 6).flatMap((s): Scholarship[] => {
    if (!s?.name) return [];
    return [
      {
        id: "",
        name: String(s.name),
        provider: String(s.provider ?? ""),
        amount: {
          value: typeof s.amount?.value === "number" ? s.amount.value : null,
          text: String(s.amount?.text ?? ""),
          period: PERIODS.includes(s.amount?.period as Period) ? (s.amount!.period as Period) : "unknown",
        },
        deadline: {
          date: typeof s.deadline?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline.date) ? s.deadline.date : null,
          text: String(s.deadline?.text ?? ""),
          quote: typeof s.deadline?.quote === "string" ? s.deadline.quote : null,
        },
        cycle: typeof s.cycle === "string" ? s.cycle : null,
        criteria: cleanCriteria(s.criteria),
        documents: Array.isArray(s.documents) ? s.documents.map(String).slice(0, 10) : [],
        applyUrl: typeof s.applyUrl === "string" ? s.applyUrl : null,
        sourceUrl: url,
        sourceKind: kind,
      },
    ];
  });
}

// Reader call with a memory cache keyed by page content and student, so repeat runs are
// faster and give the same reading. A failed read returns nothing rather than stopping the run.
async function readPage(profile: Profile, page: ExtractedPage, kind: SourceKind, step: StepId, onModel: (c: ModelCall) => void): Promise<Scholarship[]> {
  const key = `read|${page.url}|${hash(page.text)}|${hash(describeProfile(profile))}`;
  const cached = cacheGet<Partial<Scholarship>[]>(key);
  if (cached) return toScholarships(cached, page.url, kind);
  try {
    const out = await chatJson<{ scholarships?: Partial<Scholarship>[] }>({
      model: MODELS.super,
      step,
      system: READER_SYSTEM,
      user: readerUser(profile, page.url, focusText(page.text)),
      maxTokens: 6000,
      onCall: onModel,
    });
    cacheSet(key, out.scholarships ?? []);
    return toScholarships(out.scholarships, page.url, kind);
  } catch {
    return [];
  }
}

// Tavily Extract with a memory cache per URL; only uncached pages cost credits.
async function extractCached(urls: string[], step: StepId, onTool: (c: ToolCall) => void): Promise<ExtractedPage[]> {
  const have = urls.flatMap((u) => {
    const t = cacheGet<string>(`page|${u}`);
    return t ? [{ url: u, text: t }] : [];
  });
  const need = urls.filter((u) => !have.some((h) => h.url === u));
  const fresh = await extract(need, step, onTool);
  for (const p of fresh) cacheSet(`page|${p.url}`, p.text);
  if (have.length) onTool({ step, tool: "tavily.extract", detail: `${have.length} pages reused from recent runs (no credits)`, ms: 0, credits: 0, ok: true });
  return [...have, ...fresh];
}

export async function runPipeline(profile: Profile, emit: Emit): Promise<void> {
  const today = todayIst();
  const t0 = Date.now();
  const onModel = (call: ModelCall) => emit({ type: "model_call", call });
  const onTool = (call: ToolCall) => emit({ type: "tool_call", call });

  // 1. Scout
  emit({ type: "step", step: "scout", status: "running", actor: labelOf(MODELS.lightning) });
  let plan: { queries: string[]; official: string[] };
  try {
    plan = await chatJson<{ queries: string[]; official: string[] }>({
      model: MODELS.lightning,
      step: "scout",
      system: SCOUT_SYSTEM,
      user: scoutUser(profile),
      maxTokens: 2000,
      onCall: onModel,
    });
    if (!Array.isArray(plan.queries) || plan.queries.length === 0) throw new Error("no queries");
    plan.queries = plan.queries.filter((q) => typeof q === "string").slice(0, 6);
    plan.official = (Array.isArray(plan.official) ? plan.official : []).filter((q) => typeof q === "string").slice(0, 3);
    emit({ type: "step", step: "scout", status: "done", actor: labelOf(MODELS.lightning), detail: `${plan.queries.length + plan.official.length} searches planned` });
  } catch {
    plan = fallbackQueries(profile);
    emit({ type: "step", step: "scout", status: "failed", actor: labelOf(MODELS.lightning), detail: "Scout unavailable; using built-in searches" });
  }
  emit({ type: "queries", queries: [...plan.queries, ...plan.official.map((q) => `${q} (gov.in only)`)] });

  // 2. Search
  emit({ type: "step", step: "search", status: "running", actor: "Tavily Search" });
  const hits: SearchHit[] = (
    await Promise.all([
      ...plan.queries.map((q) => search(q, "search", onTool)),
      ...plan.official.map((q) => search(q, "search", onTool, { includeDomains: OFFICIAL_DOMAINS, maxResults: 5 })),
    ])
  ).flat();
  const ranked = rankSources(hits, profile.state);
  if (ranked.length === 0) {
    emit({ type: "step", step: "search", status: "failed", actor: "Tavily Search", detail: "No results" });
    emit({ type: "error", message: "The web search returned nothing. Try again in a minute." });
    return;
  }
  const official = ranked.filter((h) => h.kind === "official").slice(0, MAX_OFFICIAL_PAGES);
  const rest = ranked.filter((h) => h.kind !== "official").slice(0, MAX_PAGES - official.length);
  const chosen = [...official, ...rest];
  emit({ type: "step", step: "search", status: "done", actor: "Tavily Search", detail: `${ranked.length} sources, ${official.length} official` });
  emit({ type: "sources", sources: chosen.map((h) => ({ url: h.url, title: h.title, kind: h.kind })) });

  // 3. Extract
  emit({ type: "step", step: "extract", status: "running", actor: "Tavily Extract" });
  const pages = (await extractCached(chosen.map((h) => h.url), "extract", onTool)).filter((p) => signalScore(p.text) >= 5);
  if (pages.length === 0) {
    emit({ type: "step", step: "extract", status: "failed", actor: "Tavily Extract", detail: "No readable pages" });
    emit({ type: "error", message: "None of the pages could be read. Official portals sometimes block reading; try again later." });
    return;
  }
  emit({ type: "step", step: "extract", status: "done", actor: "Tavily Extract", detail: `${pages.length} of ${chosen.length} pages had scholarship text` });

  // 4. Read
  emit({ type: "step", step: "read", status: "running", actor: labelOf(MODELS.super) });
  const kindOf = new Map(chosen.map((h) => [h.url, h.kind]));
  const pageNorm = new Map(pages.map((p) => [p.url, normalize(p.text)]));
  const read = await pool(pages, READ_CONCURRENCY, (page) => readPage(profile, page, kindOf.get(page.url) ?? "other", "read", onModel));
  const found = read.flat();
  emit({ type: "step", step: "read", status: found.length ? "done" : "failed", actor: labelOf(MODELS.super), detail: `${found.length} scholarships read from ${pages.length} pages` });
  if (found.length === 0) {
    emit({ type: "error", message: "No scholarship rules could be read from the pages found." });
    return;
  }

  // Merge duplicates across pages, keeping every copy so official and secondary can be compared.
  const byKey = new Map<string, Scholarship>();
  const copies = new Map<string, Scholarship[]>();
  for (const s of found) {
    const key = nameKey(s.name) || slug(s.name);
    copies.set(key, [...(copies.get(key) ?? []), s]);
    const prev = byKey.get(key);
    const better =
      !prev ||
      KIND_RANK[s.sourceKind] < KIND_RANK[prev.sourceKind] ||
      (KIND_RANK[s.sourceKind] === KIND_RANK[prev.sourceKind] &&
        verifiedRules(s, pageNorm.get(s.sourceUrl) ?? "") > verifiedRules(prev, pageNorm.get(prev.sourceUrl) ?? ""));
    if (better) byKey.set(key, { ...s, id: slug(key) || slug(s.name) });
  }

  // 5. Check (code)
  emit({ type: "step", step: "check", status: "running", actor: "Rule checker (code, no model)" });
  const textByUrl = new Map(pages.map((p) => [p.url, p.text]));
  let checked: CheckedScholarship[] = [...byKey.entries()]
    .map(([key, s]) => {
      const c = checkScholarship(profile, s, textByUrl.get(s.sourceUrl) ?? "", today);
      const conflicts = findConflicts(s, copies.get(key) ?? [], pageNorm);
      return conflicts.length ? { ...c, conflicts } : c;
    })
    .sort(baseOrder);
  const eligible = checked.filter((c) => c.eligibility === "eligible").length;
  const likely = checked.filter((c) => c.eligibility === "likely").length;
  emit({ type: "step", step: "check", status: "done", actor: "Rule checker (code, no model)", detail: `${eligible} eligible, ${likely} need one check, ${checked.length - eligible - likely} not for you` });

  // 6. Verify (code)
  const rules = checked.flatMap((c) => c.results);
  const unquoted = rules.filter((r) => !r.quoteFound && r.criterion.kind !== "other").length;
  const stale = checked.filter((c) => c.deadlineStatus === "check_portal").length;
  const conflicting = checked.filter((c) => c.conflicts?.length).length;
  emit({
    type: "step",
    step: "verify",
    status: "done",
    actor: "Source verifier (code, no model)",
    detail:
      `${rules.length - unquoted} of ${rules.length} rules found word-for-word on their source; ${stale} deadlines need checking` +
      (conflicting ? `; ${conflicting} where a secondary site disagrees with the official page` : ""),
  });
  emit({ type: "results", checked });

  // 7. Follow up: one more official-only search for rules the checker couldn't settle.
  const targets = pickFollowUps(checked);
  const followActor = `Tavily + ${labelOf(MODELS.super)}`;
  if (targets.length === 0) {
    emit({ type: "step", step: "followup", status: "skipped", actor: followActor, detail: "Every open rule was already settled" });
  } else if (Date.now() - t0 > FOLLOW_UP_BUDGET_MS) {
    emit({ type: "step", step: "followup", status: "skipped", actor: followActor, detail: "Skipped to keep the run under five minutes" });
  } else {
    emit({ type: "step", step: "followup", status: "running", actor: followActor });
    const before = targets.reduce((n, c) => n + unsettled(c), 0);
    const readUrls = new Set(pages.map((p) => p.url));
    const updates = await Promise.all(
      targets.map(async (c): Promise<CheckedScholarship | null> => {
        const q = followUpQuery(c, profile);
        const hits = rankSources(await search(q, "followup", onTool, { includeDomains: OFFICIAL_DOMAINS, maxResults: 3 }), profile.state);
        const next = hits.find((h) => !readUrls.has(h.url));
        if (!next) return null;
        const [page] = (await extractCached([next.url], "followup", onTool)).filter((p) => signalScore(p.text) >= 3);
        if (!page) return null;
        const want = nameKey(c.scholarship.name);
        const match = (await readPage(profile, page, "official", "followup", onModel)).find((s) => nameKey(s.name) === want);
        if (!match) return null;
        const origText = textByUrl.get(c.scholarship.sourceUrl) ?? "";
        const merged = mergeFollowUp(c.scholarship, normalize(origText), match, normalize(page.text));
        const again = checkScholarship(profile, merged, `${origText}\n\n${page.text}`, today);
        const settled = unsettled(c) - unsettled(again);
        if (settled <= 0 && again.eligibility === c.eligibility) return null;
        return { ...again, conflicts: c.conflicts, followUp: { url: page.url, settled: Math.max(settled, 0) } };
      }),
    );
    let settledTotal = 0;
    for (const u of updates) {
      if (!u) continue;
      settledTotal += u.followUp!.settled;
      checked = checked.map((c) => (c.scholarship.id === u.scholarship.id ? u : c));
    }
    checked.sort(baseOrder);
    emit({
      type: "step",
      step: "followup",
      status: "done",
      actor: followActor,
      detail: `${before} unsettled rule${before === 1 ? "" : "s"} on ${targets.length} scholarship${targets.length === 1 ? "" : "s"} → searched government sites → ${settledTotal} settled`,
    });
    if (updates.some(Boolean)) emit({ type: "results", checked });
  }

  // 8. Judge
  const candidates = checked.filter((c) => c.eligibility !== "not_eligible" && c.deadlineStatus !== "closed").slice(0, MAX_JUDGE_CANDIDATES);
  if (candidates.length === 0) {
    emit({ type: "step", step: "judge", status: "skipped", actor: labelOf(MODELS.ultra), detail: "Nothing open to rank" });
  } else {
    emit({ type: "step", step: "judge", status: "running", actor: labelOf(MODELS.ultra) });
    try {
      const judged = await chatJson<Plan>({
        model: MODELS.ultra,
        step: "judge",
        system: JUDGE_SYSTEM,
        user: judgeUser(profile, candidates, today),
        maxTokens: 8000,
        temperature: 0.3,
        onCall: onModel,
      });
      const ids = new Set(candidates.map((c) => c.scholarship.id));
      const planOut: Plan = {
        ranked: (judged.ranked ?? []).filter((r) => ids.has(r.id)),
        steps: (judged.steps ?? []).slice(0, 6),
        summary: String(judged.summary ?? ""),
      };
      emit({ type: "plan", plan: planOut });
      emit({ type: "step", step: "judge", status: "done", actor: labelOf(MODELS.ultra), detail: `${planOut.ranked.length} ranked, ${planOut.steps.length} next steps` });
    } catch {
      emit({ type: "step", step: "judge", status: "failed", actor: labelOf(MODELS.ultra), detail: "Ranking unavailable; showing the checker's order" });
    }
  }

  // 9. Act (calendar file is built in the browser from these results)
  emit({ type: "step", step: "act", status: "done", actor: "Calendar file (code)", detail: "Deadlines ready to add to your calendar" });
  emit({ type: "done" });
}
