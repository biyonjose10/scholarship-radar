// Records one real run per demo student (needs NEBIUS_API_KEY and TAVILY_API_KEY in ../../.env),
// so the live site can replay it instantly, clearly labelled with the time it was recorded.
// Usage: npx tsx scripts/record.mts            (all three)
//        npx tsx scripts/record.mts Kavya      (one)
// Costs one full run each. Never edits a recording by hand: re-record instead.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline } from "../src/lib/pipeline";
import { PERSONAS } from "../src/lib/personas";
import type { Recording, RunEvent } from "../src/lib/types";

for (const line of readFileSync(resolve(import.meta.dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2];
}
if (!process.env.NEBIUS_API_KEY || !process.env.TAVILY_API_KEY) throw new Error("Both keys are needed in ../.env");

const dir = resolve(import.meta.dirname, "../src/data/recorded");
const want = process.argv.slice(2);
const metaPath = resolve(dir, "meta.ts");
const existing = readFileSync(metaPath, "utf8");
const meta: Record<string, { recordedAt: string }> = JSON.parse(existing.match(/= (\{[\s\S]*\});/)?.[1] ?? "{}");

for (const persona of PERSONAS.filter((p) => !want.length || want.includes(p.label))) {
  const { blurb: _b, ...profile } = persona;
  void _b;
  const t0 = Date.now();
  const events: Recording["events"] = [];
  console.log(`Recording ${profile.label}…`);
  await runPipeline(profile, (e: RunEvent) => {
    events.push({ ...e, at: Date.now() - t0 });
    if (e.type === "step") console.log(`  ${e.step} ${e.status} ${e.detail ?? ""}`);
    if (e.type === "error") console.log(`  ERROR ${e.message}`);
  });
  if (events.some((e) => e.type === "error") || !events.some((e) => e.type === "results")) {
    console.log(`  Not saved: the run did not finish cleanly.`);
    continue;
  }
  const rec: Recording = { recordedAt: new Date(t0).toISOString(), profile, events };
  writeFileSync(resolve(dir, `${profile.label.toLowerCase()}.json`), JSON.stringify(rec));
  meta[profile.label] = { recordedAt: rec.recordedAt };
  console.log(`  Saved (${((Date.now() - t0) / 1000).toFixed(0)} s, ${events.length} events).`);
}

const labels = Object.keys(meta);
writeFileSync(
  metaPath,
  `// Written by scripts/record.mts. Which demo students have a saved real run, and when it\n// was recorded. Safe to import in the browser (no event data here).\nexport const RECORDING_META: Record<string, { recordedAt: string }> = ${JSON.stringify(meta, null, 2)};\n`,
);
writeFileSync(
  resolve(dir, "index.ts"),
  `// Written by scripts/record.mts. Saved real runs for the demo students, replayed on request\n// so judges see a full run instantly without spending credits. Server-side only.\nimport type { Recording } from "@/lib/types";\n${labels
    .map((l) => `import ${l.toLowerCase()} from "./${l.toLowerCase()}.json";`)
    .join("\n")}\n\nexport const RECORDINGS: Record<string, Recording> = {${labels.map((l) => ` ${JSON.stringify(l)}: ${l.toLowerCase()} as Recording`).join(",")} };\n`,
);
console.log("Done. Check the runs in the app, then commit src/data/recorded.");
