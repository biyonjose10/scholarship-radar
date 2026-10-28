// One document checklist across every scholarship still open to the student:
// the same certificate named five ways becomes one line, ranked by how many
// applications need it and how soon the first of them closes. Plain code.
import type { CheckedScholarship } from "./types";

// Canonical names for the documents Indian scholarship portals ask for most.
const CANON: [RegExp, string][] = [
  [/income/i, "Income certificate"],
  [/caste|community certificate|\bsc\b|\bst\b|\bobc\b|category certificate/i, "Caste certificate"],
  // Bank before Aadhaar: "Aadhaar-linked bank account" is a bank account.
  [/bank|passbook|account/i, "Bank account (Aadhaar-linked)"],
  [/aadhaar|aadhar|uidai/i, "Aadhaar card"],
  [/mark|grade card|transcript|result/i, "Marks card of last exam"],
  [/fee receipt|fee structure|fees/i, "Fee receipt"],
  [/admission|allotment|enrol/i, "Admission letter"],
  [/bonafide|bona fide|study certificate|student id|college id/i, "Study / bonafide certificate"],
  [/domicile|residen|nativity/i, "Domicile certificate"],
  [/disab|udid|pwd/i, "Disability certificate"],
  [/minority|religion|self[- ]?declaration/i, "Minority self-declaration"],
  [/photo/i, "Passport photo"],
  [/ration/i, "Ration card"],
];

export function canonicalDoc(raw: string): string {
  const s = raw.trim();
  for (const [re, name] of CANON) if (re.test(s)) return name;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface KitItem {
  doc: string;
  schemes: string[];
  firstDeadline: string | null; // ISO date of the soonest scheme needing it
}

export function documentChecklist(list: CheckedScholarship[]): KitItem[] {
  const live = list.filter((c) => c.eligibility !== "not_eligible" && c.deadlineStatus !== "closed");
  const byDoc = new Map<string, KitItem>();
  for (const c of live) {
    const date = c.deadlineStatus === "check_portal" ? null : c.scholarship.deadline.date;
    for (const raw of c.scholarship.documents) {
      if (!raw.trim()) continue;
      const doc = canonicalDoc(raw);
      const item = byDoc.get(doc) ?? { doc, schemes: [], firstDeadline: null };
      if (!item.schemes.includes(c.scholarship.name)) item.schemes.push(c.scholarship.name);
      if (date && (!item.firstDeadline || date < item.firstDeadline)) item.firstDeadline = date;
      byDoc.set(doc, item);
    }
  }
  return [...byDoc.values()].sort(
    (a, b) => b.schemes.length - a.schemes.length || (a.firstDeadline ?? "9999").localeCompare(b.firstDeadline ?? "9999") || a.doc.localeCompare(b.doc),
  );
}
