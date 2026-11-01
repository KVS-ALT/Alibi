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
