# Baseline

Phase 0 measurements and verified facts. Every later phase is compared against this file and `perf/baseline.json`.

DEPLOY_HOST: unknown

No `CNAME`, no `vercel.json`, no `netlify.toml`, and the README names no host. `https://github.com/datakid/app-launcher/settings/pages` needs a login and the GitHub API was rate limited from the sandbox. Ask the owner before Phase 4.

## Measurement environment

- Sandbox: 1 CPU core, no GPU. An idle page already runs at 50 to 67 ms per frame, so frame-time targets (17.2 ms, 20 ms, 32 ms) cannot be validated here. Use these numbers only for before/after comparison in the same environment, and re-run `npm run perf` on real hardware for absolute figures.
- Chromium 141 with Playwright 1.56.1. The sandbox cannot download the latest Chromium, so Playwright is pinned to the version that matches the preinstalled browser. `playwright` stays a root dev dependency.
- `navigator.hardwareConcurrency` is 1 in the sandbox, which would make `isLowEnd()` true. Perf runs override it to 8 cores and 8 GB so the full-effects path is measured. `node perf/measure.mjs --lowend` overrides to 2 and 2.
- Runs: 7 per interaction per profile, first discarded. `imageDecodes` comes from a second set of 7 traced runs so tracing overhead does not pollute the timing metrics.
- `interactionMs` is the Event Timing duration of the triggering event. Event Timing does not report durations under 16 ms, so a missing entry is recorded as 8.
- `settleMs` counts every running finite animation on the document timeline. Infinite-iteration animations and scroll-driven (non-document timeline) animations are excluded.
- `settleCoreMs` additionally excludes animations on `.badge-dot`, `.spotlight` and `h1` (the `newDot` pulse, the spotlight idle fade and the title shimmer). It is an extra metric and not part of the plan.
- `readableMs` is the first frame where the first `#appGrid .app-card` is a different element from the one at input time, or has been below opacity 0.6, and is at or above 0.6. It is n/a when neither happens (for example version switches, and the mobile tab switch where the first card element is reused).
- `pointerSweep` has no triggering Event Timing entry and no settle point, so those metrics are n/a. Its window is the 3000 ms sweep.

## Baseline numbers

### mobile (median / worst of 6 measured runs)

| Interaction | interactionMs | settleMs | settleCoreMs | readableMs | longTasks | worstFrameMs | medianFrameMs | droppedFrames | imageRequests | imageDecodes |
|---|---|---|---|---|---|---|---|---|---|---|
| versionSwitch | 112 / 136 | 703.45 / 730.3 | 703.45 / 730.3 | n/a | 2 / 4 | 66.6 / 66.7 | 33.3 / 33.4 | 2 / 5 | 0 / 0 | 4 / 4 |
| tabSwitch | 796 / 904 | 3013.7 / 3023.1 | 1781.5 / 1844.6 | n/a | 6 / 10 | 558.35 / 633.3 | 33.35 / 216.65 | 7 / 13 | 6 / 8 | 70 / 81 |
| viewSwitch | 488 / 568 | 619.45 / 705.5 | 619.45 / 705.5 | 22.05 / 215 | 2 / 3 | 250 / 333.4 | 70.83 / 116.6 | 1 / 2 | 0 / 3 | 23 / 26 |
| paletteOpen | 1104 / 1208 | 1861.8 / 1984 | 1861.8 / 1984 | n/a | 4.5 / 7 | 533.3 / 583.4 | 137.42 / 258.35 | 2.5 / 4 | 0 / 0 | 52 / 54 |
| colorsChange | 216 / 376 | 1193.9 / 3023.9 | 1193.9 / 3023.9 | n/a | 3 / 8 | 483.35 / 633.3 | 183.35 / 350 | 1 / 9 | 0 / 0 | 32 / 64 |
| pointerSweep | n/a | n/a | n/a | n/a | 10 / 24 | 58.35 / 66.7 | 24.95 / 33.3 | 24 / 38 | 0 / 0 | 0 / 0 |

### desktop (median / worst of 6 measured runs)

