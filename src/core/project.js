// Project data: the one JSON document that describes a piece. Versioned, with migrations from older files.
// Pure functions, no DOM, no audio, no storage.
import { parseProgression, chordToText } from './theory.js';

export const FORMAT = 'chord-project';
export const VERSION = 2;

/**
 * @typedef {{sym:string, beats:number|null, section:string}} ChordItem
 * @typedef {{volume:number, pan:number, mute:boolean, solo:boolean}} Mix
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
 * @property {ChordItem[]} chords      the master chord track
 * @property {{hook:string, question:string, reveal:string, watermark:string}} text  on-screen text for the video
 * @property {{voices:Mix, chords:Mix&{instrument:string}, bass:Mix&{instrument:string, pattern:string},
 *   drums:Mix&{pattern:string}, melody:Mix&{instrument:string, notes:MelodyNote[]}}} tracks
 */

export const TRACK_IDS = ['voices', 'chords', 'bass', 'drums', 'melody'];
export const TRACK_LABEL = { voices: 'Gliding voices', chords: 'Chords', bass: 'Bass', drums: 'Drums', melody: 'Melody' };
export const BASS_PATTERNS = { off: 'Off', root: 'Long notes', pulse: 'On every beat', fifth: 'Root and fifth', octave: 'Octaves' };
export const DRUM_PATTERNS = { off: 'Off', soft: 'Soft pulse', basic: 'Basic beat', four: 'Four on the floor', half: 'Half time' };

const mix = (volume = 0.8) => ({ volume, pan: 0, mute: false, solo: false });
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
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
  };
}

/** Chord items → text, one section per line. */
export function chordsToText(chords) {
  let out = '';
  for (const c of chords) {
    if (c.section) out += (out ? '\n' : '') + `[${c.section}] `;
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
    tempo: 90, beatsPerChord: 4, key: 'auto', glide: 0.26,
    chords: chordsFromText(chordText).chords,
    text: { hook: '', question: '', reveal: '', watermark: '' },
    tracks: {
      voices: mix(0.8),
      chords: { ...mix(0.8), instrument: 'none' },
      bass: { ...mix(0.8), instrument: 'bass', pattern: 'off' },
      drums: { ...mix(0.7), pattern: 'off' },
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
    const [instrument, muteVoices] = SOUND_V1[old.sound] || SOUND_V1.pad;
    p.tracks.chords.instrument = instrument; p.tracks.voices.mute = muteVoices;
    if (typeof old.id === 'string') p.id = old.id;
    return p;
  },
};

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
  if (typeof v !== 'number' || v < 1) throw new ProjectError('This file is not a project.');
  if (v > VERSION) throw new ProjectError('This project was made with a newer version of the app. Reload the app to update it, then try again.');
  if (v === 1 && raw.prog === undefined && raw.chords === undefined) throw new ProjectError('This file is not a project.');
  let p = raw;
  while (v < VERSION) { p = MIGRATIONS[v](p); v++; }
  if (raw.version === VERSION && raw.format !== FORMAT) throw new ProjectError('This file is not a project.');

  const d = newProject();
  const mixOf = (m, dm) => ({ volume: clamp(num(m && m.volume, dm.volume), 0, 1), pan: clamp(num(m && m.pan, 0), -1, 1), mute: !!(m && m.mute), solo: !!(m && m.solo) });
  const t = p.tracks && typeof p.tracks === 'object' ? p.tracks : {};
  const chords = (Array.isArray(p.chords) ? p.chords : []).slice(0, 512).map(c => {
    if (!c || typeof c.sym !== 'string') return null;
    const one = chordsFromText(c.sym).chords[0]; if (!one) return null;
    const beats = typeof c.beats === 'number' && isFinite(c.beats) ? clamp(c.beats, 0.25, 64) : null;
    return { sym: one.sym, beats, section: str(c.section, '', 60) };
  }).filter(Boolean);
  const notes = (Array.isArray(t.melody && t.melody.notes) ? t.melody.notes : []).slice(0, 4096)
    .filter(n => n && [n.t, n.d, n.m].every(x => typeof x === 'number' && isFinite(x)) && n.d > 0 && n.t >= 0)
    .map(n => ({ t: n.t, d: n.d, m: clamp(Math.round(n.m), 24, 108) }));
  const key = /^(auto|([0-9]|1[01])(:m)?)$/.test(String(p.key)) ? String(p.key) : 'auto';
  return {
    format: FORMAT, version: VERSION,
    id: str(p.id, '', 64) || newId(), name: str(p.name, '', 80).trim() || 'Untitled',
    createdAt: num(p.createdAt, d.createdAt), updatedAt: num(p.updatedAt, d.updatedAt),
    tempo: clamp(num(p.tempo, 90), 20, 300), beatsPerChord: clamp(num(p.beatsPerChord, 4), 0.25, 64),
    key, glide: clamp(num(p.glide, 0.26), 0.02, 2), chords,
    text: { hook: str(p.text && p.text.hook), question: str(p.text && p.text.question), reveal: str(p.text && p.text.reveal), watermark: str(p.text && p.text.watermark, '', 60) },
    tracks: {
      voices: mixOf(t.voices, d.tracks.voices),
      chords: { ...mixOf(t.chords, d.tracks.chords), instrument: str(t.chords && t.chords.instrument, 'none', 24) || 'none' },
      bass: { ...mixOf(t.bass, d.tracks.bass), instrument: 'bass', pattern: t.bass && t.bass.pattern in BASS_PATTERNS ? t.bass.pattern : 'off' },
      drums: { ...mixOf(t.drums, d.tracks.drums), pattern: t.drums && t.drums.pattern in DRUM_PATTERNS ? t.drums.pattern : 'off' },
      melody: { ...mixOf(t.melody, d.tracks.melody), instrument: str(t.melody && t.melody.instrument, 'celesta', 24) || 'celesta', notes },
    },
  };
}

/** Parse the text of a .json project file. Throws ProjectError with a readable message. */
export function parseProjectFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new ProjectError('This file could not be read: it is not valid JSON. Pick a project file exported from this app.'); }
  return normalizeProject(raw);
}

export function serializeProject(project) { return JSON.stringify(project, null, 1); }

/** A safe file name for exports. */
export function fileBase(project) {
  return (project.name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
}
