# Forme — conversation to working prototype

An anonymous builder with twenty reviewed starting points, consented browser speech capture, interactive previews, and matching offline/source exports. The current generator is a conspicuously labelled deterministic demo using synthetic data. No provider account, API key, login or payment is needed.

## Run locally

Use Node 22.12 or newer. From this directory:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3001/**. This single Node service serves both the built frontend and the anonymous API. Leave the terminal running. Stop it with Ctrl+C.

Optional runtime settings are documented in `.env.example`. The local `.env` is ignored by Git and loaded only on the next manual `npm.cmd start`; editing it does not reload the running server. Blank optional placeholders are commented out to preserve the defaults. The current MVP consumes runtime/local-workflow settings only; ElevenLabs, Agentboxd and AI-provider API-key environment consumers are not wired. Adding credentials to a file does not enable those services or authorize live calls.

Try a brief such as: “Build a studio booking app called Willow Studio. Let visitors filter spaces and send a demo enquiry.” Build, filter the sample spaces, open the booking form, submit synthetic details, use Present, and download the configuration or source ZIP. Start a new session to clear the current conversation and preview.

For frontend development, run `npm.cmd run dev` in another terminal and open http://127.0.0.1:5173/. Its `/api` requests proxy to port 3001. Without the server, this developer view falls back to the clearly labelled browser demo. The default production command uses the real local server pipeline and replays its actual progress events.

## Voice and local data

Select **Start session** to request microphone access. Nothing opens the microphone on page load. Nearby voices may be captured, and browser speech recognition may send audio to the browser provider. Obtain their consent. Mute and End remain visible; “build prototype” builds while capture remains active, and “pause listening” mutes. Typed input always works. Mobile, locked-screen and background capture are not guaranteed. No claim of wearer-only isolation is made.

Final transcript text stays in the current in-memory browser session. The preview configuration and compatible local form state are saved in this browser tab's session storage. The anonymous backend uses an HttpOnly ownership cookie and memory-only sessions with a 30-minute expiry. Server sessions disappear on restart. Prototype demo forms create local receipts only; they do not send bookings, payments or email. Avoid entering private information during testing.

The source ZIP includes standalone `index.html`, matching styles/configuration, readable React source, README and roadmap. Open the standalone HTML without installing anything, or follow the included React project instructions. Exported form values start empty; private form entries and transcripts are excluded.

## Checks and current limits

```powershell
npm.cmd test -- --configLoader runner
npm.cmd run build
npm.cmd audit
```

The suite covers capture lifecycle, session isolation and restoration, generation/schema validation, executable offline exports, unsafe input rejection, preview filtering, anonymous HTTP ownership and the workflow task graph. Browser inventories live in `qa/`. Visual checks describe their actual coverage; they are not a production accessibility certification.

The current flow uses `local-demo` server execution. Real Render Workflows definitions are included, but a native Windows CLI/SDK socket error prevented an accepted task run. No real Render run ID or deployed app is claimed. See [server/README.md](server/README.md) for the exact evidence and local-development commands. The Render adapter deliberately permits only local loopback execution. Hosted workflow execution needs a separately authorized configuration and supported runtime.

Email handoff is optional and disabled without configuration. A local URL is not a public project link. No real messages are sent by the default app.

No live deployment, production backend, durable multi-instance store, external AI provider, authentication, real transaction or email delivery is included. A production version needs those choices reviewed for its actual audience and data.
