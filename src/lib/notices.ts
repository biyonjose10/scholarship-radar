// Reads the Karnataka SSP portal's notice board in code. It lists every department's
// post-matric last date, year by year, in a fixed Kannada sentence:
//   "## Financial Year: 2026-27"
//   "ಹಿಂದುಳಿದ ಕಲ್ಯಾಣ ಇಲಾಖೆಯ ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ: 31/10/2026"
// A model reading this page tends to pick a line from the wrong year; a parser can't.
// If the page changes shape, this returns nothing and the Reader model takes the page instead.
import type { Scholarship } from "./types";
import { CURRENT_CYCLE_YEARS } from "./checker";

// Kannada department names as the portal writes them, with the English name we show.
const DEPARTMENTS: [RegExp, string][] = [
  [/^ಹಿಂದುಳಿದ/, "Backward Classes Welfare Department"],
  [/^ಸಮಾಜ ಕಲ್ಯಾಣ/, "Social Welfare Department"],
  [/^ಪರಿಶಿಷ್ಟ ಪಂಗಡ/, "Tribal Welfare Department"],
  [/^ಅಲ್ಪಸಂಖ್ಯಾತ/, "Minorities Welfare Department"],
  [/^ತಾಂತ್ರಿಕ ಶಿಕ್ಷಣ/, "Department of Technical Education"],
  [/^ವಿಕಲಚೇತನ/, "Department for the Welfare of Persons with Disabilities"],
  [/^ಕರ್ನಾಟಕ ರಾಜ್ಯ ಬ್ರಾಹ್ಮಣ/, "Karnataka State Brahmin Development Board"],
  [/^ಆರ್ಯ ವೈಶ್ಯ/, "Arya Vyshya Development Corporation"],
];

const LINE = /^(.+?)ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಕೊನೆಯ ದಿನಾಂಕ:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const HEADING = /Financial Year:\s*(\d{4}-\d{2})/i;

export function parseSspNotices(text: string, url: string): Scholarship[] {
  const out: Scholarship[] = [];
  let cycle: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
    const h = line.match(HEADING);
    if (h) {
      cycle = h[1];
      continue;
    }
    if (!cycle || !cycle.startsWith(CURRENT_CYCLE_YEARS[0])) continue; // only this year's section, e.g. 2026-27
    const m = line.match(LINE);
    if (!m) continue;
    const dept = DEPARTMENTS.find(([re]) => re.test(m[1].trim()))?.[1];
    if (!dept) continue;
    const date = `${m[4]}-${m[3].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    out.push({
      id: "",
      name: `Post-Matric Scholarship (${dept})`,
      provider: dept,
      amount: { value: null, text: "", period: "unknown" },
      deadline: { date, text: `${m[2]}/${m[3]}/${m[4]}`, quote: line.slice(0, m.index! + m[0].length) },
      cycle,
      criteria: [],
      documents: [],
      applyUrl: url,
      sourceUrl: url,
      sourceKind: "official",
    });
  }
  return out;
}
