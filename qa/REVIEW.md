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


## Domain scenario and export validation follow-up

New domain generator 1115a44 was reviewed through independent executable tests. All 20 cases passed: each asserts a domain-specific data column and form field, executes the exported JavaScript, filters to the exact expected category rows, navigates to its form, rejects an empty required form, fills relevant selects/dates/numbers/email, and observes a local receipt. Examples include bakery item/allergens data and pickup-date, restaurant dish data and reservation-guests, marketplace product data and bag-quantity, wedding moment data and rsvp-attendance.

A thirteenth export security case demonstrated that a separate button with submitDemoForm could bypass required target form validation. Both exported runtimes were fixed in 10a2fc0. The regression is now green. Full independent integration command after those changes: 4 files, 38 tests passed (session 3, preview 2, export/security 13, domain scenarios 20).

Live browser verification on port 3001 found a stale server process returning generic rows after the domain code was built. Integration is restarting it. New domain browser screenshots and form layout checks remain pending; old visual passes are not being counted as new domain verification.

## Fresh canonical browser/domain visual verification

After the server restart, Chrome on http://127.0.0.1:3001/ built Sunday QA with item/category/allergens/price columns and Country sourdough, Chocolate morning bun, and Seeded rye rows. Selecting Pastry reduced the table to Chocolate morning bun alone. The preorder page exposed bake selection, quantity, pickup date, name, and email. An empty required date blocked submission; after entering 2026-12-01, the local-only receipt appeared.

Actually viewed the refreshed six contact sheets for templates 11–20: contact-rest-desktop-0/1.png, contact-rest-mobile-0/1.png, and contact-rest-form-mobile-0/1.png under worktrees/ui/qa. These now visibly contain domain-specific data and forms. All ten desktop layouts, ten mobile layouts, and ten mobile form layouts pass the basic visual check. Longer tables scroll inside their labelled table regions; controls and labels fit the 390px forms. This is visual/interaction QA, not a full accessibility conformance audit.

An additional export identifier-collision regression passes (14/14 export tests): a valid component named screen-contact does not shadow the internal screen template in the current HTML ordering. No defect was observed for that edge case.

The upcoming mobile-first main builder redesign has not yet been reviewed by this report. These results certify the reviewed template/domain views and workflows only, not later shell edits.

## Final mobile shell and waitlist evidence

Actually viewed mobile-first-idle.png, mobile-first-listening-mock.png, mobile-first-building-delay.png, mobile-first-preview.png, mobile-first-keyboard-focus.png, and mobile-waitlist-receipt.png in the UI qa folder. At 390px the idle screen exposes Start session in the first viewport and keeps typing collapsed; the generated bakery preview fits the viewport; the typing disclosure shows a visible keyboard focus ring. The listening screenshot is explicitly a recognition TEST STUB, not live hardware or background-capture evidence. The UI runner's mobile-first-report.json records width 390, a working mute transition, and reduced-motion computed animation none / transition 0s.

The UI runner's actual-browser waitlist-report.json confirms only text/name and email inputs, local receipt, reload restoration of the fictional visitor fields and receipt, fresh-session preview clearing, and no private email in exported source. The receipt screenshot was actually viewed. Independently, test fd2ea1b verifies the same storage/export privacy boundaries against canonical application code.

Latest independent review suite evidence comprises 3 session cases, 2 preview interaction cases, 14 export/security cases, 20 domain scenario cases, and 1 waitlist privacy case. These were run in targeted groups; the integration owner runs the combined canonical suite and production build after merges. The last review addition, 5f32b14, covers obsolete filter options across template changes and awaits the integration owner's final fix/check.

No new visual blocker was observed in the final mobile shell or assigned ten refreshed domain templates. Live microphone hardware, actual speech accuracy, locked-screen/background recording, external email delivery, real bookings, payments, authentication, and production service integration were not verified or claimed. Email delivery remains disabled; waitlist storage is the latest form state in this browser tab, with no subscriber database or entry history.
