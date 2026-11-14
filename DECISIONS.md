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
- Project format: version 4 (`chord-project`). Older files are migrated on load: version 1 (flat fields, sound "modes") and unversioned ones, version 2 (gets chord ids, glide style and the per-voice sound split), version 3 (gets the drum step grid and swing).
- The video keeps its seamless-loop design: one cycle taken from the middle of three. At rest the preview shows the first chord.
- Deleting a chord does not ask for confirmation: it shows "removed · Undo" instead, because it is undoable. Deleting a project (not undoable) does ask.
- Leaving the page (tab switch, phone lock) stops playback instead of trying to keep it alive in the background.
- The strummed electronic harp replaces the earlier trademarked instrument name.
- Browser tests use the Playwright already installed on the machine and are skipped where there is none; the Pages workflow runs lint, types, the build, the unit tests and the browser tests (Playwright and ffmpeg are installed there and the browser tests are required, not skipped).
- The Pages workflow deploys from `main` and from `release`. If the Pages environment only allows the default branch, the `release` run fails harmlessly until `main` is replaced.

## Step 3 — instruments (brief changed by the owner)
- The first instrument list is dropped. The new set extends the existing family: soft, warm, nostalgic, toy-like sounds.
- The bass track still needs a voice: it gets one plain soft bass of its own, not offered as a chord instrument.
- Fifteen instruments added to the four existing ones: lo-fi keys, celesta, toy piano, vibraphone, kalimba, soft marimba, pocket console, music box, lullaby strings, dream bells, warm strings, tape choir, tape flute, singing glass, shimmer pad. All synthesized, no samples.
- They were written directly rather than by one helper per instrument, to stay within the usage budget; each one is measured by the same automatic test (peak, level, clicks) and can be profiled note by note.
- Nobody has listened to them: the tests prove they are clean and balanced, not that they are beautiful. Listening and retouching is a task for a person.

## Steps 4 and 5
- Tracks are fixed, not free-form: gliding voices (the master chord track), a chord instrument, bass, drums, melody. This keeps the app light and centred on the gliding voices.
- The bass is chosen as a pattern that follows the chords. Drums are a step grid (one bar, 16 steps, six lanes, four levels, swing) that starts from a preset pattern and can be edited; the built-in patterns are grids too.
- The melody is tapped on a grid limited to the notes of the key (two octaves), with the chord tones marked. One voice only. The roll works from the keyboard as well as by touch and mouse, and every semitone can be entered ("All notes").
- WAV and video exports are exactly one seamless loop. MIDI export has one track per audible part.
- Mixer changes (volume, pan, mute, solo) apply to the sound that is playing without restarting it; a new instrument or pattern restarts from the same position.
- Foundations hardening: lookups of chord qualities, patterns and sounds use own-property checks (never `in`); repeats expand to at most 512 chords in total and a longer progression gives a plain error instead of a partial list; a chord `sym` is always one chord; stored projects carry a `rev` and a save over a newer revision from another tab is refused (`conflict`), never silently overwritten; unreadable stored records are listed so they can be deleted.
- Minor-key numerals mark the raised degrees (♯III, ♯VI, ♯VII) so they never collide with the natural ones.

## Video export (wave 1)
- The video is exactly one audio loop long: the frame rate is nudged (about 30.013 fps) so the frame count is an integer, frame N equals frame 0, and the audio padding is trimmed.
- The chord name changes one lead (the 0.26 s glide lead, derived from `starts[n] - vs` in `song.js`) before the sound arrives, so frame 0, the cover, shows the first chord.
- The export draws on its own canvas and can be cancelled; `exportVideo` takes `ratio` and `theme` options.

