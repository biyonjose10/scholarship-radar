"use client";

import { useMemo, useRef, useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { claimableTotal, inr } from "@/lib/checker";
import { buildIcs } from "@/lib/ics";
import type {
  CheckedScholarship,
  CourseLevel,
  Category,
  Gender,
  KaGroup,
  ModelCall,
  Plan,
  Profile,
  RunEvent,
  SourceKind,
  StepId,
  ToolCall,
} from "@/lib/types";

type ActorKind = "model" | "tool" | "code";

const STEPS: { id: StepId; title: string; actor: string; kind: ActorKind; what: string }[] = [
  { id: "scout", title: "Plan the searches", actor: "Nemotron 3.5 Lightning", kind: "model", what: "Writes targeted searches from your details" },
  { id: "search", title: "Search the web", actor: "Tavily Search", kind: "tool", what: "General web plus government sites only" },
  { id: "extract", title: "Read the pages", actor: "Tavily Extract", kind: "tool", what: "Full text of the best sources, official first" },
  { id: "read", title: "Pull out the rules", actor: "Nemotron 3 Super", kind: "model", what: "Each rule, with the exact sentence it came from" },
  { id: "check", title: "Check each rule against you", actor: "Rule checker (code, no model)", kind: "code", what: "Yes / no / unsure, decided by code" },
  { id: "verify", title: "Verify against the source", actor: "Source verifier (code, no model)", kind: "code", what: "Rules not on the page are never trusted" },
  { id: "judge", title: "Rank and plan", actor: "Nemotron 3 Ultra", kind: "model", what: "What to apply for first, and what to do this week" },
  { id: "act", title: "Add to calendar", actor: "Calendar file (code)", kind: "code", what: "Deadlines with reminders" },
];

type StepState = { status: "idle" | "running" | "done" | "failed" | "skipped"; actor?: string; detail?: string; startMs?: number; endMs?: number };

const STATES = [
  "Karnataka", "Andhra Pradesh", "Telangana", "Tamil Nadu", "Kerala", "Maharashtra", "Delhi", "Uttar Pradesh",
  "Bihar", "West Bengal", "Gujarat", "Rajasthan", "Madhya Pradesh", "Odisha", "Punjab", "Haryana", "Assam", "Other",
];

const EMPTY: Profile = {
  label: "You",
  state: "Karnataka",
  courseLevel: "ug",
  course: "",
  year: 1,
  category: "General",
  kaGroup: null,
  minority: false,
  familyIncome: 0,
  marksPercent: 0,
  gender: "female",
  disability: false,
};

function loadSaved(): Profile | null {
  try {
    const raw = localStorage.getItem("unclaimed.profile");
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function save(p: Profile) {
  try {
    localStorage.setItem("unclaimed.profile", JSON.stringify(p));
  } catch {
    /* private mode: fine */
  }
}

export default function Radar() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [queries, setQueries] = useState<string[]>([]);
  const [sources, setSources] = useState<{ url: string; title: string; kind: SourceKind }[]>([]);
  const [calls, setCalls] = useState<({ t: number } & ({ m: ModelCall } | { x: ToolCall }))[]>([]);
  const [checked, setChecked] = useState<CheckedScholarship[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [ran, setRan] = useState<Profile | null>(null); // the details the current results were checked against
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);


  function pick(i: number) {
    const { blurb: _b, ...p } = PERSONAS[i];
    void _b;
    setProfile(p);
    run(p);
  }

  async function run(p: Profile) {
    if (running) return;
    save(p);
    setRunning(true);
    setSteps({});
    setQueries([]);
    setSources([]);
    setCalls([]);
    setChecked(null);
    setPlan(null);
    setError(null);
    setFormOpen(false);
    setRan(p);
    setElapsedMs(null);
    startedAt.current = Date.now();
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? `Request failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) handle(JSON.parse(line.slice(6)) as RunEvent);
        }
      }
    } catch (e) {
      setError(`Connection lost: ${String(e)}`);
    } finally {
      setElapsedMs(Date.now() - startedAt.current);
      setRunning(false);
    }
  }

  function handle(e: RunEvent) {
    const t = Date.now() - startedAt.current;
    switch (e.type) {
      case "step":
        // Times are measured in this browser from the stream, so they include network time.
        setSteps((s) => {
          const prev = s[e.step];
          const startMs = e.status === "running" ? t : (prev?.startMs ?? t);
          const endMs = e.status === "running" ? undefined : t;
          return { ...s, [e.step]: { status: e.status, actor: e.actor, detail: e.detail, startMs, endMs } };
        });
        break;
      case "queries":
        setQueries(e.queries);
        break;
      case "sources":
        setSources(e.sources);
        break;
      case "model_call":
        setCalls((c) => [...c, { t, m: e.call }]);
        break;
      case "tool_call":
        setCalls((c) => [...c, { t, x: e.call }]);
        break;
      case "results":
        setChecked(e.checked);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        break;
      case "plan":
        setPlan(e.plan);
        break;
      case "error":
        setError(e.message);
        break;
    }
  }

  const ordered = useMemo(() => {
    if (!checked) return null;
    if (!plan?.ranked.length) return checked;
    const pos = new Map(plan.ranked.map((r, i) => [r.id, i]));
    return [...checked].sort((a, b) => (pos.get(a.scholarship.id) ?? 999) - (pos.get(b.scholarship.id) ?? 999));
  }, [checked, plan]);

  const started = running || Object.keys(steps).length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink py-5">
        <div>
          <p className="font-mono text-sm font-medium uppercase tracking-[0.2em] text-stamp">Unclaimed</p>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-tight sm:text-4xl">
            The scholarships you can still claim, checked rule by rule.
          </h1>
        </div>
        <p className="font-mono text-xs text-ink/70">Nebius Token Factory · NVIDIA Nemotron · Tavily</p>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-6">
          <div>
            <h2 className="font-display text-lg font-semibold">Try a demo student</h2>
            <p className="text-sm text-ink/70">Fictional students. One tap runs the whole agent.</p>
            <div className="mt-3 grid gap-2">
              {PERSONAS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => pick(i)}
                  disabled={running}
                  className="w-full border border-ink/25 bg-paper px-3 py-2 text-left transition hover:border-stamp disabled:opacity-50"
                >
                  <span className="font-semibold">{p.label}</span>
                  <span className="block text-sm text-ink/70">{p.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-rule pt-4">
            <button
              onClick={() => {
                // Restore the details this browser used last time, if any.
                if (!formOpen && !profile.course) {
                  const saved = loadSaved();
                  if (saved) setProfile(saved);
                }
                setFormOpen((o) => !o);
              }}
              className="flex w-full items-center justify-between font-display text-lg font-semibold"
              aria-expanded={formOpen}
            >
              Or use your own details <span className="font-mono text-sm">{formOpen ? "−" : "+"}</span>
            </button>
            {formOpen && <ProfileForm value={profile} onChange={setProfile} onRun={() => run(profile)} running={running} />}
          </div>

          {started && <Timeline steps={steps} />}
        </aside>

        <main className="min-w-0 space-y-8">
          {!started && <HowItWorks />}
          {error && (
            <div role="alert" className="border-l-4 border-marigold bg-paper px-4 py-3">
              <p className="font-semibold">Run stopped</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          {started && !checked && !error && <Working queries={queries} sources={sources} />}
          <div ref={resultsRef} />
          {ordered && ran && <Dossier p={ran} elapsedMs={elapsedMs} calls={calls.length} />}
          {ordered && <Ledger list={ordered} plan={plan} judging={running && !plan && steps.judge?.status === "running"} />}
          {started && <CallLog calls={calls} />}
        </main>
      </section>

      <footer className="mt-16 border-t border-rule pt-4 text-xs text-ink/70">
        Nothing you enter is stored on our server; your details stay in this browser. Always confirm on the official portal before
        applying — rules and dates change. Built for the Nebius x NVIDIA Global AI Hackathon.
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full border border-ink/30 bg-paper px-2 py-1.5 text-base focus:border-stamp focus:outline-none";

function ProfileForm({ value: p, onChange, onRun, running }: { value: Profile; onChange: (p: Profile) => void; onRun: () => void; running: boolean }) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...p, [k]: v });
  const showGroup = p.state === "Karnataka" && p.category === "OBC";
  const valid = p.course.trim().length > 1 && p.familyIncome >= 0 && p.marksPercent > 0;
  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onRun();
      }}
    >
      <div className="col-span-2">
        <Field label="State you belong to">
          <select className={inputCls} value={p.state} onChange={(e) => set("state", e.target.value)}>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Level">
        <select className={inputCls} value={p.courseLevel} onChange={(e) => set("courseLevel", e.target.value as CourseLevel)}>
          <option value="diploma">Diploma</option>
          <option value="ug">Undergraduate</option>
          <option value="pg">Postgraduate</option>
          <option value="phd">PhD</option>
        </select>
      </Field>
      <Field label="Year">
        <select className={inputCls} value={p.year} onChange={(e) => set("year", Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>
      <div className="col-span-2">
        <Field label="Course">
          <input className={inputCls} placeholder="e.g. B.E. Civil" value={p.course} onChange={(e) => set("course", e.target.value)} maxLength={80} />
        </Field>
      </div>
      <Field label="Category">
        <select
          className={inputCls}
          value={p.category}
          onChange={(e) => onChange({ ...p, category: e.target.value as Category, kaGroup: e.target.value === "OBC" ? p.kaGroup : null })}
        >
          {["General", "OBC", "SC", "ST", "EWS"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {showGroup ? (
        <Field label="Karnataka group">
          <select className={inputCls} value={p.kaGroup ?? ""} onChange={(e) => set("kaGroup", (e.target.value || null) as KaGroup | null)}>
            <option value="">Not sure</option>
            {["Cat-1", "2A", "2B", "3A", "3B"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Gender">
          <select className={inputCls} value={p.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
      )}
      {showGroup && (
        <Field label="Gender">
          <select className={inputCls} value={p.gender} onChange={(e) => set("gender", e.target.value as Gender)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
      )}
      <Field label="Family income / year (₹)">
        <input
          className={`${inputCls} font-mono`}
          inputMode="numeric"
          value={p.familyIncome || ""}
          placeholder="180000"
          onChange={(e) => set("familyIncome", Number(e.target.value.replace(/\D/g, "")) || 0)}
        />
      </Field>
      <Field label="Last exam marks (%)">
        <input
          className={`${inputCls} font-mono`}
          inputMode="decimal"
          value={p.marksPercent || ""}
          placeholder="78"
          onChange={(e) => set("marksPercent", Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "")) || 0))}
        />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.minority} onChange={(e) => set("minority", e.target.checked)} className="size-4 accent-stamp" />
        Religious minority (Muslim, Christian, Sikh, Buddhist, Jain, Parsi)
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.disability} onChange={(e) => set("disability", e.target.checked)} className="size-4 accent-stamp" />
        I have a disability
      </label>
      <button
        type="submit"
        disabled={!valid || running}
        className="col-span-2 bg-ink px-4 py-2.5 font-semibold text-paper transition hover:bg-stamp disabled:opacity-40"
      >
        {running ? "Searching…" : "Find my scholarships"}
      </button>
      <p className="col-span-2 text-xs text-ink/70">Don&apos;t enter your name. Takes about two minutes.</p>
    </form>
  );
}

function ActorChip({ kind, label }: { kind: ActorKind; label: string }) {
  const cls =
    kind === "model" ? "border-stamp text-stamp" : kind === "tool" ? "border-ink/60 text-ink" : "border-rupee/70 text-rupee";
  return <span className={`inline-block border px-1.5 py-0.5 font-mono text-[11px] leading-none ${cls}`}>{label}</span>;
}

function Timeline({ steps }: { steps: Record<string, StepState> }) {
  return (
    <div className="border-t border-rule pt-4" aria-live="polite">
      <h2 className="font-display text-lg font-semibold">What the agent is doing</h2>
      <ol className="mt-3 space-y-0">
        {STEPS.map((s, i) => {
          const st = steps[s.id] ?? { status: "idle" };
          const dot =
            st.status === "running"
              ? "bg-marigold animate-pulse"
              : st.status === "done"
                ? "bg-rupee"
                : st.status === "failed"
                  ? "bg-[#b42318]"
                  : st.status === "skipped"
                    ? "bg-ink/30"
                    : "bg-transparent border border-ink/30";
          return (
            <li key={s.id} className="relative flex gap-3 pb-4">
              {i < STEPS.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-rule" aria-hidden />}
              <span className={`mt-1.5 size-[11px] shrink-0 rounded-full ${dot}`} aria-hidden />
              <div className={st.status === "idle" ? "opacity-50" : ""}>
                <p className="text-sm font-semibold">
                  {s.title}
                  <span className="sr-only"> — {st.status}</span>
                </p>
                <ActorChip kind={s.kind} label={st.actor ?? s.actor} />
                {st.startMs !== undefined && st.endMs !== undefined && (
                  <span className="ml-2 font-mono text-[11px] text-ink/60">{((st.endMs - st.startMs) / 1000).toFixed(1)} s</span>
                )}
                {st.detail && <p className="mt-1 text-xs text-ink/80">{st.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HowItWorks() {
  return (
    <div className="border border-rule bg-paper p-5">
      <h2 className="font-display text-xl font-semibold">How it works</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink/80">
        Scholarship rules are scattered across government portals and websites, and they change every year. Unclaimed reads them for
        you, checks every rule against your details in code, and shows you the exact sentence each rule came from.
      </p>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {STEPS.map((s) => (
            <tr key={s.id} className="border-t border-rule">
              <td className="py-2 pr-3 font-medium">{s.title}</td>
              <td className="py-2 pr-3">
                <ActorChip kind={s.kind} label={s.actor} />
              </td>
              <td className="hidden py-2 text-ink/70 sm:table-cell">{s.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Working({ queries, sources }: { queries: string[]; sources: { url: string; title: string; kind: SourceKind }[] }) {
  return (
    <div className="space-y-5">
      {queries.length > 0 && (
        <div>
          <h3 className="font-display font-semibold">Searches planned</h3>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {queries.map((q) => (
              <li key={q} className="border-b border-rule pb-1">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <h3 className="font-display font-semibold">Pages being read</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {sources.map((s) => (
              <li key={s.url} className="flex items-baseline gap-2">
                <SourceTag kind={s.kind} />
                <span className="truncate">{s.title || s.url}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceTag({ kind }: { kind: SourceKind }) {
  const map = {
    official: ["Official", "border-stamp text-stamp"],
    foundation: ["Funder", "border-stamp/60 text-stamp"],
    aggregator: ["Secondary", "border-ink/40 text-ink/70"],
    other: ["Secondary", "border-ink/40 text-ink/70"],
  } as const;
  const [label, cls] = map[kind];
  return <span className={`shrink-0 border px-1 font-mono text-[10px] uppercase tracking-wide ${cls}`}>{label}</span>;
}

function Stamp({ c }: { c: CheckedScholarship }) {
  let text: string;
  let cls: string;
  if (c.eligibility === "not_eligible") [text, cls] = ["Not for you", "border-ink/40 text-ink/60"];
  else if (c.deadlineStatus === "closed") [text, cls] = ["Closed", "border-ink/40 text-ink/60"];
  else if (c.eligibility === "likely") [text, cls] = ["Check 1 rule", "border-marigold text-[#8a5a00]"];
  else [text, cls] = ["Eligible", "border-rupee text-rupee"];
  return (
    <span className={`inline-block -rotate-2 border-2 px-2 py-0.5 font-mono text-xs font-medium uppercase tracking-wider ${cls}`}>{text}</span>
  );
}

function dateLabel(c: CheckedScholarship): { main: string; sub: string; urgent: boolean } {
  const d = c.scholarship.deadline.date;
  if (c.deadlineStatus === "check_portal" || !d) return { main: "—", sub: "check portal", urgent: false };
  const main = new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (c.deadlineStatus === "closed") return { main, sub: "closed", urgent: false };
  return { main, sub: `${c.daysLeft} days left`, urgent: c.deadlineStatus === "closing_soon" };
}

function Ledger({ list, plan, judging }: { list: CheckedScholarship[]; plan: Plan | null; judging: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { total, count, closingSoon } = claimableTotal(list);
  const visible = showAll ? list : list.filter((c) => c.eligibility !== "not_eligible");
  const hidden = list.length - list.filter((c) => c.eligibility !== "not_eligible").length;
  const why = new Map(plan?.ranked.map((r) => [r.id, r.why]) ?? []);
  const ics = buildIcs(list);
  const unsure = list.filter((c) => c.eligibility === "likely" && c.deadlineStatus !== "closed").length;

  return (
    <section className="space-y-6">
      <div className="border-2 border-ink bg-paper p-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink/70">Open to you this cycle</p>
        <p className={`mt-1 text-3xl font-semibold sm:text-5xl ${total > 0 ? "font-mono text-rupee" : "font-display text-ink"}`}>
          {total > 0 ? inr(total) : `${count} scheme${count === 1 ? "" : "s"} you qualify for`}
          {total > 0 && <span className="ml-2 font-sans text-base font-normal text-ink/70">stated per year</span>}
        </p>
        <dl className="mt-4 grid grid-cols-3 border-y border-rule text-sm">
          <Stat label="Eligible" value={list.filter((c) => c.eligibility === "eligible" && c.deadlineStatus !== "closed").length} tone="text-rupee" />
          <Stat label="Need one check" value={unsure} tone="text-[#8a5a00]" />
          <Stat label="Close in 3 weeks" value={closingSoon} tone={closingSoon > 0 ? "text-[#b42318]" : "text-ink"} />
        </dl>
        <p className="mt-3 text-sm text-ink/80">Many government schemes pay your fees directly, so they show no fixed amount.</p>
        {ics && (
          <a
            href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`}
            download="scholarship-deadlines.ics"
            className="mt-4 inline-block bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-stamp"
          >
            Add deadlines to my calendar
          </a>
        )}
      </div>

      <div>
        <div className="hidden grid-cols-[110px_1fr_110px_120px] gap-3 border-b-2 border-ink pb-1 font-mono text-[11px] uppercase tracking-wider text-ink/70 sm:grid">
          <span>Last date</span>
          <span>Scholarship</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Status</span>
        </div>
        <ul>
          {visible.map((c) => {
            const s = c.scholarship;
            const d = dateLabel(c);
            const isOpen = open === s.id;
            return (
              <li key={s.id} className="border-b border-rule bg-paper/60">
                <button
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-1 py-3 text-left hover:bg-paper sm:grid-cols-[110px_1fr_110px_120px] sm:items-center"
                >
                  <span className="order-3 font-mono text-sm sm:order-none">
                    {d.main}
                    <span className={`block text-xs ${d.urgent ? "font-semibold text-[#8a5a00]" : "text-ink/60"}`}>{d.sub}</span>
                  </span>
                  <span className="order-1 min-w-0 sm:order-none">
                    <span className="block font-semibold leading-snug">{s.name}</span>
                    <span className="flex items-center gap-2 text-xs text-ink/70">
                      <SourceTag kind={s.sourceKind} />
                      <span className="truncate">{s.provider}</span>
                    </span>
                    {why.get(s.id) && <span className="mt-1 block text-sm text-ink/85">{why.get(s.id)}</span>}
                    {c.eligibility === "likely" && openQuestion(c) && (
                      <span className="mt-1 block text-xs text-[#8a5a00]">To check: {openQuestion(c)}</span>
                    )}
                  </span>
                  <span className="order-4 text-right font-mono text-sm sm:order-none">
                    {s.amount.value ? inr(s.amount.value) : <span className="text-xs text-ink/70">{s.amount.text || "—"}</span>}
                  </span>
                  <span className="order-2 text-right sm:order-none">
                    <Stamp c={c} />
                  </span>
                </button>
                {s.applyUrl && c.eligibility !== "not_eligible" && c.deadlineStatus !== "closed" && !isOpen && (
                  <a
                    href={s.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 ml-1 inline-block border border-ink px-2 py-0.5 font-mono text-xs uppercase tracking-wider hover:bg-ink hover:text-paper"
                  >
                    Apply on portal ↗
                  </a>
                )}
                {isOpen && <Detail c={c} />}
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm underline">
            {showAll ? "Hide" : "Show"} {hidden} that don&apos;t fit you, and why
          </button>
        )}
        {visible.length === 0 && <p className="py-4 text-sm">Nothing found that fits these details this cycle. Try again later; portals add schemes through the year.</p>}
      </div>

      <div className="border-l-4 border-stamp bg-paper p-5">
        <h3 className="font-display text-lg font-semibold">
          What to do first <ActorChip kind="model" label="Nemotron 3 Ultra" />
        </h3>
        {judging && <p className="mt-2 text-sm">Ranking your options and writing a plan…</p>}
        {plan && (
          <>
            <p className="mt-2 text-sm">{plan.summary}</p>
            <ol className="mt-3 space-y-2">
              {plan.steps.map((st, i) => (
                <li key={i} className="grid grid-cols-[110px_1fr] gap-3 border-t border-rule pt-2 text-sm">
                  <span className="font-mono text-xs font-medium uppercase">{st.when}</span>
                  <span>{st.action}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {!plan && !judging && <p className="mt-2 text-sm text-ink/70">No plan for this run; the list above is in the checker&apos;s order (eligible first, soonest deadline first).</p>}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border-r border-rule px-2 py-2 last:border-r-0 first:pl-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-ink/60">{label}</dt>
      <dd className={`font-mono text-2xl font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

// The first rule the checker could not settle, in plain words.
function openQuestion(c: CheckedScholarship): string | null {
  return c.results.find((r) => r.verdict === "unknown")?.reason ?? null;
}

const LEVEL: Record<CourseLevel, string> = { school: "School", diploma: "Diploma", ug: "UG", pg: "PG", phd: "PhD" };

// The details these results were checked against, so a viewer can see the inputs next to the answer.
function Dossier({ p, elapsedMs, calls }: { p: Profile; elapsedMs: number | null; calls: number }) {
  const cat = p.category === "OBC" && p.kaGroup ? `OBC ${p.kaGroup}` : p.category;
  const items = [
    p.state,
    `${p.course || LEVEL[p.courseLevel]} · year ${p.year}`,
    cat + (p.minority ? " · minority" : ""),
    `${inr(p.familyIncome)} family income`,
    `${p.marksPercent}% marks`,
    p.gender === "female" ? "Female" : p.gender === "male" ? "Male" : "Other",
    ...(p.disability ? ["Disability"] : []),
  ];
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-3">
      <p className="text-sm">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink/60">Checked for {p.label}: </span>
        {items.join(" · ")}
      </p>
      {elapsedMs !== null && (
        <p className="font-mono text-xs text-ink/60">
          Done in {(elapsedMs / 1000).toFixed(0)} s · {calls} calls
        </p>
      )}
    </div>
  );
}

function Detail({ c }: { c: CheckedScholarship }) {
  const s = c.scholarship;
  const mark = { pass: ["✓", "text-rupee"], fail: ["✗", "text-[#b42318]"], unknown: ["?", "text-[#8a5a00]"] } as const;
  return (
    <div className="space-y-4 px-1 pb-4 text-sm">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-ink/70">Rules, checked against you</p>
        <ul className="mt-2 space-y-2">
          {c.results.map((r, i) => (
            <li key={i} className="grid grid-cols-[18px_1fr] gap-2">
              <span className={`font-mono font-semibold ${mark[r.verdict][1]}`} aria-label={r.verdict}>
                {mark[r.verdict][0]}
              </span>
              <span>
                {r.reason}
                {r.criterion.quote && (
                  <span className={`mt-1 block border-l-2 pl-2 font-mono text-xs ${r.quoteFound ? "border-stamp text-ink/80" : "border-ink/30 text-ink/50"}`}>
                    “{r.criterion.quote}”{r.quoteFound ? "" : " — not found on the page"}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {c.flags.length > 0 && (
        <ul className="space-y-1">
          {c.flags.map((f) => (
            <li key={f} className="bg-marigold/15 px-2 py-1 text-xs">
              {f}
            </li>
          ))}
        </ul>
      )}
      {s.deadline.quote && (
        <p className="text-xs">
          <span className="font-mono uppercase tracking-wider text-ink/70">Last date, from the source: </span>“{s.deadline.quote}”
        </p>
      )}
      {s.documents.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink/70">Documents to get ready</p>
          <p className="mt-1">{s.documents.join(" · ")}</p>
        </div>
      )}
      <p className="flex flex-wrap gap-4 text-xs">
        <a className="underline" href={s.sourceUrl} target="_blank" rel="noreferrer">
          Source page
        </a>
        {s.applyUrl && (
          <a className="underline" href={s.applyUrl} target="_blank" rel="noreferrer">
            Where to apply
          </a>
        )}
      </p>
    </div>
  );
}

function CallLog({ calls }: { calls: ({ t: number } & ({ m: ModelCall } | { x: ToolCall }))[] }) {
  const models = calls.filter((c): c is { t: number; m: ModelCall } => "m" in c);
  const tokens = models.reduce((s, c) => s + (c.m.promptTokens ?? 0) + (c.m.completionTokens ?? 0), 0);
  return (
    <details className="border border-rule bg-paper p-4">
      <summary className="cursor-pointer font-display font-semibold">
        Every model and tool call ({calls.length}) <span className="font-mono text-xs font-normal text-ink/70">· {tokens.toLocaleString("en-IN")} Nemotron tokens</span>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] font-mono text-xs">
          <thead>
            <tr className="border-b border-ink text-left text-ink/70">
              <th className="py-1 pr-2">t+s</th>
              <th className="pr-2">step</th>
              <th className="pr-2">model / tool</th>
              <th className="pr-2 text-right">ms</th>
              <th className="pr-2 text-right">in / out / cached</th>
              <th>request id / detail</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i} className="border-b border-rule align-top">
                <td className="py-1 pr-2">{(c.t / 1000).toFixed(1)}</td>
                {"m" in c ? (
                  <>
                    <td className="pr-2">{c.m.step}</td>
                    <td className="pr-2 text-stamp">{c.m.model}</td>
                    <td className="pr-2 text-right">{c.m.ms}</td>
                    <td className="pr-2 text-right">
                      {c.m.promptTokens ?? "–"} / {c.m.completionTokens ?? "–"} / {c.m.cachedTokens ?? "–"}
                    </td>
                    <td className={c.m.ok ? "" : "text-[#b42318]"}>{c.m.ok ? c.m.requestId : c.m.error}</td>
                  </>
                ) : (
                  <>
                    <td className="pr-2">{c.x.step}</td>
                    <td className="pr-2">{c.x.tool}</td>
                    <td className="pr-2 text-right">{c.x.ms}</td>
                    <td className="pr-2 text-right">{c.x.credits ? `${c.x.credits} credits` : "–"}</td>
                    <td className={`break-all ${c.x.ok ? "" : "text-[#b42318]"}`}>{c.x.ok ? c.x.detail : c.x.error}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
