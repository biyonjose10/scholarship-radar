// Tavily search + extract, plus the rule that decides which sources we trust most.
import type { SourceKind, StepId, ToolCall } from "./types";

const TAVILY = "https://api.tavily.com";

export interface SearchHit {
  url: string;
  title: string;
  content: string;
  score: number;
  kind: SourceKind;
}

export interface ExtractedPage {
  url: string;
  text: string;
}

// Known scholarship funders whose own sites count as primary sources.
const FOUNDATION_HOSTS = [
  "tatatrusts.org",
  "reliancefoundation.org",
  "hdfcbank.com",
  "adityabirlascholars.net",
  "aicte.gov.in",
  "aicte-india.org",
  "kotakeducation.org",
  "sitaramjindalfoundation.org",
  "azimpremjifoundation.org",
  "infosys.org",
  "lic.in",
  "ongcindia.com",
  "vidyasaarathi.co.in",
  "santoorscholarships.com",
  "colgate.co.in",
  "foundationforexcellence.org",
];

const AGGREGATOR_HOSTS = [
  "buddy4study.com",
  "careers360.com",
  "shiksha.com",
  "collegedunia.com",
  "scholarshipsinindia.com",
  "jagranjosh.com",
  "studyiq.com",
  "vikaspedia.in",
];

// Social and video pages are never used as evidence.
const BLOCKED_HOSTS = ["facebook.com", "youtube.com", "instagram.com", "x.com", "twitter.com", "quora.com", "reddit.com", "telegram.me", "t.me"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function matches(host: string, list: string[]): boolean {
  return list.some((h) => host === h || host.endsWith("." + h));
}

export function classifySource(url: string): SourceKind | "blocked" {
  const host = hostOf(url);
  if (!host || matches(host, BLOCKED_HOSTS)) return "blocked";
  if (host.endsWith(".gov.in") || host.endsWith(".nic.in") || host === "scholarships.gov.in") return "official";
  if (matches(host, FOUNDATION_HOSTS)) return "foundation";
  if (matches(host, AGGREGATOR_HOSTS)) return "aggregator";
  return "other";
}

// Central-government hosts whose schemes apply in every state.
const NATIONAL_HOSTS = [
  "scholarships.gov.in", "aicte.gov.in", "aicte-india.org", "education.gov.in", "socialjustice.gov.in",
  "minorityaffairs.gov.in", "tribal.nic.in", "myscheme.gov.in", "ugc.gov.in", "ugc.ac.in", "pib.gov.in", "india.gov.in",
];

// State names and the short codes their government hosts use (e.g. mn.gov.in = Manipur).
const STATE_MARKERS: Record<string, string[]> = {
  "Andhra Pradesh": ["andhra", "ap.gov.in", "apgov"], "Arunachal Pradesh": ["arunachal"], Assam: ["assam"], Bihar: ["bihar"],
  Chhattisgarh: ["chhattisgarh", "cg.gov.in"], Goa: ["goa.gov.in", "goa"], Gujarat: ["gujarat"], Haryana: ["haryana"],
  "Himachal Pradesh": ["himachal", "hp.gov.in"], Jharkhand: ["jharkhand"], Karnataka: ["karnataka", "kar.nic.in"],
  Kerala: ["kerala"], "Madhya Pradesh": ["madhya", "mp.gov.in", "mponline"], Maharashtra: ["maharashtra", "mahadbt"],
  Manipur: ["manipur", "mn.gov.in"], Meghalaya: ["meghalaya"], Mizoram: ["mizoram"], Nagaland: ["nagaland"],
  Odisha: ["odisha"], Punjab: ["punjab"], Rajasthan: ["rajasthan"], Sikkim: ["sikkim"], "Tamil Nadu": ["tamilnadu", "tn.gov.in"],
  Telangana: ["telangana", "ts.gov.in", "tg.gov.in"], Tripura: ["tripura"], "Uttar Pradesh": ["uttarpradesh", "up.gov.in", "upgov"],
  Uttarakhand: ["uttarakhand", "uk.gov.in"], "West Bengal": ["westbengal", "wb.gov.in", "wbgov"], Delhi: ["delhi"],
};

function mentionsState(url: string, state: string): boolean {
  const u = url.toLowerCase().replace(/[\s_-]+/g, "");
  return (STATE_MARKERS[state] ?? [state.toLowerCase().replace(/\s+/g, "")]).some((m) => u.includes(m.replace(/[\s_-]+/g, "")));
}

function otherState(url: string, state: string): boolean {
  return Object.keys(STATE_MARKERS).some((s) => s !== state && mentionsState(url, s));
}

// Order: the student's own state government, then central government, then funders,
// then secondary sites. Pages about another state's schemes are dropped.
export function rankSources(hits: SearchHit[], state: string): SearchHit[] {
  const seen = new Set<string>();
  const rank = (h: SearchHit): number => {
    if (h.kind === "official") return STATE_PORTALS[state] && hostOf(h.url) === STATE_PORTALS[state] ? -1 : mentionsState(h.url, state) ? 0 : 1;
    return { foundation: 2, aggregator: 3, other: 4 }[h.kind];
  };
  return hits
    .filter((h) => {
      const key = h.url.split("#")[0].replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      if (otherState(h.url, state)) return false;
      if (h.kind === "official" && !mentionsState(h.url, state) && !matches(hostOf(h.url), NATIONAL_HOSTS)) return false;
      return true;
    })
    .sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}

function apiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  return key;
}

