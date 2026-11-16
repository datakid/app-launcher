# Results

Final values against `perf/baseline.json`, from `perf/out/latest.json`. The baseline run came from a one-core sandbox and the final run from a two-core sandbox, neither with a GPU (about 15 frames per second when idle), so the frame-time rows only show the direction of change and the two columns are not a like-for-like timing comparison. The CI run skips the timing targets for the same reason; run `npm run perf` on real hardware for absolute values. Each final cell is the median of 7 measured runs, with the worst run in brackets.

`settleGridMs` and `medianFrameMs` did not exist in the baseline run, so their baseline cells are empty. `settleMs` includes every finite animation on the page, including the hover and accent transitions that start when the pointer reaches the clicked control.

## mobile

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 112 (136) | 64 (96) | -43% |
| settleMs | 703.45 (730.3) | 684.25 (696.6) | -3% |
| settleGridMs |  | 684.25 (696.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 2 (4) | 0.5 (1) | -75% |
| worstFrameMs | 66.6 (66.7) | 33.4 (50) | -50% |
| medianFrameMs | 33.3 (33.4) | 16.7 (16.7) | -50% |
| droppedFrames | 2 (5) | 2 (4) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 4 (4) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 796 (904) | 468 (584) | -41% |
| settleMs | 3013.7 (3023.1) | 1207.25 (1282.3) | -60% |
| settleGridMs |  | 682.3 (832.3) | n/a |
| readableMs |  |  | n/a |
| longTasks | 6 (10) | 4 (5) | -33% |
| worstFrameMs | 558.35 (633.3) | 366.65 (450) | -34% |
| medianFrameMs | 33.35 (216.65) | 16.7 (16.7) | -50% |
| droppedFrames | 7 (13) | 5.5 (7) | -21% |
| imageRequests | 6 (8) | 0 (0) | -100% |
| imageDecodes | 70 (81) | 6 (11) | -91% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 488 (568) | 288 (368) | -41% |
| settleMs | 619.45 (705.5) | 416.7 (703.2) | -33% |
| settleGridMs |  | 416.7 (703.2) | n/a |
| readableMs | 22.05 (215) | 5.6 (249) | -75% |
| longTasks | 2 (3) | 1 (2) | -50% |
| worstFrameMs | 250 (333.4) | 200 (300.1) | -20% |
| medianFrameMs | 70.83 (116.6) | 16.7 (33.3) | -76% |
| droppedFrames | 1 (2) | 3.5 (6) | 250% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 23 (26) | 4 (8) | -83% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 1104 (1208) | 404 (496) | -63% |
| settleMs | 1861.8 (1984) | 1212.2 (1335.9) | -35% |
| settleGridMs |  | 24.45 (266.4) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (7) | 4.5 (6) | 0% |
| worstFrameMs | 533.3 (583.4) | 274.95 (366.7) | -48% |
| medianFrameMs | 137.42 (258.35) | 41.68 (50) | -70% |
| droppedFrames | 2.5 (4) | 5 (5) | 100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 52 (54) | 8 (9) | -85% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 216 (376) | 176 (224) | -19% |
| settleMs | 1193.9 (3023.9) | 1150.8 (3011.5) | -4% |
| settleGridMs |  | 7.75 (245) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (8) | 7 (7) | 133% |
| worstFrameMs | 483.35 (633.3) | 224.95 (266.6) | -53% |
| medianFrameMs | 183.35 (350) | 16.7 (16.7) | -91% |
| droppedFrames | 1 (9) | 8.5 (12) | 750% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 12 (12) | -62% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 10 (24) | 0 (0) | -100% |
| worstFrameMs | 58.35 (66.7) | 16.8 (33.3) | -71% |
| medianFrameMs | 24.95 (33.3) | 16.7 (16.7) | -33% |
| droppedFrames | 24 (38) | 0 (1) | -100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 0 (0) | 0 (0) | 0% |

## desktop

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 452 (480) | 180 (224) | -60% |
| settleMs | 1008.7 (1157.5) | 753.2 (804.6) | -25% |
| settleGridMs |  | 753.2 (804.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (6) | 7 (10) | 56% |
| worstFrameMs | 241.65 (416.6) | 83.4 (133.4) | -65% |
| medianFrameMs | 141.68 (166.7) | 66.65 (66.7) | -53% |
| droppedFrames | 1 (1) | 0 (3) | -100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 31 (40) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 652 (696) | 256 (344) | -61% |
| settleMs | 3135.6 (3278.7) | 1005.1 (1159.5) | -68% |
| settleGridMs |  | 548 (656.9) | n/a |
| readableMs | 1074.45 (1266.8) | 384.05 (523.6) | -64% |
| longTasks | 8 (9) | 7 (8) | -12% |
| worstFrameMs | 691.65 (866.6) | 183.35 (299.9) | -73% |
| medianFrameMs | 295.82 (358.35) | 50.02 (50.1) | -83% |
| droppedFrames | 2 (3) | 4.5 (6) | 125% |
| imageRequests | 6.5 (8) | 0 (0) | -100% |
| imageDecodes | 64 (75) | 8 (11) | -87% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 304 (456) | 152 (168) | -50% |
| settleMs | 1073 (1211.4) | 398.85 (405.8) | -63% |
| settleGridMs |  | 398.85 (405.8) | n/a |
| readableMs | 545.35 (700) | 198.45 (233.3) | -64% |
| longTasks | 9 (11) | 2 (5) | -78% |
| worstFrameMs | 158.4 (300) | 66.7 (83.4) | -58% |
| medianFrameMs | 83.28 (99.95) | 45.85 (66.6) | -45% |
| droppedFrames | 1.5 (3) | 0 (3) | -100% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 22.5 (38) | 6 (8) | -73% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 444 (1024) | 376 (472) | -15% |
| settleMs | 1435.8 (1793.4) | 1121.4 (1239.8) | -22% |
| settleGridMs |  | 73.2 (106.4) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3.5 (5) | 5 (10) | 43% |
| worstFrameMs | 449.95 (633.3) | 233.4 (300) | -48% |
| medianFrameMs | 175 (366.6) | 116.7 (116.75) | -33% |
| droppedFrames | 2 (4) | 2 (6) | 0% |
| imageRequests | 0 (1) | 0 (0) | 0% |
| imageDecodes | 62 (70) | 8 (11) | -87% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 236 (304) | 192 (280) | -19% |
| settleMs | 945.5 (3054.3) | 1099.65 (3022.3) | 16% |
| settleGridMs |  | 14.95 (189.1) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (17) | 7.5 (11) | 150% |
| worstFrameMs | 500 (516.6) | 174.95 (266.7) | -65% |
| medianFrameMs | 166.65 (199.95) | 41.68 (50) | -75% |
| droppedFrames | 1.5 (11) | 7 (11) | 367% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 14 (16) | -56% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 18.5 (21) | 25.5 (28) | 38% |
| worstFrameMs | 216.7 (300) | 133.4 (166.7) | -38% |
| medianFrameMs | 150 (150) | 66.63 (66.7) | -56% |
| droppedFrames | 0 (1) | 7 (8) | new |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 115 (140) | 2 (3) | -98% |

## Page weight and caching

| Measure | Value |
|---|---|
| `dist/index.html`, gzipped | 24990 bytes (limit 30720) |
| First load, gzipped total over 11 requests | 260574 bytes (limit 266240) |
| Repeat visit, network requests before the grid appears | 0 |
| Offline reload shows the grid | yes |
| Before this work, `index.html` alone, gzipped | 129671 bytes |

First load files, gzipped:

- `/app.ac86adff.js`: 62378 bytes
- `/app.61775fb2.css`: 29754 bytes
- `/`: 24990 bytes
- `/fonts/inter-latin-600-normal.woff2`: 24452 bytes
- `/fonts/inter-latin-500-normal.woff2`: 24272 bytes
- `/fonts/inter-latin-400-normal.woff2`: 23664 bytes
- `/fonts/cormorant-garamond-latin-400-italic.woff2`: 23660 bytes
- `/fonts/cormorant-garamond-latin-600-normal.woff2`: 23396 bytes
- `/icons/glyph-atlas.85619065.webp`: 17746 bytes
- `/icons/manifest.v2.json`: 3779 bytes
- `/links.json`: 2483 bytes

## Icon assets

| File | Bytes | Gzipped |
|---|---|---|
| `icons/atlas.02b8d85c.webp` | 88436 | 88427 |
| `icons/glyph-atlas.85619065.webp` | 17746 | 17774 |
| `icons/glyphs.f3066055.svg` | 15092 | 5949 |
| `icons/manifest.json` | 13600 | 3093 |
| `icons/manifest.v2.json` | 25593 | 3779 |
| `icons/manifest.v2.schema.json` | 3207 | 841 |

The 64 v1 PNG files (583963 bytes) stay for one release and are not loaded when `manifest.v2.json` is available.
