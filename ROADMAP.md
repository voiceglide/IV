# Roadmap

Ideas noted along the way. Nothing here is promised.

## How the code is organised (so new work lands in the right place)
- `src/core` — pure data and music logic: theory, the versioned project format and its migrations, the timeline, patterns, undo history, WAV and MIDI encoders. No DOM, no audio. Unit-tested in Node.
- `src/audio` — the engine (master bus, one channel per track, live and offline rendering) and the instruments, all behind one interface (`instrument.js`).
- `src/render`, `src/export` — video frames and video encoding.
- `src/storage` — projects on the device. `src/ui` — the interface; it holds no audio logic and changes the project only through `store.update`.
- Adding a track: add its settings to `core/project.js` (and a migration if the format changes), its events to `core/patterns.js`, one line in `scheduleSong` in `audio/engine.js`, a strip in `ui/tracks.js`. The engine's existing code is not modified.
- Adding an instrument: one file in `src/audio/instruments/`, one import in `index.js`.

## Next
- Listen to every instrument on real speakers and phones; retouch balance and character by ear.
- Melody: record from an on-screen keyboard; import a MIDI file.
- Per-chord rhythm (push, anticipation), swing, and 3/4 and 6/8 as real meters instead of beat counts.
- More bass and drum patterns; a fill at the end of each section.
- Video: square and horizontal formats, colour themes, a dark theme for the app.
- Export stems (one WAV per track) and a count-in free "performance" export with an ending.
- Share a progression as a link (the project encoded in the URL, still without a server).
- Voicing controls: range of the top voice, drop voicings, guitar-friendly voicings.
- Languages other than English.

## Later, maybe
- MIDI input and output with the Web MIDI API.
- A second chord track for comparing two progressions side by side.
- Lyrics or cue text per section on the video.
