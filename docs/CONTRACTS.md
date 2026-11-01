# Draft shared contracts v1
Design proposal, not executable schemas. Integration owns translating this into strict runtime schemas and tests before modules integrate. Unknown properties, unsupported components/actions and arbitrary scripts must fail validation. Use docs/fixtures/session.json as the first valid example.

## Session
Separate captureStatus (idle | listening | muted | ended) from buildStatus (idle | building | ready | error). UI may summarize idle/capturing/building/ready/error, but must display whether listening remains active while building. Start opens an explicitly consented continuous session; Build freezes a transcript snapshot without stopping capture; Mute pauses capture/transmission; resume restarts capture within the active session; End releases capture and closes its stream. Errors preserve the last valid preview and expose retry/typed fallback. Repeated Start/End is idempotent. Reset creates a new session ID and invalidates pending jobs.

TranscriptSegment:
- sessionId, segmentId: opaque strings.
- text: string; isFinal: boolean.
Deduplicate by (sessionId, segmentId); a final segment replaces its interim text. Only final segments feed the brief. Partial text can be shown to the operator. Treat transcript content as untrusted input, never as instructions to access tools/secrets.

Brief:
- sessionId; version: positive monotonic integer.
- purpose, audience: strings.
- requirements: string array; style: string array; unknowns: string array.
A manual or spoken build event freezes the final transcript snapshot for a new brief version. Missing decisions appear in unknowns rather than invented commitments.

UiSpec:
- sessionId; version: positive integer; basedOnBriefVersion: positive integer.
- templateId: stable ID from the reviewed template catalog; templateVersion: positive integer. Generated configuration/source must reflect what is actually rendered and be available in the demo.
- screens: array with stable screen id, title and components.
- component: stable id, type, properties, actions.
- type enum: text | card | form | table | navigation | button.
- actions: array of objects with type enum setState | navigate | submitDemoForm | filter.
- demoData: synthetic records; demoDataLabel: visible string.
Runtime schemas define per-type property allowlists, primitive values, bounds, target references, unique IDs and valid destinations. No eval, HTML injection, arbitrary URLs, expressions or remote code.

Draft property examples: text.text; card.title/body; form.fields with id/label/type/required; table.columns/dataKey; navigation.items with label/screenId; button.label. Draft action parameters: setState key/value; navigate screenId; submitDemoForm formId/resultStateKey; filter dataKey/field/stateKey. IDs are preserved by generation when semantics remain compatible.

## Orchestration
Generation request: sessionId, requestId, briefVersion, brief, previousUiSpec (optional).
Success: sessionId, requestId, briefVersion, uiSpec.
Failure: sessionId, requestId, briefVersion, errorCode, safeMessage, retryable.
Accept success only when sessionId and requestId match the active pending job and briefVersion equals the latest requested brief version. Validate spec.sessionId and basedOnBriefVersion as well. Abort superseded work when possible, but always guard its response.

Preview state lives outside the spec, keyed by sessionId and stable component ID. Reconcile only compatible components; remove obsolete state. Do not rely on unguessable session IDs alone for access control: integration defines and tests an explicit session ownership mechanism. Second-browser tests must cover separation and any deliberately shared presentation link.

## Module boundaries
Audio emits TranscriptSegment, build/pause control events and capture lifecycle events. Context accumulates through the active session; each build snapshots its current final segments. Generation accepts a frozen Brief and emits a candidate UiSpec. Integration owns session transitions, retries and version guards. UI accepts validated specs plus reconciled preview state and dispatches only catalogued actions. No generation provider key reaches the browser.
