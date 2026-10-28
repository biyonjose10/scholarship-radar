// Official vs secondary: when an official page and a secondary site describe the same
// scholarship differently, say so. Plain code, and only facts quoted word-for-word on
// their own pages count, so a model misreading one page can't invent a conflict.
import type { CategoryTag, Conflict, Scholarship } from "./types";
import { quoteInText } from "./text";
import { inr } from "./checker";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dateLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function sameGroups(a?: CategoryTag[], b?: CategoryTag[]): boolean {
  const x = [...(a ?? [])].sort().join(",");
  const y = [...(b ?? [])].sort().join(",");
  return x === y;
}

// pageNorm: normalised page text by URL, as used by the verifier.
export function findConflicts(official: Scholarship, others: Scholarship[], pageNorm: Map<string, string>): Conflict[] {
  if (official.sourceKind !== "official") return [];
  const offPage = pageNorm.get(official.sourceUrl) ?? "";
  const out: Conflict[] = [];

  for (const o of others) {
    if (o.sourceKind === "official" || o.sourceUrl === official.sourceUrl) continue;
    const page = pageNorm.get(o.sourceUrl) ?? "";
    const host = hostOf(o.sourceUrl);

    // Deadline: both dated, both quoted on their own page, and different.
    if (
      official.deadline.date &&
      o.deadline.date &&
      official.deadline.date !== o.deadline.date &&
      quoteInText(official.deadline.quote, offPage) &&
      quoteInText(o.deadline.quote, page)
    ) {
      out.push({ field: "deadline", official: dateLabel(official.deadline.date), secondary: dateLabel(o.deadline.date), secondaryHost: host, secondaryUrl: o.sourceUrl });
    }

    // Income limit for the same group(s), both quoted, different amounts.
    for (const oc of official.criteria) {
      if (oc.kind !== "income_max" || !quoteInText(oc.quote, offPage)) continue;
      const match = o.criteria.find(
        (c) => c.kind === "income_max" && sameGroups(c.forCategories, oc.forCategories) && c.value !== oc.value && quoteInText(c.quote, page),
      );
      if (match && match.kind === "income_max") {
        const who = oc.forCategories?.length ? ` (${oc.forCategories.join(", ")})` : "";
        out.push({ field: "income", official: inr(oc.value) + who, secondary: inr(match.value) + who, secondaryHost: host, secondaryUrl: o.sourceUrl });
      }
    }
  }
  // One line per field and value is enough.
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.field}|${c.secondary}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