// Many searches go out at once; a dropped connection ("fetch failed") or a 429/5xx is retried twice.
async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await postOnce(path, body);
      if ((r.status === 429 || r.status >= 500) && attempt < 2) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (attempt >= 2 || String(e).includes("TAVILY_API_KEY")) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

async function postOnce(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${TAVILY}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

// The state scholarship portal where students apply. Its notices carry the current (often
// extended) last dates, which department pages may not have caught up with.
export const STATE_PORTALS: Record<string, string> = {
  Karnataka: "ssp.karnataka.gov.in",
  Maharashtra: "mahadbt.maharashtra.gov.in",
  Bihar: "pmsonline.bih.nic.in",
};

// The portal page where those notices are posted, read on every run for that state so the
// current dates never depend on what a search happens to return.
export const STATE_NOTICE_PAGES: Record<string, string> = {
  Karnataka: "https://ssp.karnataka.gov.in/ssp_post_home",
};

// Government sites only: these are the portals that publish the rules themselves.
export const OFFICIAL_DOMAINS = ["gov.in", "nic.in"];

export async function search(
  query: string,
  step: StepId,
  onCall: (c: ToolCall) => void,
  opts: { includeDomains?: string[]; maxResults?: number } = {},
): Promise<SearchHit[]> {
  const t0 = Date.now();
  const label = opts.includeDomains ? `${query} (only ${opts.includeDomains.join(", ")})` : query;
  try {
    const { status, json } = await post("/search", {
      query,
      search_depth: "advanced",
      max_results: opts.maxResults ?? 8,
      country: "india",
      ...(opts.includeDomains ? { include_domains: opts.includeDomains } : {}),
    });
    if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`);
    const results = (json.results as { url: string; title: string; content: string; score: number }[]) ?? [];
    onCall({ step, tool: "tavily.search", detail: label, ms: Date.now() - t0, credits: 2, ok: true });
    return results.flatMap((r) => {
      const kind = classifySource(r.url);
      return kind === "blocked" ? [] : [{ url: r.url, title: r.title, content: r.content, score: r.score, kind }];
    });
  } catch (e) {
    onCall({ step, tool: "tavily.search", detail: label, ms: Date.now() - t0, credits: null, ok: false, error: String(e) });
    return [];
  }
}

export async function extract(
  urls: string[],
  step: StepId,
  onCall: (c: ToolCall) => void,
): Promise<ExtractedPage[]> {
  if (urls.length === 0) return [];
  const t0 = Date.now();
  try {
    const { status, json } = await post("/extract", { urls, extract_depth: "advanced", format: "markdown" });
    if (status !== 200) throw new Error(`HTTP ${status}: ${JSON.stringify(json).slice(0, 200)}`);
    const results = (json.results as { url: string; raw_content: string }[]) ?? [];
    const failed = (json.failed_results as { url: string }[]) ?? [];
    onCall({
      step,
      tool: "tavily.extract",
      detail: `${results.length} of ${urls.length} pages read${failed.length ? `, ${failed.length} failed` : ""}`,
      ms: Date.now() - t0,
      credits: Math.ceil(urls.length / 5) * 2,
      ok: true,
    });
    return results.filter((r) => r.raw_content && r.raw_content.trim().length > 200).map((r) => ({ url: r.url, text: r.raw_content }));
  } catch (e) {
    onCall({ step, tool: "tavily.extract", detail: `${urls.length} pages`, ms: Date.now() - t0, credits: null, ok: false, error: String(e) });
    return [];
  }
}
