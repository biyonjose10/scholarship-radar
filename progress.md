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
