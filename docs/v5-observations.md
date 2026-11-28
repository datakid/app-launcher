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

### Phase 5 outcome: motion continuity, one clock

Owner decisions on record (2026-11-24): delete the non-anchor variant-chip fallback (-270 B gz), retire `?motion=legacy` now instead of in Phase 7 (-127 B gz).

| Plan item | What shipped |
|---|---|
| 1 one clock | `tokens.css` owns every duration and curve used by script: `--lx-tab-*`, `--mo-*` (tab rail, view, palette, QR, crossfade, theme, Zen, boot, hover, travel, lift and scale), `--ease-exit` (now the old JS exit curve, `cubic-bezier(.4, 0, .7, .2)`, distinct from enter), `--ease-accel`, `--ease-xfade`. `motion.js` reads them from the computed style at load, on every motion preference change and when the theme is applied. No literal `cubic-bezier(`, `duration:` or millisecond value is left in `src/modules` and `qa:motion` now fails on one. The six dead duplicate keyframe blocks and the `ctxRise` keyframes are gone |
| 2 interruptible | tab indicator, palette morph (open, close and reopen), variant thumb, QR sheet and its thumb, Zen toggle (from the live View Transition rects), context menu and appearance menu retarget from their current computed state. `qa/rapid-switch.mjs` reverses each of the eight surfaces at 30, 50 and 80 percent, forward and after a reopen: 48 cases, 48 pass, worst jump 0 px. The Phase 4 build (main) fails 23 of 48, worst 95.31 px (palette), tab indicator 22.97 and 39.73 px, QR content and look menu items restart (60), Zen 15.77 px |
| 5 press feedback | a forced `:active` on 44 pressables in the grid, palette, QR dialog, context menu and appearance menu: every property that changes on press transitions in `--dur-tap`. Fixed: the bar kbd chip, the magnifier (its layout-layer duration lost to a 380 ms transition set later), the icon-view tile (90 ms literal), `.qr-close`, `.qr-action`, and the variant chip, whose opacity was not in its transition list and changed instantly. The five existing per-rule durations are merged into one rule |
| 6 `inherits: false` | rejected, measured (below) |
| 7 `?motion=legacy` | retired (owner), with its token block, the inline script line and the QA check; `qa/behaviour.mjs` now asserts that the default timings are read from the tokens and that changing a token reaches script after a motion preference change |

Not done, said plainly:
- Item 3, objects travel (tile FLIP between card, palette row, palette detail, context-menu header and QR dialog). Not done in Phase 5 for want of bytes; done in the Phase 7 follow-up below, once Phase 6 had freed 24 KB.
- Item 4, rows persisting in the palette, is delivered with the keyed view in Phase 6, as the plan says.

`inherits: false` on `--tx`, `--ty`, `--hov`, `--gx`, `--gy`, measured as an upper bound (the probe leaves the readers on descendants broken, so it can only look better than a real change could): desktop hover sweep on the bento view, 5 runs, 2-CPU software renderer. Elements restyled 59,237 with `inherits: true`, 61,993 with `false`; style recalculations 739 against 776; recalculation time 1,949 ms against 2,090 ms. It does not reduce the work even before paying for the readers, so the registrations stay `inherits: true`.

Proof: computed-style diff against the Phase 4 build (`qa/style-diff.mjs`, quick matrix, 29,432 elements, 0 structural differences). The only non-custom-property differences are `transition-property` on the variant chips (opacity added) and the context menu items (`all` to `opacity, translate`, from keyframes to transitions). The custom-property differences are the six `--lx-*-ms` variables removed, the new `--mo-*` tokens and `--ease-exit`. Screenshot diff, quick matrix, 40 shots, `--policy v5`: pass, largest image 24 pixels over the threshold, none strong. First load 266,237 B against 266,240 B.