| Interaction | interactionMs | settleMs | settleCoreMs | readableMs | longTasks | worstFrameMs | medianFrameMs | droppedFrames | imageRequests | imageDecodes |
|---|---|---|---|---|---|---|---|---|---|---|
| versionSwitch | 452 / 480 | 1008.7 / 1157.5 | 1008.7 / 1157.5 | n/a | 4.5 / 6 | 241.65 / 416.6 | 141.68 / 166.7 | 1 / 1 | 0 / 0 | 31 / 40 |
| tabSwitch | 652 / 696 | 3135.6 / 3278.7 | 2254.9 / 2500.1 | 1074.45 / 1266.8 | 8 / 9 | 691.65 / 866.6 | 295.82 / 358.35 | 2 / 3 | 6.5 / 8 | 64 / 75 |
| viewSwitch | 304 / 456 | 1073 / 1211.4 | 1073 / 1211.4 | 545.35 / 700 | 9 / 11 | 158.4 / 300 | 83.28 / 99.95 | 1.5 / 3 | 0 / 3 | 22.5 / 38 |
| paletteOpen | 444 / 1024 | 1435.8 / 1793.4 | 1327.25 / 1694.8 | n/a | 3.5 / 5 | 449.95 / 633.3 | 175 / 366.6 | 2 / 4 | 0 / 1 | 62 / 70 |
| colorsChange | 236 / 304 | 945.5 / 3054.3 | 945.5 / 3054.3 | n/a | 3 / 17 | 500 / 516.6 | 166.65 / 199.95 | 1.5 / 11 | 0 / 0 | 32 / 64 |
| pointerSweep | n/a | n/a | n/a | n/a | 18.5 / 21 | 216.7 / 300 | 150 / 150 | 0 / 1 | 0 / 0 | 115 / 140 |

## Facts verified against the code

- `index.html`: 557837 bytes. It inlines CSS, JS, `<script type="application/json" id="lx-data">` and one base64 `apple-touch-icon`.
- `icons/`: 67 files, 605474 bytes in total (33 favicons, 33 `.glyph.png` glyphs, `manifest.json`).
- `MOTION` (exact):

```
const MOTION = { outMs: 190, outEase: 'cubic-bezier(0.4, 0, 0.7, 0.2)', inMs: 620, delayBase: 60, delaySpread: 150, bootOffset: 120, bootSpread: 260, travelOut: 10, travelIn: 14, liftIn: 8, scaleOut: 0.988, scaleIn: 0.982 };
```

  `EASE_ACCEL` is `cubic-bezier(0.4, 0, 1, 1)`.
- Stagger function reading `MOTION`: `staggerDelay`.
- Font Awesome: there is no stylesheet link. `ensureIcon` fetches each icon's SVG at runtime from the jsdelivr CDN (constant `ICON_CDN`). Phase 1 step 8 therefore applies. Fonts under `fonts/` are IBM Plex Sans Arabic, El Messiri and Inter, three preloaded with `<link rel="preload" as="font">`.
- `backdrop-filter` (selector: value):
  - `.controls-pill`: blur(16px) saturate(150%), overridden to blur(20px) saturate(170%) and blur(24px) saturate(160%) under `:root[data-palette]`
  - `.lx-bar`: blur(16px), overridden to blur(22px) and blur(26px) under `:root[data-palette]`; `none` at max-width 640px
  - `.container .lx-bar .tab-rail`: blur(22px) saturate(170%) at max-width 640px
  - `.lx-context-menu`: blur(24px), overridden to blur(28px)
  - `.lx-toast`: blur(20px) saturate(160%)
  - `:root[data-palette] #lx-palette`: blur(30px) saturate(160%); its `::backdrop`: blur(6px) saturate(120%)
  - `:root[data-palette] .badge` and `.digit-badge`: blur(8px)
  - `:root .app-grid[data-layout="list"]`: blur(22px) saturate(175%)
  - `.icon-plate::before`: blur(22px) saturate(175%)
  - reset to `none`: `.card-clip`, list-row `.card-clip`, and the `prefers-reduced-transparency` and `forced-colors` blocks
- Glyph drawing: `appMark(app, variant)` returns `{ kind, url }` with kind `glyph`, `favicon` or `fa`. It prefers the glyph when every variant has one, then the favicon, then Font Awesome. `markHtml`, `glyphHtml`, `favHtml` and `retileIcon` do the drawing. Glyphs are `.lx-glyph::before` with `-webkit-mask` and `mask: var(--glyph) center / contain no-repeat`, and `--glyph` is set inline as `url(icons/<key>.glyph.png?v=...)`. There is no `mask-image: url(...)` literal. Favicons are `img.lx-fav` filling `.app-icon-wrapper`; the watermark variant is `.card-glyph .lx-fav` or `.card-glyph .lx-glyph`. With the current data all 33 tools have glyphs, so no `img.lx-fav` is drawn today.
- `startViewTransition`: called once, inside `withViewTransition`. `lookSwap` is a wrapper around it. Callers:
  - `lookSwap`: `setPaletteMode` (Colors), `setCornersMode`, the language handler in `setupInteractions` (`applyI18n`), and the background catalog refresh in `setBaseCatalog`
  - `withViewTransition`: `setZenMode` and the theme toggle in `setupInteractions`

