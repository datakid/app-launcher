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

## Data & storage

No backend. `localStorage` keys: `lx-theme`, `lx-lang`, `lx-sound`, `lx-last-tab`, `lx-last-open`, `lx-variant-*`, `lx-recents`, `lx-freq`, `lx-unlocked-secrets`, `lx-schema`.
