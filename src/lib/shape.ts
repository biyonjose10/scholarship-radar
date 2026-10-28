// Shapes the Reader's criteria into exactly what the checker compares against. Models write
// "OBC" as "obc", "Category-I" for "Cat-1", years as "1st year", genders as "Girls"; compared
// raw, those would wrongly fail a student. Anything that can't be mapped safely becomes an
// "other" rule, which the checker treats as unsure, never as a reason to exclude.
import type { CategoryTag, Criterion, CourseLevel, Gender } from "./types";

const CATEGORY: [RegExp, CategoryTag][] = [
  [/^(cat(egory)?[\s.-]*(1|i))$/i, "Cat-1"],
  [/^(cat(egory)?[\s.-]*)?2\s*-?\s*a$/i, "2A"],
  [/^(cat(egory)?[\s.-]*)?2\s*-?\s*b$/i, "2B"],
  [/^(cat(egory)?[\s.-]*)?3\s*-?\s*a$/i, "3A"],
  [/^(cat(egory)?[\s.-]*)?3\s*-?\s*b$/i, "3B"],
  [/^(obc|other backward class(es)?|backward class(es)?|bc)$/i, "OBC"],
  [/^(sc|scheduled castes?)$/i, "SC"],
  [/^(st|scheduled tribes?)$/i, "ST"],
  [/^(ews|economically weaker sections?)$/i, "EWS"],
  [/^(general|gen|open|unreserved|ur)$/i, "General"],
  [/^(minority|minorities|religious minorit(y|ies))$/i, "Minority"],
];

const LEVEL: [RegExp, CourseLevel][] = [
  [/^(school|class\s*(9|10|11|12)|pre-?matric|puc|pre-?university)$/i, "school"],
  [/^(diploma|polytechnic)$/i, "diploma"],
  [/^(ug|undergraduate|under-?graduate|graduation|degree|bachelor'?s?|b\.?e\.?|b\.?tech|b\.?sc|b\.?a|b\.?com)$/i, "ug"],
  [/^(pg|postgraduate|post-?graduate|post-?graduation|master'?s?|m\.?tech|m\.?sc|m\.?a|mba)$/i, "pg"],
  [/^(phd|ph\.?d\.?|doctoral|doctorate)$/i, "phd"],
];

const GENDER: [RegExp, Gender][] = [
  [/^(female|girls?|women|woman)$/i, "female"],
  [/^(male|boys?|men|man)$/i, "male"],
  [/^(other|transgender|third gender)$/i, "other"],
];

function mapAll<T>(values: unknown[], table: [RegExp, T][]): T[] | null {
  const out: T[] = [];
  for (const v of values) {
    const s = String(v).trim();
    const hit = table.find(([re]) => re.test(s));
    if (!hit) return null; // one unknown value: don't guess
    if (!out.includes(hit[1])) out.push(hit[1]);
  }
  return out.length ? out : null;
}

// "1st year", "Year 2", 3, "3" -> 3; anything else -> null.
function year(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6) return v;
  const m = String(v).match(/^\s*(?:year\s*)?([1-6])(?:st|nd|rd|th)?(?:\s*year)?\s*$/i);
  return m ? Number(m[1]) : null;
}

// "250000", "2,50,000", 250000 -> 250000; anything else -> null.
function amount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string" && /^\s*[\d,]+(\.\d+)?\s*$/.test(v)) return Number(v.replace(/,/g, ""));
  return null;
}

function asOther(c: Record<string, unknown>, what: string): Criterion {
  const vals = Array.isArray(c.values) ? c.values.join(", ") : String(c.value ?? "");
  return { kind: "other", text: `${what}: ${vals}`.slice(0, 160), quote: typeof c.quote === "string" ? c.quote : "" };
}

export function cleanCriteria(raw: unknown): Criterion[] {
  if (!Array.isArray(raw)) return [];
  const out: Criterion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const quote = typeof c.quote === "string" ? c.quote : "";
    const values = Array.isArray(c.values) ? c.values : null;
    switch (c.kind) {
      case "income_max": {
        const value = amount(c.value);
        if (value === null) break;
        const groups = Array.isArray(c.forCategories) && c.forCategories.length ? mapAll(c.forCategories, CATEGORY) : undefined;
        if (groups === null) out.push(asOther(c, "Income limit for some groups"));
        else out.push({ kind: "income_max", value, ...(groups ? { forCategories: groups } : {}), quote });
        break;
      }
      case "min_marks": {
        const value = amount(c.value);
        if (value !== null && value <= 100) out.push({ kind: "min_marks", value, quote });
        break;
      }
      case "categories": {
        const v = values && mapAll(values, CATEGORY);
        out.push(v ? { kind: "categories", values: v, quote } : asOther(c, "Open to"));
        break;
      }
      case "course_levels": {
        const v = values && mapAll(values, LEVEL);
        out.push(v ? { kind: "course_levels", values: v, quote } : asOther(c, "Courses"));
        break;
      }
      case "genders": {
        const v = values && mapAll(values, GENDER);
        out.push(v ? { kind: "genders", values: v, quote } : asOther(c, "Gender"));
        break;
      }
      case "years": {
        const v = values?.map(year);
        if (v && v.length && v.every((x) => x !== null)) out.push({ kind: "years", values: [...new Set(v as number[])], quote });
        else out.push(asOther(c, "Year of study"));
        break;
      }
      case "states":
        if (values && values.length) out.push({ kind: "states", values: values.map((v) => String(v).trim()), quote });
        break;
      case "minority_only":
      case "disability_only":
        out.push({ kind: c.kind, quote });
        break;
      case "other":
        if (typeof c.text === "string" && c.text.trim()) out.push({ kind: "other", text: c.text.trim().slice(0, 200), quote });
        break;
    }
  }
  return out;
}
