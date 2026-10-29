// Nebius Token Factory client (OpenAI-compatible) for NVIDIA Nemotron models.
// Every call is reported through onCall so the UI log shows model, latency, tokens,
// cached tokens and the Token Factory request id.
import type { ModelCall, StepId } from "./types";

const BASE = process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1";

// Model ids are env-overridable in case Token Factory renames one during the event.
export const MODELS = {
  lightning: process.env.MODEL_LIGHTNING ?? "nvidia/Nemotron-3_5-Lightning",
  super: process.env.MODEL_SUPER ?? "nvidia/nemotron-3-super-120b-a12b",
  superVl: process.env.MODEL_SUPER_VL ?? "nvidia/Nemotron-3.5-Super-VL",
  ultra: process.env.MODEL_ULTRA ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
};

export const MODEL_LABELS: Record<string, string> = {
  [MODELS.lightning]: "Nemotron 3.5 Lightning",
  [MODELS.super]: "Nemotron 3 Super",
  [MODELS.superVl]: "Nemotron 3.5 Super VL",
  [MODELS.ultra]: "Nemotron 3 Ultra",
};

export function labelOf(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

export function hasNebiusKey(): boolean {
  return Boolean(process.env.NEBIUS_API_KEY);
}

interface ChatOpts {
  model: string;
  step: StepId;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  // false switches off Nemotron's hidden reasoning (chat_template_kwargs.enable_thinking), for
  // jobs that only copy text out: much faster and cheaper. Default: the model's own setting.
  thinking?: boolean;
  onCall: (c: ModelCall) => void;
}

interface ChatResponse {
  id?: string;
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

// Nemotron may put its thinking inline in <think> tags; the answer is what follows.
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();
}

export function parseJsonLoose<T>(s: string): T {
  const text = stripThinking(s).replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1)) as T;
    throw new Error(`Model did not return JSON: ${text.slice(0, 160)}`);
  }
}

// Connection drops ("fetch failed") happen on long calls; try twice more before giving up.
async function post(body: Record<string, unknown>): Promise<{ status: number; json: ChatResponse & { error?: unknown }; text: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await postOnce(body);
    } catch (e) {
      if (attempt >= 2 || String(e).includes("NEBIUS_API_KEY")) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
    }
  }
}

async function postOnce(body: Record<string, unknown>): Promise<{ status: number; json: ChatResponse & { error?: unknown }; text: string }> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: ChatResponse = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json, text };
}

export async function chat(o: ChatOpts): Promise<string> {
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    model: o.model,
    messages: [
      { role: "system", content: o.system },
      { role: "user", content: o.user },
    ],
    max_tokens: o.maxTokens ?? 4000,
    temperature: o.temperature ?? 0.2,
  };
  if (o.json) body.response_format = { type: "json_object" };
  if (o.thinking === false) body.chat_template_kwargs = { enable_thinking: false };

  try {
    let r = await post(body);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (r.status === 400 && body.chat_template_kwargs) {
        // Model without the thinking switch: retry with its default.
        delete body.chat_template_kwargs;
      } else if (r.status === 400 && body.response_format) {
        // Model without JSON mode: retry once with the instruction in the prompt only.
        delete body.response_format;
      } else if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      } else break;
      r = await post(body);
    }
    if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    const msg = r.json.choices?.[0]?.message;
    const content = stripThinking(msg?.content ?? "");
    o.onCall({
      step: o.step,
      model: o.model,
      requestId: r.json.id ?? null,
      ms: Date.now() - t0,
      promptTokens: r.json.usage?.prompt_tokens ?? null,
      completionTokens: r.json.usage?.completion_tokens ?? null,
      cachedTokens: r.json.usage?.prompt_tokens_details?.cached_tokens ?? null,
      ok: true,
    });
    return content;
  } catch (e) {
    o.onCall({
      step: o.step,
      model: o.model,
      requestId: null,
      ms: Date.now() - t0,
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      ok: false,
      error: String(e).slice(0, 300),
    });
    throw e;
  }
}

export async function chatJson<T>(o: Omit<ChatOpts, "json">): Promise<T> {
  return parseJsonLoose<T>(await chat({ ...o, json: true }));
}
