// The pitch bus: one ConstantSourceNode per voice, in cents, connected to the detune of every oscillator of that voice.
// Its value follows core/song.js glideCurve exactly, so what is heard is what is drawn.
// Oscillators keep a fixed frequency (the voice's first note × partial ratio); all sliding is detune.
import { slotPitch, glideOf, glideCurve } from '../core/song.js';

/**
 * Schedule voice k's pitch, in cents relative to its first note, on `param`.
 * `abs` maps song time to context time; events that are already over at `now` are folded into the start value,
 * so a live play that begins mid-song never schedules anything in the past.
 */
export function schedulePitch(param, song, k, abs, now) {
  const S = song.starts, n = S.length, base = slotPitch(song, 0, k);
  const cents = i => (slotPitch(song, i, k) - base) * 100;
  /** @type {{t:number, dur:number, curve:Float32Array}[]} */ const ev = [];
  let initial = 0, last = -1;
  for (let i = 1; i < n; i++) {
    if (slotPitch(song, i, k) === slotPitch(song, i - 1, k)) continue;
    const g = glideOf(song, i), from = S[i] - g, a = abs(from), b = abs(S[i]);
    if (b <= now) { initial = cents(i); continue; }
    if (a < now) { // started already: continue from the point where we are
      const steps = Math.max(2, Math.ceil((b - now) * 200)), arr = new Float32Array(steps);
      for (let j = 0; j < steps; j++) { const tc = now + (b - now) * j / (steps - 1); arr[j] = cents(i - 1) + 100 * glideCurve(song, k, S[i] - (b - tc)); }
      arr[steps - 1] = cents(i);
      ev.push({ t: now, dur: b - now, curve: arr }); last = b;
    } else {
      const steps = Math.max(8, Math.ceil(g * 240)), arr = new Float32Array(steps);
      for (let j = 0; j < steps; j++) arr[j] = cents(i - 1) + 100 * glideCurve(song, k, from + g * j / (steps - 1));
      arr[steps - 1] = cents(i);
      const t = Math.max(a, last + 1e-6); // curves must not overlap, even by rounding
      ev.push({ t, dur: Math.max(1e-4, b - t), curve: arr }); last = b;
    }
  }
  param.setValueAtTime(initial, 0);
  for (const e of ev) param.setValueCurveAtTime(/** @type {Float32Array} */(e.curve), e.t, e.dur);
  return base;
}

/** A pitch bus for voice k. Returns {bus, base}: `base` is the frequency (Hz) the oscillators are tuned to. */
export function createPitchBus(ac, song, k, abs, start, stop, hz) {
  const bus = ac.createConstantSource(); bus.offset.value = 0;
  const base = schedulePitch(bus.offset, song, k, abs, ac.currentTime);
  bus.start(start); bus.stop(stop);
  return { bus, base: hz(base) };
}
