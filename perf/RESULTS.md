# Results

Final values against `perf/baseline.json`, from `perf/out/latest.json`. The baseline run came from a one-core sandbox and the final run from a two-core sandbox, neither with a GPU (about 15 frames per second when idle), so the frame-time rows only show the direction of change and the two columns are not a like-for-like timing comparison. The CI run skips the timing targets for the same reason; run `npm run perf` on real hardware for absolute values. Each final cell is the median of 7 measured runs, with the worst run in brackets.

`settleGridMs` and `medianFrameMs` did not exist in the baseline run, so their baseline cells are empty. `settleMs` includes every finite animation on the page, including the hover and accent transitions that start when the pointer reaches the clicked control.

## mobile

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 112 (136) | 56 (56) | -50% |
| settleMs | 703.45 (730.3) | 675.1 (678.9) | -4% |
| settleGridMs |  | 675.1 (678.9) | n/a |
| readableMs |  |  | n/a |
| longTasks | 2 (4) | 0 (0) | -100% |
| worstFrameMs | 66.6 (66.7) | 33.3 (33.3) | -50% |
| medianFrameMs | 33.3 (33.4) | 16.7 (16.7) | -50% |
| droppedFrames | 2 (5) | 1 (1) | -50% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 4 (4) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 796 (904) | 592 (704) | -26% |
| settleMs | 3013.7 (3023.1) | 1385.7 (3006) | -54% |
| settleGridMs |  | 935.7 (1006.1) | n/a |
| readableMs |  | 970.9 (1006.1) | n/a |
| longTasks | 6 (10) | 4 (6) | -33% |
| worstFrameMs | 558.35 (633.3) | 500 (533.4) | -10% |
| medianFrameMs | 33.35 (216.65) | 16.7 (16.7) | -50% |
| droppedFrames | 7 (13) | 6 (6) | -14% |
| imageRequests | 6 (8) | 0 (0) | -100% |
| imageDecodes | 70 (81) | 6 (9) | -91% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 488 (568) | 472 (544) | -3% |
| settleMs | 619.45 (705.5) | 603.9 (900.4) | -3% |
| settleGridMs |  | 603.9 (900.4) | n/a |
| readableMs | 22.05 (215) | 4 (15.7) | -82% |
| longTasks | 2 (3) | 1 (1) | -50% |
| worstFrameMs | 250 (333.4) | 400 (533.3) | 60% |
| medianFrameMs | 70.83 (116.6) | 16.7 (33.3) | -76% |
| droppedFrames | 1 (2) | 3 (5) | 200% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 23 (26) | 4 (9) | -83% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 1104 (1208) | 552 (576) | -50% |
| settleMs | 1861.8 (1984) | 1379.3 (1385.7) | -26% |
| settleGridMs |  | 17.1 (446) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (7) | 4 (5) | -11% |
| worstFrameMs | 533.3 (583.4) | 333.2 (466.7) | -38% |
| medianFrameMs | 137.42 (258.35) | 49.9 (58.35) | -64% |
| droppedFrames | 2.5 (4) | 4 (5) | 60% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 52 (54) | 7 (7) | -87% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 216 (376) | 272 (304) | 26% |
| settleMs | 1193.9 (3023.9) | 749.4 (3002.4) | -37% |
| settleGridMs |  | 7.1 (332.8) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (8) | 2 (7) | -33% |
| worstFrameMs | 483.35 (633.3) | 333.3 (516.6) | -31% |
| medianFrameMs | 183.35 (350) | 66.6 (83.3) | -64% |
| droppedFrames | 1 (9) | 2 (10) | 100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 8 (12) | -75% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 10 (24) | 0 (0) | -100% |
| worstFrameMs | 58.35 (66.7) | 16.8 (16.8) | -71% |
| medianFrameMs | 24.95 (33.3) | 16.7 (16.7) | -33% |
| droppedFrames | 24 (38) | 0 (0) | -100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 0 (0) | 0 (0) | 0% |

