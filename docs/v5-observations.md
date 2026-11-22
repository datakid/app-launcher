# v5 Phase 0A: baseline and observations

Base: `main` at `6565676`. Build: `app.d7976814.css`, `app.ba7f98cc.js`, cache `lx-63f81a9e`. This file records what the baseline measured, what the plan said that the repository does not confirm, and what the later phases need to know. Nothing in `src/` changed in this phase.

## 1. What this phase adds

| file | purpose |
|---|---|
| `qa/matrix.mjs` | the shared capture matrix: looks, corners, themes, languages, views, widths, surfaces, and the steps that put a page in each state |
| `qa/visual-marks.mjs` | captures the matrix to PNG files plus `manifest.json` (sha256 of the decoded pixels) |
| `qa/shot-diff.mjs` | compares two captures; `--policy v5` is the pixel-identical gate |
| `qa/style-diff.mjs` | compares the computed style of every element of two builds, exactly |
| `perf/recalc.mjs` | one line: the settle step ignores scroll-driven animations (finding F5) |
| `qa/baseline.mjs` | `npm run qa:baseline -- <git ref>` builds a ref in a temporary worktree and captures the matrix from it |
| `qa/baseline/main-6565676.manifest.json` | pixel hashes of capture A of `main`; the two captures agree byte for byte on 149 of the 544 shots, so a hash only says "identical", never "different" |

The matrix is 544 shots: 2 themes x 2 languages x 4 looks x 3 corner styles x 3 views x 3 widths (390, 1280, 1707) for the grid, and 2 themes x 2 languages x 4 looks x 7 surfaces at 1280 (Zen in Bento and in Icons, the palette with a query, the palette detail pane, the context menu, the QR dialog, the appearance menu). The harness it replaces took 1280 px, English, balanced corners only, in a single run order.

Every shot checks that the page really reached the theme, look, corners, view, language, direction and Zen state that the job asked for, and the run fails if any shot did not, or if the shot count differs from the plan.

## 2. Determinism

Two captures of one build only agree if everything that varies is pinned. These were found, in this order, and each is handled in `qa/matrix.mjs`:

1. `Math.random` seeds the orb field (`OrbField.spawn`: orbit radius, speed, size and phase, `src/modules/orbs.js` 57 to 62). It is replaced by a seeded generator before any page script runs.
2. The orb bloom reads `performance.now()` even under reduced motion (finding F1). The orb clock is frozen to a fixed value while `render` runs.
3. The `?qr=` deep link races the glyph preload, so some captures showed the fallback bolt in the dialog header. The QR shot opens the dialog from the card chip instead.
4. The caret blinks in the palette input and a running input transition beats `!important`. Inputs get `transition: none` and `caret-color: transparent` for the capture.
5. Order dependence. The first baseline attempt passed its own A/B check and still depended on the shot before it: the pointer stayed where the previous job left it, so Zen and palette shots that followed the appearance-menu job showed a hover state on the look button, and the others did not. Each job now clears local and session storage and parks the pointer at the corner before loading. A 32-shot subset captured in a different order matches the full baseline within the policy (largest image: 112 pixels over 3 levels, no strong pixel).
6. Chromium flags `--force-color-profile=srgb --font-render-hinting=none --disable-lcd-text`. The `--deterministic-mode` flag stalls every capture here and is not used. Thread and compositor flags did not reduce the noise.

The browser is Chrome 153.0.8010.12 (headless shell, Playwright 1.56 build 1243, linked as build 1194 because the Playwright CDN is not reachable from this sandbox). The baseline is tied to that browser build: another build can render glyph edges and gradients differently, so a baseline is only valid against captures from the same build.

## 3. Noise floor and the pixel policy

Two full captures of `main` (A and B, 597 s and 581 s with two workers):

