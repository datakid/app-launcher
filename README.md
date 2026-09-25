# LinkExpress

A single-file, vanilla HTML/CSS/JS launchpad for internal tools. Bilingual (Arabic RTL / English LTR), dark/light themes, bento grid, command palette, optional generative sound.

## Entry points

| Path | Purpose |
|---|---|
| `index.html` | The whole app (markup, CSS, JS, data) |
| `index.html#core` / `#tools` / `#experimental` | Deep-link to a category tab |
| `index.html?lxdebug=1` | FPS / motion-loop / long-task overlay + console warnings |
| `fonts/*.woff2` | Self-hosted fonts referenced by `@font-face` (upload the `fonts/` folder alongside `index.html`; the page degrades gracefully to metric-matched system fallbacks if missing) |

Keyboard: `⌘/Ctrl K` or `/` or any letter → palette · `1–9` → launch card · `Alt Z` → Zen · `Esc` → close / exit Zen · arrows navigate cards & tabs.

## Completed features

- Curated + solver-generated bento layouts, RTL-aware tab rail with morphing indicator
- Command palette with fuzzy Arabic/English search, ghost autocomplete, recents/frequency ranking, per-result actions, secret unlock
- Pointer field: spring-driven tilt, edge reveal, glow, spotlight, magnetic control pill
- Theme swap with view-transition wipe, orb-field canvas background, idle cinema mode
- Zen mode (header collapse) with view-transition or FLIP fallback
- Full a11y: roles, live regions, focus-visible rings, reduced-motion / reduced-transparency / forced-colors / contrast-more paths

## This pass (polish, no perf regression)

**Palette hover leak — fixed.** Cards behind the open command palette previously kept reacting to the pointer (tilt, glow, edge reveal, spotlight, magnetic pill), because `pointermove` is document-level and the dialog backdrop doesn't stop it. That was a focus leak, not a feature: it competed with the dialog for attention and burned a spring-solver frame loop for nothing. Now, while `#lx-palette` is open:

- the pointer field treats the cursor as off-screen so every card spring settles to rest (verified: `--hov` → 0, transform cleared, `is-tracking` removed, spotlight deactivated)
- pointer velocity stops accumulating, so there's no "lean" jolt when the palette closes
- the magnetic pill releases its pull
- scroll events inside the palette no longer invalidate the grid geometry cache (previously every palette scroll forced a full card re-measure)
- the field re-measures once when the dialog closes and once when the container dolly transition ends, so the grid snaps back accurately

**Other perf trims**
- Bar edge-glow caches its `getBoundingClientRect` per hover session instead of reading layout on every `pointermove`
- Palette `kbd` hint press-flash is now a pre-built key map, gated to palette-open, instead of a `querySelectorAll` on every keydown in the app

**Pixel polish**
- `kbd` chips: unified weight, tabular numerals, LTR isolation, no wrapping
- Light theme: "New" and "Variant" badge inks darkened for real contrast on cream surfaces (grid and palette)
- Search bar label: full string on desktop, short string on phones / narrow containers (container query with a media fallback) — no more mid-word ellipsis
- Mobile: tab rail bounded so search keeps breathing room; control pill tightened to the corner
- Auto-flow grid gets a thin themed scrollbar and scroll padding
- Palette host chip truncates cleanly; search-match `mark` clones its background across line breaks; action `kbd` hints hidden on narrow palettes

## Not yet implemented

- Persisting Zen mode across reloads
- User-editable links (data lives in the inline `#lx-data` JSON)

## Suggested next steps

- Move `#lx-data` to a table-backed source if links need editing without a redeploy
- Add a settings sheet for sound volume and motion intensity

## Data & storage

No backend. `localStorage` keys: `lx-theme`, `lx-lang`, `lx-sound`, `lx-last-tab`, `lx-last-open`, `lx-variant-*`, `lx-recents`, `lx-freq`, `lx-unlocked-secrets`, `lx-schema`.
