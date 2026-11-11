# vNext measurements

Status: not measured. The owner requested source implementation with testing and finishing deferred to Sonnet. This environment has no Node/npm runtime. No check, timing, trace, screenshot, byte-budget result, or improvement is claimed.

| Ticket | Command | Before | After | Machine / throttle | Verdict |
| --- | --- | --- | --- | --- | --- |
| T0 | npm run check | Not run | Not run | Unavailable | Pending full checkout/runtime |
| T0 | npm run perf | Not run | Not run | Required: same machine, Chrome 4x CPU throttle | Pending |
| T0 | npm run perf:recalc | Not run | Not run | Required: same machine, Chrome 4x CPU throttle | Pending |
| T0 | node qa/smooth.mjs --timing | Not run | Not run | Verify flag support first | Pending |
| T0 | node qa/rapid-switch.mjs --strict | Not run | Not run | Verify flag support first | Pending |
| T5 draft | Same tab-switch measurement selected from T0 | Not run | Not run | Same machine and throttle as pristine baseline | Unverified draft |

Additional unverified drafts: T3 core token merge; T6 tab timings/overlap; T9 phone hostname display; T10 in-app confirmation dialog and new behavior cases. No before/after numbers, screenshots, build-budget results or test passes are available. See `NOTES.md` for exact scope and remaining acceptance work.

## Ranking

Not established. Do not invent GO/SKIP decisions for T4, T5 or T7 without baseline measurements. T5 source work was drafted at the owner's explicit request to prepare a handoff; it has not met ticket acceptance.

## Baseline source

The three unmodified source files available here are under `reference/upstream/`. They are references for diff/review, not a runnable full baseline checkout. Use a full upstream checkout for baseline capture and the complete build/QA tooling.
