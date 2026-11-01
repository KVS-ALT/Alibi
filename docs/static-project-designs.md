# Static project designs and compact generation

The project preview catalog contains 100 presets: 25 structural layout families with four structural modes each. It includes sidebars, editorial layouts, dashboards, ledgers, terminal layouts and industrial treatments. Live sessions assign a stable session-scoped design key to each project, so a rename preserves its design while projects and new sessions can vary. Product content follows the project's domain.

Previews are generated locally as escaped HTML with inline CSS. The empty iframe sandbox and CSP block scripts and external resources. No Tailwind CDN or model-generated HTML is needed. Legacy fixture previews are rendered through the catalog as well. Portfolio cards use plain project labels instead of invented URLs or repository addresses.

The default provider model is Qwen/Qwen3-30B-A3B-Instruct-2507 with thinking disabled. DeepSeek V3.2 remains an explicit configuration option. Modern models return compact content patches for registered project IDs; local code owns names, identity, layout and HTML. Optional bounded label/value details appear in the existing expanded project. The AI has a shared 7.2-second deadline including a validation retry; the local draft publishes first.

The final synthetic live-provider probe on 2026-11-01 completed in 5.33 seconds with one request; its local draft appeared in 52 ms, preserved Priya Shah and Roadnest, and retained four merged details. Earlier larger requests timed out. This measurement does not guarantee transcription or provider latency for every conversation. Local product briefs and prototype details remain available when the AI times out.

Run `npm test`, `npm run build:web`, and `node scripts/qa-static-mock-ui.cjs http://127.0.0.1:3006` against a fresh production build for automated coverage. `scripts/probe-generation.cjs` accepts an existing environment file and an optional model argument for a synthetic paid provider probe; it prints timings and safe diagnostics only, never credentials.