Findings:
- F-P5a. Two surfaces animate layout-bound properties, against the plan's rule that only opacity, transform, translate and scale animate: the tab indicator animates `left` and `right`, and the palette morph animates `clip-path`. Both are as they were; making them continuous was the task here. Converting them to transform needs a decision because the pill stretch and the rounded clip would change look.
- F-P5b. Tab-switch exits used the enter curve; they now use `--ease-exit`. This is the only timing change in the phase (the duration is unchanged).
- F-P5c. Component CSS still holds about 100 literal durations and 3 literal curves outside `tokens.css` (`states.css`, `qr.css`). Script is clean; CSS is not, and they were left because a token per literal costs bytes with no behaviour change.
- F-P5d. The palette rows, the palette close button and the QR thumbs have no pressed state at all. Nothing was added.
- F-P5e. The QR entrance animations no longer require `[open]`, so reopening a dialog that is still fading out resumes it instead of restarting it.

### Phase 6A outcome: search audit (no engine change)

Bench on the real catalogue (`qa/search-bench.mjs --verbose`, 3,257 queries, 36 entries, 4 categories): top-1 96.5 percent, top-3 98.2, found 98.4. Junk and unrelated words returning something: 0 of 318. Speed on the bench: median 0.041 ms, p95 0.157 ms.

| Family | n | top-1 | top-3 | found |
|---|---|---|---|---|
| exact, joined, reversed, reversed joined, typo title (joined), parent + variant, layout swap, prefix, category + word | 63 to 252 each | 100 | 100 | 100 |
| typo title, typo title reversed, word starts | 63 to 252 | 98 to 98.4 | 100 | 100 |
| url, id, url typo | 72 to 360 | 97.1 to 99.2 | 100 | 100 |
| typo word | 1,109 | 93.6 | 95.1 | 95.5 |
| first letters | 63 | 87.3 | 96.8 | 98.4 |
| url fragment | 95 | 85.3 | 98.9 | 100 |

Weakest groups, all under 90 percent top-1: three-letter words with one typo (substitute, substitute the first letter, transpose: 0 percent each, n = 7; delete: 57.1 percent), first letters in Arabic (79.4, n = 34), two typos in a word of 5 to 7 letters (61.4) or 8 and more (73.1), url fragments in the middle of a host (82.1) and url fragments starting at the longest part (85.7). Category queries find every member of the tab, with first-12 precision between 42 and 100 percent.

Golden set: `qa/search-golden.json` holds 61 hand-written queries (prefixes, acronyms, half-typed Arabic with and without the article, mixed script, the wrong keyboard layout, pasted URLs, url fragments, version names, category names, typos); `qa/search-golden.mjs` checks that the top result is the expected app, variant or category. At the time of the audit 55 of 61 passed. The six failures:
- Five wrong-layout queries for short Arabic names typed on the English layout (`فلو`, `سيم`, `كوين`, `طرق`, `فوليو`): the raw query returns weak subsequence hits (tier 3), so the layout swap, which only runs when the raw query returns nothing, never happens, and the right entry is not first.
- `rio` for ROI, a transposition in a three-letter word: nothing is returned.

Latency per keystroke (every prefix of every golden query, 5 rounds after warm-up): real catalogue p50 0.022 ms, p95 0.052 ms, max 2.8 ms. The synthetic 5,000-entry catalogue (`qa/search.mjs`): warm median 3.28 ms, p95 9.91 ms (limits 6 and 12), cold median 4.47 ms, p95 9.73 ms; building the index takes 278 ms.

The golden set was not in `qa:search` at this point because it failed; it is added in 6D (see below). The owner's ten real queries are not in it yet.

### Phase 6 outcome: search improvements, palette seam, ratchet

