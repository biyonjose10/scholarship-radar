# Unclaimed — submission kit (drafts)

Everything marked **TODO** needs a real number, quote or clip before submitting. Nothing in the video may show something the live app doesn't do.

---

## 1. Devpost fields

**Name:** Unclaimed
**Tagline (≤ 200 chars):** Finds the scholarships an Indian student can still claim, checks every rule against them with the exact sentence it came from, and hands back a dated plan. Nemotron on Nebius Token Factory + Tavily.
**Track:** Best Apps & Agents · **Bonus:** Best Use of Tavily
**Built with:** Nebius Token Factory, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3 Super, NVIDIA Nemotron 3.5 Lightning, Tavily Search, Tavily Extract, Next.js, TypeScript, Vercel
**Demo:** https://unclaimed-nine.vercel.app · **Repo:** https://github.com/biyonjose10/scholarship-radar (public at submission)

### Story (draft)

**Inspiration**
In Karnataka alone, the state scholarship portal lists a different last date for each department — Backward Classes Welfare's post-matric scholarship closes on 31/10/2026, Social Welfare's on 31/01/2027 — and the income limit for the same scheme is ₹2.5 lakh for Category-1 students but ₹1 lakh for 2A/3A/3B. Add the National Scholarship Portal, AICTE and dozens of foundations, rules that change every year, and official pages written in Kannada, and students find out about the scheme they qualified for after it closed. TODO: one real student quote here.

**What it does**
Eight facts in (or one tap on a demo student). Two minutes later: every scholarship found, each eligibility rule ticked ✓, crossed ✗ or marked ? against you, the sentence each rule came from, which ones close soonest, what to do this week, and a calendar file with reminders.

**How we built it**
An eight-step agent, each step labelled in the interface with the model or tool doing it:
- **Nemotron 3.5 Lightning** (Token Factory) plans the searches.
- **Tavily Search** runs them on the open web and restricted to `gov.in`/`nic.in`; own-state government pages rank first, other states' pages are dropped. **Tavily Extract** reads the full text.
- **Nemotron 3 Super** (Token Factory, JSON mode) extracts each rule with a word-for-word quote — including from Kannada pages.
- **Code, not a model, decides eligibility**, and a verifier rejects any rule whose quote isn't on the page and flags dates from old cycles.
- **Nemotron 3 Ultra** (Token Factory) ranks what's left and writes the plan.
Next.js on Vercel, Server-Sent Events for the live timeline, a per-IP spend guard, 11 unit tests.

**Challenges**
- Official portals are invisible to ordinary search and some are JavaScript shells; restricting Tavily to government domains surfaced them.
- Our first ranking put a Manipur page first for a Karnataka student — any `.gov.in` looked "official". Now the student's state wins and other states are dropped.
- A look-alike domain (`sspscholarshipkarnataka.in`) mimics the real portal.
- Letting a model say "you're eligible" felt wrong for money decisions, so the model only reads; code decides; every rule shows its source sentence.

**Accomplishments** — TODO after real runs: e.g. "N of M rules verified word-for-word against their source pages in our test runs".

**What we learned** — TODO (one honest paragraph: Token Factory JSON mode, Nemotron on Kannada text, Tavily include_domains).

**What's next** — WhatsApp reminders, more states' category systems, a college scholarship-cell view that runs the check for a whole class.

**Limitations** — link to the README section.

---

## 2. Required feedback section (draft — fill from real experience)

- **What we used:** Token Factory chat completions (OpenAI-compatible) with Nemotron 3.5 Lightning, Nemotron 3 Super (JSON mode) and Nemotron 3 Ultra; Tavily Search and Extract.
- **Onboarding:** TODO — account creation, billing from India (card type, any charge), applying the hackathon code and the Builders Program code, time from sign-up to first successful call.
- **What worked:** TODO (e.g. OpenAI SDK compatibility, latency per model, JSON mode reliability, cached tokens reported or not).
- **What didn't:** TODO (e.g. model ids not discoverable without a key — the public `/v1/models` needs auth; no docs on Nemotron's reasoning on/off switch; JSON-mode support per model only visible on model cards).
- **Would we build on it again:** TODO yes/no + why.

---

## 3. Video script (≤ 3:00, TTS voiceover, screen recording only)

| Time | Shot (screen) | Voiceover |
|---|---|---|
| 0:00–0:08 | Live app, ledger already showing Kavya's results; zoom on the marigold "closes in N days" row | "Kavya qualifies for a state scholarship that closes on Saturday. Nobody told her." |
| 0:08–0:30 | Fresh page → tap **Kavya** → timeline lights up step by step; chips "Nemotron 3.5 Lightning", "Tavily Search", "Nemotron 3 Super" visible | "Unclaimed finds the scholarships an Indian student can still claim. One tap: Nemotron 3.5 Lightning on Nebius Token Factory plans the searches, Tavily searches government portals, Nemotron 3 Super reads every rule." |
| 0:30–0:55 | Headline card (count, closing soon) → expand the BCW row: ✓ ticks with violet quote lines; the Kannada deadline quote | "Then code — not a model — checks each rule against her. Every tick shows the exact sentence it came from, even when the official page is in Kannada. If the model can't quote a rule, it's never trusted." |
| 0:55–1:20 | Scroll to "What to do first" with the Ultra chip; the steps list | "Nemotron 3 Ultra ranks what's left and writes the week's plan: which certificate to start on today, which rule to confirm with the college." |
| 1:20–1:35 | Click "Add deadlines to my calendar" → calendar shows the event with reminders | "Every open deadline goes into her calendar, with reminders." |
| 1:35–2:05 | Student quote cards (text on screen, first name + year) | "We asked students at our college..." TODO real quotes. "The problem isn't that scholarships don't exist. It's that the rules are scattered, they change every year, and the dates differ by department." |
| 2:05–2:30 | Show "Show N that don't fit you, and why" (✗ year rule on Pragati); a "Secondary — confirm" flag; the old-cycle "check portal" flag | "It's honest about what it doesn't know: rules it can't verify, dates from last year's cycle, and pages from secondary sites are all flagged." |
| 2:30–2:50 | Open the call log: model ids, request ids, tokens | "Every call is logged: Lightning, Super and Ultra on Nebius Token Factory, Tavily for search. About two cents a run." TODO measured |
| 2:50–3:00 | Title card: Unclaimed · URL · "Nebius Token Factory · NVIDIA Nemotron · Tavily" | "Unclaimed. The money is already there. Go claim it." |

Recording notes: record at 1280×800, browser zoom 110%; run Kavya once before recording so the cache is warm, then record a fresh run (the timeline must be real). Do not cut away from a step that failed — re-record instead.

---

## 4. Quotes and footage to collect (you)

- 4–6 students: "Have you ever missed a scholarship? Why?" "How do you hear about them?" "Did you know BCW post-matric closes 31 Oct?" — text quotes, first name + year only, ask consent to use them.
- 1 person from the college scholarship cell if reachable: how many students miss deadlines, what documents hold them up.
- Screen recording of the real ssp.karnataka.gov.in home page (public page, for context in the video).
- Do NOT record anyone's real marks card, income certificate or Aadhaar.
