# Unclaimed — submission kit (drafts)

Everything marked **TODO** needs a real quote or clip before submitting. Nothing in the video may show something the live app doesn't do.

---

## 1. Devpost fields

**Name:** Unclaimed
**Tagline (≤ 200 chars):** Finds the scholarships an Indian student can still claim, checks every rule with the exact sentence it came from, and catches when websites get the deadline wrong. Nemotron + Tavily.
**Track:** Best Apps & Agents · **Bonus:** Best Use of Tavily
**Built with:** Nebius Token Factory, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3 Super, NVIDIA Nemotron 3.5 Lightning, Tavily Search, Tavily Extract, Next.js, TypeScript, Vercel
**Demo:** https://unclaimed-nine.vercel.app · **Repo:** https://github.com/biyonjose10/scholarship-radar (public at submission)

### Story

**Inspiration**
On 28 October we looked up one scholarship, Karnataka's post-matric scholarship for Backward Classes, and found three different last dates. The department's own page said 31 August. Buddy4Study, where most students look, said 30 September. The state portal's notice board, in Kannada, said 31 October. Two of the three say it's closed; it closes on Saturday. Multiply that by every department, the National Scholarship Portal, AICTE and the foundations, rules that change every year and income limits that differ by caste group (₹2.5 lakh for Category-1, ₹1 lakh for 2A/3A/3B), and students find out about the scheme they qualified for after it closed. TODO: one real student quote here.

**What it does**
Eight facts in, or one tap on a demo student. Under a minute later: every scholarship found, each eligibility rule ticked ✓, crossed ✗ or marked ? against you with the sentence it came from, which ones close soonest, where a website disagrees with the official page, one document checklist, what to do this week, and a calendar file with reminders.

**How we built it**
A nine-step agent, each step labelled in the interface with the model, tool or code doing it:
- **Nemotron 3.5 Lightning** plans the searches.
- **Tavily Search** runs them on the open web, restricted to `gov.in`/`nic.in`, and on the state scholarship portal. **Tavily Extract** reads the full pages.
- **Nemotron 3 Super** (JSON mode) extracts each rule with a word-for-word quote, including from Kannada pages. The portal's notice board has a fixed format, so code reads its dates.
- **Code merges copies** of the same scheme across pages, takes the newest official date and shows the older one; **code decides eligibility**; a **verifier** rejects any rule whose quote isn't on the page and flags when a secondary site disagrees with the official one.
- For rules still unsettled, the agent **searches government sites again** for that one rule and re-checks.
- **Nemotron 3 Ultra** ranks what's left and writes the plan.
Next.js on Vercel, Server-Sent Events for the live timeline, a spend guard, recorded real runs for the demo students, 23 unit tests and a labelled accuracy test.

**Challenges**
- **Three dates for one scheme.** Deadlines get extended and department pages lag. We group copies of a scheme by level and department (names never match) and trust the newest dated official notice.
- **The model mixed up years** on the portal's notice board, which lists every year's dates in the same Kannada sentence. A parser reads it exactly.
- **Nemotron thinks by default.** Lightning spent its whole token budget thinking and returned nothing; Super took up to a minute per page. Switching thinking off for extraction took a run from 182 s to under a minute.
- **"Official" isn't enough.** Our first ranking put a Manipur page first for a Karnataka student, and a look-alike domain (`sspscholarshipkarnataka.in`) mimics the real portal.
- **Money decisions shouldn't come from a model**, so the model only reads; code decides; every rule shows its source.

**Accomplishments**
- On hand-labelled pages, over three runs: **34 of 36 rules and 14 of 15 deadlines read correctly, 0 invented rules.**
- It catches the real Buddy4Study date error for the BCW scheme and the Minorities Welfare one (30 Sept vs the official 30 Nov).
- A full run costs about **$0.015 (₹1.5)** and takes 30–75 s.

**What we learned**
Token Factory's OpenAI-compatible API made switching models trivial, and JSON mode was reliable once thinking was off. Nemotron 3 Super reads Kannada notices and copies quotes in the original script. Turning reasoning off where the job is copying, and on where it's judging, was the biggest speed and cost win. Tavily's `include_domains` is what makes official portals findable at all. And the hardest part of this problem isn't AI: it's that the official sources disagree with each other.

**What's next**
More states' notice boards, WhatsApp reminders, and a college scholarship-cell view that runs the check for a whole class.

**Limitations** — see the README section; they're real and published on purpose.

---

## 2. Required feedback section

