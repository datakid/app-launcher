# Results

Final values against `perf/baseline.json`, from `perf/out/latest.json`. Both runs are in the same sandbox (one CPU core, no GPU, about 15 frames per second when idle), so the frame-time rows only show the direction of change. The CI run skips the timing targets for the same reason; run `npm run perf` on real hardware for absolute values. Each cell is the median of 6 measured runs, with the worst run in brackets.

`settleGridMs` and `medianFrameMs` did not exist in the baseline run, so their baseline cells are empty. `settleMs` includes every finite animation on the page, including the hover and accent transitions that start when the pointer reaches the clicked control.

## mobile

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 112 (136) | 104 (144) | -7% |
| settleMs | 703.45 (730.3) | 708.4 (737.8) | 1% |
| settleGridMs |  | 708.4 (737.8) | n/a |
| readableMs |  |  | n/a |
| longTasks | 2 (4) | 1 (2) | -50% |
| worstFrameMs | 66.6 (66.7) | 41.7 (66.6) | -37% |
| medianFrameMs | 33.3 (33.4) | 16.7 (33.2) | -50% |
| droppedFrames | 2 (5) | 9.5 (13) | 375% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 4 (4) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 796 (904) | 724 (856) | -9% |
| settleMs | 3013.7 (3023.1) | 3003.1 (3013.4) | 0% |
| settleGridMs |  | 1108.1 (1234.6) | n/a |
| readableMs |  |  | n/a |
| longTasks | 6 (10) | 5 (6) | -17% |
| worstFrameMs | 558.35 (633.3) | 375.05 (450) | -33% |
| medianFrameMs | 33.35 (216.65) | 16.7 (41.7) | -50% |
| droppedFrames | 7 (13) | 18.5 (22) | 164% |
| imageRequests | 6 (8) | 0 (0) | -100% |
| imageDecodes | 70 (81) | 10.5 (12) | -85% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 488 (568) | 404 (544) | -17% |
| settleMs | 619.45 (705.5) | 494.2 (666.8) | -20% |
| settleGridMs |  | 494.2 (666.8) | n/a |
| readableMs | 22.05 (215) | 88.8 (270.7) | 303% |
| longTasks | 2 (3) | 2 (3) | 0% |
| worstFrameMs | 250 (333.4) | 158.35 (266.6) | -37% |
| medianFrameMs | 70.83 (116.6) | 41.7 (66.6) | -41% |
| droppedFrames | 1 (2) | 2 (3) | 100% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 23 (26) | 3 (4) | -87% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 1104 (1208) | 928 (952) | -16% |
| settleMs | 1861.8 (1984) | 1662.95 (1717.8) | -11% |
| settleGridMs |  | 50.55 (833.9) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (7) | 6 (9) | 33% |
| worstFrameMs | 533.3 (583.4) | 400 (433.3) | -25% |
| medianFrameMs | 137.42 (258.35) | 116.75 (274.95) | -15% |
| droppedFrames | 2.5 (4) | 2 (3) | -20% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 52 (54) | 11 (13) | -79% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 216 (376) | 172 (216) | -20% |
| settleMs | 1193.9 (3023.9) | 822.25 (3020.3) | -31% |
| settleGridMs |  | 7.1 (26.3) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (8) | 2 (7) | -33% |
| worstFrameMs | 483.35 (633.3) | 333.3 (350) | -31% |
| medianFrameMs | 183.35 (350) | 150 (233.35) | -18% |
| droppedFrames | 1 (9) | 1 (12) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 4 (8) | -87% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 10 (24) | 0 (0) | -100% |
| worstFrameMs | 58.35 (66.7) | 33.4 (50) | -43% |
| medianFrameMs | 24.95 (33.3) | 16.7 (16.7) | -33% |
| droppedFrames | 24 (38) | 26 (42) | 8% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 0 (0) | 0 (0) | 0% |

## desktop

### versionSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 452 (480) | 440 (472) | -3% |
| settleMs | 1008.7 (1157.5) | 1032.85 (1098.9) | 2% |
| settleGridMs |  | 1032.85 (1098.9) | n/a |
| readableMs |  |  | n/a |
| longTasks | 4.5 (6) | 5 (6) | 11% |
| worstFrameMs | 241.65 (416.6) | 274.95 (399.9) | 14% |
| medianFrameMs | 141.68 (166.7) | 145.85 (166.6) | 3% |
| droppedFrames | 1 (1) | 1 (2) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 31 (40) | 0 (0) | -100% |

### tabSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 652 (696) | 496 (720) | -24% |
| settleMs | 3135.6 (3278.7) | 3179.05 (3360.1) | 1% |
| settleGridMs |  | 1462.4 (1641.4) | n/a |
| readableMs | 1074.45 (1266.8) | 1387 (1641.4) | 29% |
| longTasks | 8 (9) | 9.5 (13) | 19% |
| worstFrameMs | 691.65 (866.6) | 966.65 (1033.3) | 40% |
| medianFrameMs | 295.82 (358.35) | 208.25 (308.3) | -30% |
| droppedFrames | 2 (3) | 1 (3) | -50% |
| imageRequests | 6.5 (8) | 0 (0) | -100% |
| imageDecodes | 64 (75) | 10 (26) | -84% |