| measure | value |
|---|---|
| shots per run | 544, no state errors |
| identical by hash | 149 |
| differing by at least 1 level | 395 images, 2,223,693 pixels in total, almost all by 1 level |
| differing by more than 3 levels | 264 images, 4,431 pixels in total |
| most pixels over 3 levels in one image | 153 (`light-ar-curated-balanced-icons-390`) |
| largest single-pixel delta | 67, a few pixels along one icon edge row |
| most pixels over 64 levels in one image | 2 |

The differences are isolated antialiasing pixels on glyph and icon edges. Policy `v5` is derived from them:

- ignore a channel difference of 3 levels or less;
- fail an image with more than 300 pixels above that (twice the worst noise seen);
- fail an image with more than 16 pixels that differ by more than 64 levels (eight times the worst noise seen).

The first version of the last rule failed any single pixel above 64, set from one earlier pair of runs; the second pair contained a 67, so a lone pixel is not a usable signal and the rule counts pixels instead. The numbers are set from two runs of one environment. If a later phase meets a false failure, measure again before moving them.

Under the policy A against B has 0 failing images.

## 4. Sensitivity: what each gate catches

Five synthetic regressions were applied to a copy of `dist/` and compared with the baseline (screenshot gate on the five Vivid light shots of the quick matrix; style gate on the whole quick matrix, 40 jobs).

| change | screenshot gate | style gate (declarations that differ) |
|---|---|---|
| border alpha .06 to .08 | caught, 3 of 5 shots | caught, 413 |
| soft shadow alpha .05 to .07 | missed, 0 of 5 | caught, 386 |
| ink colour `#15130f` to `#1b1914` | caught, 5 of 5 | caught, 8,358 |
| chip height 28 px to 29 px | caught, 3 of 5 | caught, 490 |
| icon radius .28 to .29 | caught, 5 of 5 | caught, 569 |

A screenshot gate cannot see a change smaller than its noise floor, and a faint shadow is one. The style gate is exact: on two copies of the same build it reports 0 differences across 28,152 element records (about 700 elements per page, with `::before`, `::after`, `::placeholder`, `::backdrop` and every custom property on the root). Phase 1 should use both.

How the style gate stays exact: both builds are loaded with no pointer, so the spotlight and the pointer reveal never start; surfaces are opened with synthetic events rather than the mouse; running animations are finished before reading; property names are sorted before hashing, because Chrome lists computed properties in a different order from page to page; origins are normalised out of URLs; a difference is re-read for up to twelve rounds and is only reported when it holds. The quick matrix takes about 90 seconds on identical builds and several minutes when many elements differ; `--matrix full` is the whole 544 jobs.

## 5. Where the plan and the repository disagree

| item | what the plan says | what is there |
|---|---|---|
| companion brief | `docs/LINKEXPRESS_V5_BRIEF.md` | not in the repository, in any branch or in the history; this phase worked from the plan alone |
| baseline images | commit them outside `dist/`, or upload them as a CI artefact | one run is 380 MB, so they are not committed; the repository holds the hash manifest and `npm run qa:baseline -- 6565676` regenerates the images in about 10 minutes with the same browser build. The owner can ask for an upload of the images instead |
| dark ground (D7) | `#030406` | `:root` declares `#030406` (`src/app.css` 171) but `:root[data-palette="vivid"], :root[data-palette="curated"]` overrides it with `#050608` (2620), Mono uses `#060607` (2518) and Muted `#100e0c` (2145). The page `theme-color` meta is still set from `#030406` (`src/app.js` 2941) |
| light ground | not stated | Vivid and Curated light use `#f4f2ee`, the meta colour uses `#f3f1ec` |
| `npm run check` | green on every commit | not green in this sandbox: three synthetic search latency checks fail (see section 7). The limits are untouched |
| `npm run perf -- --assert` | run on real hardware | on a host without a GPU it only passes with `CI=1`, which skips the timing targets as `README.md` says. Without it the run reports hundreds of frame misses that say nothing about the app |

