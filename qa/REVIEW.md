# Independent QA review — 2026-11-01

## Scope and evidence

This review owns templates 11–20. All ten desktop and all ten mobile screenshots were actually viewed, not merely generated. UI agent owns templates 1–10. Screenshots live at:
C:/Users/User/Documents/Codex/2026-11-01/task-2/worktrees/ui/qa/{template-id}-desktop.png
C:/Users/User/Documents/Codex/2026-11-01/task-2/worktrees/ui/qa/{template-id}-mobile.png
Desktop captures are 1440px wide; mobile captures are 390px wide. Contact sheets contact-rest-desktop-0.png and contact-rest-desktop-1.png were also viewed. Five desktop templates were additionally observed interactively through Chrome.

These are first-pass layout findings before the planned distinct domain configurations. They do NOT certify new configurations or twenty independent business workflows. No backend, payment, authentication, email delivery, live speech recognition, or production readiness is claimed.

| Template ID | Desktop viewed | Mobile viewed | First-pass finding |
| --- | --- | --- | --- |
| journal | Yes | Yes | Layout pass; actual typed build/navigation/local receipt and repaired category filter verified |
| fitness | Yes | Yes | Pass after b2dfa85: mobile recapture actually viewed; filter label now legible |
| salon | Yes | Yes | Basic layout pass |
| music | Yes | Yes | Pass after b2dfa85: mobile recapture actually viewed; filter label now legible |
| coworking | Yes | Yes | Basic layout pass |
| bakery | Yes | Yes | Basic layout pass; UI is darkening CTA accent for contrast |
| agency | Yes | Yes | Basic layout pass |
| recipe | Yes | Yes | Basic layout pass |
| job-board | Yes | Yes | Basic layout pass |
| wedding | Yes | Yes | Basic layout pass; centered hero differs visibly from split layouts |

Counts: 10/10 desktop and 10/10 mobile viewed; 10 basic layout passes after mobile contrast recheck. Functional distinction across twenty templates remains pending domain configurations: reviewed version shares generic cards, category listings, and a contact form.

## Executed checks

- Initial tests: 15/15 passed (three session lifecycle cases plus twelve export/schema checks).
- Preview regressions: category filter reproduced failure against old Preview, then both filter and search tests passed after UI 508925c.
- New parity export 1b3d0a: all twelve independent export/schema tests passed. Export JavaScript actually executes in jsdom. Tests verify hostile script-closing markup remains literal text, no injected image nodes, safe action/property rejection, navigation, filter, required form validation, local receipt, exact config equality, and ZIP entry count matching emitted files.
- Test commands: node node_modules/vitest/vitest.mjs run --configLoader runner tests/integration/export-security.test.ts and tests/integration/preview-interactions.test.ts.

## Live browser findings

At http://127.0.0.1:5173/ in Chrome, typed a fictional journal brief named Field Review, chose Field Notes, built it, navigated to contact, filled QA Reader and reader@example.test, and submitted. Accessibility state confirmed: Saved in this demo only. No real request was sent.

Category filter initially left all three rows despite Community selection. Root cause: App discarded componentId, so applyAction did not copy the selected field into filter state. Integration patched it. Repeating Apply filter in the live page produced exactly the Community row.

Present mode initially left the preview in the first narrow grid column on desktop. Reported to UI; later saved desktop captures visibly show full-width presentation after the fix.

Browser automation later timed out on Page.getFrameTree. Remaining visual review used the UI agent's saved screenshots; no failed screenshot calls were counted as viewed. No live actions with external side effects were performed.

## Follow-up required

- Dark theme mobile contrast recheck completed on refreshed fitness/music captures; bakery darker CTA also viewed.
- Recheck domain-specific configurations and representative mobile forms after generation adds them.
- Final integration production build and complete suite must run after all merges; earlier test passes do not cover later edits.

