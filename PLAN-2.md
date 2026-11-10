# Plan 2 — glide sounds and ease of use

Why: the first version put new instruments *next to* the gliding voices (struck notes layered on top).
What was wanted is the opposite: **the gliding voices themselves should have different sounds**. And the app
works, but using it is clumsy. This plan fixes both. Same rules as before (see PROGRESS.md, "How to resume").

## Part A — instruments that glide (priority)
1. **A second instrument interface: the glide voice.** A continuous sound whose pitch is driven by the engine
   (one frequency curve per voice), instead of separate notes. Each glide sound is one file in
   `src/audio/glides/` that builds its chain (sources, filter, vibrato, level) from that curve.
   The current pad becomes the first one, unchanged.
2. **A real palette of glide sounds**, each clearly different when it slides:
   warm pad (current) · string section (bowed, slow swell) · solo cello / violin · choir "ooh" and "aah" ·
   whistle / theremin · breathy flute · soft organ · singing glass · analog lead with portamento ·
   lo-fi tape pad · brass swell · bell pad (struck on arrival, tail glides).
3. **Expression of the glide itself**, as settings: glide length (also as a fraction of the chord), curve
   (straight, eased, late "scoop"), vibrato that appears once a voice has arrived, a soft swell on each chord
   change, and which voices glide (all, only the ones that move).
4. **Per-voice sound** (optional, after 1–3): bass, inner voices and top voice may use different glide sounds
   (for example cello bass + choir + whistle on top). The video keeps one colour per voice.
5. The struck instruments become a secondary "Layer" choice, cut down to the few that sound best.
6. Tests: same automatic checks (level, clipping, clicks) plus a new one: the pitch really follows the curve.
7. **Listening page**: `sound-check.html`, one tap per glide sound on the same progression, so a person can
   judge and note what to retouch. Nothing ships as "done" before it has been listened to on a phone.

## Part B — ease of use
Observed weak points: with Edit open the preview becomes tiny on a small phone; changing a chord opens a full
sheet every time; settings are spread over four tabs; nothing can be dragged; starting from scratch is slow.
1. **Chord strip always visible** under the preview: tap a chord to select it, tap + to add, drag to reorder,
   swipe down (or a clear button) to remove. The playing chord is highlighted there.
2. **Inline chord picker** in the bottom panel (root row + type row), no full sheet; changes are heard at once.
3. **Start faster**: a library of common progressions (in any key), a Transpose control, "Surprise me".
4. **Sound in one tap**: the glide sound is the first, biggest choice (a row of named tiles with a preview),
   then ready-made "scenes" (glide sound + layer + bass + drums). The mixer moves to an "Advanced" fold.
5. **Preview first**: Edit takes less height, the preview can be tapped to play/pause, and a full-screen
   preview button exists. Tempo by tapping.
6. **Export in one tap**: a main "Video" button; the other formats behind "More".
7. Wording pass on every label and message, with a newcomer in mind.

## Part C — order of work
0. The owner lists what felt wrong (five lines are enough) — added to this file before starting.
1. A1 + A2 (three glide sounds first: strings, choir, whistle) + A7, then stop for a listening check.
2. B1 + B2 + B4, then a second check on a phone.
3. The rest of A, then the rest of B, QA as in the first plan, update QA.md and PROGRESS.md.

One branch and one pull request per numbered step of Part C.
