// POST /api/run — runs the agent for one profile and streams its steps as Server-Sent Events.
import { runPipeline } from "@/lib/pipeline";
import { admit } from "@/lib/guard";
import { hasNebiusKey } from "@/lib/nebius";
import type { CourseLevel, Category, Gender, KaGroup, Profile, RunEvent } from "@/lib/types";

export const maxDuration = 300;

const LEVELS: CourseLevel[] = ["school", "diploma", "ug", "pg", "phd"];
const CATEGORIES: Category[] = ["General", "OBC", "SC", "ST", "EWS"];
const GROUPS: KaGroup[] = ["Cat-1", "2A", "2B", "3A", "3B"];
const GENDERS: Gender[] = ["female", "male", "other"];

function parseProfile(x: unknown): Profile | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null);
  const p: Profile = {
    label: str(o.label, 40) ?? "Student",
    state: str(o.state, 40) ?? "",
    courseLevel: LEVELS.includes(o.courseLevel as CourseLevel) ? (o.courseLevel as CourseLevel) : ("" as CourseLevel),
    course: str(o.course, 80) ?? "",
    year: num(o.year, 1, 6) ?? 0,
    category: CATEGORIES.includes(o.category as Category) ? (o.category as Category) : ("" as Category),
    kaGroup: GROUPS.includes(o.kaGroup as KaGroup) ? (o.kaGroup as KaGroup) : null,
    minority: o.minority === true,
    familyIncome: num(o.familyIncome, 0, 100_000_000) ?? -1,
    marksPercent: num(o.marksPercent, 0, 100) ?? -1,
    gender: GENDERS.includes(o.gender as Gender) ? (o.gender as Gender) : ("" as Gender),
    disability: o.disability === true,
  };
  if (!p.state || !p.courseLevel || !p.course || !p.year || !p.category || p.familyIncome < 0 || p.marksPercent < 0 || !p.gender) return null;
  return p;
}

function sse(events: RunEvent[]): Response {
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const profile = parseProfile(await req.json().catch(() => null));
  if (!profile) return Response.json({ error: "Please fill in every field." }, { status: 400 });

  if (!hasNebiusKey() || !process.env.TAVILY_API_KEY) {
    return sse([{ type: "error", message: "The model service isn't configured on this server yet." }, { type: "done" }]);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const gate = admit(ip);
  if (!gate.ok) return sse([{ type: "error", message: gate.reason }, { type: "done" }]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* client went away */
        }
      };
      try {
        await runPipeline(profile, emit);
      } catch (e) {
        emit({ type: "error", message: `The run stopped unexpectedly: ${String(e).slice(0, 200)}` });
        emit({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
