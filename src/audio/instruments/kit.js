// Building blocks shared by the instruments: additive voices, FM voices, detuned ensembles, tape wow, breath noise.
import { envelope } from '../instrument.js';

/** A slow pitch drift shared by every note of one playback (cents per LFO). Connect the result to osc.detune. */
export function wow(ac, span, lfos = [[0.55, 5], [6, 1.5]]) {
  const sum = ac.createGain(); sum.gain.value = 1;
  for (const [f, cents] of lfos) {
    const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.value = cents;
    o.connect(g); g.connect(sum); o.start(span.start); o.stop(span.end);
  }
  return sum;
}

/**
 * Additive voice: a few partials through one low-pass and one envelope.
 * partials: [ratio, amplitude, decay time constant in s (0 = follows the envelope only), oscillator type]
 * @param {BaseAudioContext} ac @param {AudioNode} out @param {import('../instrument.js').NoteSpec} n
 * @param {{partials:(number|string)[][], peak:number, attack?:number, decay?:number, sustain?:number, release?:number, lowpass?:number, q?:number, hold?:number, drift?:AudioNode}} o
 */
export function additive(ac, out, n, o) {
  const g = ac.createGain();
  const stop = envelope(g, { time: n.time, duration: o.hold || n.duration, peak: o.peak * n.velocity, attack: o.attack, decay: o.decay, sustain: o.sustain, release: o.release });
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = Math.min(16000, o.lowpass || 8000); fl.Q.value = o.q || 0.5;
  fl.connect(g); g.connect(out);
  for (const [ratio, amp, tau, type] of o.partials) {
    const f = n.freq * /** @type {number} */(ratio); if (f > 15000) continue;
    const osc = ac.createOscillator(); osc.type = /** @type {OscillatorType} */(type || 'sine'); osc.frequency.value = f;
    if (o.drift) o.drift.connect(osc.detune);
    const pg = ac.createGain(); pg.gain.setValueAtTime(/** @type {number} */(amp), n.time); if (tau) pg.gain.setTargetAtTime(0, n.time, /** @type {number} */(tau));
    osc.connect(pg); pg.connect(fl); osc.start(n.time); osc.stop(stop);
  }
  return stop;
}

/**
 * Two-operator FM voice: a sine carrier whose frequency is pushed by a sine modulator; the modulation fades,
 * so the tone starts bright and ends pure, like a struck bar or tine.
 * @param {{ratio:number, index:number, indexDecay:number, peak:number, attack?:number, decay?:number, sustain?:number, release?:number, hold?:number, drift?:AudioNode, lowpass?:number}} o
 */
export function fm(ac, out, n, o) {
  const g = ac.createGain();
  const stop = envelope(g, { time: n.time, duration: o.hold || n.duration, peak: o.peak * n.velocity, attack: o.attack, decay: o.decay, sustain: o.sustain, release: o.release });
  const car = ac.createOscillator(); car.frequency.value = n.freq;
  const mod = ac.createOscillator(); mod.frequency.value = n.freq * o.ratio;
  const mg = ac.createGain(); mg.gain.setValueAtTime(n.freq * o.index * (0.5 + 0.5 * n.velocity), n.time); mg.gain.setTargetAtTime(n.freq * o.index * 0.08, n.time, o.indexDecay);
  if (o.drift) { o.drift.connect(car.detune); o.drift.connect(mod.detune); }
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lowpass || 9000;
  mod.connect(mg); mg.connect(car.frequency); car.connect(fl); fl.connect(g); g.connect(out);
  car.start(n.time); mod.start(n.time); car.stop(stop); mod.stop(stop);
  return stop;
}

/**
 * Sustained ensemble: a few detuned oscillators through a low-pass that opens with the attack.
 * @param {{type:OscillatorType, detune:number[], peak:number, attack:number, release:number, lowpass:number, open?:number, drift?:AudioNode, octave?:number}} o
 */
export function ensemble(ac, out, n, o) {
  const g = ac.createGain();
  const stop = envelope(g, { time: n.time, duration: n.duration, peak: o.peak * n.velocity, attack: o.attack, release: o.release });
  const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.6;
  fl.frequency.setValueAtTime(o.lowpass * 0.5, n.time); fl.frequency.setTargetAtTime(o.lowpass * (o.open || 1), n.time, o.attack);
  fl.connect(g); g.connect(out);
  o.detune.forEach((cents, i) => {
    const osc = ac.createOscillator(); osc.type = o.type; osc.frequency.value = n.freq * (o.octave && i === o.detune.length - 1 ? o.octave : 1); osc.detune.value = cents;
    if (o.drift) o.drift.connect(osc.detune);
    const pg = ac.createGain(); pg.gain.value = 1 / o.detune.length; osc.connect(pg); pg.connect(fl); osc.start(n.time); osc.stop(stop);
  });
  return { stop, filter: fl, gain: g };
}

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
const NOISE = new WeakMap();
/** One second of generated noise, shared per context. */
export function noiseBuffer(ac) {
  let b = NOISE.get(ac);
  if (!b) {
    b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0); let s = 22222;
    for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    NOISE.set(ac, b);
  }
  return b;
}
/** A band of breath or mallet noise with its own short envelope. */
export function breath(ac, out, n, o) {
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(ac); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q || 1;
  const g = ac.createGain();
  const stop = envelope(g, { time: n.time, duration: o.hold || n.duration, peak: o.peak * n.velocity, attack: o.attack || 0.003, decay: o.decay, sustain: o.sustain, release: o.release || 0.1 });
  src.connect(f); f.connect(g); g.connect(out); src.start(n.time, (n.freq * 0.37) % 0.9); src.stop(stop);
}
