# Scholarship Radar — progress log

Resume order: `../PLAN.md` → this file → `features.json` → `git log`.
One entry per working session or verified feature: time (IST), what changed, evidence.

## 2026-10-28 02:45 IST
- Idea picked by user. PLAN.md + features.json written. No code yet; waiting for plan approval and the Token Factory key in `../.env`.
- Next: smoke test (A01), repo + MIT + .gitignore, blank Vercel deploy with protection off.

## 2026-10-28 ~02:55 IST
- Scaffold pushed (private repo biyonjose10/scholarship-radar). Vercel project `unclaimed` deployed: https://unclaimed-nine.vercel.app
- Deployment Protection (SSO) disabled via `vercel project protection disable unclaimed --sso`; `curl` returns HTTP 200 with no redirect; built-in browser (not logged in to Vercel) shows the placeholder page.
- Waiting on: NEBIUS_API_KEY / TAVILY_API_KEY in ../.env (user is setting up Token Factory billing). Then `npm run smoke` (A01).

## 2026-10-28 ~02:55–03:15 IST (overnight build; Nebius key not yet available)
Built: Tavily search/extract with source ranking (`src/lib/tavily.ts`), rule checker + source verifier
(`checker.ts`, `text.ts`), Nemotron client (`nebius.ts`), Scout/Reader/Judge prompts (`prompts.ts`),
full pipeline (`pipeline.ts`), SSE API (`/api/run`), spend guard, passbook ledger UI with live timeline,
model chips, call log and `.ics` export (`Radar.tsx`, `ics.ts`). Production redeployed.

Findings from real Tavily data (`npx tsx scripts/collect.mts`):
- Plain search: 25 sources, only 1 `.gov.in`, and it returned an 809-char JS shell. Official portals need
  `include_domains: ["gov.in","nic.in"]` — tested: returns bcwd/bcw.karnataka.gov.in and an NSP guidelines PDF.
- `sspscholarshipkarnataka.in` is a look-alike of the official SSP domain; classified "other", never official.
- Karnataka OBC groups (Cat-1 / 2A / 3A / 3B) have different income limits → modelled as `kaGroup` +
  `income_max.forCategories`.

Evidence for features flipped to passing:
- A07 checker, A08 verifier, A13 spend guard: `npm test` → 10/10 pass (checker 9, guard 1).
- A02 personas/form, A10 ledger UI: dev server in fixture mode (`start.ps1 -Fixture`, development only,
  every model step labelled "dev fixture — not a real run"); clicked Kavya → BCW eligible (2A ₹1 L limit applied,
  Cat-1 limit ignored), Pragati excluded (year 2), minority scheme excluded; Sana → minority scheme eligible,
  "18 days left". Checked at 1280 px and 375 px; `scrollWidth == clientWidth == 375` (no horizontal scroll).
- `.ics` output printed and inspected (all-day event, 7-day and 2-day alarms); not yet opened in a calendar app.
- Production `/api/run` without the Nebius key returns "The model service isn't configured on this server yet."
  (no fake results); empty body → 400 "Please fill in every field."

Not verified yet (needs NEBIUS_API_KEY): A01, A03, A05/A06 in-app, A09, A11 log with real request ids, A15.

## 2026-10-29 ~00:30 IST — UI pass from a Stitch design review (bcd4a3c)
Asked Google Stitch for a critique; kept only changes backed by real run data (rejected its invented breakdowns,
"upload document" button and Kannada auto-translation). Added: "Checked for" profile line + run time and call count,
headline stat boxes (eligible / need one check / close in 3 weeks), per-step seconds in the timeline, the unresolved
rule shown on "Check 1 rule" rows, and an "Apply on portal" link on open rows.
Evidence (fixture mode, no API calls): Kavya run shows all of the above; 375 px frame scrollWidth = clientWidth;
`npm test` 11/11; deployed to unclaimed-nine.vercel.app.

## 2026-10-29 ~00:10 IST — Tier 1 + 2 features, built without any model calls
- Official vs secondary conflict flag (`conflicts.ts`): only facts quoted on their own page count. Real case found in the
  saved pages: buddy4study.com/article/ssp-scholarship lists BCW post-matric as "September 30, 2026 (extended)"; the official
  SSP portal says 31/10/2026. The fixture now uses this real mismatch.
- Follow-up step (`followup.ts`, new step "followup"): up to 2 "likely" schemes get one government-only Tavily search for
  the unsettled rule, the page is read by Super, rules quoted there replace unquoted ones, and the scheme is re-checked.
  Skipped if the run passes 150 s. NOT yet run for real (needs the Nebius key).
- Document checklist (`kit.ts`), run cost from token counts (`pricing.ts`), 6-hour memory cache for pages and readings
  (`cache.ts`).
- Recorded runs: `scripts/record.mts` saves a real run per demo student; the site replays it with a "Recorded real run"
  banner and "Run it live ↻". Tested with a temporary sample recording (removed); none recorded yet.
- Accuracy harness: `eval/gold.json` (hand-labelled from 2 real pages, 5 schemes, 14 rules), `src/lib/evalScore.ts`,
  `scripts/eval.mts`. NOT run yet (needs the key). Pages are gitignored (third-party text).
Evidence: `npm test` 18/18; fixture Kavya run shows the conflict line, checklist, follow-up step; replay banner and
recorded duration shown; Arjun without a recording gets "not configured" (no call made).

## 2026-10-29 ~10:30 IST — first real Token Factory runs (key in, $29.50 credit)
- Smoke: all four model ids match. Lightning spent its whole 2,000-token budget thinking on the Scout; Super reads took
  25-60 s with up to 5k reasoning tokens. Fix: chat_template_kwargs.enable_thinking=false for Scout and Reader (tested:
  0 reasoning tokens), kept for Ultra. Retries for "fetch failed" on Nebius and Tavily. Runs went 182 s -> 26-75 s.
- Real data problem: BCW post-matric 2026-27 has three dates: bcwd page 31.08.2026, Buddy4Study 30 Sep "(extended)",
  SSP portal notice board 31/10/2026. Fixes: the SSP notice board is always read and parsed in code (`notices.ts`;
  the model kept taking last year's lines), copies of a scheme are grouped by level+department (`merge.ts`), the newest
  quoted official date wins with "extended" noted, date-only notices borrow quoted rules and get a department rule from
  the quoted notice. 23/23 tests.
- Evidence: live POST to unclaimed-nine.vercel.app ran all 9 steps (7 eligible, 40/41 rules verified, 1 conflict).
  Recordings saved for Kavya, Arjun, Sana (src/data/recorded). Kavya: BCW post-matric official, eligible, closes 31 Oct,
  Buddy4Study conflict 30 Sept, extended from 31 Aug. Cost per run ~$0.015-0.02. Balance after all testing: $29.22.
