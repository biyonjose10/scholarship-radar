# Unclaimed

**Finds the scholarships an Indian college student can still claim, checks every eligibility rule against them with the exact sentence it came from, and hands back a dated plan.**

Live demo: https://unclaimed-nine.vercel.app · Built for the Nebius x NVIDIA Global AI Hackathon (Best Apps & Agents) · MIT licence

> Status: the Tavily search, the rule checker, the source verifier and the interface are built and tested. The Nemotron steps are wired; this README's run numbers and screenshots are filled in after the first live runs on Token Factory. <!-- TODO after first real run: replace this note -->

---

## The problem

Scholarship rules for Indian students are spread across a state portal, the National Scholarship Portal, AICTE, and dozens of foundations. They change every academic year, many official pages are in the state language, and the deadlines differ by department. In Karnataka the post-matric scholarship for Backward Classes closes on **31/10/2026** while Social Welfare's closes on 31/01/2027 — and the income limit depends on whether a student is Category-1 (₹2.5 lakh) or 2A/3A/3B (₹1 lakh). Students hear about a scheme from a WhatsApp forward, after the last date.

<!-- TODO: add 2-3 real student quotes (first name + year only, with consent) -->

## What it does

Give it eight facts (state, course, year, category, family income, marks, gender, disability) or tap a demo student. In about two minutes:

1. **Nemotron 3.5 Lightning** plans targeted searches from the profile.
2. **Tavily Search** runs them on the open web *and* restricted to government sites (`gov.in`, `nic.in`); pages from the student's own state government rank first, then central portals, then funders, then secondary sites. Pages about another state's schemes are dropped.
3. **Tavily Extract** reads the full text of the best pages.
4. **Nemotron 3 Super** pulls each scholarship's rules out as structured JSON, each rule with a word-for-word quote from the page (Kannada pages included).
5. **Plain code decides eligibility**, rule by rule: ✓ / ✗ / ?. The model never decides who qualifies.
6. **Plain code verifies sources**: a rule whose quote is not on the page is never trusted to include or exclude anyone; dates from an old cycle are flagged "check portal", not shown as live.
7. **Nemotron 3 Ultra** ranks what's left and writes the week's plan (which certificate to start on today, which rule to confirm with the college).
8. A calendar file with every open deadline and reminders 7 and 2 days before.

The interface shows which model or tool is working at each step, and a log of every call with its Token Factory request id, latency and token counts.

## Which model does what, and why

| Step | Model / tool | Why this one |
|---|---|---|
| Plan searches | `nvidia/Nemotron-3_5-Lightning` (Token Factory) | Short, fast, cheap ($0.06 / 1M input); the task is query writing |
| Search | Tavily Search (+ `include_domains` for government sites) | Current-cycle pages; official portals are invisible to plain search |
| Read pages | Tavily Extract | Full eligibility text, not snippets |
| Extract rules | `nvidia/nemotron-3-super-120b-a12b` (Token Factory, JSON mode) | Long pages (up to 24k chars each), Kannada, strict schema with verbatim quotes |
| Decide eligibility | TypeScript (`src/lib/checker.ts`) | Deterministic and testable; a model should not decide who gets money |
| Verify against source | TypeScript (`src/lib/text.ts`, `checker.ts`) | Catches invented rules and stale dates |
| Rank and plan | `nvidia/Nemotron-3-Ultra-550b-a55b` (Token Factory) | The one judgement call per run: money × urgency × certainty, and advice a student can act on |

All model calls go through Nebius Token Factory's OpenAI-compatible API (`https://api.tokenfactory.nebius.com/v1`). Model ids are overridable by env var in case of renames.

## How Token Factory is used

- `src/lib/nebius.ts` — one small client: `chat()` and `chatJson()`, `response_format: {type: "json_object"}` with a retry without it if a model rejects JSON mode, backoff on 429/5xx, `<think>` stripping, and a callback that reports model, latency, prompt/completion/**cached** tokens and the request id of every call to the UI log.
- Cost per run (estimate, to be replaced by measured numbers): Lightning ~2k tokens, Super ~7 pages × ~6k tokens, Ultra ~6k in / 1.5k out → about **$0.02–0.05 per run**. <!-- TODO measured -->
- A spend guard (`src/lib/guard.ts`) limits runs per IP per hour and per day so the public demo can't drain the credits during judging.

## Run it locally

Keys live in `../.env` (one folder above the repo, never committed):

```
NEBIUS_API_KEY=...
TAVILY_API_KEY=...
```

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1          # dev server on http://localhost:3000
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Fixture # layout-only sample run, no API calls, development only
npm test                                                     # checker, verifier and spend-guard tests
npm run smoke                                                # lists Token Factory's NVIDIA models, one Nemotron call, one Tavily call
npx tsx scripts/dryrun.mts                                   # real Tavily search+extract for the demo students, no model calls
```

Optional env: `MODEL_LIGHTNING`, `MODEL_SUPER`, `MODEL_ULTRA`, `RUNS_PER_IP_PER_HOUR` (default 5), `DAILY_RUN_CEILING` (default 60).

## Limitations and failure cases

Published on purpose; these are real.

- **Not legal or financial advice.** Every result says to confirm on the official portal; rules and dates change mid-cycle.
- **Official portals often can't be read.** Some are JavaScript shells (myscheme.gov.in returned an 809-character error page); some notices are scanned PDFs. When that happens the app falls back to secondary sites and labels every such result "Secondary — confirm on the official page".
- **Secondary sites summarise loosely.** One aggregator gives a single range ("between September 30, 2026, and January 31, 2027") where the official portal gives a date per department. Official sources always win the merge, but if the official page is unreadable the secondary date is what you see (flagged).
- **Look-alike domains exist.** `sspscholarshipkarnataka.in` imitates the real SSP portal; it is never treated as official (only `*.gov.in` / `*.nic.in` and known funders are).
- **Rules the model can't quote are "?"**, not ✓ — so some real eligibility shows as "check 1 rule".
- **Tested mainly on Karnataka.** Other states use the same pipeline but their state-government host detection and category systems (e.g. Karnataka's Cat-1/2A/2B/3A/3B) are less tuned.
- **Free-text rules** (attendance, "admitted through counselling", first-generation learner) are shown as "?" with the quote; the checker does not interpret them.
- **Amounts**: many government schemes reimburse fees rather than pay a fixed sum, so the headline total only counts stated amounts.
- **The spend guard is in-memory per server instance**: a brake, not a wall.
<!-- TODO: add measured failure cases from real runs (Reader misses, wrong dates) -->

## Privacy

No accounts. The profile is kept in the browser (localStorage) and sent only for the run; the server does not store or log it. The demo students are fictional. Don't enter a name.

## Tests

`npm test` — 11 tests: income limits by Karnataka group, category and year rules, invented-rule rejection, old-cycle and closing-soon dates, Kannada quote verification, page trimming, spend guard.

## Licence

MIT — see `LICENSE`.
