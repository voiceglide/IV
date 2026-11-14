// Project data: the one JSON document that describes a piece. Versioned, with migrations from older files.
// Pure functions, no DOM, no audio, no storage.
import { parseProgression, parseChord, chordToText, MAX_CHORDS } from './theory.js';

export const FORMAT = 'chord-project';
export const VERSION = 4;

/**
 * @typedef {{id:string, sym:string, beats:number|null, section:string}} ChordItem  id is stable across edits and reordering
 * @typedef {{curve:'straight'|'eased'|'scoop', vibrato:number, swell:number}} GlideStyle  vibrato and swell 0–1
 * @typedef {{bass:string|null, inner:string|null, top:string|null}} VoiceSplit  glide sound per voice group, null = use the main sound
 * @typedef {{volume:number, pan:number, mute:boolean, solo:boolean}} Mix
 * @typedef {Record<string, number[]>} DrumSteps  per lane, 16 steps of one bar: 0 off, 1 soft, 2 normal, 3 accent
 * @typedef {{t:number, d:number, m:number}} MelodyNote  time and length in beats from the loop start, MIDI note
 * @typedef {Object} Project
 * @property {string} format
 * @property {number} version
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} tempo            beats per minute, 20–300
 * @property {number} beatsPerChord    default length of a chord, in beats
 * @property {string} key              'auto', or '0'…'11' (major) / '0:m'…'11:m' (minor)
 * @property {number} glide            seconds a voice takes to slide to the next chord
 * @property {GlideStyle} glideStyle
 * @property {ChordItem[]} chords      the master chord track
 * @property {{hook:string, question:string, reveal:string, watermark:string}} text  on-screen text for the video
 * @property {{voices:Mix&{sound:string, split:VoiceSplit}, chords:Mix&{instrument:string}, bass:Mix&{instrument:string, pattern:string},
 *   drums:Mix&{pattern:string, swing:number, steps:DrumSteps}, melody:Mix&{instrument:string, notes:MelodyNote[]}}} tracks
 */

export const TRACK_IDS = ['voices', 'chords', 'bass', 'drums', 'melody'];
export const TRACK_LABEL = { voices: 'Gliding voices', chords: 'Extra layer', bass: 'Bass', drums: 'Drums', melody: 'Melody' };
export const BASS_PATTERNS = { off: 'Off', root: 'Long notes', pulse: 'On every beat', fifth: 'Root and fifth', octave: 'Octaves' };
export const DRUM_PATTERNS = { off: 'Off', soft: 'Soft pulse', basic: 'Basic beat', four: 'Four on the floor', half: 'Half time', custom: 'My own (step grid)' };