## Video export (wave 2)
- The Export sheet has one big "Save video" button with a Format (Vertical 9:16, Square 1:1, Wide 16:9) and a Look (Paper, Night) picker above it; audio, MIDI and the project file are under "More". The choice is remembered in localStorage (`iv.export.look`, inside try/catch). When the video is ready, "Download video" and "Share…" come before the preview so they stay on screen at 375×667.
- The MP4 is written through `FileSystemWritableFileStreamTarget` to a private OPFS file when the browser allows it (the Blob returned is that file); otherwise `ArrayBufferTarget`. The MP4 keeps its index at the front (`fastStart: 'in-memory'`), so the muxer holds the encoded chunks until the end rather than streaming; the saving is that the finished file is not held a second time.
- The preview canvas follows the app theme through `renderer.followSystem()` (prefers-color-scheme, or `data-theme` when set); the export Look is chosen separately and drawn on its own renderer.
- Rendering stays on the main thread. A worker would need its own font loading (the page's Inter is a page-level stylesheet), a second copy of the draw path to keep identical, and separate cancel plumbing; the page already stays responsive in slices, so the risk was not worth one 0.5 s task.
- Golden frames: 5 timestamps × 3 ratios × 2 looks are compared with a stored 40-column brightness grid (tests/browser/golden/frames.json) with a tolerance for anti-aliasing; regenerate with `UPDATE_GOLDEN=1 npm run test:browser -- frames`.

## Foundations fix round
- Opening a project writes nothing. A project read from storage is only remembered as "last open" (a small meta record); the project record is rewritten only by a real edit or when it is new. This is what stops a second tab from invalidating the first tab's revision.
- A save refused because another tab saved first is never retried in a loop and never dropped: the edit stays in memory, the status says "Not saved · changed in another tab", and a dialog offers "Keep mine as a copy" (a new project next to the original, which is left as the other tab saved it), "Use the other version" (loads it, drops the unsaved edit, said plainly) or "Decide later" (My projects reopens the dialog). Switching to another project while conflicted keeps the edit as a copy automatically. Revisions this tab wrote itself are never counted as someone else's.
- Leaving the page (pagehide, or the tab becoming hidden) does the final write synchronously: `putNow` creates the IndexedDB transaction and its `put` inside the handler, with nothing awaited before it (no read-then-write: a callback after the page is gone never runs). It cannot check for conflicts, so it refuses a project another tab has changed (the BroadcastChannel tells this tab). In every case the unsaved project is first written to localStorage (`studio.pending`), which is synchronous and certain. At the next start, `recoverPending` puts it back when it is newer than the stored one, drops it when the store already holds it or something newer, and keeps it as a "(recovered)" copy when it was refused as a conflict or the stored record cannot be read. A pending edit older than 30 days is ignored, and deleting a project forgets its pending edit.
- IndexedDB that does not answer within 4 s (seen on iOS Safari) puts the tab in memory mode with a message; so does a database that belongs to a newer app version, found at start or when the connection is reopened. A reopen that fails for other reasons is still an error that is retried, not a silent switch to memory.
- Unreadable records keep the date written in them (0 = unknown, shown as unknown, never "now" and never 1970). Readable ones sort by that date, so a damaged record without a date can never be picked to restore; unreadable ones come last, say why (newer version: "reload the app to update it"; damaged), cannot be opened, and can be deleted.
- Chord limit: 512 chords everywhere. The edit functions refuse to add the 513th, return the index of the chord that is already there (so a caller that selects the result still selects a real chord), and report through `setLimitNotice`, which the app connects to its toast. A file with more chords (also an old `prog` that expands past 512) keeps the first 512 and `parseProjectFile(text, notes)` fills `notes` with a plain sentence, which Import shows.
- Parser: one pass over the text, with nested repeats on a stack, so time is linear in the length. A section is `[` up to the next `]` with no `[` in between; a `[` that fails that is one bad token (`[Verse`) and the chords after it are kept. Section names are cleaned by one function (`cleanSection`) in both the text parser and `normalizeProject`, so a name never changes on reload. Text longer than 20,000 characters is refused with the existing "too long" message, and the text box stops at 20,000 with a message.
- Service worker: a navigation is answered with the cached file for that very address (ignoring the query); only the app's own address (or its index.html) falls back to the app page. Another page of the site that is not cached is not replaced by the app.
- An update that is ready is kept in the ⋯ menu ("Update ready — reload", first entry, with a dot on the button) until the page is reloaded, and the toast is shown again when the page becomes visible after a minute or more.
- CI: the build job has its own concurrency group per ref (a newer push replaces an older run of the same ref); only the deploy job uses the `pages` group, and is never cancelled halfway. Jobs and the slow steps have time limits, and ffmpeg is installed so the video test can use ffprobe.