Bytes first. Phase 5 left 3 B of headroom under the 266,240 B first-load budget, so nothing in Phase 6 would fit. The five first-load Latin fonts (Inter 400, 500, 600, Cormorant Garamond 400 italic and 600) were trimmed with `tools/subset-fonts.mjs`: the same declared `unicode-range`, only OpenType features nothing uses and glyphs outside that range removed. A pixel test rendered every covered codepoint, all 94 x 94 ASCII pairs (kerning), ligatures, tabular figures and small caps at 11 to 28 px on the old and new files: byte-identical screenshots for all five. Saving 25,044 B; first load went from 266,237 B to 241,259 B before the search work and is 241,963 B now (limit unchanged, 24,277 B of headroom). The budget was not raised.

Search (`src/search.js`), each change with failing tests first, one commit each, bench run in full after each:

| Change | Result |
|---|---|
| Layout-swapped results are used when the raw query only finds subsequence hits and the swapped reading's top hit is an exact title or keyword match (never host or url) | golden wrong-layout 5 of 10 to 10 of 10; bench identical. Two looser variants regressed the typo family (93.6 to 89.1 and three Arabic typos) and were dropped |
| Personal tie-break: recents and frequent only order hits whose score is exactly equal, after the title-token key; the palette passes them for every query length | score and tier sequence identical with and without recents (pinned for 15 queries); bench identical |
| Two typos allowed in 6 and 7 letter words, only when the token shares the first two letters and is within one letter of the query's length | typo word top-1 93.6 to 94.4; junk stays 0 of 318. Allowing it everywhere let `banana`, `bscfi` and `jzmdnl` through, so those are pinned as empty |
| Swapped neighbours in a 3-letter word (`rio` finds `roi`); narrowing is skipped for 3-letter queries so typing equals the cold result | typo word top-1 94.4 to 95.0; golden 61 of 61 |
| 1 and 2 letter ordering and highlight ranges: pinned, no engine change needed | no lower title tier outranks a higher one by more than 3 points, typing the second letter equals the cold result, ranges of every top-five golden hit are valid, swapped, typo and split highlights are pinned |

Bench after: top-1 97.0 (was 96.5), top-3 98.8 (was 98.2), found 99.0 (was 98.4); typo word 95.0 / 96.8 / 97.2 (was 93.6 / 95.1 / 95.5); no family moved down; junk 0 of 318. Latency per keystroke on the real catalogue: p50 0.041 ms, p95 0.118 ms (bench median 0.054 ms, p95 0.199 ms); the synthetic 5,000-entry limits still hold. Not changed because the bench gave no case to improve: Arabic article-less words already find their entry in the top three (30 of 30 plain, 30 of 30 with a typo), and Arabic first letters are ambiguous by nature (every title starts with the article).

Palette seam (6C): `palette/model.js` is plain data and imports nothing from the page: rows (headers and items) with the stable key `app.id` (variants already carry `parent::variant`), contiguous item indexes, match tier, field and highlight ranges, plus `pickActive` (first result after a new query, same app when the view is unchanged) and `needsTryPicks`. `view.js` builds DOM from it and keeps its keyed pool, so surviving rows keep their nodes. New: rows that survive a keystroke and moved slide from where they were (transform only, `--dur-micro`, `--ease-lux`, cancelled and measured from the visual position so back-to-back keystrokes stay continuous); the highlighted first row never slides, rows outside the list's viewport snap, reduced motion skips it. The detail pane tile stays at 56 px: a 72 px tile fit on windows at least 860 px tall but squeezed the facts block below that, and the owner preferred the original size, so the enlargement was removed again. New checks: `qa/palette-model.mjs` (20 checks, no browser), `qa/palette-rows.mjs` (13 checks: identity, slide, no travel for the highlight, continuity, settling, reduced motion).

Ratchet (6D): `qa:search` now runs `qa/search.mjs` (357 checks), `qa/search-golden.mjs` (69 queries, 69 pass, highlight ranges validated) and `qa/palette-model.mjs`; `qa/search-bench.mjs` floors are 96.7 / 98.5 / 98.7 (were 95.5 / 97.5 / 97.5). The owner's eight real queries (harve, alt, pail calc, critirial rubric, express plan, delel 460, paid 460, .vercel) are in the golden set as group `owner`; all eight already resolved to the intended app, so they are regression pins. `.vercel` is pinned as a host-field hit because every `.vercel.app` host matches it.