// The drum grid: one bar of 4 beats in 16 steps (sixteenth notes) per lane. A cell is 0 (off), 1 (soft), 2 (normal) or 3 (accent).
export const DRUM_LANES = ['kick', 'snare', 'hat', 'open', 'clap', 'tom'];
export const DRUM_LANE_LABEL = { kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', open: 'Open hat', clap: 'Clap', tom: 'Tom' };
export const DRUM_STEPS = 16, DRUM_SWING_MAX = 0.6;
/** How loud each cell level is (0…1). */
export const DRUM_LEVEL = [0, 0.4, 0.7, 1];
/** @returns {DrumSteps} */
export function emptySteps() { return Object.fromEntries(DRUM_LANES.map(l => [l, new Array(DRUM_STEPS).fill(0)])); }
/** A grid from a compact picture: lane → string of 16 characters, '.' off, 'o' soft, 'x' normal, 'X' accent. */
const pic = rows => { const g = emptySteps(); for (const [l, r] of Object.entries(rows)) g[l] = Array.from(r.padEnd(DRUM_STEPS, '.').slice(0, DRUM_STEPS), c => (c === 'X' ? 3 : c === 'x' ? 2 : c === 'o' ? 1 : 0)); return g; };
/** The built-in patterns as grids: they play as they are, and are what "start from a preset, then edit" copies. */
export const DRUM_PRESETS = {
  soft: pic({ kick: 'x...............', hat: 'x...o...o...o...' }),
  basic: pic({ kick: 'X.......x.......', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' }),
  four: pic({ kick: 'X...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' }),
  half: pic({ kick: 'X...............', snare: '........X.......', hat: 'x...o...x...o...' }),
};
/** The grid a drum track plays: its own for 'custom', the preset's for a preset, none for 'off'. @param {{pattern:string, steps:DrumSteps}} d @returns {DrumSteps} */
export function effectiveSteps(d) {
  if (d.pattern === 'custom') return d.steps;
  return Object.hasOwn(DRUM_PRESETS, d.pattern) ? DRUM_PRESETS[/** @type {'soft'} */(d.pattern)] : emptySteps();
}
/** Any value → a valid grid: only known lanes, exactly 16 whole cells of 0…3 each. */
export function cleanSteps(x) {
  const g = emptySteps(), src = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  for (const l of DRUM_LANES) {
    const row = Object.hasOwn(src, l) && Array.isArray(src[l]) ? src[l] : [];
    for (let i = 0; i < DRUM_STEPS; i++) g[l][i] = clamp(Math.round(num(row[i], 0)), 0, 3);
  }
  return g;
}

export const GLIDE_CURVES = ['straight', 'eased', 'scoop'];
/** @type {GlideStyle} */
const DEFAULT_STYLE = { curve: 'eased', vibrato: 0.5, swell: 0.5 };
const mix = (volume = 0.8) => ({ volume, pan: 0, mute: false, solo: false });
/** Melody note limits, in beats from the loop start. */
export const NOTE_MAX_T = 8192, NOTE_MIN_D = 0.05, NOTE_MAX_D = 256;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const shortId = () => newId().slice(0, 8);
const str = (x, d = '', max = 400) => (typeof x === 'string' ? x.slice(0, max) : d);

export function newId() {
  const a = new Uint8Array(8);
  (globalThis.crypto || { getRandomValues: x => { for (let i = 0; i < x.length; i++) x[i] = Math.floor(Math.random() * 256); return x; } }).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

/** Chord text ("C G:2 [Verse] Am F", repeats allowed) → chord items. Returns the tokens that were not understood. */
export function chordsFromText(text) {
  const p = parseProgression(text || '');
  return {
    chords: p.chords.map(c => ({ sym: chordToText(Object.assign({}, c, { beats: null })), beats: c.beats || null, section: c.secStart ? c.section : '' })),
    bad: p.bad,
    error: p.error || '',
  };
}

/** Section names live in "[...]" in the text, so they may not contain brackets or line breaks. */
const cleanSection = x => String(x).replace(/[[\]\r\n]+/g, ' ').trim();

/** Chord items → text, one section per line. */
export function chordsToText(chords) {
  let out = '';
  for (const c of chords) {
    if (c.section && cleanSection(c.section)) out += (out ? '\n' : '') + `[${cleanSection(c.section)}] `;
    else if (out && !out.endsWith(' ')) out += ' ';
    out += c.sym + (c.beats ? ':' + c.beats : '');
  }
  return out;
}

/** @returns {Project} */
export function newProject(name = 'Untitled', chordText = 'C G Am F') {
  const now = Date.now();
  return {
    format: FORMAT, version: VERSION, id: newId(), name, createdAt: now, updatedAt: now,
    tempo: 90, beatsPerChord: 4, key: 'auto', glide: 0.26, glideStyle: { ...DEFAULT_STYLE },
    chords: chordsFromText(chordText).chords.map(c => ({ id: shortId(), ...c })),
    text: { hook: '', question: '', reveal: '', watermark: '' },
    tracks: {
      voices: { ...mix(0.8), sound: 'pad', split: { bass: null, inner: null, top: null } },
      chords: { ...mix(0.8), instrument: 'none' },
      bass: { ...mix(0.8), instrument: 'bass', pattern: 'off' },
      drums: { ...mix(0.7), pattern: 'off', swing: 0, steps: emptySteps() },
      melody: { ...mix(0.8), instrument: 'celesta', notes: [] },
    },
  };
}

// Built-in examples: generic progressions, no real songs.
export const EXAMPLES = [
  { name: 'Four chords (I–V–vi–IV)', chords: 'C G Am F C G Am F', tempo: 84, key: '0', hook: 'Watch the voices *glide*' },
  { name: 'Jazz cadence (ii–V–I)', chords: 'Dm7 G7 Cmaj7:8 Dm7 G7 Cmaj7:8', tempo: 96, key: '0', hook: 'Two voices move, *two stay*', instrument: 'lofikeys' },
  { name: 'Minor start (vi–IV–I–V)', chords: 'Am F C G Am F C G', tempo: 90, key: '0', hook: 'Same chords, *new start*' },
];
/** @returns {Project} */
export function exampleProject(i = 0) {
  const e = EXAMPLES[i] || EXAMPLES[0], p = newProject(e.name, e.chords);
  p.tempo = e.tempo; p.key = e.key; p.text.hook = e.hook;
  if (e.instrument) p.tracks.chords.instrument = e.instrument;
  return p;
}

// ---------------------------------------------------------------- migrations
// Version 1 was a flat object: {version:1, name, prog, bpm, beats, key, sound, glide, hook, question, title, handle}.
// Files with no version at all are treated as version 1.
const SOUND_V1 = { pad: ['none', false], both: ['softpiano', false], piano: ['softpiano', true], crystal: ['crystal', false], arp: ['arp', false], omni: ['strumharp', false] };

const MIGRATIONS = {
  1(old) {
    const p = newProject(str(old.name, 'Imported project', 80), str(old.prog, '', 20000));
    p.tempo = num(typeof old.bpm === 'string' ? parseFloat(old.bpm) : old.bpm, 90);
    p.beatsPerChord = num(typeof old.beats === 'string' ? parseFloat(old.beats) : old.beats, 4);
    p.key = str(String(old.key === undefined ? 'auto' : old.key), 'auto', 8);
    p.glide = num(typeof old.glide === 'string' ? parseFloat(old.glide) : old.glide, 0.26);
    p.text = { hook: str(old.hook), question: str(old.question || old.q), reveal: str(old.title), watermark: str(old.handle) };
    const [instrument, muteVoices] = typeof old.sound === 'string' && Object.hasOwn(SOUND_V1, old.sound) ? SOUND_V1[old.sound] : SOUND_V1.pad;
    p.tracks.chords.instrument = instrument; p.tracks.voices.mute = muteVoices;
    if (typeof old.id === 'string') p.id = old.id;
    return p;
  },
};

MIGRATIONS[2] = old => ({
  ...old, version: 3,
  glideStyle: { ...DEFAULT_STYLE },
  chords: (Array.isArray(old.chords) ? old.chords : []).map(c => (c && typeof c === 'object' ? { ...c, id: shortId() } : c)),
  tracks: { ...(old.tracks || {}), voices: { ...((old.tracks && old.tracks.voices) || {}), split: { bass: null, inner: null, top: null } } },
});

// Version 4: the drum track gets a step grid and swing. The old pattern keeps playing, as the same grid you can now edit.
MIGRATIONS[3] = old => {
  const tracks = old.tracks && typeof old.tracks === 'object' ? old.tracks : {};
  const drums = tracks.drums && typeof tracks.drums === 'object' ? tracks.drums : {};
  const pat = typeof drums.pattern === 'string' && Object.hasOwn(DRUM_PRESETS, drums.pattern) ? drums.pattern : null;
  return { ...old, version: 4, tracks: { ...tracks, drums: { ...drums, swing: 0, steps: pat ? structuredCloneSteps(DRUM_PRESETS[/** @type {'soft'} */(pat)]) : emptySteps() } } };
};
const structuredCloneSteps = g => Object.fromEntries(Object.entries(g).map(([l, r]) => [l, r.slice()]));

export class ProjectError extends Error {}

/**
 * Turn anything read from a file or from storage into a valid, current Project.
 * Unknown fields are dropped, missing or damaged ones get defaults. Throws ProjectError with a message
 * written for the person using the app when the data cannot be a project at all.
 * @returns {Project}
 */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProjectError('This file is not a project.');
  let v = raw.version === undefined ? 1 : raw.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new ProjectError('This file is not a project.');
  if (v > VERSION) throw new ProjectError('This project was made with a newer version of the app. Reload the app to update it, then try again.');
  if (v === 1 && raw.prog === undefined && raw.chords === undefined) throw new ProjectError('This file is not a project.');
  // a file that says version 1 but already holds a chord list is a newer file with a wrong stamp: read it as it is
  if (v === 1 && raw.prog === undefined && Array.isArray(raw.chords)) v = 2;
  let p = raw;
  while (v < VERSION) { p = MIGRATIONS[v](p); v++; }
  if (raw.version === VERSION && raw.format !== FORMAT) throw new ProjectError('This file is not a project.');

  const d = newProject();
  const mixOf = (m, dm) => ({ volume: clamp(num(m && m.volume, dm.volume), 0, 1), pan: clamp(num(m && m.pan, 0), -1, 1), mute: !!(m && m.mute), solo: !!(m && m.solo) });
  const t = p.tracks && typeof p.tracks === 'object' ? p.tracks : {};
  const chords = (Array.isArray(p.chords) ? p.chords : []).slice(0, MAX_CHORDS).map(c => {
    if (!c || typeof c.sym !== 'string') return null;
    const one = parseChord(c.sym.slice(0, 40)); if (!one) return null;
    const beats = typeof c.beats === 'number' && isFinite(c.beats) ? clamp(c.beats, 0.25, 64) : null;
    return { id: str(c.id, '', 16) || shortId(), sym: chordToText({ ...one, beats: null }), beats, section: cleanSection(str(c.section, '', 60)) };
  }).filter(Boolean);
  const notes = (Array.isArray(t.melody && t.melody.notes) ? t.melody.notes : []).slice(0, 4096)
    .filter(n => n && [n.t, n.d, n.m].every(x => typeof x === 'number' && isFinite(x)) && n.d > 0 && n.t >= 0)
    .map(n => ({ t: clamp(n.t, 0, NOTE_MAX_T), d: clamp(n.d, NOTE_MIN_D, NOTE_MAX_D), m: clamp(Math.round(n.m), 24, 108) }));
  const key = /^(auto|([0-9]|1[01])(:m)?)$/.test(String(p.key)) ? String(p.key) : 'auto';
  return {
    format: FORMAT, version: VERSION,
    id: str(p.id, '', 64) || newId(), name: str(p.name, '', 80).trim() || 'Untitled',
    createdAt: num(p.createdAt, d.createdAt), updatedAt: num(p.updatedAt, d.updatedAt),
    tempo: clamp(num(p.tempo, 90), 20, 300), beatsPerChord: clamp(num(p.beatsPerChord, 4), 0.25, 64),
    key, glide: clamp(num(p.glide, 0.26), 0.02, 2), chords: uniqueIds(chords),
    glideStyle: {
      curve: GLIDE_CURVES.includes(p.glideStyle && p.glideStyle.curve) ? p.glideStyle.curve : DEFAULT_STYLE.curve,
      vibrato: clamp(num(p.glideStyle && p.glideStyle.vibrato, DEFAULT_STYLE.vibrato), 0, 1),
      swell: clamp(num(p.glideStyle && p.glideStyle.swell, DEFAULT_STYLE.swell), 0, 1),
    },
    text: { hook: str(p.text && p.text.hook), question: str(p.text && p.text.question), reveal: str(p.text && p.text.reveal), watermark: str(p.text && p.text.watermark, '', 60) },
    tracks: {
      voices: { ...mixOf(t.voices, d.tracks.voices), sound: str(t.voices && t.voices.sound, 'pad', 24) || 'pad', split: splitOf(t.voices && t.voices.split) },
      chords: { ...mixOf(t.chords, d.tracks.chords), instrument: str(t.chords && t.chords.instrument, 'none', 24) || 'none' },
      bass: { ...mixOf(t.bass, d.tracks.bass), instrument: 'bass', pattern: t.bass && typeof t.bass.pattern === 'string' && Object.hasOwn(BASS_PATTERNS, t.bass.pattern) ? t.bass.pattern : 'off' },
      drums: { ...mixOf(t.drums, d.tracks.drums), pattern: t.drums && typeof t.drums.pattern === 'string' && Object.hasOwn(DRUM_PATTERNS, t.drums.pattern) ? t.drums.pattern : 'off',
        swing: clamp(num(t.drums && t.drums.swing, 0), 0, DRUM_SWING_MAX), steps: cleanSteps(t.drums && t.drums.steps) },
      melody: { ...mixOf(t.melody, d.tracks.melody), instrument: str(t.melody && t.melody.instrument, 'celesta', 24) || 'celesta', notes },
    },
  };
}

const uniqueIds = chords => { const seen = new Set(); return chords.map(c => { let id = c.id; while (seen.has(id)) id = shortId(); seen.add(id); return id === c.id ? c : { ...c, id }; }); };
const splitOf = s => { const g = k => (s && typeof s[k] === 'string' && s[k] ? s[k].slice(0, 24) : null); return { bass: g('bass'), inner: g('inner'), top: g('top') }; };

/** Parse the text of a .json project file. Throws ProjectError with a readable message. */
export function parseProjectFile(text) {
  let raw;
  try { raw = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { throw new ProjectError('This file could not be read: it is not valid JSON. Pick a project file exported from this app.'); }
  return normalizeProject(raw);
}

export function serializeProject(project) { return JSON.stringify(project, null, 1); }

/** A safe file name for exports. */
export function fileBase(project) {
  return (project.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
}
