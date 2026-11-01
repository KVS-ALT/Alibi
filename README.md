# Alibi

Talk about projects you never built, and Alibi builds a live portfolio site that backs them up. Speechmatics transcribes the conversation. Featherless extracts your claims and then writes each project card and a mock UI of the product in parallel. The site fills in section by section, and it renders through hand-built templates (`/preview`). See `AGENTS.md` for the data contract.

## Run locally

```bash
npm install
cp web/.env.example web/.env.local   # then fill in keys
npm run dev:web                      # http://localhost:3000
```

- `/`: capture screen. Press the mic and talk. The portfolio builds underneath.
- `/p/<slug>`: the public portfolio, polled every 1.5s. `/p/demo-backup` is the fixed fallback.
- `/preview`: every template at every build stage.

To run the pipeline without a microphone (for testing, or as a demo fallback), create a session with `POST /api/sessions`, then send `POST /api/sessions/<id>/transcript` with `{"text": "..."}`. Both requests must use the same cookie jar.

## Pipeline (`web/lib/live-sessions.ts`, `web/lib/generation.ts`)

1. **`extract_claims`** (~8s): speaker, skills, template vibe, and projects. Claims are pinned, so later chunks only add to them. The hero and the project skeletons appear right away.
2. For each new project, two calls run **in parallel**: **`write_project`** (~10s) writes the card JSON, and **`make_mock`** (~25–40s) writes the product UI as sandboxed HTML. Each one publishes as soon as it lands.
3. Each task is validated with zod, retried once with the error appended, then falls back to safe defaults. Per-task timings are stored in the session `metrics`.

Measured on Qwen2.5-7B: first section in ~10s, two projects fully built in ~50s.

## Environment (`web/.env.local`)

| var | default | |
|---|---|---|
| `LIVE_PROVIDER_CALLS_ENABLED` | — | must be `true` for any paid provider call |
| `FEATHERLESS_API_KEY` | — | |
| `FEATHERLESS_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | |
| `FEATHERLESS_CONCURRENCY` | `4` | max parallel LLM calls (plan limit) |
| `SPEECHMATICS_API_KEY` | — | |
| `SPEECHMATICS_ENABLED` | `true` | |
| `MAX_BUILDS_PER_SESSION` | `30` | pipeline runs per session |
| `MAX_AUDIO_SECONDS_PER_SESSION` | `600` | |
| `ALIBI_LOCAL_PROFILE` | — | `true` for plain-HTTP local production (no `Secure` cookies) |
| `DATABASE_URL` | — | Postgres. Without it, sessions are kept in memory and lost on restart |
