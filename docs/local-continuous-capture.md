# Continuous local capture

The user requested recording until they press End, rather than the previous one-session 30-second test grant.

After `npm ci` and `npm run build:web`, run `node scripts/start-local-continuous.cjs PATH_TO_EXISTING_ENV_FILE`. The file is read locally; provider values are passed only to the child process and are not written to this repository or printed. The app listens only on `127.0.0.1:3005`.

This explicitly opts the local process into `ALIBI_CONTINUOUS_CAPTURE=true` together with `ALIBI_LOCAL_PROFILE=true`. Both provider enable flags are still required. The hosted test profile is unchanged. Local starts use the owned-session cookie and same-origin checks, without an expiring private test link. The cookie lasts for the browser session. End, mute, disconnect, and audio backpressure release the upstream connection; there is no app-imposed recording deadline or cumulative audio quota in this mode. Provider or network failure can still end capture.

The active transcript uses a bounded rolling window; the prior portfolio supplies project context. Completed generation snapshots are published while later speech queues the next build, so continuous speaking no longer discards all in-flight results. Only one build runs per session. The previous three-request generation quota does not apply in continuous local mode.

Generation fallback emits `[alibi:generation]` server metadata with outcome and reason, plus HTTP status when applicable. Transcripts, provider response bodies, and credentials are excluded. Basic fallback drafts remain available when the provider fails; the exact historical failure could not be recovered because the old code swallowed it.

Run `npm test` for offline regression checks. The tests cover longer capture, explicit End, rolling transcripts, unchanged hosted gating, queued generation, and redacted failure metadata. Live microphone/provider success requires a user-started retry and is not established by these offline tests.
