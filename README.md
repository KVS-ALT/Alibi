# Conversation to a working prototype

The primary screen starts consented, silent microphone capture. Final speech is assembled into a coherent brief, automatically selects a template, and produces versioned interactive results. There is no manual brief, Build step, or template picker in the primary flow. The optional developer gallery is `/inspect/templates`.

## Local run

Use Node 22.20 or newer compatible LTS. Run `npm ci --include=dev`, `npm run build`, then `npm start`. The server listens on http://127.0.0.1:3001 by default. Existing running sessions do not hot-load `.env` edits. Do not replace a running user's build without coordinating a pause.

The current user test sessions were deliberately preserved on ports 3001 and 3002. Their already-loaded bundles can predate the newest source. Localhost URLs are not public phone-share URLs.

## Required real conversation configuration

Fill the two dedicated active key fields in the ignored `.env`: `FEATHERLESS_API_KEY` and `SPEECHMATICS_API_KEY`. The chosen nonsecret settings are `GENERATION_PROVIDER=featherless`, `FEATHERLESS_MODEL=Qwen/Qwen2.5-7B-Instruct`, `SPEECH_PROVIDER=speechmatics`, and `SPEECHMATICS_ENABLED=true`. No OpenAI credential is needed for this flow.

Key entry is not authorization for recurring usage. Ordinary starts keep live calls disabled. A separately approved test process must have `LIVE_PROVIDER_CALLS_ENABLED=true`, `--allow-live-providers`, and positive explicit limits such as `--approved-generation-requests=1`, `--approved-speech-tokens=1`, and `--approved-audio-seconds=5`. Actual HTTP attempts, including retries, consume the process budget. Speech uses a server-owned WebSocket proxy with cumulative raw-PCM and wall-time caps; no provider token is exposed to the browser, and the old direct-token endpoint is disabled. Runtime budgets reset on process restart, so they must not be mistaken for a persistent public billing limit.

Featherless uses its fixed official chat endpoint and dedicated key, a 3000-token output bound, strict validated composition and no automatic retry. Model choice, safe structure/forms and presentation tokens are allowed; arbitrary scripts, URLs and CSS are not. Offline demo generation remains explicitly separate. Native browser speech and bounded ElevenLabs capture are alternative adapters, not additional required credentials.

## Output and privacy

Twenty reviewed template scenarios retain filtering, navigation and demo forms. The primary source ZIP contains plain `index.html`, `styles.css`, `app.js` and configuration plus documentation; it opens locally without React, npm or a build. A single-file standalone HTML is also included. Transcripts, raw audio and visitor form entries are not exported.

Sessions are anonymous and cookie-owned, with a 30-minute in-memory build cache. The current waitlist behavior retains the latest tab-local fields and receipt, not a subscriber database. Email attachment, durable projects/Supabase and public sharing are extra capabilities; source modules do not imply that their runtime wiring, credentials or deployment are complete. No localhost QR is presented as public sharing.

## Verification and deployment

Use `npm test -- --configLoader runner --maxWorkers=4 --testTimeout=20000`. The canonical suite passes 237 tests across 36 files. Browser and server TypeScript checks and isolated production builds pass. Tests inject provider transports. The one approved real synthetic test reached a validated Featherless bakery result after Speechmatics transcription; its overall harness still failed an external-font assertion, and fragmented speech exposed an assembly defect. Those defects are fixed locally and replayed without another paid attempt. Do not label that original run as a clean full pass.

`render.yaml` describes one Free Node webservice with automatic deploys and providers disabled. The separately created `alibi-demo` service is at https://alibi-demo.onrender.com; deployment of this latest checkpoint must be verified separately. Actual Render Workflows compute is separate, billed, and not provisioned by that file. Native Windows workflow task registration previously failed on the SDK socket; no accepted hosted workflow run is claimed. Persistent provider secrets, paid resources and live usage require their own explicit target/budget approval. No new webservice is needed per conversation.
For the approved human interactive session, add --interactive-test with an operator-generated INTERACTIVE_TEST_TOKEN and a fixed INTERACTIVE_TEST_EXPIRES_AT UTC timestamp within fifteen minutes. The private /test/claim/<token> link only sets a pending HttpOnly cookie; previews do not consume it. Only an explicit Start atomically binds the allowance to one owner and one build session. Other owners and sessions cannot use it. Current limits remain the stricter 30 seconds PCM / 40 seconds stream wall time, one connection and up to three inference attempts. The owner authorization expires after 90 seconds or the absolute deadline, whichever is earlier. These in-memory guards reset on process restart: monitor this one temporary session, then disable live flags and rotate the capability immediately. They are not a durable public billing limit.
