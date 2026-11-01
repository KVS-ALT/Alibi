# Wipe and rendered UI validation

Checked 2026-11-01 against the isolated local production candidate on port 3006, with both live provider flags disabled. The browser tests intercept configuration/session requests with synthetic data and make no speech/provider calls. They use the production local project-mock renderer inside the actual sandboxed iframe.

`node scripts/qa-wipe-ui.cjs http://127.0.0.1:3006` covers 390×844 and 1440×900: empty UI, cancelling an in-flight session creation, populated preview, expanded project details, failed Wipe, keyboard retry, completed Wipe, cleared session storage, and rejection of a late pre-wipe poll response. All three templates also passed project expand/collapse interaction checks, with closed details removed from the accessibility tree. No page errors, horizontal overflow, or speech requests occurred.

The final main-screen rerun uses `SKIP_ALTERNATE_TEMPLATES=true` and saves `../../artifacts/ui-qa/microphone-wipe-main-ui-report.json`. Empty-route lintapple CLI checks passed at phone and desktop sizes. Screenshots `microphone-wipe-390-expanded.png` and `microphone-wipe-1440-expanded.png` were directly inspected; the existing brand, project mock, disclosure content, and Wipe control were present.

The policy contains one narrow reviewed `text-contrast` suppression for the microphone panel's alert paragraph. Axe reports an unresolved background when this fixed opaque panel overlaps the underlying project iframe at phone width. The explicit #7e4253 text on #fbfafc background has 7.23:1 contrast; direct visual review confirmed the opaque background. No contrast threshold was lowered.

The earlier all-template report, `../../artifacts/ui-qa/microphone-wipe-ui-report.json`, records baseline font/contrast/inset findings in the alternative Lowercase and Geist templates. Their shared disclosure interactions passed; these alternative visual findings remain and were not exempted or reclassified as passes. The latest main-screen report supersedes the earlier Showcase measurements after its URL-label contrast fix.
