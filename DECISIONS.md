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