The earlier statement that `perf --assert` failed in this sandbox was an unset `CI`; with `CI=1` it passes (exit 0, 355 s).

## 6. The plan's observations D1 to D8

Checked against the source and the baseline captures, not against the live site (it is not reachable from this sandbox). Looking at a capture settles what is on screen; whether it looks right is the owner's decision.

| | claim | result |
|---|---|---|
| D1 | the orb field is randomised at load, with a different look on every visit | confirmed in code: `Math.random` in `OrbField.spawn` (2826 to 2831). Without pinning (random seed, orb clock and browser flags), two captures of `dark-en-vivid-balanced-bento-1280` differ in 17,832 pixels above 3 levels (1.5 percent of the image, largest delta 10); with pinning, 19 |
| D2 | a load bloom grows the orbs by up to 15 percent and decays over 7 seconds | confirmed: `bloom = max(0, 1 - (now - bloomStart) / 7000) * 0.15` (2890), canvas fade 1600 ms (`src/app.css` 2645). See F1 |
| D3 | the orb canvas is low resolution and the dark ground bands | code confirmed: canvas scale 0.35, device pixel ratio 1 (2796), orbs blended with `screen` in dark and `multiply` in light (2889), an overlay noise tile at opacity .05 on `.scrim::after`. The banding is not visible in the captures: the pixel value changes every 1.1 to 1.2 pixels on average down an empty column, the longest constant run is 43 pixels, and the dark ground only spans about 5 to 14 levels of 255. A gradient across so few levels is a risk on a real display; this machine cannot judge it |
| D4 | in dark mode the card fill barely separates from the ground | confirmed in code (`--surface: rgba(255,255,255,0.028)` in dark, line 172) and visible in `dark-en-vivid-balanced-bento-1280`: cards read through their hairline border and a faint lift; the light capture separates the cards with white fills and soft shadows |
| D5 | the pointer rim highlight is a fixed `.86` white | confirmed (`src/app.css` 809). There is no `--rim-k` token yet |
| D6 | text contrast is high | `#f6f5f2` on `#030406` is 18.8:1, on the effective Vivid and Curated ground `#050608` 18.6:1 |
| D7 | dark grounds differ by look | see section 5: the effective grounds are `#050608`, `#060607` and `#100e0c`, not one `#030406` |
| D8 | tile chroma is not a token | confirmed: no `--tile-c-k` exists. The tile contrast check passes: 432 tiles, none under 3, lowest 3.42 |

### Phase 3 outcome for D1 to D8

| | change | proof |
|---|---|---|
| D1 | `OrbField.spawn` draws from a seeded generator (mulberry32, seed 20260101), the same stream the capture harness pins, so every load gets one composition and light mode keeps the composition it was captured with | `qa/orb-seed.mjs`: two loads with different `Math.random` streams give identical orbs in dark and light at 1280 and 390 px; the check fails on the previous build |
| D2 | the load bloom is dropped in dark and kept in light (owner decision, 2026-11-21) | `qa/orb-seed.mjs`: dark canvas identical at 0.1 s and 60 s, light canvas larger at 0.1 s |
| D3 | `.scrim::after` reads `--grain-blend` and `--grain-o`; light keeps overlay at .06, dark uses plus-lighter at .2 | on an empty 790 px strip of the final dark ground the longest run of one value is 4 px with the grain and 7 px without it (the old build measured between 7 and 29 px depending on where its random orbs fell), and the grain lifts the mean by about 1 level |
| D4 | `--elev-2` and `--elev-3` (ground mixed with 6.6 and 9 percent white) and `--glass-2` and `--glass-3` for the live pill, bar, menu, toast and palette fills, `--surface` and `--surface-hover` as white-alpha lifts that keep the orb wash visible through the cards, `--rim-1` to `--rim-3` for the top edge highlights | overlays now sit above the cards instead of below them; the ladder follows each look's own `--bg` |
| D5 | `--rim-k` scales the pointer rim: 1 in light, .55 in dark | light computed styles unchanged |
| D6 | dark ink `#f6f5f2` becomes `#ecebe6` (title 16.5:1 on the new ground), muted ink alpha .5 becomes .52 (4.94:1, was 4.95:1), `--pal-ink-2` .42 becomes .46 | contrast computed from the tokens |
| D7 | one `--ground` token, `oklch(.15 .003 80)` (about `#0c0b0a`), used by all four looks in dark; the Muted vignette edge follows it; `theme-color` and the manifest use `#0c0b0a` | owner chose B on the A/B/C sheets |
| D8 | `--tile-c-k` multiplies the tile chroma in Vivid and Curated: 1 in light, .9 in dark | `qa:tiles`: 440 tiles, none under 3, lowest 3.43 |

