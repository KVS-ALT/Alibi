# Proposed build scope
## Product and demo
Hackathon theme: "Create a product to help you LARP as someone you are not."
Help a person act as an app builder during a conversation: listen silently during an explicitly started session, then turn it into a working interactive prototype on screen using reviewed templates. The user target is 20 templates, each checked visually for quality. This is a prototype builder; product name and visual direction remain open.

Example: a fictional studio owner asks for an appointment tool. Start a consented listening session, describe the workflow, trigger a build without ending the call, and show a prototype with navigation, a service filter, and a local demo booking form. A follow-up brief revises the prototype while compatible state survives.

## Scope 1: shared foundation
- Freeze the draft contracts and synthetic fixture before parallel implementation.
- One application, one proposed Render deployment, session-specific preview routes.
- Keep provider keys on the server. Hosting plan, framework, model provider and credentials are unverified decisions.
- Intended transcription provider: ElevenLabs Scribe realtime, contingent on credentials and credits. Typed input must exercise the same pipeline without it.

## Scope 2: MVP
- Explicit tap-to-start microphone consent and visible idle/capturing/building/ready/error status.
- Continuous silent listening and accumulated context during the active session; builds run in the background without requiring a new capture clip each time.
- Configurable spoken build/pause controls plus manual Build, Mute and End. Exact phrases remain undecided. Build does not end capture; Mute pauses microphone capture/transmission; End releases capture and closes the stream.
- No microphone capture or audio transmission before Start or while muted.
- Wearer-only capture is an unresolved intent, not a supported privacy guarantee: a microphone may record nearby participants. Use a consented or dictated-brief demo and test actual hardware; do not claim other voices are excluded. End releases capture and closes the stream.
- AirPods/phone/laptop input must be tested on the actual device. Browser foreground support is the proposed target; OS background/locked-phone capture is not promised. Test participant voices and noisy venues.
- Final transcript segments become a versioned structured brief, then a schema-validated UI component specification.
- Select and configure reviewed templates rather than generate arbitrary full-site code. Target 20 templates; check every template visually in its relevant viewport(s), interaction states, and Present mode before marking it ready. Keep a template inventory with screenshots, reviewer, defects and pass/fail evidence. A smaller initial release is only a proposed staging option and does not replace the target of 20.
- Make the actual generated template configuration/source used for the demo available honestly; never claim it is hidden because of an invented closed-source restriction.
- Render template screens using an allowed component catalog: text, card, form, table, navigation and button.
- Allowed actions: local state changes, navigation, demo form submission, and filtering.
- A later brief revises the UI using stable screen/component IDs. Preserve compatible form, filter and navigation state; reset only removed or incompatible state.
- Present mode hides builder controls and exposes the generated prototype.
- Invalid, stale or failed generations retain the last good preview with a useful retry path.
- Synthetic demo data is clearly labelled; no real payments, account creation or external integrations.

## MVP acceptance checklist
- [ ] Before Start, no audio is acquired or transmitted; show an obvious capture indicator after consent.
- [ ] End, Mute/resume, repeated Start/End and spoken controls do not leak streams or submit duplicate jobs; Build retains the active listening session.
- [ ] Microphone denial offers typed input and still reaches a usable preview.
- [ ] A fictional brief creates at least two navigable screens with a stateful filter/button/form.
- [ ] Transcript-to-brief-to-spec versions are traceable and stale generation results cannot replace newer output.
- [ ] The template inventory accounts for all 20 target templates, with visual review evidence and defects resolved before each is marked ready.
- [ ] The demo exposes or exports its actual generated template configuration/source.
- [ ] Unknown components/actions and arbitrary scripts are rejected before rendering.
- [ ] A revision preserves compatible state and a failed revision retains the last good preview.
- [ ] A new session and a second browser cannot see or mutate another session's data.
- [ ] No secrets appear in client bundles, logs, fixtures, commits or generated UI.
- [ ] A second browser can run a complete synthetic demo from capture/typed input through Present mode.
- [ ] A microphone-independent fixture demo works if service credentials or credits are unavailable.

## Scope 3: optional stretch
Only after MVP acceptance: richer components and themes, advertisements, and Agentboxd integration. Confirm each external integration and any cost separately.

## Excluded from this build
Ambient listening outside an explicitly started session, guaranteed OS background/locked-phone capture, agent speech, native apps, arbitrary generated code execution, per-client deployments, production accounts/payments, unattended cross-provider agent messaging, and automatic deployment or PR merging.

## Planning gates and suggested timeline
These are relative planning slots, not delivery guarantees.
1. First 15 minutes: four humans claim roles, review contracts, choose framework and build/pause phrases, verify credentials.
2. Next 45 minutes: UI runs from fixture, audio produces segments, generation validates a fixture-compatible spec, integration establishes session isolation.
3. Next 30 minutes: integrate the first vertical slice and reject stale responses.
4. Final 30 minutes: exercise acceptance checklist, rehearse two-browser demo, freeze MVP.
Cut stretch work first if the first vertical slice slips.

## Decisions still needed
Four human owners and their exact subscription/app names; framework; model/provider and authorized API access; build/pause phrases; session storage/expiry and preview access rules; Render availability; ElevenLabs credentials/credits. Subscription chat access is not assumed to include API credits.