## Icon swap path (`versionSwitch`)

`retileIcon` is called by the version-switch handler. The card element and the `.app-icon-wrapper` stay in place. Nothing is rebuilt and no `src` changes. The `--glyph` custom property on the existing `.lx-glyph` is rewritten to a new `url(icons/<key>--<variant>.glyph.png?v=...)`, which makes the browser fetch or decode a different mask image. Mutations recorded on the card, mobile:

- attribute `data-perf-target` on `div.app-card.status-closed.is-boot-card`: 1
- attribute `class` on `div.app-card.status-closed.is-boot-card`: 1
- attribute `data-dir` on `div.variant-chips`: 1
- attribute `data-variant-index` on `div.app-card.status-closed.is-boot-card`: 1
- attribute `href` on `a.card-link-overlay`: 1
- childList on `span.card-meta`: 1
- attribute `aria-label` on `a.card-link-overlay`: 1
- attribute `class` on `button.variant-chip`: 1
- attribute `aria-checked` on `button.variant-chip`: 1
- attribute `class` on `button.variant-chip.is-active`: 1
- attribute `aria-checked` on `button.variant-chip.is-active`: 1
- attribute `style` on `span.app-icon.lx-glyph`: 3
- attribute `data-mark` on `div.app-icon-wrapper`: 1
- attribute `style` on `span.lx-glyph`: 1

Desktop adds pointer-tracking noise (`style` and `class` on the card and `.card-clip`):

- attribute `data-perf-target` on `div.app-card.status-closed.is-boot-card`: 1
- attribute `class` on `div.app-card.status-closed.is-boot-card`: 9
- attribute `data-dir` on `div.variant-chips`: 1
- attribute `data-variant-index` on `div.app-card.status-closed.is-boot-card`: 1
- attribute `href` on `a.card-link-overlay`: 1
- childList on `span.card-meta`: 1
- attribute `aria-label` on `a.card-link-overlay`: 1
- attribute `class` on `button.variant-chip`: 1
- attribute `aria-checked` on `button.variant-chip`: 1
- attribute `class` on `button.variant-chip.is-active`: 1
- attribute `aria-checked` on `button.variant-chip.is-active`: 1
- attribute `style` on `span.app-icon.lx-glyph`: 3
- attribute `style` on `div.card-clip`: 10
- attribute `style` on `div.app-card.status-closed.is-boot-card`: 24
- attribute `data-mark` on `div.app-icon-wrapper`: 1
- attribute `style` on `span.lx-glyph`: 1

Measured effect: `imageRequests` is 0 (cached) but `imageDecodes` is not 0 (see the tables), so the swap is not free of decoding.

## Rendered icon sizes (CSS px)

- Glyph boxes (`.lx-glyph`, watermark excluded): bento tile header 30.7 desktop and 24 mobile; list row 26.9 desktop and 24 mobile; Icons tile 32.6; palette item 16.9 to 17.4; palette detail header 24.7; context-menu head 16.7 to 17.3.
- Favicon boxes (a favicon fills its `.app-icon-wrapper`): bento header 62 desktop and 46 mobile; list row 40 desktop and 36 mobile; Icons tile 64 on both; palette item 33; palette detail header 57.7; context-menu head about 17.
- `MAX_ICON_PX`: 64 (Icons tile `.app-icon-wrapper`, desktop and mobile).
- `WATERMARK_PX`: 136.6 on mobile and 133.7 to 134.4 on desktop (`.card-glyph` boxes in Bento).
- The palette detail watermark (171.7 px) is a Font Awesome bolt, not an `appMark` surface.
- Atlas cell from the Phase 1 formula: `min(128, ceil((64 * 2) / 16) * 16)` = 128.

## Unused bytes on first load (desktop, Bento)

- CSS: 254197 bytes, 60.8% unused.
- JS: 226168 bytes, 63.8% unused.