Finding F-P3: `states.css` painted `.controls-pill`, `.lx-context-menu` and `.lx-toast` with `color-mix(in oklab, var(--bg) 92%, transparent)` in the last layer that sets a background colour, so the per-look `background` fills for those three in `chrome.css`, `menus.css` and `looks.css` never showed in either theme. They are deleted (owner approved deleting overridden declarations, 2026-11-21). Two of those rules also reset `background-image` to `none` for Curated and Mono menus, so that reset is kept as one rule.

### Phase 4 outcome: icon depth

Owner pick (2026-11-22, after the A/B/C sheets): A, stacked copies. B (inset bevel) and C (SVG lighting filter) were only prototypes in the scratch area and are not in the code.

| Plan item | What shipped |
|---|---|
| 3A tokens deferred from Phase 3 | `--light-x` (1, and -1 under `dir="rtl"`), `--relief-k`, `--cast-k`, `--bevel-k`, `--spec-o` in `tokens.css`, with dark values for the last three; `--press` for Muted and `--fall` for favicon tiles in `looks.css`. `--light-y` and `--sheen-o` were not added because nothing reads them |
| 4B glyph | stacked relief: shade and highlight `<use>` copies, offset in `em` so they scale with the glyph (menu head icon included); the old one-pixel glyph drop shadow is gone |
| 4B plate | `--plate-pass`: specular, falloff toward the bottom-end corner, bounce light along the bottom edge; used by every plate, by favicon tiles (softer, `--fall: 12%`) and by the context-menu head icon |
| 4B bevel and shadow | `--tile-rim-hi` and `--tile-rim-lo` are soft inset lips that follow the light direction; `--tile-long` is a longer tinted shadow; the ambient shadow shifts away from the light by `--light-x` |
| 4C looks | Vivid glazed (`--spec-o` 1), Curated satin (.18), Muted letterpress (`--press: -1`, no plate), Mono anodised (specular 0, light bevel 1.4) |
| 4C dark | cast .6, bevel .6, specular .45 |

Not done, said plainly: the optional pointer-driven specular drift. The two-plane glyph (one symbol in the catalogue) only gets a darker secondary plane; it has no shadow of its own, because both planes share the stacked copies, and no separate hover travel.

Bytes: the new tile CSS pushed the first load 48 bytes over its budget, so 23 declarations that a later layer already overrides were deleted (`card.css` 17, `layout.css` 4, `palette.css` 1, `states.css` 1). Computed-style diff of the build before and after the deletions: 0 differences on the 110 cascade jobs, the 40 world jobs and the state worlds. First load is 266,142 B against 266,240 B, 98 B of headroom.

Proof for the tile change: the full computed-style diff against the Phase 3 build changes only tile elements (plate and its pseudo-elements, glyph and its copies, tile badges, the menu head icon) plus new inherited tokens; no pixel more than 8 levels different outside the tile shadow footprint in 48 look, theme, language and view combinations; `qa:tiles` 440 tiles, lowest five 3.435, 3.437, 3.438, 3.439, 3.439 (before 3.434, 3.436, 3.437, 3.437, 3.437); 400 hover toggles cost 32.1 ms of style recalculation against 35.7 ms before, equal within noise.

