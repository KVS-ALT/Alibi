# Render project apps

This branch includes the teammate's `design/mock-kits-and-guide` at 2c55d44.
Each ready generated project has a public `/p/<slug>/project/<id>` URL with
its own title, generated content, template theme and a matching product UI kit.
All URLs run on one Render Next.js service, without per-project redeploys.

The workspace supports search, adding items, completion and browser-local
persistence. Product preview uses the teammate's six reviewed mock kits.
These are interactive prototypes; project-specific external integrations
and backend business logic are not synthesized. No generated code executes.

Deploy the root render.yaml Blueprint or create a Node web service using:
- Branch: feature/render-project-apps
- Build: npm ci --include=dev && npm run build:web
- Start: npm run start -w web -- --hostname 0.0.0.0 --port $PORT
- Health: /api/health
- Node: 22.20.0

The free plan may cold start. The default has no paid provider calls.
Configure server-side provider credentials and the existing private grant
profile separately to enable voice/AI. Never set ALIBI_LOCAL_PROFILE on Render.
Set DATABASE_URL and initialize the existing schema for durable portfolios;
otherwise generated links disappear on process restart. Browser-local workspace
items are not shared across devices. /p/demo-backup is the explicit fixture.

For hosted private demos, `ALIBI_UNLIMITED_USAGE=true` removes the app's inference
count, speech/audio, 90-second grant and fixed expiry limits. The private demo
token and `INTERACTIVE_TEST_TOKEN_SHA256` are still required before starting;
the newly claimed HttpOnly cookie lasts for the browser session rather than
15 minutes. Existing provider enable flags and server-side credentials remain
required. External provider quotas, rate limits and charges still apply.
Each ready project is linked from both the capture home and public portfolio,
using its actual session slug at `/p/<slug>/project/<id>` on the Render host.

Validation at this branch's implementation snapshot:
- `npm test`: all 92 offline regression tests pass.
- `npm run build:web`: production compilation, type checking and page generation pass.
- `node scripts/qa-project-apps.cjs http://127.0.0.1:3014`: eight rendered states pass lintapple with
  zero findings at 390×844 and 1440×900: workspace, empty search, product preview
  and About. The script checks adding/completing an item, persistence after
  reload, search, no page errors, no horizontal overflow and an unknown-project 404.
- The final compiled stylesheet contains all 140 finite accent/status utilities
  assembled by the reviewed mock kits, with zero missing selectors. This covers
  the color safelist; it does not establish visual quality across every kit.

The QA script accepts an optional base URL, defaulting to `http://127.0.0.1:3012`.

Browser coverage uses the `demo-backup` shipit fixture and its template. It does
not establish all-theme or all-kit coverage, live AI/microphone behavior, Render
deployment, durable database behavior or project-specific external integrations.
The Product preview is a static sandboxed product screen; the separate Workspace
tab provides the working browser-local search, add and completion controls.
The build retains the teammate kit's unused `Accent` type lint warning.
The QA report is written before any visual findings fail the command, so failures
remain reviewable in `ui-qa/project-apps.json`.
