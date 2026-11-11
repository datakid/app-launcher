# vNext implementation handoff

## Status

Untested source draft, not a completed release. The owner explicitly requested implementation here and deferred builds, tests, measurements, screenshots, and finishing work to Sonnet. Nothing was deployed or pushed to datakid/app-launcher. No performance improvement is claimed.

This workspace is a focused source copy, NOT a complete GitHub checkout. Its files were fetched from public main on 2026-11-11. It does not contain the build pipeline, complete QA suite, lockfile, HTML template, imported modules, fonts, or icon assets. The behavior test file alone has now been copied and extended. Do not attempt to deploy this workspace as-is.

## Files to integrate into a full checkout

- `links.json`
- `src/app.js`
- `src/app.css`
- `qa/behaviour.mjs`

Pristine versions of those four files are saved under `reference/upstream/`. Diff these against the working files to isolate this draft from any subsequent upstream changes. Compare the README addition separately; do not replace a newer upstream README wholesale. The original build plan is `VNEXT-BUILD-PLAN.md`.

## Implemented source changes

### Catalogue

Removed Entity Tracker and To Do. Added Quoin at https://power-query-manager.vercel.app/ and Typing Practice with Tarq first/default and Platen alternate. The exact supplied Platen fragment is preserved. Added Arabic titles and variant labels. Preserved the catalogue schema and all unrelated entries. No icon harvesting was attempted; existing Font Awesome fallbacks must be verified.

### T5 draft: cache existing grid children

Added a module-level fragment cache and explicit data-version counter. `renderCards` accepts an optional `useCache` argument; ordinary non-tab rebuilds invalidate the cache. `activateTab` opts into reuse only when changing tabs. Nodes are detached into a fragment on departure and moved back on return, preserving listeners without introducing wrappers below `#appGrid`.

Snapshots include grid track styles, layout/rows datasets, the three layout/overflow classes, icon items/column state, and internal grid scroll offsets. Restoration resets transient pointer/press/focus classes, spring values, opacity/transform and will-change; re-observes and repacks icons; invalidates pointer geometry; and restores keyboard focus if the old grid contained it.

Cache hits skip card entrance/stagger work and use a grid-level opacity fade driven by CSS `--dur-micro`. Existing transition cancellation/ghost cleanup remains in place. Non-boot card entry no longer reads every card rectangle; legacy transition distance reads are skipped on cache hits.

Invalidation hooks cover language, palette retint, corner changes, view/non-tab rebuilds, composed catalogue/personal-link changes, imported preferences, icon manifests and late mark refresh, open-mode changes, Zen changes, local variant selection and cross-tab variant preference events. Theme-only changes do not clear it: card content/tone generation inspected here is independent of theme, while theme presentation uses CSS. Verify that assumption in the complete app.

The active grid is tracked by `_cacheKey`; its snapshot is stored on departure rather than retaining live nodes in a second container. Invalidation deliberately drops the active key too. Consequently, boot-time preference/icon refresh or another invalidation may mean the first return is a miss; subsequent visits populate the cache. Review this conservative behavior before optimizing it.

### T2 foundation only

JS reads `--ease-lux` from computed CSS with the specified fallback instead of defining the old lux curve. Added a CSS-duration reader for the cache-hit fade. CSS `--ease-out` aliases `--ease-lux`; added enter/exit/move/emphasis role aliases without new curves.

T2 is NOT complete: most duration tables, bridge tokens, switchClamp machinery and CSS duration reconciliation remain untouched. Tab timings now read dedicated CSS tokens as part of the T6 draft below. The global animate patch is unchanged.

## Additional findings for Sonnet

- The pointer engine is not literally perpetual in this source: `Motion.tick` stops when all subscriber renders return false, and the pointer render already checks settled springs. The spotlight explicitly keeps it alive for about 2200 ms after movement. T4 should measure this actual path before adding another scheduler or unsubscribe scheme.
- `--sc` is not used as a standalone CSS scale consumer in the inspected pointer path. The pointer renderer builds an inline perspective/rotate/translateZ/scale transform from `s.sc.v`. Do not blindly apply T8's CSS multiplication example.
- The card QR trigger already has a 44px pseudo-element hit area in the actual source (`.card-qr::after`). Do not add another one merely because the earlier coarse-pointer block did not contain it.
- Import copy in the source says existing imported links are replaced, not merged. Read the actual import implementation before changing T10 dialog wording. Do not promise a merge without implementing an approved data-preserving migration.
- The existing ghost transition still clones outgoing DOM. This draft removes repeated incoming card construction on cache hits, not that pre-existing clone cost. Measure before claiming tab performance gains.