## 7. Baseline of the existing checks

All run on `main` in this sandbox (2 vCPU, no GPU).

| check | result |
|---|---|
| `npm run build` | passes; critical 15,192 B, rest 167,154 B, script 200,895 B, page 85,614 B |
| `qa:load` | passes; first load 265,545 B gzipped against a limit of 266,240, so 695 B of headroom; page 25,431 B against 30,720; 11 requests; first contentful paint 228 ms |
| `qa:quick` | 90 of 90 |
| `qa:cards`, `qa:tiles`, `qa:zen`, `qa:icons`, `qa:motion` | pass (motion lint checked 907 cards and 544 clips with 0 failing) |
| `qa:behaviour`, `qa:qr` | pass |
| `qa:search` | three checks fail on the synthetic 5,000-entry catalogue: p95 13.322 ms against 12, cold median 6.032 against 6, cold p95 12.803 against 12. They failed the same way in three runs; the real-catalogue checks pass (median 0.053 ms, p95 0.183 ms). The limits were not changed. Nothing in this phase touches search |
| `perf --assert` with `CI=1` | passes |

## 8. Findings

- **F1. The bloom depends on how long the page has been alive, even under reduced motion.** With reduced motion the constructor sets `bloomStart = 0` and renders once, but `render` computes the bloom from `performance.now()`. The orb sizes in the one frame that is drawn therefore depend on how many milliseconds after navigation start the page rendered it: up to 15 percent larger on a fast load, none after 7 seconds. The capture harness freezes the clock to make it repeatable. If Phase 3 or 5 touches the bloom, fix this at the source: under reduced motion the bloom should be 0, and that is an owner decision because it changes what reduced-motion users see on load.
- **F2. Captures must not depend on the pointer.** The spotlight turns idle 2.2 seconds after the last pointer move (`performance.now() - lastMove > 2200`) and the card reveal runs a lerp after the pointer leaves, so a comparison made while a pointer is present depends on timing. In one test the reveal properties of a card were still at 0.9 after a `pointerleave` on one page and removed on the other. This was not traced further.
- **F3. The harness needs `window.bgAnim`.** The frozen orb clock attaches to the object that the app assigns to `window.bgAnim` and checks for it on every shot. The Phase 2 script split must keep that assignment, or `qa/matrix.mjs` must change in the same commit.
- **F4. The 695 byte first-load headroom.** The budget is tight. A phase that adds tokens or modules must find the bytes elsewhere in the same change.
- **F5. Phone list rows run a scroll-driven animation that never finishes.** `cardEnter` on `.app-card--row` uses a view timeline, so `document.getAnimations()` reports it as running for as long as the page can scroll. Any check that waits for "no running animation" must restrict itself to the document timeline (`a.timeline === document.timeline`), as `perf/recalc.mjs` now does; `qa/matrix.mjs` filters on a finite end time, which excludes it already.

## 9. For the next phases

- Phase 1 (CSS layers, pixel-identical): after each commit run `npm run build`, `node qa/visual-marks.mjs --site dist` then `node qa/shot-diff.mjs <baseline> <new> --policy v5`, and `node qa/style-diff.mjs <baseline dist> dist`. The baseline dist is built by `npm run qa:baseline` in a temporary worktree; build the same ref for the style gate with `git worktree add` and `npm run build`.
- The baseline is only valid for the browser build in section 2. Capture a new baseline with `npm run qa:baseline -- 6565676` if the browser changes.
- Expect `qa:search` to fail on this class of machine; do not read it as a regression unless the numbers move.

## 10. Questions for the owner

