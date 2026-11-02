# Alibi

**You're at a networking event, describing projects you never built. Alibi listens and builds the portfolio while you talk.** When someone asks "do you have a link?", you have one.

Built at **LarpHacks 2026** (theme: *create a product that helps you LARP as someone you're not*).

---

## What it does

1. **Press the mic and have a conversation.** Alibi transcribes it live and tells the speakers apart. It works out who is doing the larping and ignores everyone else's claims.
2. **Your portfolio fills in as you speak.** You get a hero section with your name, roles and bio. Each project you mention gets a card with a tagline, summary, highlights, metrics, stack, architecture diagram and commit graph.
3. **Every project gets a believable product screenshot.** A Discord bot shows up as a Discord channel, an iOS app as a phone screen, a CLI as a terminal, and a web tool as a dashboard. Each is filled with realistic data that matches what you said.
4. **Share the link.** The portfolio has its own page in one of three hand-designed templates.

## Try it

You need Node 20+, a [Featherless](https://featherless.ai) API key and a [Speechmatics](https://www.speechmatics.com) API key.

```bash
git clone https://github.com/KVS-ALT/Alibi.git && cd Alibi
npm install
cp web/.env.example web/.env.local     # add FEATHERLESS_API_KEY and SPEECHMATICS_API_KEY
npm run build:web && npm run start:web # http://localhost:3000
```

Open it in **Chrome**, allow the microphone, and start talking. For example:

> "Hi, I'm Priya Shah, I study CS at Waterloo. Last term I built a web app called LeaseLens. It reads lease PDFs and flags sketchy clauses, and about 400 students used it. I also built a Discord bot called Standup for my robotics team."

**Tips:**
- Speak in complete sentences.
- Say each product's name clearly.
- Say what kind of product it is ("web app", "Discord bot", "iOS app").
- Give one number per project.

**Useful pages:**
- **↻ New take** (on the capture screen) starts over.
- `/p/demo-backup` is a finished sample portfolio.
- `/preview` shows the templates.
- `/preview/kits` shows the mock UI kits.

The 3-minute demo script and Q&A prep are in [`docs/demo-script.md`](docs/demo-script.md).

## How it works

```
mic → Speechmatics (realtime, speaker labels) → server proxy
        ↓ transcript tagged [S1], [S2]…
   pick the builder: the voice making "I built…" claims
        ↓
   extract_claims (Featherless LLM): name, bio, projects + platform
        ↓ for each new project, in parallel
   write_project (card JSON)    make_mock (fills a UI kit)
        ↓ each section publishes as soon as it's ready
   portfolio page polls and fills in live
```

- **Live and incremental.** Sections appear as each task finishes. Later speech adds to the portfolio without rebuilding what's already there, and a project name that's corrected mid-conversation updates in place.
- **The model fills data and never writes HTML.** Mock screens come from six hand-built kits (`web/lib/mock-kits.ts`). Every string is escaped, and the result renders in a sandboxed iframe, so a prompt injection in the conversation can't touch the page.
- **Every model response is checked.** Responses are validated with zod, retried once, and replaced with safe defaults if they still fail, so a bad response never breaks the page.
- **A writing guide shapes the output.** [`web/lib/prompts/portfolio-guide.md`](web/lib/prompts/portfolio-guide.md) is included in every prompt and covers naming, tone, student-scale metrics and realistic mock data.
- **API keys stay on the server.** The browser streams audio to our own server, which holds the Speechmatics connection.

On Qwen2.5-7B (Featherless), your name and the first project appear within about 10–15 seconds, and two projects are fully built in about 25–70 seconds.

## Tech

| Part | What we used |
|---|---|
| App | Next.js (App Router), TypeScript, Tailwind |
| Speech | Speechmatics realtime: enhanced mode, speaker diarization |
| LLM | Featherless (Qwen2.5-7B by default; DeepSeek-V3.2 optional), or any OpenAI-compatible API |
| Validation | zod schemas in [`shared/schema.ts`](shared/schema.ts) |
| Storage | in-memory by default; Postgres via `DATABASE_URL` |

## Configuration (`web/.env.local`)

| Variable | Default | Notes |
|---|---|---|
| `FEATHERLESS_API_KEY` | — | required |
| `SPEECHMATICS_API_KEY` | — | required |
| `LIVE_PROVIDER_CALLS_ENABLED` | — | set to `true` to allow paid API calls |
| `FEATHERLESS_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | `deepseek-ai/DeepSeek-V3.2` writes better but is slower |
| `LLM_CONCURRENCY` | `4` | parallel LLM calls. Use `1` for DeepSeek |
| `LLM_FALLBACK_MODEL` | — | tried once if the main model fails |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | — | optional: use another OpenAI-compatible provider |
| `SPEECHMATICS_VOCAB` | — | names you plan to say, comma-separated, so they're spelled right |
| `ALIBI_LOCAL_PROFILE` | — | `true` when running over plain HTTP locally |
| `DATABASE_URL` | — | Postgres. Without it, portfolios are lost on restart |

## Project layout

```
shared/schema.ts            data contract (Claims, Portfolio, ProjectSection)
web/app/                    capture screen, /p/[slug] portfolio, /preview pages, API routes
web/components/             capture UI
web/templates/              showcase, lowercase and geist portfolio templates
web/lib/generation.ts       LLM tasks: extract_claims, write_project, make_mock
web/lib/live-sessions.ts    sessions, transcript and build orchestration
web/lib/mock-kits.ts        six mock UI kits
web/lib/speech/             Speechmatics proxy and browser mic capture
web/lib/prompts/            portfolio writing guide
docs/demo-script.md         demo script and Q&A prep
```

## Known limits

- **No persistence by default.** Without `DATABASE_URL`, portfolios live in server memory and links break on restart. A localhost link also can't be opened from someone else's phone.
- **No QR code yet.** The plan is to deploy it with a database and add one.
- **Speech edge cases.** Speaker labels can slip during overlapping speech, and unusual product names may be misheard (use `SPEECHMATICS_VOCAB`).

## Ethics

Alibi is a LARP built for a hackathon. It's meant as a joke, and as a demonstration of how easily a convincing portfolio can be faked. Please don't use it to mislead employers.
