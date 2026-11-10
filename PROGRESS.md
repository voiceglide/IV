# Progress and hand-over

Updated after every step, and whenever work is pushed. A new session can resume from this file alone.

## Where things are
| Step | State | Branch / PR |
|---|---|---|
| 0 — copy | done | `release` (first commit) |
| 1 — audit and clean | done, audit = 0 hits | `release` |
| 2 — public base | **in progress** | `step-2-public-base` |
| 3 — instruments (new brief, see below) | to do | `step-3-instruments` |
| 4 — architecture | mostly done early, inside step 2 (see DECISIONS.md); left: ROADMAP.md, review | `step-4-architecture` |
| 5 — light multitrack | engine, patterns, mixer, WAV/MIDI export exist; left: melody editor, polish, tests | `step-5-multitrack` |
| 6 — product finish | to do (first-run guide, checklist in QA.md) | `step-6-finish` |
| 7 — QA as a user | to do | `step-7-qa` |
| Final report | to do | `RAPPORT.md` |

## Step 2 detail
- [x] Code split into modules, esbuild build, lint + types + unit tests + browser tests (`npm run check`)
- [x] Generic vertical video export (platform presets removed)
- [x] `APP_NAME` single constant (`src/config.js`), README, LICENSE, Pages workflow
- [ ] Feedback button (hidden without `FEEDBACK_URL`) — being built: `src/ui/feedback.js`, `src/core/feedback.js`, tests
- [ ] PWA: manifest, icons, service worker — being built: `src/sw.js`, `src/manifest.webmanifest`, `src/icons/`, `src/ui/pwa.js`, `scripts/icons.mjs`, build changes
- [ ] Local projects (IndexedDB, "My projects", import/export) — being built: `src/storage/projects.js`, `src/ui/projects.js`
- [ ] Verify the three above (`npm run check`), commit, open PR to `release`, merge by fast-forward

## Step 3 — new brief (changed by the owner)
The first list (electric piano, acoustic piano, strings, organ, guitar, bass, harp) is **cancelled**.
Instead: **many more instruments in the family of the existing ones** (gliding pad, soft piano, crystal bells,
picked arpeggio, strummed harp): soft, warm, dreamy, nostalgic, toy-like. Candidates: music box, kalimba, celesta,
vibraphone, soft marimba, toy piano, lo-fi wobbly keys, dream (FM) bells, glass harmonica, tape choir (ooh/aah),
tape flute, warm string machine, shimmer pad, lullaby pluck, wind chimes, soft chip arpeggio.
One file per instrument in `src/audio/instruments/`, following `src/audio/instrument.js`, registered in `index.js`.
Each must pass `node tests/browser/audio.mjs <id>` (no saturation, level in band, no clicks) and should be
checked with `node scripts/profile-instrument.mjs <id>`. The bass track keeps a plain soft bass voice of its own.

## How to resume
1. `git fetch origin && git checkout <branch of the step in progress>`; `npm install`; `npm run check` must pass.
2. Read `DECISIONS.md` (choices already made) and this file. Continue the first unchecked item.
3. Rules: all work on this repository only. Every commit authored as the repository account with its no-reply
   address, no co-author or session trailers. One branch and one pull request per step, base `release`, merged by
   fast-forward push (`git push origin <branch>:release`), never with the web merge button. Forced pushes are
   not available: `main` still holds a one-line placeholder commit and is replaced by hand at the very end.
4. Each step ends with: `npm run check` green, a build, this file updated, five lines of summary in the PR.
5. Quality bar for everything: static page with no outside request; offline and installable; work never lost;
   usable at 375 px with 44 px targets; undo/redo; plain-English errors; accessible; nothing half-finished shown;
   no personal or platform names anywhere (code, metadata, history); no third-party samples or real songs;
   the product name stays the placeholder in `APP_NAME` (never containing "swan" or "glide").

## Commands
`npm run check` (lint, types, build, unit tests, browser tests) · `npm run build` → `dist/` ·
`OUT_DIR=dist-x npm run build` + `APP_DIST=dist-x node tests/browser/run.mjs <name>` for a side build ·
`node scripts/profile-instrument.mjs <id>` to describe a sound in numbers.