1. Should baseline images be uploaded somewhere (a release asset, for example) in addition to the hash manifest? One run is 380 MB.
2. Under reduced motion, should the load bloom be removed (F1)?
3. The effective dark ground in Vivid and Curated is `#050608`, not `#030406`. Phase 3 will pick the ground by screenshots. Should the page `theme-color` follow the effective ground?
4. `docs/LINKEXPRESS_V5_BRIEF.md` is missing. Is there a copy to add?

## 11. Reproducing

```
npm ci
npm run build
node qa/visual-marks.mjs --site dist --out /tmp/shots
npm run qa:baseline -- 6565676 --out /tmp/baseline
node qa/shot-diff.mjs /tmp/baseline /tmp/shots --policy v5 --json /tmp/diff.json
npm run qa:style -- <dist before> <dist after> --matrix quick
```

Set `PLAYWRIGHT_BROWSERS_PATH` to a Playwright browser folder that matches the installed Playwright version if the default download is not reachable.

## 12. Sandbox timings

Measured on `main` in this sandbox: 2 vCPU, no GPU, frames of 33 to 100 ms at 1x CPU in the smoothness runs. Frame and settle times therefore say nothing about real hardware and are kept only so that a later run in the same sandbox can be compared with them. The counts (style recalculations, layouts, requests) do not depend on the machine to the same degree. Real-hardware numbers need `npm run perf`, `npm run perf:recalc`, `npm run qa:smooth -- --timing` and `node qa/behaviour.mjs --timing` on a machine with a GPU.

### Style recalculation and layout (`perf:recalc`, median of 5 runs, 9 for desktop hover-bento; 1x CPU)

| profile | scenario | style recalcs | recalc ms | layouts | layout ms | script ms | task ms | elements restyled |
|---|---|---|---|---|---|---|---|---|
| desktop | hover-bento | 795 | 1591 | 101 | 124 | 70 | 2951 | 55683 |
| desktop | hover-list | 169 | 1900 | 139 | 70 | 87 | 3222 | 62177 |
| desktop | hover-icons | 357 | 474 | 31 | 13 | 57 | 1998 | 10781 |
| desktop | palette-cycles | 681 | 2260 | 378 | 216 | 284 | 7074 | 93200 |
| desktop | tab-switches | 1815 | 2658 | 234 | 190 | 389 | 7937 | 94650 |
| desktop | view-switches | 351 | 348 | 87 | 68 | 90 | 1481 | 12244 |
| desktop | look-cycle | 291 | 1034 | 45 | 22 | 116 | 2736 | 34016 |
| mobile | hover-bento | 6 | 0 | 0 | 0 | 19 | 177 | 0 |
| mobile | hover-list | 29 | 3 | 1 | 0 | 25 | 226 | 49 |
| mobile | hover-icons | 30 | 3 | 1 | 0 | 35 | 347 | 49 |
| mobile | palette-cycles | 789 | 1596 | 216 | 198 | 212 | 4986 | 72599 |
| mobile | tab-switches | 2206 | 2711 | 99 | 148 | 259 | 5494 | 78909 |
| mobile | view-switches | 197 | 194 | 52 | 42 | 54 | 796 | 3882 |
| mobile | look-cycle | 357 | 1772 | 57 | 39 | 74 | 2847 | 47184 |

The durations are in milliseconds over the whole scenario. The mobile hover scenarios do almost nothing because a touch profile has no hover, so their rows are close to idle. `tab-switches`, `palette-cycles` and `look-cycle` are the scenarios that carry style recalculation weight in both profiles.

### Interactions (`perf --assert`, `CI=1`)

