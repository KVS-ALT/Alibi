# Generation review

Scope: offline adversarial checks for the LARP portfolio generator. One person describes invented projects; other speakers ask questions. No live provider requests, microphone tests, deployment, or restarts were performed by this reviewer.

`tests/generation-cases.test.cjs` exercises the public `generatePortfolio` function with disabled provider configuration or explicit synthetic response envelopes. The local renderer is also checked for inert escaping.

Cases covered:

- A car marketplace's dealer inventory remains one product.
- Graphic designers using an invoice tool do not imply a CAD product.
- Two separately named car/CAD products retain the correct names.
- Interviewer questions do not invent another project.
- An interviewer introduction does not become the portfolio identity; the builder may be the second detected speaker.
- A new project preserves the previous project's details and metrics.
- Explicit corrections update a project rather than preserving stale names.
- Small talk and questions alone create no project.
- Unfamiliar domains retain the spoken product/problem and receive coherent synthetic records rather than an unrelated team task queue.
- Hardware/audio design statements, including the user's AirPods example, generate a named audio prototype with enclosure, listening and battery details. A company affiliation alone does not accidentally create an app project.
- A schema-valid partial model update preserves previous projects.
- Executable model markup is rejected; malicious title text stays escaped in trusted local HTML.

Initial execution exposed concrete failures in overlapping recipe detection, per-project name extraction, explicit corrections, role-aware name extraction, and partial model-state replacement. These were reported before fixes. The production owner fixed the clause/role/correction parsing and model-state merge. This reviewer then added the unfamiliar-domain fallback: it preserves the described product, derives a suitable name and summary, and supplies record or audio-analysis sample data instead of unrelated team tasks.

Final reviewer run: `node --test tests/generation-cases.test.cjs` passed all **16 tests**; TypeScript `--noEmit` also passed. This is offline synthetic evidence, not a live model benchmark.

Limitations: offline fixtures cannot establish real diarization accuracy, model quality, external-provider latency, or a browser-visible end-to-end 10-second guarantee. The total inference deadline and first local draft have separate tests in the main recovery suite. The fallback conservatively uses clause/domain heuristics; broad semantic interpretation and uncommon paraphrases still require model refinement.
