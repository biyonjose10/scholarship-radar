# Unclaimed (Scholarship Radar)

An agent that finds the scholarships an Indian student can still claim. It searches official portals with Tavily, reads each eligibility rule with NVIDIA Nemotron on Nebius Token Factory, checks every rule against the student in plain code with a quote from the source, and hands back a ranked, dated plan.

Built for the Nebius x NVIDIA Global AI Hackathon. Work in progress; full README (setup, model-by-job table, limitations) comes before submission.

## Run locally

Keys live in `../.env` (outside this repo): `NEBIUS_API_KEY`, `TAVILY_API_KEY`.

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Smoke test of Token Factory + Tavily: `npm run smoke`

## Licence

MIT
