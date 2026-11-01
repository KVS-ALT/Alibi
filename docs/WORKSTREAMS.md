# Four people, four agents
Each human runs their own authorized AI tool. Roles describe responsibilities, not a claim that subscriptions expose shared agents or APIs. Choose tools after confirming the four app/plan names and available capabilities. Do not share logins, tokens or subscription credentials.

| Role | Proposed exclusive implementation directories | Deliverable | Dependency |
| --- | --- | --- | --- |
| UI / preview | src/ui/, tests/ui/ | Builder shell, component renderer, Present mode, state reconciliation | Draft UI spec fixture |
| Audio / capture | src/audio/, tests/audio/ | Consent, mic lifecycle, transcript segments, build/pause detection, typed fallback | Transcript contract |
| Generation | src/generation/, tests/generation/ | Brief extraction, spec validation, provider adapter, deterministic fixture fallback | Brief and UI spec contracts |
| Integration / release | src/integration/, src/contracts/, tests/integration/, root config and lockfile | Session orchestration, routes, version checks, secrets boundary, integrated demo | All three modules |

Paths are proposed boundaries for the eventual framework. Only integration edits root configuration, manifests, lockfiles and shared contracts; other owners request changes through a task comment. If scaffolding requires different paths, integration publishes the mapping before implementation.

## Coordination protocol
Use the private coordination repository's issue comments as the conversation, one issue per task. Separate per-role status files are summaries; never have everyone append to one chat.md. The code repository holds implementation PRs and lasting technical documentation.

1. A human claims a task and names their agent; no unclaimed parallel duplication.
2. Read the scope, contracts, task issue and latest role statuses. Pull before starting.
3. Work in an isolated branch/worktree named feature/<role>-<task>. Never force-push shared branches.
4. Post branch, base SHA, changed paths, contract dependencies, checks and blockers to the task issue.
5. Open a focused PR and hand off its link. Integration reviews dependencies and merges only through the team's normal review process.
6. Human operators relay prompts/results unless an explicitly authorized integration is later built. This protocol does not automatically connect separate AI providers.

No private notes, raw audio, personal transcripts or secrets belong in the public code repo. Use synthetic fixtures. Repository access changes remain the owner's responsibility.

## Copyable handoff prompts
### UI agent
Read docs/SCOPE.md, docs/CONTRACTS.md and docs/fixtures/session.json. Own src/ui/ and tests/ui/ only. Build interactive preview rendering from the fixture, stable-ID state reconciliation and Present mode. Ask integration for shared contract/config changes. Return your branch, changed paths, acceptance evidence, limitations and PR link.

### Audio agent
Read the same documents. Own src/audio/ and tests/audio/ only. Produce transcript events from a continuous explicitly started silent session with manual/spoken build and pause controls, mute/resume and idempotent End and typed fallback. Never transmit before Start. Treat provider credentials as unverified. Return lifecycle evidence and the integration handoff.

### Generation agent
Read the same documents. Own src/generation/ and tests/generation/ only. Convert final transcript into a versioned brief and validated allowed-component spec. Provide a deterministic synthetic fixture mode; reject unsupported actions/scripts. Preserve stable IDs across compatible revisions. Return validation evidence and provider requirements without secrets.

### Integration agent
Read the same documents and all role handoffs. Own src/integration/, src/contracts/, tests/integration/ and root configuration/lockfiles. Freeze executable schemas with the team, scaffold once, connect modules, enforce per-session isolation/version guards, keep secrets server-side and preserve last-good previews. Verify the MVP acceptance checklist. Prepare deployment instructions; do not deploy or merge without the team's authorized next step.

## Handoff format
Task link; human/role; status (claimed / working / blocked / review / done); branch and base SHA; changed paths; inputs and outputs; contract/version changes requested; checks and results; blockers; next owner/action; PR link. "Done" means evidence is attached, not merely that code was written.