### Phase 7 outcome: consistency sweep, light direction, surfaces

Sweep (7.1). Literal times in transitions, animations and delays: 91 to 0 outside `tokens.css` (what remains is `0s`, `0ms` and `.01ms` defaults); literal `cubic-bezier()`: 3 to 0; literal 1px hairlines: 22 to 12 (the rest are inner rings of 4 to 16% alpha on chips, marks and the QR stage, left as material). `tokens.css` gained the `--t-18` to `--t-3600` scale for the fixed values that sit between the named durations, `--ease-qr`, `--ease-sweep`, `--hairline-faint` and `--hairline-ctl`. `qa/motion-lint.mjs` now fails on a literal time or curve in a stylesheet (custom property definitions and values of 0.01 ms or less are exempt), proven by planting four literals. Proof. The 110-job cascade diff of the sweep alone (tokens, curves, hairlines) compared 79,900 elements: 0 structural differences, 0 errors. Its first version showed that mapping hairlines to `--hairline` lowered the QR chip border in dark from 12% to 6.7%, so the chip keeps its exact value through a new `--hairline-ctl` token and the open-affordance ring keeps its literal. After all Phase 7 edits, 112 surface jobs (palette with a query, palette detail, context menu, QR dialog, appearance menu, zen bento and icons; four looks, both themes, English and Arabic) and the 30 grid jobs for Arabic and for the three views in English (142 jobs, 108,012 elements) show 0 structural differences and 0 errors. Every computed difference is one of these: the 31 new custom properties; a hairline that now takes the look's own tone, 0.5 to 2.5 points of alpha on the toast, the QR dialog, the tab rail and the context-menu header (Muted gets its warm brown, Mono pure black); and, in Arabic only, the mirrored sheen, palette action icon, context-menu head icon and watermark listed below. English computed styles of the card grid and every surface are otherwise unchanged.

Left as they are, with reasons (the plan says report and fix; these are not stragglers):

| Kind | Where | Why it stays |
|---|---|---|
| Radius literals, 33 | `50%` and `999px` circles and pills; `22%` and `30%` icon squircle ratios (card.css 105, looks.css 613, qr.css 104); 1 to 3 px indicator bars (card.css 406 to 419, chrome.css 323, qr.css 120, palette.css 290); 7 and 8 px on the 22 and 30 px palette action icons (palette.css 198, 206, 305, states.css 281); the 10 px skip link (base.css 11) | geometry that is proportional to a fixed-size element, not a surface; tying them to the Corners choice would change Soft and Crisp |
| Radius literals that are surfaces, 2 | chrome.css 175 (16 px) and layout.css 5 (8 px) | candidates for `--r-*` if the owner wants Soft and Crisp to move them; not changed without a screenshot decision |
| Shadow literals, 29 | rings of 4 to 28% alpha, contact shadows and the per-look materials in looks.css | bespoke per-look material; the elevation ladder tokens cover the surfaces (menus, dialogs, toast, palette, bar) |
| Dead fallback rims | card.css 90 to 91, chrome.css 84 to 85 (`@supports not (mask-composite: exclude)`) | deleted in the follow-up below, on the owner's answer |

Light direction (7.2). A probe loads the page in English and in Arabic with the same look, theme and view, reads the computed `box-shadow`, `background-image`, `filter`, `translate`, `transform`, `mask-image` and the pointer variables of every element and its `::before` and `::after`, mirrors the English value by rule (shadow x offset negated, gradient angle to 360 minus the angle, `at x%` to `100 - x%`, translate x negated, matrix tx negated) and compares it with the Arabic one. Symmetric gradients (90 degrees with palindromic stops) are skipped. Run over vivid, curated, muted and mono, light and dark, bento, list and icons, at rest and with a card hovered: about 550 directional values mirror correctly (card rim, aura, tile plate, tile rim lips, specular, long shadow, glyph shade and highlight copies, bar and pill rims, pointer glow). Found and fixed:

| Straggler | Fix |
|---|---|
| `.card-sheen::before` swept left to right at 115 degrees in both directions | `:root[dir="rtl"] .card-sheen { scale: -1 1 }` mirrors the band, its angle and its sweep |
| palette action icons used a literal `160deg` in Vivid, Curated and Mono | `var(--tile-ang, 160deg)`, the same token the tiles use (200 degrees in RTL) |
| the palette detail watermark: rotation `-8deg`, mask `200deg`, entrance keyframe `-3deg` | rotation and keyframe multiply by `--light-x`; the mask is `360deg - var(--tile-ang)` |

Not light, left alone: the app title and the h1 tone fade run at 135 degrees in both directions, so in Arabic the tinted tail sits at the start of the word; that follows reading direction, not the light, and changing it would restyle every Arabic title. Owner question below.

Surfaces against the elevation ladder (7.3). Screenshots and computed fills of the appearance menu, context menu, toast, confirm dialog, QR sheet, palette, bar and pill in four looks and both themes, and in Arabic for Vivid. In dark the menus, toast, palette and QR sheet are all on `--elev-3` (L .227) and the pill and bar on `--elev-2` (L .206), as the ladder says. The confirm dialog was the only surface off the ladder: it used `--bg`, which in dark is the ground (L .15), so the modal was darker than the menus under it. It now uses `light-dark(var(--bg), var(--elev-3))` (light unchanged). Focus rings are consistent: 2 px solid with 3 px offset on chrome (tabs, pill buttons, scope chips), 2 px with 2 px offset on card chips, inset on the card link, `currentColor` on dialog buttons; keycaps and chips take their radii from `--r-kbd`, `--r-chip` and `--r-chip-in` and their rings from the hairline tokens.

Screenshots against the Phase 0 baseline (7.6). `qa/visual-marks.mjs` on the Phase 0 build (main 6565676) and on this branch, both themes, English and Arabic, four looks, three corners; grid views (bento, list, icons) at 390, 1280 and 1707 px, plus at 1280 px Zen (bento, icons), the palette (query, detail), the QR dialog and the appearance and context menus: 544 pairs, 34 per look, theme and language, `qa/shot-diff.mjs --policy v5`, exact comparison. All 544 differ, as expected: v5 changed the dark ground, the icon tile and the palette. The annotated list, by the share of pixels that differ:

| Group | Frames | Pixels that differ | Cause |
|---|---|---|---|
| Dark grid views (Zen frames included), Vivid, Curated, Muted | 54 per look | 82 to 94% | Phase 3: the Ink ground, the elevation ladder and the removed dark bloom move the page background, so nearly the whole frame changes |
| Dark grid views, Mono | same | 8 to 22% (icons at 390 highest) | the background barely moves in Mono; what changes is the surfaces, rims and icon tiles (Phases 3 and 4) |
| Dark palette, QR dialog and menus | query, detail, QR dialog, appearance and context menu | query 49 to 50%, detail 98 to 99.5% (Mono 98%), dialog 90 to 93%, menu 18 to 93% | Phase 3 ground and surfaces, Phase 6 palette rows and detail tile; the query frame is half the screen because the palette panel covers the other half |
| Light grid views (Zen frames included) | 54 per look | 0.3 to 2.7%; icons at 390 px 6.4 to 7.8% | Phase 4: icon tiles, stacked relief, the new tile shape, concentrated on the tiles; icons at 390 have the most tiles per frame |
| Light palette, QR dialog and menus | query, detail, QR dialog, appearance and context menu | query 0.2 to 0.6%, detail 0.7 to 2.3%, dialog 0.5 to 0.6%, menu 0.9 to 1.1% | Phase 6: the detail tile and row model; the 56 px tile the owner kept is unchanged |
| Muted, light | all frames | 0.07 to 1.2% | the same causes; Muted tiles are low contrast |
| Arabic, both themes | 272 | the same ranges as English | the same causes |

