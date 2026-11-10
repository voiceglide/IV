// A small synthesized drum kit: kick, snare, closed hat. Noise comes from one generated buffer.

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
};

/** @param {BaseAudioContext} ac @param {AudioNode} out @param {import('../core/patterns.js').DrumEvent[]} events */
export function scheduleDrums(ac, out, events, abs, live) {
  for (const e of events) {
    const t = abs(e.t);
    if (live && t < ac.currentTime + 0.005) continue;
    HIT[e.kind](ac, out, t, e.v);
  }
}
