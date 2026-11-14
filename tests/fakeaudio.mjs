// Test helper: a recording stand-in for an AudioContext, enough to run the engine's scheduling code in Node.
// Every node remembers its type, what was set on it, and whether it was started, stopped or disconnected.

/** @param {{sampleRate?:number}} [o] */
export function fakeContext(o = {}) {
  /** @type {any[]} */ const nodes = [];
  const param = (rec, name) => {
    const p = { value: 0, calls: [] };
    for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'setValueCurveAtTime', 'cancelScheduledValues'])
      p[m] = (...a) => { p.calls.push([m, ...a]); return p; };
    rec.params[name] = p; return p;
  };
  const make = type => {
    const rec = { type, params: {}, started: [], stopped: [], disconnected: 0, connections: [], props: {} };
    const node = new Proxy(rec, {
      get(r, k) {
        if (typeof k === 'symbol') return undefined;
        if (k === '__rec') return r;
        if (k === 'connect') return d => { r.connections.push(d); return d; };
        if (k === 'disconnect') return () => { r.disconnected++; };
        if (k === 'start') return (...a) => { r.started.push(a); };
        if (k === 'stop') return (...a) => { r.stopped.push(a); };
        if (Object.hasOwn(r.props, k)) return r.props[k];
        if (k === 'then') return undefined;
        return r.params[k] || param(r, k);
      },
      set(r, k, v) { r.props[k] = v; return true; },
    });
    nodes.push(node); return node;
  };
  const ctx = new Proxy({ currentTime: 0, sampleRate: o.sampleRate || 48000, state: 'running', nodes }, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      if (k === 'destination') return (t.destination = make('destination'));
      if (k === 'createBuffer') return (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(Math.min(len, 4096)) });
      if (k === 'createPeriodicWave') return () => ({});
      if (k.startsWith('create')) return () => make(k.slice(6));
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}

/** Oscillators that are kicks: sine, pitch dropping from 140 Hz. */
export const kicksOf = (/** @type {any} */ ctx, from = 0) =>
  ctx.nodes.slice(from).filter(n => n.__rec.type === 'Oscillator' && n.__rec.props.type === 'sine'
    && n.__rec.params.frequency && n.__rec.params.frequency.calls.some(c => c[0] === 'setValueAtTime' && c[1] === 140)).length;