## desktop

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 452 (480) | 184 (224) | -59% |
| settleMs | 1008.7 (1157.5) | 787.7 (805) | -22% |
| settleGridMs |  | 787.7 (805) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (6) | 7 (8) | 56% |
| worstFrameMs | 241.65 (416.6) | 150 (150) | -38% |
| medianFrameMs | 141.68 (166.7) | 83.3 (83.4) | -41% |
| droppedFrames | 1 (1) | 1 (1) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 31 (40) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 652 (696) | 408 (416) | -37% |
| settleMs | 3135.6 (3278.7) | 1257.9 (3018.3) | -60% |
| settleGridMs |  | 591.2 (751.8) | n/a |
| readableMs | 1074.45 (1266.8) | 385.9 (418.4) | -64% |
| longTasks | 8 (9) | 8 (13) | 0% |
| worstFrameMs | 691.65 (866.6) | 216.7 (300.1) | -69% |
| medianFrameMs | 295.82 (358.35) | 66.6 (66.7) | -77% |
| droppedFrames | 2 (3) | 4 (5) | 100% |
| imageRequests | 6.5 (8) | 0 (0) | -100% |
| imageDecodes | 64 (75) | 8 (12) | -87% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 304 (456) | 144 (200) | -53% |
| settleMs | 1073 (1211.4) | 430.6 (433.2) | -60% |
| settleGridMs |  | 430.6 (433.2) | n/a |
| readableMs | 545.35 (700) | 266.5 (314) | -51% |
| longTasks | 9 (11) | 2 (4) | -78% |
| worstFrameMs | 158.4 (300) | 83.3 (83.3) | -47% |
| medianFrameMs | 83.28 (99.95) | 58.3 (66.5) | -30% |
| droppedFrames | 1.5 (3) | 0 (2) | -100% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 22.5 (38) | 6 (8) | -73% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 444 (1024) | 528 (592) | 19% |
| settleMs | 1435.8 (1793.4) | 1288 (1333.2) | -10% |
| settleGridMs |  | 204.6 (216.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3.5 (5) | 7 (7) | 100% |
| worstFrameMs | 449.95 (633.3) | 200 (233.3) | -56% |
| medianFrameMs | 175 (366.6) | 133.3 (166.8) | -24% |
| droppedFrames | 2 (4) | 1 (2) | -50% |
| imageRequests | 0 (1) | 0 (0) | 0% |
| imageDecodes | 62 (70) | 9 (11) | -85% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 236 (304) | 232 (232) | -2% |
| settleMs | 945.5 (3054.3) | 655.4 (3029.3) | -31% |
| settleGridMs |  | 38.7 (222.1) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (17) | 5 (10) | 67% |
| worstFrameMs | 500 (516.6) | 183.3 (183.4) | -63% |
| medianFrameMs | 166.65 (199.95) | 66.6 (116.7) | -60% |
| droppedFrames | 1.5 (11) | 3 (14) | 100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 12 (14) | -62% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 18.5 (21) | 26 (28) | 41% |
| worstFrameMs | 216.7 (300) | 133.4 (166.6) | -38% |
| medianFrameMs | 150 (150) | 66.65 (66.8) | -56% |
| droppedFrames | 0 (1) | 6 (6) | new |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 115 (140) | 2 (3) | -98% |

## Page weight and caching

| Measure | Value |
|---|---|
| `dist/index.html`, gzipped | 27151 bytes (limit 30720) |
| First load, gzipped total over 11 requests | 242966 bytes (limit 266240) |
| Repeat visit, network requests before the grid appears | 0 |
| Offline reload shows the grid | yes |
| Before this work, `index.html` alone, gzipped | 129671 bytes |

First load files, gzipped:

- `/app.10f8d28b.js`: 67570 bytes
- `/app.01ecf393.css`: 29472 bytes
- `/`: 27151 bytes
- `/fonts/cormorant-garamond-latin-400-italic.woff2`: 20252 bytes
- `/fonts/cormorant-garamond-latin-600-normal.woff2`: 19772 bytes
- `/fonts/inter-latin-600-normal.woff2`: 18332 bytes
- `/fonts/inter-latin-500-normal.woff2`: 18280 bytes
- `/fonts/inter-latin-400-normal.woff2`: 17764 bytes
- `/icons/glyph-atlas.85619065.webp`: 17746 bytes
- `/icons/manifest.v2.json`: 4017 bytes
- `/links.json`: 2610 bytes

## Icon assets

| File | Bytes | Gzipped |
|---|---|---|
| `icons/atlas.02b8d85c.webp` | 88436 | 88427 |
| `icons/glyph-atlas.85619065.webp` | 17746 | 17774 |
| `icons/glyphs.fcda3aad.svg` | 17491 | 6980 |
| `icons/manifest.json` | 13600 | 3093 |
| `icons/manifest.v2.json` | 27552 | 4210 |
| `icons/manifest.v2.schema.json` | 3207 | 841 |

The 64 v1 PNG files (583963 bytes) stay for one release and are not loaded when `manifest.v2.json` is available.
