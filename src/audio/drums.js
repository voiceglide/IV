// A small synthesized drum kit: kick, snare, closed and open hat, clap, tom. Noise comes from one generated buffer.

/** @type {WeakMap<BaseAudioContext, AudioBuffer>} */
const NOISE = new WeakMap();
function noise(ac) {
  let b = NOISE.get(ac);
  if (!b) {
    b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
    const d = b.getChannelData(0); let s = 2463534242;
    for (let i = 0; i < d.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; d[i] = s / 2147483648 - 1; }
    NOISE.set(ac, b);
  }
  return b;
}
function burst(ac, out, t, len, peak, type, freq, q) {
  const src = ac.createBufferSource(); src.buffer = noise(ac);
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, len / 4);
  src.connect(f); f.connect(g); g.connect(out); src.start(t, (t * 7919) % 0.3); src.stop(t + len * 2.5 + 0.05);
}
const HIT = {
  kick(ac, out, t, v) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.05, 0.07);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.7);
  },
  snare(ac, out, t, v) {
    burst(ac, out, t, 0.16, 0.16 * v, 'bandpass', 1900, 0.7);
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.04);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
  },
  hat(ac, out, t, v) { burst(ac, out, t, 0.045, 0.07 * v, 'highpass', 7000, 0.8); },
  open(ac, out, t, v) { burst(ac, out, t, 0.22, 0.06 * v, 'highpass', 6500, 0.8); },
  clap(ac, out, t, v) {
    // three quick smacks and a short tail
    for (const d of [0, 0.011, 0.022]) burst(ac, out, t + d, 0.012, 0.13 * v, 'bandpass', 1500, 1.1);
    burst(ac, out, t + 0.033, 0.1, 0.12 * v, 'bandpass', 1500, 0.9);
  },
  tom(ac, out, t, v) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.12);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.38 * v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.04, 0.09);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.8);
  },
};

/** Play one drum hit at context time t. Unknown lanes are ignored. @param {BaseAudioContext} ac @param {AudioNode} out @param {string} kind @param {number} t @param {number} v 0…1 */
export function hitDrum(ac, out, kind, t, v) {
  if (Object.hasOwn(HIT, kind)) HIT[/** @type {'kick'} */(kind)](ac, out, t, Math.max(0, Math.min(1, v)));
}

/** @param {BaseAudioContext} ac @param {AudioNode} out @param {import('../core/patterns.js').DrumEvent[]} events */
export function scheduleDrums(ac, out, events, abs, live) {
  for (const e of events) {
    const t = abs(e.t);
    if (live && t < ac.currentTime + 0.005) continue;
    hitDrum(ac, out, e.kind, t, e.v);
  }
}