Phase 7 on its own, measured: the Phase 7 starting build against this one on 32 frames (Arabic dark Vivid and English light Vivid, Balanced corners; every view and palette frame). Four frames are identical and ten differ only by 3 levels or less per channel, which the policy ignores. Sixteen have a few pixels above that (6,599 pixels over all 18 frames with differences; at most 0.009% of any frame; peak 80 levels in one frame, 50 in another, 25 or less elsewhere; one pixel above the strong limit of 64 in the whole set), which is the hairline tone and edge antialiasing. The remaining two frames are over the v5 limit: the Arabic palette query (0.27%) and palette detail (1.34%, peak 14, none strong), where the palette action icons and the watermark are now mirrored. That is the intended Phase 7 change. English frames at rest are unchanged to within hairline tone.

Check suite on the final build (7.6).

| check | result |
|---|---|
| `qa:comments`, `qa:css`, `qa:motion` | pass; motion lint checked 907 cards, 544 clips, 981 icon wrappers, 72 palette rows, 99 icon plates, 701 pill buttons, 101 bars, 505 rail items and 408 variant chips with 0 failing, and now also lints stylesheets |
| `qa:search`, `qa:search-bench` | pass, including the synthetic 5,000-entry catalogue that failed in the baseline on this machine; real catalogue median 0.042 ms, p95 0.141 ms |
| `qa:cards`, `qa:tiles` | pass; 440 tiles, minimum contrast ratio 3, 0 failing |
| `qa:load` | pass; first load 242,966 B gzipped against 266,240 (23,274 B headroom), page 27,151 B, 11 requests, 0 CDN icon requests |
| `qa:quick` | 90 of 90 on an idle machine, three runs in a row. Two earlier runs, the second right after a sandbox restart, failed one job each, always `viewport_icons_vivid_balanced_dark_en_360x640` ("1 icon label cut off"). The cause is not established: the same job, run alone five times each on this build and on the Phase 7 starting build (two on an idle machine, three under four busy loops), never reproduced it. The check measures label overflow 500 ms after load, so a font that arrives late on a cold start is the suspect |
| `qa:behaviour` and the six scripts chained after it, `qa:qr`, `qa:zen`, `qa:icons` | pass |
| `perf --assert` with `CI=1` | passes; `perf/RESULTS.md` regenerated from the same run |

One test was flaky and is fixed in `qa/behaviour.mjs`. "Changing a motion token reaches JS after a motion preference change" flipped the reduced-motion emulation and waited a fixed 150 ms. The page learns about the change from a media query event, which fires during the next rendering update; on this machine that sometimes took longer, the app still believed motion was reduced, took the instant path and created no ghost, and the test read `null`. It failed in repeated isolated runs on the Phase 7 starting build as well as on this one, so it was not a regression. The test now waits for three rendered frames after each emulation and polls up to 24 frames for the ghost animation; the assertion (333 ms) is unchanged. Eight of eight isolated runs pass, and so does the full suite.

### Phase 7 follow-up: the owner's answers

Dead fallback rims. The two `@supports not ((mask-composite: exclude) or (-webkit-mask-composite: xor))` blocks (4 lines each, `card.css` and `chrome.css`) are deleted. Computed-style diff of the build before and after, 40 jobs, 30,212 elements: 0 differences.

