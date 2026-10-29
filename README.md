# Unclaimed

**Finds the scholarships an Indian college student can still claim, checks every eligibility rule against them with the exact sentence it came from, and hands back a dated plan.**

Live demo: https://unclaimed-nine.vercel.app · Built for the Nebius x NVIDIA Global AI Hackathon (Best Apps & Agents) · MIT licence

The three demo students replay a recorded real run (labelled with the time it was recorded) so judges see a full run instantly; **Run it live ↻** does a fresh one. Fresh runs take 30–75 s and cost about $0.02.

---

## The problem

Scholarship rules for Indian students are spread across a state portal, department sites, the National Scholarship Portal, AICTE and dozens of foundations. They change every academic year, official notices are often in the state language, deadlines differ by department, and they get extended.

What we found while building this, all on 28–29 Oct 2026, for one scheme (Karnataka's post-matric scholarship for Backward Classes, 2026-27):

| Source | Last date it gives |
|---|---|
| bcwd.karnataka.gov.in (the department's own page) | 31.08.2026 |
| buddy4study.com (a popular scholarship site) | 30 Sep 2026 "(extended)" |
| ssp.karnataka.gov.in (the portal where you apply), notice board, in Kannada | **31/10/2026** |

A student reading either of the first two would think it had already closed. It closes on Saturday.

The money is there and going unclaimed. Government figures given in Parliament show ₹9,163.98 crore allocated for scholarships for SC, OBC, EBC and DNT students in 2024-25, while post-matric beneficiaries fell from 45.45 lakh to about 24.5 lakh over four years ([The Wire, 12 Mar 2026](https://m.thewire.in/article/caste/funds-for-scholarships-for-students-from-marginalised-communities-underutilised-govt-data-shows-2)). There are many reasons; scattered, shifting, contradictory information is one a student can't fix alone.

## What it does

Give it eight facts (state, course, year, category, family income, marks, gender, disability) or tap a demo student. Then:

1. **Nemotron 3.5 Lightning** plans targeted searches from the profile.
2. **Tavily Search** runs them on the open web, restricted to government sites (`gov.in`, `nic.in`), and on the state's scholarship portal. The student's own state government ranks first, then central portals, funders and secondary sites; other states' pages are dropped.
3. **Tavily Extract** reads the full text of the best pages. The state portal's notice board is always read.
4. **Nemotron 3 Super** pulls each scholarship's rules out as JSON, each rule with a word-for-word quote (Kannada pages included). The portal's notice board has a fixed format, so **code** reads its dates; the model kept picking last year's lines.
5. **Code merges copies of the same scheme** across pages (names differ; level and department don't). The newest dated official notice wins, and the older date is shown: "Last date extended. An older official page still says 31 Aug 2026."
6. **Code decides eligibility**, rule by rule: ✓ / ✗ / ?. The model never decides who qualifies.
7. **Code verifies sources**: a rule whose quote isn't on the page is never trusted to include or exclude anyone; last year's dates are flagged; when a secondary site disagrees with the official page, the row says so.
8. **Follow-up search**: for rules still unsettled, the agent searches government sites once more for that one rule, reads the page and re-checks.
9. **Nemotron 3 Ultra** ranks what's left and writes the week's plan. Then: one combined document checklist across every open scheme, and a calendar file with reminders 7 and 2 days before each deadline.

Every step shows which model, tool or code is doing it, and the call log lists every call with its Token Factory request id, latency, tokens and the run's cost.

## Which model does what, and why

| Step | Model / tool | Why |
|---|---|---|
| Plan searches | `nvidia/Nemotron-3_5-Lightning`, thinking off | Short, fast, cheap; the job is writing queries (0.5–2 s) |
| Search | Tavily Search with `include_domains` for government sites and the state portal | Official portals are invisible to plain search |
| Read pages | Tavily Extract | Full eligibility text, not snippets |
| Extract rules | `nvidia/nemotron-3-super-120b-a12b`, JSON mode, thinking off | Long pages, Kannada, strict schema with verbatim quotes (1–6 s per page) |
| Read the portal's notice board | TypeScript (`src/lib/notices.ts`) | Fixed format; a model mixed up years |
| Merge copies, decide eligibility, verify, flag conflicts | TypeScript (`merge.ts`, `checker.ts`, `conflicts.ts`) | Deterministic and tested; a model should not decide who gets money |
| Rank and plan | `nvidia/Nemotron-3-Ultra-550b-a55b`, thinking on | The one judgement call per run: money × urgency × certainty |

## How Token Factory is used

- `src/lib/nebius.ts`: one small OpenAI-compatible client. JSON mode (`response_format`), `chat_template_kwargs: {enable_thinking: false}` for the steps that copy text out, retries on dropped connections and 429/5xx, `<think>` stripping, and a report of model, latency, tokens and request id for every call.
- **Thinking off mattered.** Nemotron reasons by default. In our first run Lightning spent its entire 2,000-token budget thinking and never wrote the queries, and Super took 25–60 s per page with up to 5,000 reasoning tokens. Switching it off for extraction took a run from **182 s to 26–75 s** and cut cost; Ultra keeps thinking for the plan.
- **Measured cost:** $0.013–0.020 per full run (about ₹1.5), 20–30 Tavily credits.
- A spend guard (`src/lib/guard.ts`) caps live runs per IP and per day; recorded runs cost nothing.

## Accuracy

`scripts/eval.mts` runs the Reader on two real pages hand-labelled in `eval/gold.json` (5 schemes, 12 rules, 5 deadlines) and scores it in code (`src/lib/evalScore.ts`).

Three runs on 29 Oct 2026, after one prompt fix (Karnataka's "Category I" was being tagged General): **34 of 36 labelled rules and 14 of 15 deadlines read correctly, 0 invented rules.** Every extra rule the model returned was quoted word-for-word on the page (things we hadn't labelled, like course levels). Both misses came from one run that skipped a whole scheme.

## Run it locally

Keys live in `../.env` (one folder above the repo, never committed):

```
NEBIUS_API_KEY=...
TAVILY_API_KEY=...
```

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1          # dev server on http://localhost:3000
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Fixture # layout-only sample run, no API calls, development only
npm test                                                     # 23 unit tests
npm run smoke                                                # lists Token Factory's NVIDIA models, one Nemotron call, one Tavily call
npx tsx scripts/trial.mts Kavya                              # one real run, printed step by step
npx tsx scripts/record.mts                                   # re-record the demo students' runs
npx tsx scripts/eval.mts                                     # Reader accuracy on the labelled pages
```

Optional env: `MODEL_LIGHTNING`, `MODEL_SUPER`, `MODEL_ULTRA`, `RUNS_PER_IP_PER_HOUR` (default 5), `DAILY_RUN_CEILING` (default 20).

## Limitations and failure cases

Published on purpose; these are real.

- **Not legal or financial advice.** Every result says to confirm on the official portal.
- **Deadlines move.** Three sources gave three dates for the same scheme (table above). The app trusts the newest dated official notice; if that notice isn't readable on a run, an older official date or a secondary site's date is what you see, flagged.
- **Search results vary run to run.** Different runs can surface different pages, so two runs for the same student can list different schemes. The state notice board is always read to keep the key dates stable.
- **The Reader sometimes skips a scheme** on a long page (1 of 3 evaluation runs).
- **Official portals are often unreadable**: JavaScript shells, scanned PDFs. Then secondary sites fill in and every such row is labelled "Secondary — confirm on the official page".
- **Date-only notices**: the portal lists dates by department without rules. Rules are then borrowed from a secondary page that quotes them (shown as such), and the department named in the notice decides who it's for.
- **Look-alike domains exist.** `sspscholarshipkarnataka.in` imitates the real SSP portal; only `*.gov.in` / `*.nic.in` and known funders count as official.
- **Tested mainly on Karnataka.** Its notice board is parsed in code; other states use the general pipeline.
- **Free-text rules** (attendance, community boards) show as "?" with the quote.
- **The spend guard is in-memory per server instance**: a brake, not a wall.

## Privacy

No accounts. The profile stays in the browser (localStorage) and is sent only for the run; the server does not store or log it. The demo students are fictional. Don't enter a name.

## Tests

`npm test`: 23 tests covering income limits by Karnataka group, category and year rules, invented-rule rejection, old-cycle and closing-soon dates, Kannada quotes, the notice-board parser, merging copies and extended dates, official-vs-secondary conflicts, the follow-up search merge, the model-output shaper, the document checklist, run cost and the eval scorer.

## Licence

MIT — see `LICENSE`.
