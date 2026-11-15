# v5 Phase 0B: remote branch audit

Audited against `main` at `2ba24a7` (after PR #20). 19 remote branches: `main`, the v5 working branch, and 17 others.

How each row was found: `git rev-list --count origin/main..origin/<b>` for commits not in main, `git cherry` for squash-merged work, `git branch -r --merged origin/main`, and `git merge-tree --write-tree` to see what merging the branch into main would change. References were searched in `.github/workflows/`, `vercel.json`, `harvest/`, `tools/`, `package.json`, `README.md`, `docs/`, `perf/`, `qa/` and `build/`. No branch name is used by any of them (`icons.yml` runs on pushes to `main` and calls `datakid/harvest-studio/.github/workflows/harvest-icons.yml@main`). Not checked from this sandbox: the `datakid/harvest-studio` repository and branch-bound domains in the Vercel project.

No `archive/*` tags exist yet. Nothing has been tagged or deleted.

## Fully merged into main (no unique commits)

| branch | last commit | recommendation |
|---|---|---|
| `ci/harvest-icons` | 2026-11-06 | archive tag, delete |
| `ci/pin-main` | 2026-11-06 | archive tag, delete |
| `feat/fuzzy-search` | 2026-11-13 | archive tag, delete |
| `feat/tarq-quoin` | 2026-11-11 | archive tag, delete |
| `feat/v4-tiles-search` | 2026-11-04 | archive tag, delete |
| `fix/harvest-icon-alias` | 2026-10-31 | archive tag, delete |
| `fix/search-highlight` | 2026-11-12 | archive tag, delete |
| `fix/split-typo-four` | 2026-11-14 | archive tag, delete |
| `fix/v4-close-out` | 2026-11-10 | archive tag, delete |
| `merge/main-beta` | 2026-11-13 | archive tag, delete |
| `polish/ceiling-sonnet` | 2026-10-30 | archive tag, delete |
| `polish/icons-qr` | 2026-10-28 | archive tag, delete |

## Unique work not in main (owner decisions)

| branch | unique commits | last commit | what it holds | recommendation |
|---|---|---|---|---|
| `beta` | 20 (195 files, 132 behind main) | 2026-11-13 | the `vnext` experiments T0 to T10 (motion source of truth, card growth on phones, storage guards, baseline screenshots) on top of the October Harvest and icons work | keep; it is the branch your icon-intake workflow and the main against beta comparison use |
| `ci/studio-ref` | 1 | 2026-11-06 | adds `studio-ref: main` to the `icons.yml` call of the Harvest Studio workflow; merges cleanly, changes one line of CI | keep until you confirm the Studio workflow accepts a `studio-ref` input, then merge or drop |
| `ship/qr-views-polish` | 1 | 2026-10-26 | makes the reduced-motion check in `qa/behaviour.mjs` wait a few frames before judging leftovers; merges cleanly, changes one file | cherry-pick onto the v5 branch (it only makes a test more patient), then archive and delete |
| `harvest/full-catalog` | 1 unique, 1 regenerated `dist/` | 2026-10-31 | gives the `harvest` id the Studio mark; main already carries the interim `harvest` entry from PR #9; merging conflicts in 6 files | archive tag, delete |
| `polish/ceiling` | 18 | 2026-10-31 | the first version of the card and chip polish; `polish/ceiling-sonnet` (PR #7) replaced it and none of the 18 subjects is in main's log; merging conflicts in 9 files | archive tag, delete |

## Final state if the recommendations are accepted

`main`, `beta`, `ci/studio-ref` and the v5 working branch. 15 branches deleted: the 12 merged ones, `harvest/full-catalog`, `polish/ceiling` and, after its cherry-pick, `ship/qr-views-polish`. Each is recoverable from an `archive/<name>` tag (slashes become dashes, for example `archive/polish-ceiling`).