Accessibility overrides under every look. New `qa/a11y.mjs` (`npm run qa:a11y`, in `check`) runs four looks in both themes and checks four things: under `prefers-reduced-transparency` and forced colours the bar, palette (and its `::backdrop`), menus, toast, QR sheet, confirm dialog, pill and the scrim have no `backdrop-filter`; the card rim keeps `opacity` of at least .35 and list borders resolve to `--border`; forced colours hides the decorative layers and keeps `forced-color-adjust: none` on the glyph; reduced motion leaves no transition or animation above 0.011 ms except the palette row cursor fade. It found one real defect: the palette dialog's `::backdrop` kept its blur under reduced transparency and forced colours, and `a11y.css` now clears `.lx-bar`, `#lx-palette` and `#lx-palette::backdrop`. The first version of the probe passed vacuously, because the 2-CPU sandbox looks low-end and low-end already forces `backdrop-filter: none !important`; the probe now raises `hardwareConcurrency` and `deviceMemory` to 8 before it loads the page, and a mutated copy of the build (an `!important` blur on `.lx-bar`) makes it fail.

Objects travel (Phase 5 item 3). `motion.js` has two functions, `noteTile(el)` (remember the tile's box) and `travelTile(el, src)` (animate the destination tile from the remembered box, or from `src`, to its own place with `translate` and `scale` only, from the centre, over `--mo-tile`, 260 ms, `--ease-lux`). The animation ends at the identity, so no static frame changes. Call sites: the card to the context-menu header; the context-menu header to the QR dialog and to the palette detail ("Details"); the palette detail to the QR dialog; the card's own QR button and the keyboard shortcut to the QR dialog (the card tile as `src`). Nothing travels for the site QR, for the command QR, when a dialog that is still fading out is reopened, under reduced motion (duration 0) or when a tile has no box. First load went from 242,687 to 242,966 B gzipped (279 B, the plan's estimate was 400), against 266,240. `qa/rapid-switch.mjs`: 48 reversals, worst jump 0 px. Limit, said plainly: in the palette morph the dialog is itself moving when the tile starts, so the end points are exact and the path in between is approximate (the palette body only fades in after the first quarter of the open, so the start of the path is hidden).

F-P5a, evaluated and left as it is. The tab indicator's `left` and `right` stretch and the palette's `clip-path` cannot be written as `transform` without changing the look: a non-uniform `scaleX` squashes the rounded ends of the pill while it stretches (the ends would need a counter-scaled inner element), and a `clip-path` that rounds from 999 px to 20 px has no transform equivalent. Each moves one absolutely positioned box. If the owner wants the rule applied literally, the cheapest honest change is a pure translate of the indicator and a scale-and-fade of the palette panel, which is a different animation and needs a decision.

New entries (owner's request). Daftar became a version card with a second version, Materia (`https://meterial-tau.vercel.app/`, Arabic label ديوان), and the palette category holds a new tool, Store (متجر, `https://static-store-fr76.vercel.app/#/polars-desktop-demo`). The icons come from the owner's selection archive: `glyphs.fcda3aad.svg` (17,491 B, from 16,642 B) now holds `g-dafter--dafter`, `g-dafter--materia` and `g-store`; the manifest has the keys `dafter--dafter`, `dafter--materia` and `store`, hash `26a74e50`. The atlas was left untouched (a lossy re-encode degrades the existing cells and a lossless one is over its size cap), so the two new entries have `favicon: null` and use the sprite glyph at every size. Materia is marked `status: override` here: the archive flagged it `default`, which would make the whole Daftar group fall back to the Font Awesome icon. A new Harvest Studio run may flag it `default` again. Two test expectations moved with the data: the wrong-layout search check expects `dafter::dafter` (a version entry, like Quoin and Seam), and the Core row solver now balances 6+6 at 6 and 8 columns because Daftar is a plate (it was 6+5).

Not done: the Arabic mirror of the title fade (recommended against), and the real-hardware `perf:recalc` and `qa:smooth --timing` runs (they need a machine that is not this sandbox).

Open: the two surface radius literals, `chrome.css` 16 px (phone tab buttons) and `layout.css` 8 px (the focus ring), wait for the owner's pick from a side-by-side.

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
