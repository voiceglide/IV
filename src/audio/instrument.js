// The instrument interface. Every file in audio/instruments/ default-exports one object of this shape.
// The engine owns everything around it: when notes happen (core/patterns.js), the per-instrument channel
// (high-pass → balance → volume → pan), polyphony limiting, the reverb and the master bus.
//
// Rules for note():
//  - Build the voice from Web Audio nodes only (oscillators, filters, gains, generated buffers). No samples, no network.
//  - It must work in an OfflineAudioContext as well as a live AudioContext: use only `ac`, never a global context,
//    never setTimeout, never ac.currentTime (schedule from n.time).
//  - No clicks: the voice's gain is 0 at n.time, ramps up over at least 2 ms, and ramps down to silence after
//    n.time + n.duration. Never start or stop an oscillator while its gain is audible.
//  - No stuck notes: every source it starts is stopped, at the latest RELEASE_MAX seconds after the gate ends.
//  - Loudness: at velocity 1 a single mid-range note should peak near 0.1 at `out`. `level` then trims the
//    instrument so that a held four-note chord sits at the same loudness as the other instruments.

/**
 * @typedef {Object} NoteSpec
 * @property {number} midi      MIDI note number (may be fractional)
 * @property {number} freq      frequency in Hz
 * @property {number} time      start, in seconds on the context's clock
 * @property {number} duration  gate length in seconds (plucked sounds may decay sooner on their own)
 * @property {number} velocity  0…1
 *
 * @typedef {Object} Instrument
 * @property {string} id
 * @property {string} name          label shown in the app
 * @property {'chords'|'bass'} role which track can use it
 * @property {'tied'|'block'|'strum'|'arp'|'arpHigh'|'sweep'|'roll'} style  how a chord becomes notes (core/patterns.js)
 * @property {number} highpass      low cut of this instrument's channel, in Hz
 * @property {number} level         balance gain of this instrument's channel
 * @property {number} maxVoices     polyphony cap; the engine shortens the oldest notes beyond it
 * @property {(ac: BaseAudioContext, out: AudioNode, n: NoteSpec, shared?: any) => void} note
 * @property {(ac: BaseAudioContext, out: AudioNode, span: {start:number, end:number}) => any} [setup]
 *   optional: nodes shared by all notes of one playback (an LFO, a body filter…). Start them at span.start,
 *   stop them at span.end. The return value is handed to note() as `shared`.
 */

export const RELEASE_MAX = 6;
export const hz = m => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Gain envelope helper: silent before `time`, linear attack, exponential fall to `sustain` × peak with time
 * constant `decay`, then an exponential release after the gate. Returns the time at which sources can stop.
 * @param {GainNode} g
 * @param {{time:number, duration:number, peak:number, attack?:number, decay?:number, sustain?:number, release?:number}} o
 */
export function envelope(g, o) {
  const attack = Math.max(0.002, o.attack || 0.005), release = Math.max(0.01, o.release || 0.15);
  const sustain = o.sustain === undefined ? 1 : o.sustain, end = Math.max(o.time + attack + 0.005, o.time + o.duration);
  g.gain.setValueAtTime(0, 0); g.gain.setValueAtTime(0, o.time);
  g.gain.linearRampToValueAtTime(o.peak, o.time + attack);
  if (sustain < 1) g.gain.setTargetAtTime(o.peak * sustain, o.time + attack, Math.max(0.01, o.decay || 0.5));
  g.gain.setTargetAtTime(0, end, release / 4);       // −35 dB after one `release`
  g.gain.setValueAtTime(0, end + release * 2);        // and hard zero well below audibility, so stop() is silent
  return Math.min(end + release * 2 + 0.01, end + RELEASE_MAX);
}
