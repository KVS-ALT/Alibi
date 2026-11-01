# Builder backend and Render task boundary

The local MVP runs anonymously with an unguessable HttpOnly owner cookie. There is no login, provider credential, cloud resource, or payment setup. The default `local-demo` runner performs real generation, validation and export work in the Node process using the shared reviewed templates and deterministic **Demo generator**. It makes no provider calls. Sessions are held in memory, expire after 30 minutes, and disappear on restart. This is a single-process demo store, not durable authentication or production persistence.

The HTTP server serves the built frontend from `dist` and exposes same-origin `/api` routes. Development binds to `127.0.0.1:3001`; production binds to `0.0.0.0:$PORT`. `HOST` overrides this. Integration owns root build/start scripts. Build both `server/index.ts` and `server/workflows.ts` through Vite SSR so the shared export renderer's CSS imports are bundled correctly; start the resulting `dist-server/index.js` with Node.

## API

- `GET /api/health`: reports `runner`, `generator`, ephemeral storage and TTL.
- `POST /api/sessions` with `{id: <frontend UUID>}`: creates a server session and HttpOnly `larp_owner` cookie. Reusing an existing UUID requires its cookie.
- `POST /api/sessions/:id/jobs`: flattened `GenerationRequest` plus optional reviewed `templateId`; returns `{jobId,runner,generator}`.
- `GET /api/sessions/:id/jobs/:jobId/events`: SSE `data:` objects: `{type:'stage',progress:{stage,status,message,runId?}}`, `{type:'result',result:GenerationResult}`, or `{type:'error',code,message}`. Replays completed events before attaching a live listener, then closes on completion. The local runner emits stages only when the corresponding work actually starts/completes. The Render runner reports root acceptance/completion only; it does not invent per-task live progress.
- `GET /api/sessions/:id`: latest successful result and expiry.
- `GET /api/sessions/:id/export?format=json|html|source`: actual configuration, standalone HTML, or source ZIP.
- `DELETE /api/sessions/:id`: cancels local waiting work and clears memory.
- `POST /api/sessions/:id/email` with `{recipient,enabled:true,projectVersion}` validates explicit consent and the latest completed artifact version. This local build always returns `ready`/`notSent:true`/`email_disabled`. It has no configured send transport or provider credentials and exposes no public project link; exports still require owner-cookie access. The optional Agentboxd adapter requires an allowlist and durable atomic outbox before future live use.

All session, job and export reads check cookie ownership. Requests are capped at 128 KiB, 120 API requests/minute/socket address, 100 total sessions, four active builds globally, one active build/session, five retained jobs/session, and three SSE subscribers/job. Cross-origin requests are rejected; secrets and provider errors are not echoed. Deployments with multiple instances require a shared session/job store before use.

## Actual Render Workflows definitions

`workflows.ts` registers seven actual `@renderinc/sdk` 1.x tasks. The root `buildPrototype` chains template selection, parallel content/style/asset review, validation, and export packaging with `TaskContext.run`. Each task declares a flex compute plan, bounded timeout and retry policy. These definitions use the same pure functions as the default local runner.

Official references: [task SDK](https://render.com/docs/workflows-sdk-typescript), [local development](https://render.com/docs/workflows-local-development), [Workflows overview](https://render.com/docs/workflows).

Supported local-development command after building the workflow entry:

```powershell
render workflows dev --debug -- node dist-server/workflows.js
# In a separate terminal:
$env:RENDER_USE_LOCAL_DEV='true'
$env:RENDER_LOCAL_DEV_URL='http://localhost:8120'
$env:RENDER_BUILD_TASK='buildPrototype'
node dist-server/index.js
```

The adapter deliberately rejects live mode and non-loopback task URLs. No Render API key is needed or read for the default local flow. Live workflow provisioning/execution is outside this local test setup.

### Verification on this Windows machine, 2026-11-01

Official portable Render CLI **v2.34.0** was downloaded into temporary storage and its SHA-256 matched the published `cli_2.34.0_SHA256SUMS`:
`3492c4ff56fb42b04303cce589c469ad28c62d7b6f244678219f8861615486ed`.

The CLI started its task server on port 8120. Using `render workflows dev --debug -- node node_modules/tsx/dist/cli.mjs server/workflows.ts`, actual SDK 1.0.0 task registration failed repeatedly with:

```text
connect EACCES /tmp\render-sdk-sockets-1666802810/8932391d-b486-478b-91f6-c04b9083a5c3.sock
```

The attempt was stopped. No task run was accepted and no real Render run ID was produced. This is an observed native Windows socket transport failure; no broader platform support claim is made. The CLI/SDK were not patched and no hosted services, account/authentication, API keys, paid calls or alternative environment were created. Keep `RENDER_USE_LOCAL_DEV` unset on this machine for the working `local-demo` backend.

A bounded follow-up checked the installed SDK and official local-development/TypeScript references. SDK 1.0.0's `workflows/runner.js` requires `RENDER_SDK_SOCKET_PATH`; `executor.js` constructs `UDSClient`, and `uds.js` sends Node HTTP requests with `socketPath`. No TCP or named-pipe task-executor override was found. `RENDER_LOCAL_DEV_URL` changes the app-to-CLI HTTP endpoint, not this subprocess socket transport. A future Render-hosted Linux workflow is a separate deployment step requiring authorization and credentials; it is not configured or verified here.

The registered task functions are also tested using the SDK's documented in-process `TaskDefinition.func` API and a supplied chaining context. This proves graph logic and output parity; it does not prove a Render runtime run. HTTP integration tests exercise ownership, expiry, bounds, busy protection, actual generation stages, safe failure handling, and exports.
