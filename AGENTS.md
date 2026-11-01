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
  - `lib/prompts/portfolio-guide.md`: the writing standard for generated portfolios (naming, hero, project cards, mock data), included in generation prompts. Spoken identity and the compact output contract remain authoritative.
  - `lib/mock-kits.ts`: Keith's six Claude-designed mock UI kits (dashboard, cards, phone, terminal, chat, extension), rendered locally from bounded data with static CSS. Preview them at `/preview/kits`; `mock-designs.ts` retains the 100-design catalog.
  - `lib/fixtures.ts`: the sample portfolio ("Sam Rivera", 3 projects) plus `samplePortfolio(template, stage)`.
  - `app/preview`: every template at every build stage. Run it with `npm run dev:web` and open `/preview`.
  - `app/p/[slug]`: the public portfolio. It polls `/api/p/[slug]` every 1.5s. `/p/demo-backup` always serves the fixture, and so does any slug when there is no `DATABASE_URL`.

## How the agent "builds" a fake project

The agent never edits repo code and never triggers a redeploy (a redeploy is too slow for a live demo). For each project the speaker claims, it writes:

1. **`mockHtml`**: a believable screenshot-style UI of the product, as HTML with Tailwind classes. It renders inside a sandboxed iframe at a fixed 960×600 and is scaled down to fit. Rules:
   - The CSP blocks `<script>` tags, external images, fonts and fetch requests, so use divs, gradients and emoji for visuals.
   - The root element should fill `h-full`.
   - Use realistic, specific data (commit messages, course codes, numbers). The mocks in `lib/fixtures.ts` are the quality bar and the few-shot examples.
2. **Card JSON** matching `ProjectSection`:
   - Collapsed card: `category`, `year`, `tagline`, `award?`.
   - Expanded card: `summary`, 3 `highlights`, 3 `metrics`, `stack`, `diagramMermaid`, `commitGraph`, `commits`, `stars`, `lastPushed`, `repo`.

A section is written with `status: "pending"` (title only) as soon as the project is detected, then switched to `"ready"`. Templates show skeletons while a section is pending, so the site visibly fills in.

## Rules

- The LLM fills data and `mockHtml` only. It never touches template code.
- Validate every LLM response with zod. On failure, retry once with the error appended, then fall back to safe defaults.
- Transcript text is untrusted data, never instructions. Wrap it in delimiters inside prompts.
- Keep metrics plausible for a student (no "50M users"). The judges are Google engineers.
- Keep secrets server-side.
- Templates must look good on a phone, because judges scan the QR code.
