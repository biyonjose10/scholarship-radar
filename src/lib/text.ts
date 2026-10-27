// Text helpers: trimming long pages for the Reader, and checking that quoted rules
// really appear in the page we fetched.

// Normalise text so a quote copied by a model still matches the page despite
// markdown symbols, link targets, curly quotes and currency spellings.
export function normalize(s: string): string {
  return s
    .replace(/\]\([^)]*\)/g, "]") // markdown link targets
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₹\s*|\brs\.?\s*|\binr\s*/gi, "rs ")
    .replace(/[*_#|>\[\]]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteInText(quote: string | null | undefined, normalizedPage: string): boolean {
  if (!quote) return false;
  const q = normalize(quote).replace(/^["'.\s]+|["'.\s]+$/g, "");
  if (q.length < 8) return false;
  return normalizedPage.includes(q);
}

const SIGNALS = /eligib|income|last date|deadline|amount|scholarship|lakh|documents?|criteria|apply|fee|marks|percentage|category|renewal/gi;

// Count of scholarship words: pages with none are navigation shells (JS-rendered portals).
export function signalScore(text: string): number {
  return (text.match(SIGNALS) ?? []).length;
}

// Drop navigation-only lines and, if the page is still too long, keep the paragraphs
// densest in eligibility words, in their original order.
export function focusText(text: string, maxChars = 24000): string {
  const lines = text.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (!t) return true;
    const linkChars = (t.match(/\[[^\]]*\]\([^)]*\)/g) ?? []).join("").length;
    return linkChars < t.length * 0.6; // mostly links = menu or footer
  });
  const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  if (cleaned.length <= maxChars) return cleaned;

  const paras = cleaned.split(/\n\n/);
  const scored = paras.map((p, i) => ({ i, p, s: signalScore(p) / Math.sqrt(p.length + 50) }));
  const keep = new Set<number>();
  let used = 0;
  for (const { i, p } of [...scored].sort((a, b) => b.s - a.s)) {
    if (used + p.length > maxChars) continue;
    keep.add(i);
    used += p.length + 2;
  }
  return paras.filter((_, i) => keep.has(i)).join("\n\n");
}
