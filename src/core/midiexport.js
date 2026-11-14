// Song → Standard MIDI file: one loop, one MIDI track per audible app track.
import { encodeMidi } from './midi.js';
import { chordEvents, bassEvents, drumEvents, melodyEvents } from './patterns.js';
import { chordNotes } from './song.js';

const PROGRAM = { softpiano: 0, arp: 0, lofikeys: 4, celesta: 8, toypiano: 8, musicbox: 10, vibraphone: 11, marimba: 12, kalimba: 108, chiparp: 80, crystal: 98, dreambells: 14,
  strumharp: 46, lullaby: 46, stringmachine: 50, choir: 53, tapeflute: 73, glass: 92, shimmer: 88, bass: 33 };
// General MIDI percussion (channel 10): bass drum 1, acoustic snare, hand clap, closed hat, open hat, low tom
export const DRUM_NOTE = { kick: 36, snare: 38, clap: 39, hat: 42, open: 46, tom: 45 };
const STYLES = { softpiano: 'tied', arp: 'arp', crystal: 'arpHigh', strumharp: 'sweep' };

/**
 * @param {any} song @param {(id:string)=>string} [styleOf] how an instrument plays chords (defaults to block chords)
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function songToMidi(song, styleOf = id => STYLES[id] || 'block') {
  const lo = song.cycle, hi = 2 * song.cycle, eps = 1e-6, spb = song.spb, tr = song.tracks;
  const span = { lo, hi: hi - eps, from: lo };
  const loopBeats = (hi - lo) / spb, loopTicks = Math.round(loopBeats * 480);
  // every onset lands on a tick inside [0, loop) (one that rounds to the loop end would sound on the next downbeat: dropped),
  // and every note ends by the loop's last tick (the 0.05-beat minimum never pushes a cut note past it)
  const inLoop = (evs, drums = false) => evs.filter(e => e.t >= lo - eps && e.t < hi - eps)
    .map(e => { const t = (e.t - lo) / spb; return { t, d: Math.min(Math.max(0.05, (Math.min(e.t + (e.d || 0.1), hi) - e.t) / spb), loopBeats - t), m: e.m, v: drums ? Math.round(127 * (e.v || 0.7)) : Math.round(40 + 60 * (e.v || 0.8)) }; })
    .filter(n => Math.round(n.t * 480) < loopTicks);
  const anySolo = Object.values(tr).some(t => t.solo);
  const audible = id => !tr[id].mute && tr[id].volume > 0 && (!anySolo || tr[id].solo); // same rule as the audio engine
  const tracks = [];
  if (audible('voices')) {
    const notes = [];
    for (let i = song.n; i < 2 * song.n; i++) {
      const end = i + 1 < song.starts.length ? song.starts[i + 1] : song.end;
      for (const m of chordNotes(song, i)) notes.push({ t: song.starts[i], d: end - song.starts[i], m, v: 0.7 });
    }
    tracks.push({ name: 'Voices', channel: 0, program: 89, notes: inLoop(notes) });
  }
  const inst = tr.chords.instrument;
  if (inst && inst !== 'none' && audible('chords')) tracks.push({ name: 'Chords', channel: 1, program: PROGRAM[inst] || 0, notes: inLoop(chordEvents(song, styleOf(inst), span)) });
  if (tr.bass.pattern !== 'off' && audible('bass')) tracks.push({ name: 'Bass', channel: 2, program: PROGRAM.bass, notes: inLoop(bassEvents(song, tr.bass.pattern, span)) });
  if (tr.melody.notes.length && audible('melody')) tracks.push({ name: 'Melody', channel: 3, program: PROGRAM[tr.melody.instrument] || 0, notes: inLoop(melodyEvents(song, tr.melody.notes, span)) });
  if (tr.drums.pattern !== 'off' && audible('drums')) tracks.push({ name: 'Drums', channel: 9, notes: inLoop(drumEvents(song, tr.drums.pattern, span).map(e => ({ t: e.t, d: 0.1, m: DRUM_NOTE[e.kind], v: e.v })), true) });
  return encodeMidi({ bpm: song.tempo, endBeat: loopBeats, tracks });
}