| profile | interaction | interaction ms | settle ms | long tasks | worst frame ms | dropped frames | image requests |
|---|---|---|---|---|---|---|---|
| mobile | versionSwitch | 48 | 665.1 | 0 | 16.8 | 0 | 0 |
| mobile | tabSwitch | 352 | 1223.7 | 4 | 266.7 | 6 | 0 |
| mobile | viewSwitch | 208 | 329.8 | 1 | 150 | 2 | 0 |
| mobile | paletteOpen | 400 | 1249 | 4.5 | 308.3 | 5 | 0 |
| mobile | colorsChange | 144 | 1076.1 | 6 | 233.4 | 10 | 0 |
| mobile | pointerSweep | - | - | 0 | 16.8 | 0 | 0 |
| desktop | versionSwitch | 152 | 732.2 | 6 | 116.6 | 1 | 0 |
| desktop | tabSwitch | 216 | 1112.6 | 7 | 166.7 | 5 | 0 |
| desktop | viewSwitch | 112 | 371.5 | 0 | 50 | 3 | 0 |
| desktop | paletteOpen | 280 | 1084.2 | 9 | 133.3 | 0 | 0 |
| desktop | colorsChange | 160 | 958.6 | 6 | 133.3 | 7 | 0 |
| desktop | pointerSweep | - | - | 15 | 133.3 | 9 | 0 |

### Smoothness (`qa:smooth -- --timing`)

Limits are p95 18 ms (34 ms at 4x) and no long animation frame over 100 ms. All 18 rows exceed them here, as expected without a GPU; the run fails for that reason only.

| view | scenario | p50 ms 1x | p95 ms 1x | p50 ms 4x | p95 ms 4x |
|---|---|---|---|---|---|
| bento | hover-sweep | 83.4 | 150 | 183.3 | 316.7 |
| bento | palette-x10 | 100.1 | 183.3 | 216.7 | 516.7 |
| bento | tabs-x10 | 49.9 | 166.7 | 133.3 | 416.6 |
| list | hover-sweep | 50 | 83.3 | 116.7 | 200 |
| list | palette-x10 | 100 | 166.7 | 183.3 | 400 |
| list | tabs-x10 | 49.9 | 166.6 | 66.6 | 350 |
| icons | hover-sweep | 33.3 | 50 | 33.4 | 66.7 |
| icons | palette-x10 | 100 | 150 | 183.4 | 516.6 |
| icons | tabs-x10 | 33.3 | 116.7 | 49.9 | 316.6 |

### Behaviour with `--timing`

`node qa/behaviour.mjs --timing`: 45 checks pass, 1 fails: "20 version switches: no frame over 32 ms (desktop)", worst frame 67 ms. A 32 ms frame limit cannot hold on a machine that takes 33 to 100 ms to render a frame.

### Search quality by query family (`qa:search-bench -- --verbose`)

Top 1, top 3 and found are percentages of the n queries of each family on the real catalogue.

| family | n | top 1 | top 3 | found |
|---|---|---|---|---|
| exact | 140 | 100 | 100 | 100 |
| typo word | 1049 | 93.4 | 94.9 | 95.2 |
| typo title | 236 | 97.9 | 100 | 100 |
| typo title joined | 236 | 100 | 100 | 100 |
| typo title reversed | 236 | 97.9 | 100 | 100 |
| joined | 59 | 100 | 100 | 100 |
| reversed | 59 | 100 | 100 | 100 |
| reversed joined | 59 | 100 | 100 | 100 |
| word starts | 59 | 98.3 | 100 | 100 |
| first letters | 59 | 86.4 | 96.6 | 98.3 |
| parent + variant | 24 | 100 | 100 | 100 |
| url | 350 | 99.1 | 100 | 100 |
| url typo | 170 | 97.1 | 100 | 100 |
| url fragment | 93 | 84.9 | 98.9 | 100 |
| id | 70 | 97.1 | 100 | 100 |
| layout swap | 70 | 98.6 | 98.6 | 98.6 |
| prefix | 8 | 100 | 100 | 100 |
| category + word | 121 | 100 | 100 | 100 |
| ALL | 3098 | 96.4 | 98.2 | 98.3 |

Search speed over the 3,098 queries on the real catalogue: median 0.053 ms, p95 0.183 ms, max 7.856 ms. Junk queries that return something: 0 of 318.