- **What we used:** Token Factory chat completions (OpenAI-compatible) with Nemotron 3.5 Lightning, Nemotron 3 Super (JSON mode) and Nemotron 3 Ultra; also Nemotron 3.5 Super VL in our second entry. Tavily Search and Extract.
- **Onboarding:** Sign-up with Google was quick. Billing needs a card even for credits; a Visa debit card from India worked (one OTP verification, no charge). The hackathon code `NEBIUS-DEVPOST-GLOBAL26` is rejected by the console's promo-code box ("Invalid promo code"): it's an activation code for a separate form on nebius.com, which emails the real code a few hours later. That cost us most of a night; a line on the Devpost page saying "this goes in the form, not the console" would fix it. Once applied, credits showed instantly.
- **What worked:** Drop-in OpenAI compatibility; all four NVIDIA models listed under `/v1/models` with ids that matched the docs; JSON mode; request ids and token usage on every response; image input for Super VL with base64 data URLs. Latency with thinking off: Lightning 0.5–2 s, Super 1–6 s per page, Super VL ~5 s per page; Ultra with thinking 4–9 s.
- **What didn't:** Reasoning is on by default and counts against `max_tokens`, so a 2,000-token budget returned no answer at all; we found `chat_template_kwargs: {"enable_thinking": false}` by testing, not in the docs (`/no_think` in the system prompt had no effect). Long calls occasionally dropped the connection ("fetch failed") around 60–75 s, so we added retries. Cached-token counts weren't reported for these models.
- **Would we build on it again:** Yes. Cheap enough to serve students for free (about ₹1.5 a run), fast once thinking is tuned, and one API for text and vision.

---

## 3. Video script (≤ 3:00, screen recording only)

| Time | Shot (screen) | Voiceover |
|---|---|---|
| 0:00–0:10 | Three browser tabs side by side: bcwd.karnataka.gov.in "31.08.2026", buddy4study "September 30, 2026", ssp.karnataka.gov.in notice "31/10/2026" | "One scholarship. Three websites. Three different last dates. Two of them say it's closed. It closes on Saturday." |
| 0:10–0:35 | Unclaimed home → tap **Run it live** for Kavya (or a fresh custom run) → timeline lights up; chips Lightning, Tavily, Super | "Unclaimed finds the scholarships an Indian student can still claim. Nemotron 3.5 Lightning on Nebius Token Factory plans the searches, Tavily searches government portals, Nemotron 3 Super reads every rule — even in Kannada." |
| 0:35–1:00 | Results: headline + stat boxes → the BCW row: "closes 31 Oct, 2 days left", "Last date extended…", yellow "buddy4study.com says 30 Sept…" | "Code merges what every page says about the same scheme, trusts the newest official notice, and tells you when a website has it wrong." |
| 1:00–1:20 | Expand the BCW row: ✓ rules with quote lines; the Kannada deadline quote | "Code, not a model, checks each rule against her, and every tick shows the exact sentence it came from. If the model can't quote a rule, it's never trusted." |
| 1:20–1:40 | Documents checklist → "What to do first" with the Ultra chip | "Nemotron 3 Ultra ranks what's left and writes the week's plan, and one checklist says which certificate to get first." |
| 1:40–1:50 | Click "Add deadlines to my calendar" → event with reminders | "Every open deadline goes into her calendar." |
| 1:50–2:15 | Student quote cards (text, first name + year) | TODO real quotes. |
| 2:15–2:35 | Arjun (SC): BCW scheme ✗ "Only for OBC…", Social Welfare ✓; a "?" row with "To check:" | "It's honest about what it doesn't know: unverifiable rules, old dates and secondary sources are all flagged." |
| 2:35–2:50 | Call log and the "Done in 36 s · ₹1.4" line | "Every call is logged with its request id. A full run costs about one and a half rupees." |
| 2:50–3:00 | Title card: Unclaimed · URL · "Nebius Token Factory · NVIDIA Nemotron · Tavily" | "Unclaimed. The money is already there. Go claim it." |

Recording notes: 1280×800, browser zoom 110%. Show at least one **live** run (Run it live ↻); the recorded replays are fine for the other shots but say on screen "recorded run, 29 Oct". Re-record rather than cut away from a failed step. The "2 days left" wording changes with the recording date; record by 30 Oct.

---

## 4. Quotes and footage to collect (you)

- 4–6 students: "Have you ever missed a scholarship? Why?" "How do you hear about them?" "Did you know BCW post-matric closes 31 Oct?" Text quotes, first name + year only, with consent.
- Screen recordings of the three public pages in the opening shot (bcwd, buddy4study, ssp notice board).
- Do NOT record anyone's real marks card, income certificate or Aadhaar.
