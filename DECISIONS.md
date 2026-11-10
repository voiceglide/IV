# Decisions

Choices made without asking, in order. Short on purpose.

## Step 0 — copy
- Only working files were copied: the app sources, the build script, the unit tests and the package files. No history, no docs, no screenshots, no song data, no rendering tooling.
- All work lives on a new line of history that starts from a single commit, on the branch `release`. Every commit there carries the same author name and a no-reply address.
- Rewriting `main` in place was not possible from the working session (forced pushes are blocked there). `main` still holds the one-line placeholder commit; replacing it with `release` is a manual step listed in the hand-over report.
- Commits carry no co-author or session trailers: the history must show one author only.
- Pull requests target `release` and are merged by fast-forward push, not through the web merge button, so that no merge commit can pick up another address.

## Step 1 — audit
- Searched every file's content, every file name and image/font metadata, case-insensitively, for the agreed list of private terms (personal names, the earlier project name, social platform and tool names, places, hosting ids).
- Result before cleaning: 24 matching lines in 5 files (package files, the page template, the app script, the examples file). Result after cleaning: 0.
- The terms themselves are deliberately not written in this repository. The detailed table is in the hand-over report only.
- Removed with them: the song library, the publishing calendar, captions and hashtags, the posting checklist, the platform safe-area overlay, the host-specific download path.
- Kept: three generic examples (I–V–vi–IV, ii–V–I, vi–IV–I–V), no song titles.
- No images were copied, so there was no image metadata to strip at this step.

## Step 2 — public base
- The split into modules (planned as step 4) was done first, so that every later feature lands in its own file. Step 4 keeps the review and the roadmap.
- Build: esbuild bundles the app into one page; the typeface (Inter, SIL Open Font License, redistributable) and the MP4 muxer (MIT) ship inside the build. No outside request at run time. Their notices are in THIRD-PARTY-NOTICES.md.
- Musical flat and sharp signs are not in the Latin subset of the typeface; they fall back to the system font, as before.
- Project format: version 2 (`chord-project`). Version 1 (flat fields, sound "modes") and unversioned files are migrated on load.
- The video keeps its seamless-loop design: one cycle taken from the middle of three. At rest the preview shows the first chord.
- Deleting a chord does not ask for confirmation: it shows "removed · Undo" instead, because it is undoable. Deleting a project (not undoable) does ask.
- Leaving the page (tab switch, phone lock) stops playback instead of trying to keep it alive in the background.
- The strummed electronic harp replaces the earlier trademarked instrument name.
- Browser tests use the Playwright already installed on the machine and are skipped where there is none; the Pages workflow runs lint, types and unit tests only.
- The Pages workflow deploys from `main` and from `release`. If the Pages environment only allows the default branch, the `release` run fails harmlessly until `main` is replaced.

## Step 3 — instruments (brief changed by the owner)
- The first instrument list is dropped. The new set extends the existing family: soft, warm, nostalgic, toy-like sounds.
- The bass track still needs a voice: it gets one plain soft bass of its own, not offered as a chord instrument.
- Fifteen instruments added to the four existing ones: lo-fi keys, celesta, toy piano, vibraphone, kalimba, soft marimba, pocket console, music box, lullaby strings, dream bells, warm strings, tape choir, tape flute, singing glass, shimmer pad. All synthesized, no samples.
- They were written directly rather than by one helper per instrument, to stay within the usage budget; each one is measured by the same automatic test (peak, level, clicks) and can be profiled note by note.
- Nobody has listened to them: the tests prove they are clean and balanced, not that they are beautiful. Listening and retouching is a task for a person.
