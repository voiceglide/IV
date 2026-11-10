# NOM

Placeholder name: the product name lives in one constant, `APP_NAME` in `src/config.js`.

A chord progression editor that shows how each voice moves from chord to chord. It plays the progression and exports a vertical video, audio (WAV), MIDI or a project file. It runs entirely in the browser: no account, no server, works offline, and can be installed on a phone.

## Use it

1. Open the page.
2. Tap Play to hear the progression.
3. Tap Edit to change or add chords, tempo or key.
4. Pick instruments under Sound.
5. Tap Export and choose video, audio (WAV), MIDI or project file.

Projects are saved automatically on the device. "My projects" lists them. Export a project file to move one to another device.

## Develop

```sh
npm install
npm run build   # static site in dist/
npm run check   # lint, types, build, unit tests, browser tests
```

The browser tests use a locally installed Playwright and are skipped without it.

`FEEDBACK_URL=https://… npm run build` enables the optional anonymous feedback button. Without it, the button does not exist.

## Layout

| Folder | Contents |
| --- | --- |
| `src/core` | Music theory, project format, timeline, patterns (pure functions) |
| `src/audio` | Audio engine and instruments |
| `src/render` | Canvas video frames |
| `src/export` | Video encoding |
| `src/storage` | Projects saved on the device |
| `src/ui` | The interface |
| `tests` | Unit and browser tests |
| `scripts` | Build script |

## Privacy

Nothing leaves the device. No analytics, cookies or trackers.
Feedback is opt-in and anonymous.

## Licence

All rights reserved. See `LICENSE`. Third-party components are listed in `THIRD-PARTY-NOTICES.md`.
