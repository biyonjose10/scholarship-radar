// What a run cost on Nebius Token Factory, from the token counts each call reports.
// List prices in USD per million tokens, as published for these models in Oct 2026.
// Unknown models are left out rather than guessed.
import type { ModelCall } from "./types";

export const PRICES: Record<string, { input: number; output: number }> = {
  "nvidia/Nemotron-3_5-Lightning": { input: 0.06, output: 0.24 },
  "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9 },
  "nvidia/Nemotron-3.5-Super-VL": { input: 0.3, output: 0.9 },
  "nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1, output: 3 },
};

// Display only; the bill is in USD.
export const INR_PER_USD = 88;

export function runCost(calls: ModelCall[]): { usd: number; priced: number; unpriced: number } {
  let usd = 0;
  let priced = 0;
  let unpriced = 0;
  for (const c of calls) {
    if (!c.ok) continue;
    const p = PRICES[c.model];
    if (!p || c.promptTokens === null || c.completionTokens === null) {
      unpriced++;
      continue;
    }
    usd += (c.promptTokens * p.input + c.completionTokens * p.output) / 1_000_000;
    priced++;
  }
  return { usd, priced, unpriced };
}

export function formatCost(usd: number): string {
  const inr = usd * INR_PER_USD;
  const d = usd < 0.01 ? 4 : 3;
  return `$${usd.toFixed(d)} (≈ ₹${inr < 1 ? inr.toFixed(2) : inr.toFixed(1)})`;
}
