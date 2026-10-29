// Dev helper: one real run for a demo student, printed step by step; full events saved to
// .cache/trial-<name>.json for inspection. Usage: npx tsx scripts/trial.mts Kavya
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { runPipeline } from "../src/lib/pipeline";
import { PERSONAS } from "../src/lib/personas";
import { runCost, formatCost } from "../src/lib/pricing";
import type { ModelCall, RunEvent } from "../src/lib/types";

for (const line of readFileSync(resolve(import.meta.dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && m[2]) process.env[m[1]] ??= m[2];
}
const who = process.argv[2] ?? "Kavya";
const persona = PERSONAS.find((p) => p.label === who)!;
const { blurb: _b, ...profile } = persona;
void _b;
const t0 = Date.now();
const events: (RunEvent & { at: number })[] = [];
const calls: ModelCall[] = [];
let credits = 0;
await runPipeline(profile, (e) => {
  events.push({ ...e, at: Date.now() - t0 });
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  if (e.type === "step") console.log(`${s}s  ${e.step.padEnd(8)} ${e.status.padEnd(8)} ${e.actor} ${e.detail ? "— " + e.detail : ""}`);
  if (e.type === "model_call") {
    calls.push(e.call);
    console.log(`${s}s     model ${e.call.model} ${e.call.ok ? "ok" : "FAIL"} ${e.call.ms}ms in/out ${e.call.promptTokens}/${e.call.completionTokens} ${e.call.ok ? "" : e.call.error}`);
  }
  if (e.type === "tool_call") {
    credits += e.call.credits ?? 0;
    if (!e.call.ok) console.log(`${s}s     tool FAIL ${e.call.tool} ${e.call.error}`);
  }
  if (e.type === "error") console.log(`${s}s  ERROR ${e.message}`);
  if (e.type === "results") {
    for (const c of e.checked) console.log(`         · [${c.eligibility}/${c.deadlineStatus}] ${c.scholarship.name} (${c.scholarship.sourceKind}) rules ${c.results.length}, unknown ${c.results.filter((r) => r.verdict === "unknown").length}${c.conflicts?.length ? " CONFLICT " + JSON.stringify(c.conflicts.map((x) => [x.field, x.official, x.secondary])) : ""}${c.followUp ? " FOLLOWUP+" + c.followUp.settled : ""}`);
  }
  if (e.type === "plan") console.log(`         plan: ${e.plan.summary}`);
});
mkdirSync(resolve(import.meta.dirname, "../.cache"), { recursive: true });
writeFileSync(resolve(import.meta.dirname, `../.cache/trial-${who.toLowerCase()}.json`), JSON.stringify(events, null, 1));
console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(0)} s · Nemotron ${formatCost(runCost(calls).usd)} · ~${credits} Tavily credits`);
