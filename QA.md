# QA

How it was checked: `npm run check` runs lint, type checks, 42 unit tests and seven browser test files in headless
Chromium (phone screens 375×667 and 390×844, and a desktop window). Nothing here was checked on a real phone,
and nobody has listened to the sound: see "Not verified".

## Product requirements
| Requirement | State | Evidence / note |
|---|---|---|
| Standalone static page, no outside request | ✅ | every browser test fails on any request leaving the page's origin |
| Offline after the first visit | ✅ | `pwa` test: reload and new tab with the network cut |
| Installable (manifest, icons, service worker) | ✅ built · ⚠️ install not testable here | Android prompt and iPhone "Add to Home Screen" need a real device |
| Autosave, restore on reload | ✅ | `projects` test |
| My projects: create, rename, duplicate, delete | ✅ | `projects` test |
| Import / export .json, old files migrated, bad files refused | ✅ | `projects` test, unit tests |
| Storage never used for tracking | ✅ | only projects, the last-open id, the "guide seen" flag and the last Export Format and Look are stored |
| Example plays in one tap on first launch | ✅ | `welcome` test |
| Three-step guide, skippable; help at any time | ✅ | `welcome` test |
| Clear empty state | ✅ | `edges` test |
| Undo / redo, also by touch | ✅ | header buttons, `smoke` test |
| Keyboard shortcuts | ✅ | Space, E, 1–4, N, X, P, ?, Ctrl/⌘+Z, Shift+Z, Esc |
| Confirmation before deletion | ✅ projects · ⚠️ chords and melody | chords and melody notes are removed at once with an Undo button instead (see DECISIONS.md) |
| Error messages say what to do | ✅ | tempo, unknown chord, bad file, full storage, failed export |
| One screen at 375 px, 44 px targets, no sideways scroll | ✅ | `smoke`, `projects`, `feedback` tests measure them |
| No accidental zoom | ✅ | every field uses 16 px text |
| Rotation | ✅ | landscape layout, `welcome` test |
| iPhone: sound on first tap, silent switch, return from background | ⚠️ built, not verifiable here | the context is created and resumed inside the tap; the page declares media playback; leaving the page stops the sound and the next tap resumes |
| Smooth animation, clean audio | ⚠️ partly | audio is measured offline: no saturation, no clicks, balanced levels for all 20 voices; frame rate and crackle on a real phone are not measured |
| No console errors | ✅ | every browser test fails on a console or page error |
| No memory leak after 10 minutes | ⚠️ not measured | by design each loop's audio nodes stop and are released; no long run was made |
| Contrast, labels, keyboard navigation, reduced motion | ✅ mostly | labels and focus handling on all controls; the melody grid is pointer-only |
| English interface, consistent | ✅ | |
| No dead button, unfinished parts hidden | ✅ | feedback and install entries appear only when they can work |

## Journeys played by the tests
First launch · play/stop · add, change, delete a chord · undo/redo · tempo and lengths · typed chords ·
change instrument while playing · mute/solo · melody notes · open/close Edit and its tabs · export video, WAV,
MIDI, project file · save, reload, import · network cut then relaunch · rotation · background and return.

## Edge cases covered
Tempo 20 and 300 · one chord · quarter-beat chords · extended and unusual chords · sharps and flats ·
slash chords far from the root · 200 chords · invalid, non-project and version-1 files · full storage (unit test,
simulated) · storage unavailable (falls back to memory with a notice) · no chords at all.

## Bugs found and fixed
1. Notes held from the previous chord were missing when playback started mid-progression. Fixed in the patterns, with a test.
2. A melody note ending exactly on the loop boundary was played twice. Fixed, with a test.
3. Attached feedback could include the on-video signature. It is now always blanked.
4. The tape choir took almost a second to speak; its attack is now a tenth of a second.

## Known limits, with how to see them
- **Loop seam in WAV/video audio**: the gliding voices are free-running oscillators, so the last sample of the loop does not meet the first one exactly (a step of about 0.04 of full scale was measured). On repeat this can be a faint tick. Reproduce: export WAV, loop it in an audio editor.
- **Video sound codec**: where the browser cannot encode AAC the MP4 carries Opus sound (seen in headless Chromium on Linux); some players and platforms refuse it. Chrome on Android/desktop and Safari normally provide AAC.
- **Very long loops**: the video is written to a file in the browser's private storage (OPFS) as it is encoded, and the result is that file, so the finished MP4 is not held in memory. Where OPFS is missing or refuses (some private windows, older Safari), it is built in memory with one buffer. Either way the encoded chunks of the whole video are held by the muxer until the file is finalised (the MP4 index goes at the front for players and uploads), and the sound loop is rendered in memory. Not measured with a 200-chord loop. A leftover private-storage file (page closed mid-export) is deleted by the next export.
- **Video export and the page**: frames are drawn on the main thread in small slices, so the page stays usable, but there is one longest task of about half a second while the sound is rendered. Moving it to a worker was left out (see DECISIONS.md).
- **Video look**: the Format (vertical, square, wide) and Look (paper, night) are chosen in the Export sheet and remembered. The preview follows the app's dark mode; the exported Look is independent of it.
- **Melody grid**: touch and mouse only; shows two octaves of the key at a time; notes outside the key cannot be entered.
- **Glyphs**: ♭ and ♯ come from the system font, so their look varies slightly between devices.
- **`main` branch**: still the one-line placeholder; see RAPPORT.md.

## Not verified (needs a person)
Real iPhone and Android: install, silent switch, lock/unlock, audio after a call · listening to all instruments ·
ten minutes of continuous playback · the Pages deployment itself.
