# Alibi

Talk about projects you never built, and Alibi builds a live portfolio site that backs them up. Built for LarpHacks 2026.

How it works:
- **Speechmatics** transcribes the conversation and labels each speaker.
- An LLM on **Featherless** picks out the person larping, extracts their claims, and then, for each project, writes the card and designs a mock product screen in parallel.
- The site fills in section by section through hand-built templates.

See [AGENTS.md](AGENTS.md) for the data contract and [docs/demo-script.md](docs/demo-script.md) for the 3-minute demo script.

## Quick start

```bash
npm install
cp web/.env.example web/.env.local   # then fill in FEATHERLESS_API_KEY and SPEECHMATICS_API_KEY
npm run build:web
npm run start:web                    # http://localhost:3000
```

For a live demo, use the production build (`build:web` + `start:web`). Dev mode (`npm run dev:web`) compiles on first request and is much slower. Use Chrome and allow the microphone.

## Pages

- **`/`** is the capture screen. Press the mic and talk. The portfolio builds underneath.
  - **↻ New take** starts a fresh session.
  - **Open portfolio** opens the shareable link.
- **`/p/<slug>`** is the public portfolio. `/p/demo-backup` is a fixed, hand-made portfolio to fall back on.
- **`/preview`** shows every template at every build stage. **`/preview/kits`** shows the six mock UI kits.

To run without a microphone (for testing, or as a demo fallback):
1. `POST /api/sessions` to create a session.
2. `POST /api/sessions/<id>/transcript` with `{"text": "..."}` to send the conversation.

Both requests must use the same cookie jar.

## Pipeline

The code lives in `web/lib/live-sessions.ts` and `web/lib/generation.ts`.

1. **Speech.** Speechmatics runs in its enhanced mode with speaker diarization (up to 4 voices). The transcript is tagged `[S1]`, `[S2]`…
   - The **builder** is the voice with the most first-person "I built…" claims.
   - Only their words become the portfolio. Other people's questions are context.
2. **`extract_claims`** pulls out the name, roles, bio, skills, and each project with its platform. Claims are pinned, so later speech only adds to them.
   - While the mic is live, it only uses complete sentences.
   - A name that grows ("Lease" → "Lease Lens") renames the existing project rather than creating a new one.
3. For each new project, two calls run **in parallel**:
   - **`write_project`** writes the card.
   - **`make_mock`** fills one of six hand-built UI kits (`web/lib/mock-kits.ts`). The kit is picked from the platform: iOS → phone, Discord bot → chat, CLI → terminal, and so on.
4. Every response is validated with zod, retried once with the error, then falls back to safe defaults. Mocks render escaped, inside a sandboxed iframe.
5. `web/lib/prompts/portfolio-guide.md` is the writing standard included in every prompt. Edit it to change how portfolios read.

Measured with Qwen2.5-7B on Featherless: the name and first section appear in ~10–15s. Two projects are fully built in ~25–70s, depending on how fast you talk.

## Environment (`web/.env.local`)

| var | default | |
|---|---|---|
| `LIVE_PROVIDER_CALLS_ENABLED` | — | must be `true` for any paid provider call |
| `FEATHERLESS_API_KEY` | — | |
| `FEATHERLESS_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | fast. `deepseek-ai/DeepSeek-V3.2` writes better but runs one call at a time (~15s each) |
| `LLM_CONCURRENCY` | `4` | parallel LLM calls. Use `1` for DeepSeek |
| `LLM_FALLBACK_MODEL` | — | tried once if the main model errors |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | — | optional: any OpenAI-compatible provider instead of Featherless |
| `SPEECHMATICS_API_KEY` | — | |
| `SPEECHMATICS_ENABLED` | `true` | |
| `SPEECHMATICS_VOCAB` | — | comma-separated names you'll say, so they're spelled right (e.g. `LeaseLens,Standup`) |
| `ALIBI_LOCAL_PROFILE` | — | `true` for plain-HTTP local runs (no `Secure` cookies) |
| `DATABASE_URL` | — | Postgres. Without it, sessions live in memory and are lost on restart |

## Known limits

- Without `DATABASE_URL`, portfolios live in server memory. Links stop working after a restart, and phones on other networks can't reach a localhost server.
- There's no QR code yet.
- Speaker labels can slip during overlapping speech.
