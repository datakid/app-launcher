# LinkExpress

A bilingual (Arabic/English) launchpad for internal tools. A single static `index.html` driven entirely by `links.json`.

## Editing links
`links.json` is the **only** source of truth. There is no copy of the catalog inside `index.html`, so you never have to edit code to add, remove, rename or reorder tools.

- Any Font Awesome 6 **solid** icon name works (`"icon": "fa-rocket"`). Built-in icons render instantly; others are fetched once from jsDelivr and fall back to `fa-circle` if the name does not exist
- Visitors see changes on their next visit. The last good catalog is cached in `localStorage`, shown immediately, then silently refreshed from `links.json`
- If `links.json` has a JSON syntax error, the cached version keeps showing (first-time visitors see "Could not load the tool list"). Check with `?lxdebug=1`, which also warns about rejected entries

## Features
- Bento grid of tools by category, with variants, "New" (auto-expires 30 days after `since`) and "Closed" badges
- Command palette (⌘K / Ctrl K, `/`, or start typing) with recents, frequent tools, Arabic-aware fuzzy search and actions
- Theme, language, sound and Zen mode, all saved in `localStorage`
- My data menu: import personal links (they go into a "My Links" tab), export data, remove imported links
- Pointer light: glass rim highlights with an opposite-edge glint, a soft inner glow and a gentle focus fade on other cards

## Files and URLs
- `index.html`: the app. `#<categoryId>` opens a tab (`#core`, `#tools`, `#experimental`, `#mine`). `?lxdebug=1` shows debug warnings
- `links.json`: the catalog
- `fonts/*.woff2`: self-hosted IBM Plex Sans Arabic, El Messiri, Inter and Cormorant Garamond

## Data model
- Catalog: `{ categories: [{ id, label{ar,en}, icon, accent, key, apps: [{ id, title{ar,en}, url | variants[{id,label,url,icon}], defaultVariant, icon, gradient[3], closed, closedReason, isNew, since }] }] }`
- IDs: lowercase letters, digits and `-`, up to 40 characters, unique. Colors must be `#rrggbb`. URLs must be `https:`
- Limits: 12 categories, 24 apps per category, 4 variants per app, 256 KB file
- Import file: `{ "links": [{ "title": "..." | {ar,en}, "url": "https://...", "icon": "fa-...", "color": "#rrggbb" }], "prefs": {...} }`
- localStorage keys: `lx-user-links`, `lx-catalog-cache`, `lx-theme`, `lx-lang`, `lx-sound`, `lx-variant-*`, `lx-recents`, `lx-freq`, `lx-last-tab`, `lx-last-open`

## Notes
- Must be served over http(s). Opening `index.html` directly from disk cannot read `links.json`
- Deploy via the Publish tab

## Next steps
- Optional: a small JSON Schema file for editor autocompletion of `links.json`
