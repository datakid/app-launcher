# vNext measurements

Machine: 2-core cloud sandbox, headless Chromium, no hardware GPU. Absolute numbers are not comparable with the plan's budgets; only interleaved main-vs-beta comparisons are meaningful. Base is pristine `main` built with its own pipeline; head is `main` with the beta overlay (`src/app.js`, `src/app.css`, `links.json`, `qa/*`).

## Gates (overlay on a scratch copy of main)

`npm run check` stages, `qa:behaviour`, `qa:icons`, `qa:comments` and the byte-budget gates pass after T2, T3 and T10. `perf --assert` cannot pass in this sandbox: pristine `main` already misses 22 hardware-bound targets, so it is not used as a gate here.

## Tab switch A/B (3 interleaved rounds, median of per-round medians)

| profile | metric | main | beta |
| --- | --- | --- | --- |
| desktop | interactionMs | 284 | 232 |
| desktop | readableMs | 368 | 248 |
| desktop | settleGridMs | 543 | 398 |
| desktop | droppedFrames | 4.5 | 4.0 |
| desktop | settleCoreMs | 960 | 1000 |
| mobile | interactionMs | 428 | 412 |
| mobile | settleGridMs | 679 | 713 |
| mobile | settleCoreMs | 1184 | 1272 |
| mobile | droppedFrames | 5.5 | 4.5 |

Desktop improves clearly and every round agrees. Mobile is within the round-to-round spread (main settleGrid 629–745, beta 646–722). Verdict: keep T5 and T6.

## View switch A/B (3 interleaved rounds)

Desktop interaction 148 → 168 ms and mobile 300 → 312 ms, with overlapping per-round ranges (main 144–176, beta 140–176). No view-switch code changed in T5/T6, so this is noise, not a regression.

## Style recalculation (`perf:recalc`, desktop 4x, 5 runs, interleaved)

| scenario | recalcs | recalc ms | script ms |
| --- | --- | --- | --- |
| tab-switches | 899 → 785 (-12.7%) | 8472 → 8109 (-4.3%) | 789 → 659 (-16.5%) |
| hover-bento | 573 → 579 (+1.0%) | 6552 → 6511 (-0.6%) | 289 → 252 (-12.6%) |
| palette-cycles | 501 → 494 (-1.4%) | 8682 → 8305 (-4.3%) | 1043 → 955 (-8.4%) |

## Rapid switching

Rapid-switch misses went from 25/14 on main to 17/10 on beta.

## T4 idle cost

Measured idle CPU with the pointer engine: zero. `Motion.tick` already sleeps when every subscriber's render returns false, and descendants consume `--tx/--ty/--hov`, so `@property` `inherits` cannot be flipped. Verdict: SKIP.

## Correctness evidence

`vnext/cache-e2e.mjs` checks tab-cache correctness end to end (node identity on A-B-A, invalidation on language, view, import, reset and variant changes, reduced motion, both languages).
