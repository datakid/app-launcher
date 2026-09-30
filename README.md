# LinkExpress

A bilingual (Arabic/English) launchpad for internal tools. A single static `index.html` driven entirely by `links.json`.

## Editing links
`links.json` is the source of truth. A copy is also baked into `index.html` (`<script id="lx-data">`) so the first paint is instant, even offline or on a first visit.

- Load order: localStorage cache, then the baked-in copy, then `links.json` fetched quietly in the background once the page is idle
- The **refresh** button (last button in the top-left pill, or the "Refresh tools" command after typing `>` in the palette) forces a network fetch of `links.json` that skips the cache and tells you whether anything changed
- When you publish, paste the new `links.json` into `lx-data` so the baked-in copy stays current. Until you do, the background fetch still keeps visitors up to date

- Any Font Awesome 6 **solid** icon name works (`"icon": "fa-rocket"`). Built-in icons render instantly; others are fetched once from jsDelivr and fall back to `fa-circle` if the name does not exist
- Visitors see changes on their next visit. The last good catalog is cached in `localStorage`, shown immediately, then silently refreshed from `links.json`
- If `links.json` has a JSON syntax error, the cached version keeps showing (first-time visitors see "Could not load the tool list"). Check with `?lxdebug=1`, which also warns about rejected entries

## Features
- Bento grid of tools by category, with variants, "New" (auto-expires 30 days after `since`) and "Closed" badges
- Command palette (⌘K / Ctrl K, `/`, or start typing) with recents, frequent tools, Arabic-aware fuzzy search and actions
- Theme, language, sound and Zen mode, all saved in `localStorage`
- My data menu: import personal links (they go into a "My Links" tab), export data, remove imported links
- Pointer light: glass rim highlights with an opposite-edge glint, a soft inner glow and a sweeping sheen
- Focus falloff: when you hover a card, the others recede by distance (0.90 opacity for neighbours down to about 0.74 for the farthest, plus a slight scale-back). It starts after 110 ms of intent, so passing over cards doesn't flicker
- Cards: an accent glow in the corner, a hostname line under the title and an accent-tinted border on hover
- Palette scopes: category chips with live match counts and a sliding highlight. Shift+Tab cycles through them
- Command palette: flat keycaps, a quiet cursor, a strong primary action, dot-separated hints and a live status dot
- Visual system (v2): accent-aware gradient rim on the bar and palette, glass surfaces with a stronger blur, a circular magnifier badge on the bar and palette input, a tab indicator with an inner accent glow, active-state dots on the controls pill, an accent hairline across the top of each card, refined icon tiles, tinted variant chips and a more legible hostname line. Motion timings were tightened across the board (springs, tab switch, palette morph, card entry) so animations feel snappy and never block interaction

- Card glyph: a large, faint copy of the tool's icon sits in the corner of each card and drifts slightly with the pointer
- Zen mode persists across reloads (`lx-zen`), is applied before first paint, and travels with export/import prefs
- Palette: a tappable close button (Esc keycap on desktop, × on touch). Closing or pressing Esc during the open morph cancels it instantly instead of being ignored
- Tab indicator: positioned with real `left`/`right` edges (not `clip-path`), so its inset accent ring stays visible all the way around, rounded ends included, both at rest and while it slides. The top highlight sits on a `::before` layer inset by 1px so it never covers the top edge of the ring
- Alt Account launcher: always listed in the palette (search "Alt" or "البديل") under an "Alt launcher" group. It has no card and is left out of the random "Try" picks
- Short desktop windows (≤700 px tall) scroll instead of squashing the grid; very narrow phones (≤360 px) get a compact controls pill

## Files and URLs
- `index.html`: the app. `#<categoryId>` opens a tab (`#core`, `#tools`, `#experimental`, `#mine`). `?lxdebug=1` shows debug warnings
- `links.json`: the catalog
- `fonts/*.woff2`: self-hosted IBM Plex Sans Arabic, El Messiri, Inter and Cormorant Garamond

## Data model
- Catalog: `{ categories: [{ id, label{ar,en}, icon, accent, key, apps: [{ id, title{ar,en}, url | variants[{id,label,url,icon}], defaultVariant, icon, gradient[3], closed, closedReason, isNew, since }] }] }`
- IDs: lowercase letters, digits and `-`, up to 40 characters, unique. Colors must be `#rrggbb`. URLs must be `https:`
- Limits: 12 categories, 24 apps per category, 4 variants per app, 256 KB file
- Import file: `{ "links": [{ "title": "..." | {ar,en}, "url": "https://...", "icon": "fa-...", "color": "#rrggbb" }], "prefs": {...} }`
- localStorage keys: `lx-user-links`, `lx-catalog-cache`, `lx-theme`, `lx-lang`, `lx-sound`, `lx-zen`, `lx-variant-*`, `lx-recents`, `lx-freq`, `lx-last-tab`, `lx-last-open`

## Notes
- Must be served over http(s). Opening `index.html` directly from disk cannot read `links.json`
- Deploy via the Publish tab

## Next steps
- Optional: a small JSON Schema file for editor autocompletion of `links.json`
