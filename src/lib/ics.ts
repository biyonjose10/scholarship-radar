// Builds an .ics calendar file: one all-day event per open deadline, with reminders
// a week and two days before. Runs in the browser; nothing is sent anywhere.
import type { CheckedScholarship } from "./types";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 72) out.push((i ? " " : "") + line.slice(i, i + 72));
  return out.join("\r\n");
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildIcs(list: CheckedScholarship[]): string | null {
  const live = list.filter(
    (c) => c.eligibility !== "not_eligible" && (c.deadlineStatus === "open" || c.deadlineStatus === "closing_soon") && c.scholarship.deadline.date,
  );
  if (live.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Unclaimed//Scholarship deadlines//EN", "CALSCALE:GREGORIAN"];
  for (const c of live) {
    const s = c.scholarship;
    const date = s.deadline.date!.replace(/-/g, "");
    const desc = [
      `Last date to apply: ${s.deadline.text || s.deadline.date}`,
      c.eligibility === "likely" ? "Eligibility needs one check before applying." : "",
      s.documents.length ? `Documents: ${s.documents.join(", ")}` : "",
      `Source: ${s.sourceUrl}`,
      s.applyUrl ? `Apply: ${s.applyUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}-${date}@unclaimed`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${nextDay(s.deadline.date!)}`,
      fold(`SUMMARY:${esc(`Last date: ${s.name}`)}`),
      fold(`DESCRIPTION:${esc(desc)}`),
      fold(`URL:${s.applyUrl ?? s.sourceUrl}`),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${esc(`${s.name} closes in 7 days`)}`),
      "TRIGGER:-P7D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${esc(`${s.name} closes in 2 days`)}`),
      "TRIGGER:-P2D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
