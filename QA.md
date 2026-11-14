# QA

How it was checked: `npm run check` runs lint, type checks, 103 unit tests and 14 browser test files (counts as of the foundations round) in headless
Chromium (phone screens 375×667 and 390×844, and a desktop window). Nothing here was checked on a real phone,
and nobody has listened to the sound: see "Not verified".

## Product requirements
| Requirement | State | Evidence / note |
|---|---|---|
| Standalone static page, no outside request | ✅ | every browser test fails on any request leaving the page's origin |
| Offline after the first visit | ✅ | `pwa` test: reload and new tab with the network cut |
| Installable (manifest, icons, service worker) | ✅ built · ⚠️ install not testable here | Android prompt and iPhone "Add to Home Screen" need a real device |
| Autosave, restore on reload | ✅ | `projects` test |
| An edit made just before the page goes away (reload, tab close, tab switch) is kept | ✅ | `tabs` test: the write is started inside the pagehide handler, and a copy in localStorage is put back at the next start if it did not land |
| Two tabs on the same project never lose an edit | ✅ | `tabs` test: opening a tab writes nothing; a real conflict asks (keep mine as a copy / use the other version), edits stay in memory meanwhile |
| Records that cannot be read are shown as such | ✅ | `tabs` test, `storage-foundations` unit test: newer-version and damaged records are listed with the reason, cannot be opened, can be deleted, never win the restore |
| My projects: create, rename, duplicate, delete | ✅ | `projects` test |
| Import / export .json, old files migrated, bad files refused | ✅ | `projects` test, unit tests |
| Storage never used for tracking | ✅ | projects and the last-open id (IndexedDB); in localStorage the "guide seen" flag, the last Export Format and Look, an edit that was not yet written when the page went away (`studio.pending`, removed once restored), and the notes typed on the sound-check page (`sound-check-notes-v1`) |
| Example plays in one tap on first launch | ✅ | `welcome` test |
| Three-step guide, skippable; help at any time | ✅ | `welcome` test |
| Clear empty state | ✅ | `edges` test |
| Undo / redo, also by touch | ✅ | header buttons, `smoke` test |
| Keyboard shortcuts | ✅ | Space, E, 1–5, N, X, P, ?, Ctrl/⌘+Z, Shift+Z, Esc |
| Confirmation before deletion | ✅ projects · ⚠️ chords and melody | chords and melody notes are removed at once with an Undo button instead (see DECISIONS.md) |
| Error messages say what to do | ✅ | tempo, unknown chord, bad file, full storage, failed export |
| One screen at 375 px, 44 px targets, no sideways scroll | ✅ | `smoke`, `projects`, `feedback` tests measure them |
| No accidental zoom | ✅ | every field uses 16 px text |
| Rotation | ✅ | landscape layout, `welcome` test |
| iPhone: sound on first tap, silent switch, return from background | ⚠️ built, not verifiable here | the context is created and resumed inside the tap; the page declares media playback; leaving the page stops the sound and the next tap resumes |
| Smooth animation, clean audio | ⚠️ partly | audio is measured offline: no saturation, no clicks, balanced levels for all 20 voices; frame rate and crackle on a real phone are not measured |
| No console errors | ✅ | every browser test fails on a console or page error |
| No memory leak after 10 minutes | ⚠️ not measured | by design each loop's audio nodes stop and are released; no long run was made |
| Contrast, labels, keyboard navigation, reduced motion | ✅ mostly | labels and focus handling on all controls; the melody roll works from the keyboard too |
| English interface, consistent | ✅ | |
| No dead button, unfinished parts hidden | ✅ | feedback and install entries appear only when they can work |

## Journeys played by the tests
First launch · play/stop · add, change, delete a chord · undo/redo · tempo and lengths · typed chords ·
change instrument while playing · mute/solo · melody notes · open/close Edit and its tabs · export video, WAV,
MIDI, project file · save, reload, import · network cut then relaunch · rotation · background and return.

## Edge cases covered
Tempo 20 and 300 · one chord · quarter-beat chords · extended and unusual chords · sharps and flats ·
slash chords far from the root · 200 chords · the 512-chord cap at the edit (a plain message, no silent cut on reload) · hostile chord text (200,000 brackets parses in a few milliseconds; the text box holds at most 20,000 characters) · an unmatched "[" · a project file with more than 512 chords keeps the first 512 and says so · invalid, non-project and version-1 files · full storage (unit test,
simulated) · storage unavailable, never answering (4 s) or belonging to a newer app version (falls back to memory with a notice) · no chords at all.

