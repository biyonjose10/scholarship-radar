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

const KIND_RANK: Record<SourceKind, number> = { official: 0, foundation: 1, aggregator: 2, other: 3 };

// Official first, then foundations, then aggregators; within a kind, Tavily's own score.
export function rankSources(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const key = h.url.split("#")[0].replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.score - a.score);
}

function apiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  return key;
}

async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${TAVILY}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

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
