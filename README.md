# LinkExpress

A bilingual (Arabic/English) launchpad for internal tools. It is a single static `index.html`, with an optional `links.json` catalog.

## Features
- Bento grid of tools by category, with variants (for example Express/Full), "New" and "Closed" badges
- Command palette (⌘K / Ctrl K, `/`, or just start typing). It shows recent and frequent tools, fuzzy Arabic-aware search, and actions (new tab, same tab, copy, reveal)
- Theme, language, sound and Zen mode, all saved in `localStorage`
- **My data menu** (folder button):
  - Import links from a JSON file. They go into a separate "My Links" tab with IDs starting `u-`
  - Export all your data: links plus theme, language, sound and variant choices
  - Remove imported links
- **External catalog**: `links.json` is fetched from the same site, checked and cached. The inline `#lx-data` copy is the fallback

## Files and URLs
- `index.html`: the app. `#<categoryId>` opens a tab (`#core`, `#tools`, `#experimental`, `#mine`). `?lxdebug=1` shows the debug overlay and warnings
- `links.json`: the catalog to edit from now on. Setting `CATALOG_URL = ''` in the script turns it off
- `fonts/*.woff2`: needed but **not in this project yet**. Upload them, or the app falls back to system fonts

## Data model
- Catalog: `{ categories: [{ id, label{ar,en}, icon, accent, key, apps: [{ id, title{ar,en}, url | variants[{id,label,url,icon}], defaultVariant, icon, gradient[3], closed, closedReason, isNew, since }] }] }`
- Import file: `{ "links": [{ "title": "..." | {ar,en}, "url": "https://...", "icon": "fa-...", "color": "#rrggbb" }], "prefs": {...} }`. A plain array also works
- localStorage keys: `lx-user-links`, `lx-catalog-cache`, `lx-theme`, `lx-lang`, `lx-sound`, `lx-variant-*`, `lx-recents`, `lx-freq`, `lx-last-tab`, `lx-last-open`

## Safety limits
- Imports: 64 KB maximum, 24 links maximum, `https:` only (no credentials in the URL)
- Icons must be on the built-in list and colors must be hex
- Invisible bidi and control characters are removed from text
- The catalog comes from the same origin only, is capped at 256 KB and must be `https:`
