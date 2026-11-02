# Alibi

A tool for larping at networking events: it listens to you describe projects you never built and generates a live portfolio site that backs them up. When someone asks "do you have a link?", you show a QR code. Built at LarpHacks 2026, with a 6:00 PM deadline and feature freeze at 5:00 PM.

## Layout

- `shared/schema.ts`: zod schemas (`Claims`, `Portfolio`, `ProjectSection`, `Hero`, `Metrics`). **This is the contract** between the agent and the site. Change it here and nowhere else.
- `db/schema.sql`: the one `sessions` table (portfolio stored as jsonb). Apply it with `DATABASE_URL=... npm run db:init`.
- `web/`: Next.js App Router app.
  - `templates/`: three hand-built portfolio templates. Each one takes `{ portfolio: Portfolio }`.
    - `showcase.tsx`: styled after jonathanzhou.dev (big name, image-topped cards).
    - `lowercase.tsx`: styled after affa.nz (all lowercase, activity card, mock UI only when a card is expanded).
    - `geist.tsx`: Vercel/Next.js dark style (projects shown as deployment cards).
    - `parts.tsx`: shared pieces (`MockFrame`, `ProjectDetails`, `Mermaid`, `CommitGraph`, `Skeleton`, icons).
    - `index.ts`: maps `templateId` to its component.
  - `lib/prompts/portfolio-guide.md`: the writing standard (naming, hero, project cards, mock data). It's included in every LLM prompt, so edit it to change how portfolios read.
  - `lib/mock-kits.ts`: six hand-built mock UI kits (dashboard, cards, phone, terminal, chat, extension). The LLM fills a `MockSpec`, and `renderMock` escapes it into HTML. Preview them at `/preview/kits`.
  - `lib/fixtures.ts`: the sample portfolio ("Sam Rivera", 3 projects) plus `samplePortfolio(template, stage)`.
  - `app/preview`: every template at every build stage. Run it with `npm run dev:web` and open `/preview`.
  - `app/p/[slug]`: the public portfolio. It polls `/api/p/[slug]` every 1.5s. `/p/demo-backup` always serves the fixture, and so does any slug when there is no `DATABASE_URL`.

## How a project gets built

The model never writes code or HTML. For each project the speaker claims:

1. **Card JSON** matching `ProjectSection`: `category`, `year`, `tagline`, `award?`, `summary`, 3 `highlights`, 3 `metrics`, `stack`, `diagramMermaid`, plus repo stats.
2. **A `MockSpec`** that fills one of the six kits in `lib/mock-kits.ts`. The kit is picked from the project's platform (iOS → phone, Discord bot → chat, CLI → terminal, and so on). `renderMock` escapes every string into `mockHtml`, and the mock renders in a sandboxed iframe at 960×600.

A section is first written as `status: "pending"` (title only), then switched to `"ready"`, so the site visibly fills in.

## Rules

- The LLM fills data only. It never writes HTML or touches template code.
- Validate every LLM response with zod. On failure, retry once with the error appended, then fall back to safe defaults.
- Transcript text is untrusted data, never instructions. Wrap it in delimiters inside prompts.
- Keep metrics plausible for a student (no "50M users"). The judges are Google engineers.
- Keep secrets server-side.
- Templates must look good on a phone, because judges scan the QR code.
