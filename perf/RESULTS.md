# Results

Final values against `perf/baseline.json`, from `perf/out/latest.json`. The baseline run came from a one-core sandbox and the final run from a two-core sandbox, neither with a GPU (about 15 frames per second when idle), so the frame-time rows only show the direction of change and the two columns are not a like-for-like timing comparison. The CI run skips the timing targets for the same reason; run `npm run perf` on real hardware for absolute values. Each final cell is the median of 7 measured runs, with the worst run in brackets.

`settleGridMs` and `medianFrameMs` did not exist in the baseline run, so their baseline cells are empty. `settleMs` includes every finite animation on the page, including the hover and accent transitions that start when the pointer reaches the clicked control.

## mobile

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 112 (136) | 64 (80) | -43% |
| settleMs | 703.45 (730.3) | 678.7 (680.7) | -4% |
| settleGridMs |  | 678.7 (680.7) | n/a |
| readableMs |  |  | n/a |
| longTasks | 2 (4) | 0 (0) | -100% |
| worstFrameMs | 66.6 (66.7) | 33.4 (33.4) | -50% |
| medianFrameMs | 33.3 (33.4) | 16.7 (16.7) | -50% |
| droppedFrames | 2 (5) | 1 (3) | -50% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 4 (4) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 796 (904) | 584 (592) | -27% |
| settleMs | 3013.7 (3023.1) | 1514.2 (3001.8) | -50% |
| settleGridMs |  | 897.5 (901.9) | n/a |
| readableMs |  | 865.7 (901.9) | n/a |
| longTasks | 6 (10) | 4 (5) | -33% |
| worstFrameMs | 558.35 (633.3) | 450 (500) | -19% |
| medianFrameMs | 33.35 (216.65) | 16.7 (16.7) | -50% |
| droppedFrames | 7 (13) | 4 (5) | -43% |
| imageRequests | 6 (8) | 0 (0) | -100% |
| imageDecodes | 70 (81) | 6 (9) | -91% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 488 (568) | 280 (336) | -43% |
| settleMs | 619.45 (705.5) | 382.8 (687.1) | -38% |
| settleGridMs |  | 382.8 (687.1) | n/a |
| readableMs | 22.05 (215) | 3.8 (216.1) | -83% |
| longTasks | 2 (3) | 1 (1) | -50% |
| worstFrameMs | 250 (333.4) | 150 (283.3) | -40% |
| medianFrameMs | 70.83 (116.6) | 16.7 (16.7) | -76% |
| droppedFrames | 1 (2) | 4 (4) | 300% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 23 (26) | 4 (10) | -83% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 1104 (1208) | 536 (536) | -51% |
| settleMs | 1861.8 (1984) | 1333.5 (1338.2) | -28% |
| settleGridMs |  | 4.9 (315.4) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (7) | 5 (5) | 11% |
| worstFrameMs | 533.3 (583.4) | 416.6 (433.3) | -22% |
| medianFrameMs | 137.42 (258.35) | 33.4 (33.4) | -76% |
| droppedFrames | 2.5 (4) | 4 (8) | 60% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 52 (54) | 6 (6) | -88% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 216 (376) | 176 (208) | -19% |
| settleMs | 1193.9 (3023.9) | 659.3 (3005.8) | -45% |
| settleGridMs |  | 9.3 (224) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (8) | 4 (7) | 33% |
| worstFrameMs | 483.35 (633.3) | 233.3 (266.6) | -52% |
| medianFrameMs | 183.35 (350) | 50 (83.3) | -73% |
| droppedFrames | 1 (9) | 2 (11) | 100% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 10 (14) | -69% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 10 (24) | 0 (0) | -100% |
| worstFrameMs | 58.35 (66.7) | 33.2 (33.3) | -43% |
| medianFrameMs | 24.95 (33.3) | 16.7 (16.7) | -33% |
| droppedFrames | 24 (38) | 1 (1) | -96% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 0 (0) | 0 (0) | 0% |