## Bugs found and fixed
1. Notes held from the previous chord were missing when playback started mid-progression. Fixed in the patterns, with a test.
2. A melody note ending exactly on the loop boundary was played twice. Fixed, with a test.
3. Attached feedback could include the on-video signature. It is now always blanked.
4. The tape choir took almost a second to speak; its attack is now a tenth of a second.

Found by a tester and fixed in the foundations round, each with a test that failed before:
5. Opening a second tab made the first tab's next edit a conflict and lost it (the new tab rewrote the project). Opening now writes nothing; a real conflict offers a choice.
6. An edit made less than half a second before a reload or tab close was lost (the save went through an async queue). The write now starts inside the handler, with a localStorage copy as a safety net.
7. Offline, `sound-check.html` showed the main app (the worker answered every page with the app). It now answers with the file asked for, also with a query string.
8. Unreadable stored records showed "0 chords · 0 BPM · edited 1970" and could win the restore. They are listed with their reason and date, and never restored.
9. The 512-chord cap only applied on load. It now applies at the edit, and an old file with more chords keeps the first 512 with a notice.
10. `[Verse C G [Chorus] Am F` swallowed chords; an unmatched "[" is now one bad token.
11. 200,000 brackets froze the page for 19 s; the parser is one linear pass and the text box is limited.
12. A key such as `{"toString":1}` threw a TypeError instead of a ProjectError.
13. A database that never opened (iOS) or was too new left the tab at "Not saved"; it now works in memory with a clear message.
14. An update that was announced once (a single toast) could be missed; it now stays in the menu until applied.

## Known limits, with how to see them
- **Video sound codec**: where the browser cannot encode AAC the MP4 carries Opus sound (seen in headless Chromium on Linux); some players and platforms refuse it. Chrome on Android/desktop and Safari normally provide AAC; not checked on a real device.
- **Very long loops**: the video is written to a file in the browser's private storage (OPFS) as it is encoded, so the finished MP4 is not held in memory a second time. Where OPFS is missing or refuses (some private windows, older Safari), it is built in memory with one buffer. Either way the encoded chunks of the whole video are held by the muxer until the file is finalised (the MP4 index goes at the front for players and uploads), and the sound loop is rendered in memory. Not measured with a 200-chord loop. A leftover private-storage file (page closed mid-export) is deleted by the next export.
- **Video export and the page**: frames are drawn on the main thread in small slices, so the page stays usable, but there is one longest task of about half a second while the sound is rendered. Moving it to a worker was left out (see DECISIONS.md).
- **Video look**: the Format (vertical, square, wide) and Look (paper, night) are chosen in the Export sheet and remembered. The preview follows the app's dark mode; the exported Look is independent of it.
- **Melody roll**: shows two octaves at a time (scroll or zoom for the rest); every semitone can be entered, by touch, mouse or keyboard.
- **Two tabs**: a second tab never disturbs the first one, but if both edit the same project the later save is refused and its owner chooses (keep as a copy, or take the other version). There is no live merge.
- **Leaving the page**: the final write is started inside the page-hide handler and a copy is kept in localStorage; a browser that kills the page before either (a crash, a forced kill) can still lose the last few hundred milliseconds.
- **Text box**: holds at most 20,000 characters, and a progression expands to at most 512 chords.
- **Glyphs**: ♭ and ♯ come from the system font, so their look varies slightly between devices.
- **`main` branch**: still the one-line placeholder; see RAPPORT.md.

## Not verified (needs a person)
- Nobody has listened to the sound: every check of it is a measurement (level, clicks, pitch, seam), not a judgement of how it sounds. `sound-check.html` is there for that listening.
- No real device was used: not iPhone, not Android, not Safari. Install, the silent switch, lock/unlock, audio after a call, the iPhone IndexedDB behaviour behind the open timeout, and touch feel are all untested.
- AAC video sound was not produced anywhere here (the test browser encodes Opus).
- Ten minutes of continuous playback, frame rate on a phone, and the Pages deployment itself.
