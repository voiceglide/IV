// Scenes: ready-made sound settings, one tap each. A scene sets the glide sound (and optionally a different sound
// for the bass, inner or top voices), how the glide moves, the extra chord layer, the bass and drum patterns and the
// balance between them. It never touches the chords, the melody, the tempo, mute or solo.
// Pure data and two pure functions; the ids are checked against the registries by tests/scenes.test.mjs.

/**
 * @typedef {Object} Scene
 * @property {string} id
 * @property {string} name
 * @property {string} hint   a few words under the name
 * @property {string} sound  glide sound id
 * @property {{bass:string|null, inner:string|null, top:string|null}} split
 * @property {number} glide  seconds a voice takes to slide
 * @property {{curve:'straight'|'eased'|'scoop', vibrato:number, swell:number}} style
 * @property {string} layer  chord instrument id, or 'none'
 * @property {string} bass   bass pattern id
 * @property {string} drums  drum pattern id
 * @property {{voices:number, chords:number, bass:number, drums:number}} mix  volumes 0–1
 */

const none = { bass: null, inner: null, top: null };

/** @type {Scene[]} */
export const SCENES = [
  { id: 'plain', name: 'Plain and clear', hint: 'just the voices', sound: 'pad', split: none, glide: 0.26, style: { curve: 'eased', vibrato: 0.5, swell: 0.5 },
    layer: 'none', bass: 'off', drums: 'off', mix: { voices: 0.8, chords: 0.8, bass: 0.8, drums: 0.7 } },
  { id: 'latenight', name: 'Late-night pad', hint: 'slow, dark and warm', sound: 'pad', split: { bass: 'cello', inner: null, top: null }, glide: 0.42, style: { curve: 'eased', vibrato: 0.3, swell: 0.7 },
    layer: 'lofikeys', bass: 'root', drums: 'soft', mix: { voices: 0.85, chords: 0.5, bass: 0.7, drums: 0.45 } },
  { id: 'stringschoir', name: 'Strings and choir', hint: 'bowed bass, choir on top', sound: 'strings', split: { bass: 'cello', inner: null, top: 'ooh' }, glide: 0.42, style: { curve: 'eased', vibrato: 0.6, swell: 0.8 },
    layer: 'none', bass: 'off', drums: 'off', mix: { voices: 0.85, chords: 0.7, bass: 0.7, drums: 0.5 } },
  { id: 'lofitape', name: 'Lo-fi tape', hint: 'wobbly keys, a lazy beat', sound: 'tape', split: none, glide: 0.26, style: { curve: 'straight', vibrato: 0.8, swell: 0.3 },
    layer: 'lofikeys', bass: 'pulse', drums: 'half', mix: { voices: 0.7, chords: 0.65, bass: 0.7, drums: 0.55 } },
  { id: 'musicbox', name: 'Music box', hint: 'small and sweet', sound: 'glass', split: none, glide: 0.16, style: { curve: 'straight', vibrato: 0.1, swell: 0.2 },
    layer: 'musicbox', bass: 'off', drums: 'off', mix: { voices: 0.55, chords: 0.8, bass: 0.7, drums: 0.5 } },
  { id: 'dreamwhistle', name: 'Dream whistle', hint: 'a floating whistle on top', sound: 'ooh', split: { bass: null, inner: null, top: 'whistle' }, glide: 0.42, style: { curve: 'scoop', vibrato: 0.7, swell: 0.4 },
    layer: 'dreambells', bass: 'root', drums: 'off', mix: { voices: 0.8, chords: 0.5, bass: 0.6, drums: 0.5 } },
  { id: 'brassswell', name: 'Warm brass swell', hint: 'each change blooms', sound: 'brass', split: { bass: 'organ', inner: null, top: null }, glide: 0.42, style: { curve: 'eased', vibrato: 0.4, swell: 1 },
    layer: 'none', bass: 'fifth', drums: 'soft', mix: { voices: 0.8, chords: 0.6, bass: 0.7, drums: 0.5 } },
  { id: 'glassbells', name: 'Glass bells', hint: 'bright and shimmering', sound: 'glass', split: { bass: 'pad', inner: null, top: null }, glide: 0.26, style: { curve: 'eased', vibrato: 0.2, swell: 0.6 },
    layer: 'celesta', bass: 'root', drums: 'off', mix: { voices: 0.7, chords: 0.7, bass: 0.6, drums: 0.5 } },
  { id: 'airyflutes', name: 'Airy flutes', hint: 'breathy and light', sound: 'flute', split: { bass: 'cello', inner: null, top: null }, glide: 0.26, style: { curve: 'scoop', vibrato: 0.5, swell: 0.5 },
    layer: 'kalimba', bass: 'off', drums: 'off', mix: { voices: 0.8, chords: 0.6, bass: 0.7, drums: 0.5 } },
  { id: 'softorgan', name: 'Soft organ groove', hint: 'steady, with a gentle beat', sound: 'organ', split: none, glide: 0.16, style: { curve: 'straight', vibrato: 0.2, swell: 0.2 },
    layer: 'softpiano', bass: 'octave', drums: 'basic', mix: { voices: 0.7, chords: 0.7, bass: 0.75, drums: 0.6 } },
];

const MIXED = /** @type {const} */(['voices', 'chords', 'bass', 'drums']);

/** Change a project (a draft inside store.update) to the scene. */
export function applyScene(p, s) {
  p.glide = s.glide; p.glideStyle = { ...s.style };
  const t = p.tracks;
  t.voices.sound = s.sound; t.voices.split = { ...s.split };
  t.chords.instrument = s.layer; t.bass.pattern = s.bass; t.drums.pattern = s.drums;
  for (const id of MIXED) t[id].volume = s.mix[id];
}

/** Does the project hold exactly this scene's settings? */
export function sceneMatches(p, s) {
  const t = p.tracks, sp = t.voices.split || none, g = p.glideStyle;
  return t.voices.sound === s.sound && sp.bass === s.split.bass && sp.inner === s.split.inner && sp.top === s.split.top
    && Math.abs(p.glide - s.glide) < 1e-6 && g.curve === s.style.curve && Math.abs(g.vibrato - s.style.vibrato) < 1e-6 && Math.abs(g.swell - s.style.swell) < 1e-6
    && t.chords.instrument === s.layer && t.bass.pattern === s.bass && t.drums.pattern === s.drums
    && MIXED.every(id => Math.abs(t[id].volume - s.mix[id]) < 1e-6);
}

/** The scene the project matches, or null. */
export const currentScene = p => SCENES.find(s => sceneMatches(p, s)) || null;