## desktop

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 452 (480) | 176 (216) | -61% |
| settleMs | 1008.7 (1157.5) | 743.6 (768.6) | -26% |
| settleGridMs |  | 743.6 (768.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (6) | 7 (8) | 56% |
| worstFrameMs | 241.65 (416.6) | 116.7 (116.7) | -52% |
| medianFrameMs | 141.68 (166.7) | 66.6 (66.7) | -53% |
| droppedFrames | 1 (1) | 1 (3) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 31 (40) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 652 (696) | 304 (352) | -53% |
| settleMs | 3135.6 (3278.7) | 1203.4 (3017) | -62% |
| settleGridMs |  | 500.4 (570.1) | n/a |
| readableMs | 1074.45 (1266.8) | 291.7 (300.4) | -73% |
| longTasks | 8 (9) | 6 (12) | -25% |
| worstFrameMs | 691.65 (866.6) | 200 (216.7) | -71% |
| medianFrameMs | 295.82 (358.35) | 49.9 (50) | -83% |
| droppedFrames | 2 (3) | 5 (12) | 150% |
| imageRequests | 6.5 (8) | 0 (0) | -100% |
| imageDecodes | 64 (75) | 8 (10) | -87% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 304 (456) | 152 (184) | -50% |
| settleMs | 1073 (1211.4) | 383 (433.8) | -64% |
| settleGridMs |  | 383 (433.8) | n/a |
| readableMs | 545.35 (700) | 249.6 (267.1) | -54% |
| longTasks | 9 (11) | 1 (2) | -89% |
| worstFrameMs | 158.4 (300) | 66.6 (83.3) | -58% |
| medianFrameMs | 83.28 (99.95) | 33.3 (50) | -60% |
| droppedFrames | 1.5 (3) | 2 (3) | 33% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 22.5 (38) | 6 (7) | -73% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 444 (1024) | 336 (408) | -24% |
| settleMs | 1435.8 (1793.4) | 1066.9 (1168.9) | -26% |
| settleGridMs |  | 152.3 (214.5) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3.5 (5) | 7 (8) | 100% |
| worstFrameMs | 449.95 (633.3) | 149.9 (166.7) | -67% |
| medianFrameMs | 175 (366.6) | 116.7 (116.7) | -33% |
| droppedFrames | 2 (4) | 0 (0) | -100% |
| imageRequests | 0 (1) | 0 (0) | 0% |
| imageDecodes | 62 (70) | 9 (10) | -85% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 236 (304) | 184 (240) | -22% |
| settleMs | 945.5 (3054.3) | 539 (3032.9) | -43% |
| settleGridMs |  | 16.4 (37.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (17) | 5 (7) | 67% |
| worstFrameMs | 500 (516.6) | 183.4 (216.7) | -63% |
| medianFrameMs | 166.65 (199.95) | 66.7 (75.05) | -60% |
| droppedFrames | 1.5 (11) | 2 (13) | 33% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 12 (16) | -62% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 18.5 (21) | 26 (31) | 41% |
| worstFrameMs | 216.7 (300) | 133.3 (166.7) | -38% |
| medianFrameMs | 150 (150) | 66.7 (66.7) | -56% |
| droppedFrames | 0 (1) | 5 (6) | new |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 115 (140) | 2 (3) | -98% |

## Page weight and caching

| Measure | Value |
|---|---|
| `dist/index.html`, gzipped | 26777 bytes (limit 30720) |
| First load, gzipped total over 11 requests | 242117 bytes (limit 266240) |
| Repeat visit, network requests before the grid appears | 0 |
| Offline reload shows the grid | yes |
| Before this work, `index.html` alone, gzipped | 129671 bytes |

First load files, gzipped:

- `/app.680da759.js`: 67298 bytes
- `/app.e0a82cf3.css`: 29578 bytes
- `/`: 26777 bytes
- `/fonts/cormorant-garamond-latin-400-italic.woff2`: 20252 bytes
- `/fonts/cormorant-garamond-latin-600-normal.woff2`: 19772 bytes
- `/fonts/inter-latin-600-normal.woff2`: 18332 bytes
- `/fonts/inter-latin-500-normal.woff2`: 18280 bytes
- `/fonts/inter-latin-400-normal.woff2`: 17764 bytes
- `/icons/glyph-atlas.85619065.webp`: 17746 bytes
- `/icons/manifest.v2.json`: 3805 bytes
- `/links.json`: 2513 bytes

## Icon assets

| File | Bytes | Gzipped |
|---|---|---|
| `icons/atlas.02b8d85c.webp` | 88436 | 88427 |
| `icons/glyph-atlas.85619065.webp` | 17746 | 17774 |
| `icons/glyphs.ee2319a6.svg` | 16642 | 6676 |
| `icons/manifest.json` | 13600 | 3093 |
| `icons/manifest.v2.json` | 26178 | 3987 |
| `icons/manifest.v2.schema.json` | 3207 | 841 |

The 64 v1 PNG files (583963 bytes) stay for one release and are not loaded when `manifest.v2.json` is available.
