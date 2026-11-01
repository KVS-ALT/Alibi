# Adapter review checkpoint

## PR #2 review state, verified 2026-11-01 17:50 UTC

https://github.com/KVS-ALT/LarpHacks-Project/pull/2 is open, draft, and unmerged at head ec44e41c958ff907fe8d41bff292a00c4d5c5234. GitHub connector returned zero submitted reviews, comments, inline review threads, commit statuses, and workflow runs. The separate check-runs REST endpoint, read with the existing authenticated GitHub CLI, returned total_count: 0.

There is no posted Codex review or GitHub CI result to claim at this checkpoint. No review requests, comments, state changes, approvals, merges, or authentication changes were made.

## Adapter review scope

Worktree: worktrees/provider-review, branch feature/provider-review, based on the reviewed PR head. Tests will inject network transports only. No real keys, live provider requests, paid operations, microphone transmission, or emails are authorized in this review. Keep port 3001 unchanged; any candidate must use port 3002 with live actions forcibly disabled.

Required boundaries: central default-off gate; forced-off dominance; server-only secrets; fixed allowlisted provider endpoints; no redirects; bounded input/output; abort and cleanup; no pre-consent audio transmission; validated generated schemas; no arbitrary executable output; explicit allowed email recipients; durable idempotency/rate limits; session ownership; and honest disabled/unknown delivery states.

## Independent mock review, 2026-11-01

Nine additional integration tests pass against Agentboxd 057ea12 + 4b59af7, generation a90d61c + 9554cb2, and speech 5d6c89d + 68721cf. No test used real credentials or an external transport.

- Found and reproduced a credential leak when an untrusted Agentboxd success response supplied the configured API key as its message ID. The focused regression failed before 4b59af7 and passes afterward: the result is unknown, with no key in the client result or durable outbox.
- Eight concurrent handoffs through independently reconstructed durable outboxes invoke transport only once. A simulated ambiguous connection failure remains unknown after reconstruction, without resending.
- Identical content in separate anonymous sessions produces independent reservations/results; replay in the first session returns only its original result.
- Model-authored script/template closures survive as inert text through the actual executable standalone HTML. The source configuration equals the generated spec and contains neither the test credential nor an Authorization header.
- Another anonymous session's previous spec is rejected before provider transport.
- A stalled response stream reaches the configured deadline, without retrying or exposing partial provider data.
- An ended speech session's delayed response is discarded even after a new, explicitly consented session starts with the same builder ID and chunk ID. The new session receives only its own transcript.
- The browser's actual PCM normalization produces a WAV accepted by the server; changing its channel declaration to stereo causes rejection before transport.
- Server refusal of session start leaves capture safely muted, with no microphone request or audio upload. Constructing the controller causes no start request.

The first speech checkpoint retained ended sessions and prevented restarting the same ID. The owner fixed this following review: ended entries are removed, fresh consent is required, and old captured state remains ended so delayed responses are discarded. The owner also added a deadline race for transports that ignore abort signals. Browser start/resume deadline tightening was separately requested after reviewing the initial session-creation fetch.

The file outbox is a bounded single-host store. Its crash lock fails closed and requires manual inspection; it is not a distributed database. Windows privacy relies on the private parent directory's ACL. No real delivery, live microphone quality, provider availability or billing behavior has been tested.

Pending: final central API wiring and consent/audio cleanup review; candidate carousel review is separate, and its unchosen palette is not approved.