## Required next work

1. Start from a complete checkout of datakid/app-launcher/main. Review diffs against `reference/upstream/`, especially if upstream has changed; apply only intended edits.
2. Capture T0 baseline from pristine upstream before evaluating this draft. Run the actual npm checks and inspect supported script flags. Do not mark this draft green on source inspection alone.
3. Review cache lifecycle, especially asynchronous icon readiness, imports/reset, storage events, preference updates during transitions, resizes, font readiness, focus and rapid switching. Confirm A-B-A node identity and valid invalidation in every view. Check transient class removal against the existing focus-ring closure.
4. Measure construction versus outgoing clone cost and check compressed load budgets. Retain/revise/revert T5 according to the build plan's measured acceptance.
5. Finish T2 and the remaining plan. T3 is partial (core token consolidation only), T6 and T10 are implementation drafts, and T9 only has hostname presentation work. T0/T1/T4/T7/T8 remain unimplemented. No ticket has met the full measured/visual acceptance requirements.
6. Build dist only with the existing build command; run behavioral/accessibility/mobile/RTL/theme/view QA and all required before/after captures. Obtain owner approvals where specified. The behavior suite has been extended, not run. Its legacy tab exit expectation changed from 190ms to 120ms because T6 explicitly requests the same new tab timings for both motion modes; legacy version/boot expectations remain unchanged.
7. Split reviewed changes into ticket commits in the real repository. This tool workspace auto-commits changes together; it cannot satisfy the plan's original per-ticket Git commit requirement.

## Constraints preserved

No added code comments, dependencies, scripts, generated dist edits, localStorage key changes, saved-data clearing, or deployment configuration changes. `src/search.js`, `src/qr.js`, and `src/icon-solver.js` were neither opened nor modified. No user browser data or live database was accessed.

## Additional implementation pass

### T3 partial: core token consolidation

Moved the entire later core token block into the initial root block with its values preserved, retaining the existing tab-accent transition location. No layers, important declarations or reduced-motion blocks were moved. Computed-token equivalence and screenshots still need checking. The reduced-motion and duplicate QR-rule consolidation are not done.

### T6 draft: overlap the existing transition

Both legacy and new tab tables use CSS tokens `--lx-tab-out: 120ms` and `--lx-tab-in: 240ms`, zero entry delay and zero per-card stagger. Outgoing/incoming travel is 8px for tabs, using the exit/enter aliases. Uncached tab transitions now use the existing WAAPI path even when scroll timelines are available, to avoid phone switches accidentally bypassing the tuning. Cache hits deliberately retain T5's opacity-only micro fade. View transitions, existing interruption guards and RTL direction multiplication are unchanged. Reduced motion retains the existing instant path rather than modifying the global animate patch. Recordings, rapid-switch checks and owner approval are pending.

### T10 draft: native confirmation replacement

Added one on-demand native HTML dialog helper (no template/build changes). It uses localized textContent strings, labelled title/body, safe initial focus, native focus containment, Escape/backdrop cancellation, logical CSS, opaque theme-aware fill, forced-colors support, opacity-only entrance and no reduced-motion transition. It suppresses bubbling application shortcuts and overlapping confirmation requests, restores focus when possible, and suspends pointer interactions while open.

Import and reset now await this helper. Existing import REPLACEMENT semantics and honest copy are preserved: the plan's assumption that import merges links does not match this source. No merge/migration was invented. Import and reset compare the stored link snapshot after confirmation and abort with bilingual feedback if another tab changed it while waiting. Reset storage failures now return with error feedback instead of reporting success. No real user data was accessed or reset during development.

Added behavior tests for both languages: safe focus, Tab/Shift+Tab containment, Escape/backdrop preserving records, import cancellation, explicit replacement import, explicit reset, and absence of native dialogs. These tests use fresh browser contexts and synthetic test records only. They have NOT run. Tests for intervening storage changes, prefs-only imports, mobile layout and all themes still need adding/running as appropriate.

### T9 partial: compact phone hostnames

Card hostnames now have separate full and compact spans. Below 641px only the compact label displays, removing the five hosting suffixes specified in the plan. Overlay links retain the complete URL in title and accessible name. Both stacked and non-stacked variant changes update hostname markup, URL titles and accessible link labels. URLs and catalogue schema are unchanged. Check actual truncation at 320px/390px, RTL and all themes; no contrast or anatomy pass is claimed.

## Ideas

None implemented beyond the authorized scope.