### viewSwitch

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 304 (456) | 204 (304) | -33% |
| settleMs | 1073 (1211.4) | 455.3 (589.1) | -58% |
| settleGridMs |  | 455.3 (589.1) | n/a |
| readableMs | 545.35 (700) | 287.4 (355.8) | -47% |
| longTasks | 9 (11) | 3 (3) | -67% |
| worstFrameMs | 158.4 (300) | 91.65 (200) | -42% |
| medianFrameMs | 83.28 (99.95) | 66.6 (66.7) | -20% |
| droppedFrames | 1.5 (3) | 0.5 (2) | -67% |
| imageRequests | 0 (3) | 0 (0) | 0% |
| imageDecodes | 22.5 (38) | 4 (5) | -82% |

### paletteOpen

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 444 (1024) | 544 (752) | 23% |
| settleMs | 1435.8 (1793.4) | 1426.2 (1608) | -1% |
| settleGridMs |  | 93.1 (129.1) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3.5 (5) | 3.5 (4) | 0% |
| worstFrameMs | 449.95 (633.3) | 491.6 (533.4) | 9% |
| medianFrameMs | 175 (366.6) | 229.15 (350.05) | 31% |
| droppedFrames | 2 (4) | 1.5 (2) | -25% |
| imageRequests | 0 (1) | 0 (0) | 0% |
| imageDecodes | 62 (70) | 12.5 (14) | -80% |

### colorsChange

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs | 236 (304) | 216 (272) | -8% |
| settleMs | 945.5 (3054.3) | 834.85 (3048.9) | -12% |
| settleGridMs |  | 203.6 (250.5) | n/a |
| readableMs |  |  | n/a |
| longTasks | 3 (17) | 2 (17) | -33% |
| worstFrameMs | 500 (516.6) | 458.3 (483.3) | -8% |
| medianFrameMs | 166.65 (199.95) | 108.3 (150) | -35% |
| droppedFrames | 1.5 (11) | 1.5 (9) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 32 (64) | 4 (8) | -87% |

### pointerSweep

| Metric | Baseline | Final | Change |
|---|---|---|---|
| interactionMs |  |  | n/a |
| settleMs |  |  | n/a |
| settleGridMs |  |  | n/a |
| readableMs |  |  | n/a |
| longTasks | 18.5 (21) | 20.5 (21) | 11% |
| worstFrameMs | 216.7 (300) | 183.3 (266.7) | -15% |
| medianFrameMs | 150 (150) | 133.35 (133.4) | -11% |
| droppedFrames | 0 (1) | 0 (1) | 0% |
| imageRequests | 0 (0) | 0 (0) | 0% |
| imageDecodes | 115 (140) | 46 (48) | -60% |

## Page weight and caching

| Measure | Value |
|---|---|
| `dist/index.html`, gzipped | 36498 bytes (limit 61440) |
| First load, gzipped total over 11 requests | 252179 bytes (limit 256000) |
| Repeat visit, network requests before the grid appears | 0 |
| Offline reload shows the grid | yes |
| Before this work, `index.html` alone, gzipped | 129671 bytes |

First load files, gzipped:

- `/app.b1ebc47c.js`: 48255 bytes
- `/`: 36498 bytes
- `/app.626c5094.css`: 33809 bytes
- `/fonts/inter-latin-600-normal.woff2`: 24452 bytes
- `/fonts/inter-latin-500-normal.woff2`: 24272 bytes
- `/fonts/inter-latin-400-normal.woff2`: 23664 bytes
- `/fonts/cormorant-garamond-latin-400-italic.woff2`: 23660 bytes
- `/fonts/cormorant-garamond-latin-600-normal.woff2`: 23396 bytes
- `/icons/glyph-atlas.2c29e8ec.webp`: 8958 bytes
- `/icons/manifest.v2.json`: 2892 bytes
- `/links.json`: 2323 bytes

## Icon assets

| File | Bytes | Gzipped |
|---|---|---|
| `icons/atlas.c2da9595.webp` | 90096 | 90062 |
| `icons/glyph-atlas.2c29e8ec.webp` | 8958 | 8981 |
| `icons/glyphs.a8f51f68.svg` | 17109 | 6915 |
| `icons/manifest.json` | 13600 | 3093 |
| `icons/manifest.v2.json` | 15237 | 2892 |
| `icons/manifest.v2.schema.json` | 2923 | 773 |

The 64 v1 PNG files (583963 bytes) stay for one release and are not loaded when `manifest.v2.json` is available.
