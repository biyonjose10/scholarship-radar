// Token Factory smoke test: lists NVIDIA models, then makes one small chat call.
// Reads keys from ../.env (outside the repo). Never prints a key.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env");
if (!existsSync(envPath)) {
  console.error(`No .env at ${envPath}. Add NEBIUS_API_KEY=... there.`);
  process.exit(1);
}
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const key = process.env.NEBIUS_API_KEY;
if (!key) {
  console.error("NEBIUS_API_KEY is missing from .env");
  process.exit(1);
}

const BASE = "https://api.tokenfactory.nebius.com/v1";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const list = await fetch(`${BASE}/models`, { headers });
console.log(`GET /models -> HTTP ${list.status}`);
if (!list.ok) {
  console.error((await list.text()).slice(0, 500));
  process.exit(1);
}
const ids = (await list.json()).data.map((m) => m.id);
const nvidia = ids.filter((id) => /nvidia|nemotron/i.test(id)).sort();
console.log(`${ids.length} models total; NVIDIA ones:`);
for (const id of nvidia) console.log(`  ${id}`);

const model = process.argv[2] || nvidia.find((id) => /lightning/i.test(id)) || nvidia[0];
const t0 = Date.now();
const chat = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Reply with exactly: smoke test ok" }],
    max_tokens: 200,
  }),
});
const body = await chat.json();
console.log(`\nPOST /chat/completions model=${model} -> HTTP ${chat.status} in ${Date.now() - t0} ms`);
if (!chat.ok) {
  console.error(JSON.stringify(body).slice(0, 500));
  process.exit(1);
}
console.log(`request id: ${body.id}`);
console.log(`usage: ${JSON.stringify(body.usage)}`);
console.log(`reply: ${body.choices?.[0]?.message?.content?.trim()}`);

if (process.env.TAVILY_API_KEY) {
  const tv = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Karnataka post matric scholarship last date", max_results: 3 }),
  });
  const tj = await tv.json();
  console.log(`\nTavily search -> HTTP ${tv.status}`);
  for (const r of tj.results ?? []) console.log(`  ${r.url}`);
} else {
  console.log("\nTAVILY_API_KEY not set; skipped Tavily check.");
}
