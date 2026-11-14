// Canvas renderer: draws one frame of the video for a song at a given time. Size, aspect ratio and colours are parameters:
// createRenderer(canvas, {w, h, theme}). Layout is in fractions of w/h (see layoutFor), colours come from a theme (theme.js).
// No audio, no project editing: it only reads the song built by core/song.js.
import { keyName } from '../core/theory.js';
import { slotPitch, idxAt, pitchAt, noteAt, noteName, glideOf } from '../core/song.js';
import { resolveTheme } from './theme.js';

/** The sizes the exporter offers. */
export const RATIOS = { '9:16': { w: 1080, h: 1920 }, '1:1': { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 } };
export const W = 1080, H = 1920;

/**
 * Safe areas for platform interface (fractions of the frame): the top bar, the caption and buttons at the bottom, the button column on the right.
 * The chord name, the staff and the chord lane stay inside them; only the piano and the signature reach into the bottom margin.
 */
export const SAFE = { '9:16': { top: 0.075, bottom: 0.2, side: 0.06, right: 0.12 }, '1:1': { top: 0.05, bottom: 0.07, side: 0.05, right: 0.05 }, '16:9': { top: 0.06, bottom: 0.08, side: 0.04, right: 0.04 } };

/** @param {number} w @param {number} h */
export function ratioOf(w, h) { const r = w / h; return r < 0.8 ? '9:16' : r > 1.3 ? '16:9' : '1:1'; }

/**
 * Every position of the frame, in pixels, from the frame size. `k` scales type and strokes; `sp` is the staff's chord spacing.
 * @param {number} w @param {number} h
 */
export function layoutFor(w, h) {
  const ratio = ratioOf(w, h);
  if (ratio === '16:9') { // a left panel with the chord name and header text, the staff, chord lane and piano on the right
    const k = h / 1080 * 0.8, sx0 = 0.36 * w, sx1 = w, sw = sx1 - sx0;
    return { ratio, k, cx: 0.17 * w, hookMaxW: 0.3 * w, kicker: 0.12 * h, hook1: 0.19 * h, hookLh: 72 * k, name: 0.56 * h, numRow: 0.66 * h, chordSize: 250 * k,
      sx0, sx1, staffTop: 0.1 * h, staffBot: 0.62 * h, playX: sx0 + 0.21 * sw, UB: [0.12 * h, 0.5 * h], BB: [0.54 * h, 0.6 * h], sp: 0.3 * sw,
      lx0: sx0 + 0.03 * sw, lx1: sx1 - 0.03 * sw, laneY: 0.665 * h, laneH: 0.085 * h, kx0: sx0 + 0.05 * sw, kx1: sx1 - 0.05 * sw, kbY: 0.8 * h, kbH: 0.13 * h,
      handleX: 0.17 * w, handle: 0.9 * h };
  }
  if (ratio === '1:1') {
    const k = w / 1080 * 0.62;
    return { ratio, k, cx: 0.5 * w, hookMaxW: 0.82 * w, kicker: 0.085 * h, hook1: 0.135 * h, hookLh: 72 * k, name: 0.345 * h, numRow: 0.4 * h, chordSize: 250 * k,
      sx0: 0, sx1: w, staffTop: 0.43 * h, staffBot: 0.7 * h, playX: 0.305 * w, UB: [0.445 * h, 0.64 * h], BB: [0.655 * h, 0.69 * h], sp: 0.3056 * w,
      lx0: 0.037 * w, lx1: 0.963 * w, laneY: 0.72 * h, laneH: 0.07 * h, kx0: 0.1 * w, kx1: 0.9 * w, kbY: 0.82 * h, kbH: 0.11 * h, handleX: 0.5 * w, handle: 0.975 * h };
  }
  const k = w / 1080; // 9:16
  return { ratio, k, cx: 0.5 * w, hookMaxW: 0.76 * w, kicker: 0.102 * h, hook1: 0.13 * h, hookLh: 72 * k, name: 0.2917 * h, numRow: 0.331 * h, chordSize: 250 * k,
    sx0: 0, sx1: w, staffTop: 0.3594 * h, staffBot: 0.6719 * h, playX: 0.305 * w, UB: [0.3719 * h, 0.5656 * h], BB: [0.6094 * h, 0.6573 * h], sp: 0.3056 * w,
    lx0: 0.037 * w, lx1: 0.963 * w, laneY: 0.683 * h, laneH: 0.0417 * h, kx0: 0.11 * w, kx1: 0.89 * w, kbY: 0.757 * h, kbH: 0.0781 * h, handleX: 0.5 * w, handle: 0.8542 * h };
}

// ---------- easing ----------
const clamp = u => Math.max(0, Math.min(1, u));
const easeOut = u => 1 - Math.pow(1 - clamp(u), 3);
const easeOutQuad = u => { u = clamp(u); return 1 - (1 - u) * (1 - u); };
const easeOutBack = u => { u = clamp(u); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const REVEAL = 2.7;
const HOOK_ON = 2.3, HOOK_OFF = 2.45, LATE_OUT = 0.35, WRAP_IN = 0.12;
const EXTRA = 0.62; // share of a chord's width that is given to the glide: the time axis is stretched around every chord change

// ---------- loop time ----------
// Everything on screen is periodic in song.cycle, so the first frame and the frame one cycle later are identical.
// phase: seconds since the loop start, in [0,cycle). fold: any time mapped into the exported window [vs,ve) (for pitch lookups).
// The discrete "event clock" (chord name, lane, rings, pills) runs `lead` seconds ahead of the sound: the name changes when the voices
// start moving, so the first frame of the loop (which is `lead` before the first chord arrives) already shows the first chord.
const wrap = (d, cyc) => d - Math.floor((d + 1e-6) / cyc) * cyc;
const phaseOf = (song, now) => Math.max(0, wrap(now - song.vs, song.cycle));
const foldT = (song, t) => song.vs + Math.max(0, wrap(t - song.vs, song.cycle));
function clockOf(song, now) {
  const s0 = song.starts[song.n], lead = Math.max(0, s0 - song.vs);
  const d = Math.max(0, wrap(now + lead - s0, song.cycle)), i = idxAt(song, s0 + d);
  return { i, since: d - (song.starts[i] - s0), lead };
}

/**
 * The staff's time axis. Position on screen is not proportional to time: around every chord change the axis is stretched (the glide
 * lasts a quarter second, far too short to read at a steady scroll), so each glide is drawn as a long, readable curve while the sound
 * is untouched. x(t) is periodic: x(t + cycle) = x(t) + period.
 * @param {any} song @param {number} sp pixels per chord on average
 */
function timeAxis(song, sp) {
  const STEP = 1 / 240, cyc = song.cycle, nSteps = Math.ceil(cyc / STEP), E = EXTRA * sp, v0 = (sp - E) / song.dur;
  const bumps = [];
  for (let m = -1; m <= 1; m++) for (let j = song.n; j < 2 * song.n; j++) {
    const g = glideOf(song, j), w = Math.max(0.6 * g, 0.12);
    bumps.push({ c: song.starts[j] - g / 2 + m * cyc, w });
  }
  const speed = t => { let v = v0; for (const b of bumps) { const d = t - b.c; if (d > -b.w && d < b.w) v += E * (1 + Math.cos(Math.PI * d / b.w)) / (2 * b.w); } return v; };
  const tab = new Float64Array(nSteps + 2); // tab[q] = x at vs + q*STEP
  for (let q = 1; q < tab.length; q++) tab[q] = tab[q - 1] + 0.5 * (speed(song.vs + (q - 1) * STEP) + speed(song.vs + q * STEP)) * STEP;
  const per = tab[nSteps] + (cyc - nSteps * STEP) * speed(song.vs + cyc); // x gained over exactly one cycle
  const at = u => { const q = Math.min(nSteps, Math.floor(u / STEP)); return tab[q] + (u - q * STEP) * (tab[q + 1] - tab[q]) / STEP; };
  return {
    period: per,
    /** screen distance (px, from time 0 of the window) of time t */
    x(t) { const m = Math.floor((t - song.vs) / cyc), u = t - song.vs - m * cyc; return m * per + at(u); },
    /** time at screen distance z */
    t(z) {
      const m = Math.floor(z / per), r = z - m * per; let a = 0, b = nSteps;
      while (a < b) { const mid = (a + b + 1) >> 1; if (tab[mid] <= r) a = mid; else b = mid - 1; }
      const dx = tab[a + 1] - tab[a], u = a * STEP + (dx > 0 ? (r - tab[a]) / dx * STEP : 0);
      return song.vs + m * cyc + u;
    },
  };
}

/**
 * @param {HTMLCanvasElement|OffscreenCanvas} cv
 * @param {{w?:number, h?:number, theme?:string|import('./theme.js').Theme}} [opts]
 */
export function createRenderer(cv, opts = {}) {
  let w = opts.w || W, h = opts.h || H, th = resolveTheme(opts.theme), L = layoutFor(w, h);
  cv.width = w; cv.height = h;
  const c = /** @type {CanvasRenderingContext2D} */(cv.getContext('2d'));
  const mk = () => typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : new OffscreenCanvas(w, h);
  let grain = /** @type {any} */(null), staff = /** @type {any} */(null), staffFor = /** @type {any} */(null), axis = /** @type {any} */(null);
  const ia = a => `rgba(${th.inkRGB},${a})`;
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  // upper voices and bass get their own bands, so the voices spread out and the bass sits just below them
  function yOf(song, k, m) {
    if (k === 0) { const sp = Math.max(song.bHi - song.bLo, 7); return L.BB[0] + (song.bHi - m + 1) / (sp + 2) * (L.BB[1] - L.BB[0]); }
    const sp = Math.max(song.uHi - song.uLo, 9); return L.UB[0] + (song.uHi - m + 1) / (sp + 2) * (L.UB[1] - L.UB[0]);
  }
  // ---------- static layers: paper grain + faint staff guides ----------
  function buildGrain() {
    grain = mk(); const g = grain.getContext('2d'), img = g.createImageData(w, h); let s = 7;
    for (let i = 0; i < img.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = s >>> 24; img.data[i] = img.data[i + 1] = img.data[i + 2] = th.name === 'night' ? 255 : v; img.data[i + 3] = th.name === 'night' ? v >> 5 : th.grain; }
    g.putImageData(img, 0, 0);
  }
  function paintStaticLayers(song) {
    if (!staff) staff = mk();
    const g = staff.getContext('2d'); g.clearRect(0, 0, w, h); if (!song) return;
    // one even, ruled grid over the whole staff: the upper voices' semitone step, repeated from top to bottom.
    const step = (L.UB[1] - L.UB[0]) / (Math.max(song.uHi - song.uLo, 9) + 2), y0 = yOf(song, 1, song.uHi);
    g.fillStyle = ia(0.05);
    for (let y = y0 - Math.floor((y0 - L.staffTop) / step) * step; y <= L.staffBot + 0.5; y += step) g.fillRect(L.sx0, Math.round(y) - 1, L.sx1 - L.sx0, 2);
  }

  // ---------- drawing helpers ----------
  const font = (wt, px) => { c.font = `${wt} ${Math.round(px * 10) / 10}px Inter, system-ui, sans-serif`; };
  function rr(x, y, ww, hh, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, ww, hh, r); else c.rect(x, y, ww, hh); }
  function spaced(txt, x, y, sp, align) { let tw = 0; for (const ch of txt) tw += c.measureText(ch).width + sp; tw -= sp; let xx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x; c.textAlign = 'left'; for (const ch of txt) { c.fillText(ch, xx, y); xx += c.measureText(ch).width + sp; } return tw; }
  function chordMetrics(ch, size) {
    font(800, size); const rw = c.measureText(ch.letter).width;
    font(700, size * 0.46); const aw = ch.acc ? c.measureText(ch.acc).width : 0;
    const suf = ch.qd + (ch.slash ? '/' + ch.slash : ''); const sw = suf ? c.measureText(suf).width : 0;
    return { rw, suf, total: rw + Math.max(aw, sw) + (aw || sw ? size * 0.05 : 0) };
  }
  function drawChord(ch, x, y, size, col) {
    const m = chordMetrics(ch, size); let x0 = x - m.total / 2;
    c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    font(800, size); c.fillText(ch.letter, x0, y); x0 += m.rw + size * 0.035;
    font(700, size * 0.46); if (ch.acc) c.fillText(ch.acc, x0, y - size * 0.5); if (m.suf) c.fillText(m.suf, x0, y);
  }
  // hook / question text: "*word*" is drawn in pink; words rise in one after another
  function richLines(txt, size, maxW) {
    font(800, size); const words = txt.split(/\s+/).filter(Boolean).map(wd => { const pink = /^\*.*\*[.,!?]*$/.test(wd) || /^\*/.test(wd) && /\*/.test(wd.slice(1)); return { t: wd.replace(/\*/g, ''), pink }; });
    const lines = []; let cur = [], wsum = 0; const sp = c.measureText(' ').width;
    for (const wd of words) { const ww = c.measureText(wd.t).width; if (cur.length && wsum + sp + ww > maxW) { lines.push(cur); cur = []; wsum = 0; } cur.push(wd); wsum += (cur.length > 1 ? sp : 0) + ww; }
    if (cur.length) lines.push(cur);
    // balance two-line text so no word is left alone on the second line
    if (lines.length === 2) { const all = words, wOf = ws => ws.reduce((a, wd, q) => a + c.measureText(wd.t).width + (q ? sp : 0), 0); let best = null;
      for (let q = 1; q < all.length; q++) { const a = all.slice(0, q), b = all.slice(q), m = Math.max(wOf(a), wOf(b)); if (m <= maxW && (!best || m < best.m)) best = { m, l: [a, b] }; }
      if (best) return best.l; }
    return lines;
  }
  function drawRich(txt, size, y1, lh, t, alpha, drift) {
    if (alpha <= 0 || !txt) return;
    let lines = richLines(txt, size, L.hookMaxW);
    if (lines.length > 2) { size *= 0.78; lh *= 0.82; lines = richLines(txt, size, L.hookMaxW); } // three lines: smaller, so they stay above the chord name
    font(800, size); const sp = c.measureText(' ').width; let wi = 0;
    c.save(); c.textAlign = 'left';
    lines.forEach((ln, j) => {
      const tw = ln.reduce((a, wd, q) => a + c.measureText(wd.t).width + (q ? sp : 0), 0); let x = L.cx - tw / 2;
      for (const wd of ln) { const u = easeOut((t - wi * 0.06) / 0.32); c.globalAlpha = alpha * u; c.fillStyle = wd.pink ? th.pink : th.ink;
        c.fillText(wd.t, x, y1 + j * lh + 16 * L.k * (1 - u) - drift); x += c.measureText(wd.t).width + sp; wi++; }
    });
    c.restore();
  }

  // ---------- background ----------
  function drawBg() {
    c.fillStyle = `rgb(${th.paper.join(',')})`; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h * 0.42, 80 * L.k, w / 2, h * 0.46, Math.max(w, h) * 0.82);
    g.addColorStop(0, th.glow[0]); g.addColorStop(1, th.glow[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const v = c.createRadialGradient(w / 2, h / 2, Math.max(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
    v.addColorStop(0, th.vignette[0]); v.addColorStop(1, th.vignette[1]); c.fillStyle = v; c.fillRect(0, 0, w, h);
    c.drawImage(grain, 0, 0); c.drawImage(staff, 0, 0);
  }

  // ---------- header: hook / question / reveal text, then the chord name ----------
  // Layers over one loop (phase p): the hook (or, without one, the quiet meta line) at the start; the question, then the reveal in the last
  // seconds. The late layer fades out just before the wrap and the first layer fades back in, so frame `cycle` equals frame 0.
  function headerLayers(song, p) {
    const cyc = song.cycle, left = cyc - p;
    const late = song.reveal && left <= REVEAL ? 'reveal' : song.question && left <= song.qSec ? 'question' : null;
    let lateA = 0, lateT = 0;
    if (late) { const dur = late === 'reveal' ? REVEAL : song.qSec; lateT = dur - left; lateA = easeOut(lateT / (late === 'reveal' ? 0.25 : 0.2)) * clamp((left - WRAP_IN) / (LATE_OUT - WRAP_IN)); }
    const rise = clamp((p - (cyc - WRAP_IN)) / WRAP_IN);              // the first layer comes back just before the wrap
    const early = late && left > WRAP_IN ? 0 : 1;
    let hookA = 0, drift = 0;
    if (song.hook) { if (p < HOOK_ON) hookA = 1; else if (p < HOOK_OFF) { hookA = 1 - (p - HOOK_ON) / (HOOK_OFF - HOOK_ON); drift = 8 * (1 - hookA); } if (cyc - p <= WRAP_IN) hookA = Math.max(hookA, rise); hookA *= early; }
    const metaA = song.hook ? easeOut((p - HOOK_OFF) / 0.3) * (1 - hookA) * (late ? 0 : 1) : late ? rise * early : 1;
    return { late, lateA, lateT, hookA, drift, metaA };
  }
  function drawHeader(song, now, i, since) {
    const ch = song.chords[i], p = phaseOf(song, now), HL = headerLayers(song, p), k = L.k;
    c.save();
    // the hook is fully on screen from frame 0 (it is the thumbnail and the first thing read)
    if (HL.hookA > 0) drawRich(song.hook, 64 * k, L.hook1, L.hookLh, 10, HL.hookA, HL.drift);
    if (HL.late === 'question' && HL.lateA > 0) { font(800, 34 * k); c.globalAlpha = HL.lateA; c.fillStyle = th.pink; spaced('YOUR TURN', L.cx, L.kicker, 5 * k, 'center'); drawRich(song.question, 64 * k, L.hook1, L.hookLh, HL.lateT + 0.3, HL.lateA, 0); }
    if (HL.late === 'reveal' && HL.lateA > 0) {
      c.globalAlpha = HL.lateA; font(800, 34 * k); c.fillStyle = th.pink; spaced('IT WAS', L.cx, L.kicker, 6 * k, 'center');
      const parts = song.reveal.split(/\s+[—–-]\s+/); font(900, 70 * k); c.fillStyle = th.ink; c.textAlign = 'center';
      c.fillText(parts[0], L.cx, L.hook1 + 10 * k * (1 - HL.lateA)); if (parts[1]) { font(600, 42 * k); c.fillStyle = ia(0.62); c.fillText(parts.slice(1).join(' — '), L.cx, L.hook1 + 62 * k); }
    }
    if (HL.metaA > 0) { // quiet meta line: section and key
      c.globalAlpha = HL.metaA; font(800, 40 * k); c.fillStyle = th.meta;
      spaced([ch.section, keyName(song.key, song.sharps)].filter(Boolean).join('   ·   ').toUpperCase(), L.cx, L.hook1, 4 * k, 'center');
    }
    // chord name: full size from the first frame (the header text sits above it); a small settle on each change
    const pop = 1 + 0.06 * Math.sin(Math.PI * clamp(since / 0.2));
    c.globalAlpha = 1; c.save(); c.translate(L.cx, L.name); c.scale(pop, pop); drawChord(ch, 0, 0, L.chordSize, th.ink); c.restore();
    // roman numeral pill
    font(800, 46 * k); const rn = ch.rn, rw = c.measureText(rn).width + 52 * k, ph = 62 * k;
    c.fillStyle = rgba(th.pink, 0.14); rr(L.cx - rw / 2, L.numRow - 44 * k, rw, ph, ph / 2); c.fill();
    c.fillStyle = th.pink; c.textAlign = 'center'; c.fillText(rn, L.cx, L.numRow + 4 * k);
    c.restore();
  }

  // ---------- staff ----------
  function drawStaff(song, now, i, since) {
    const k = L.k, ch = song.chords[i];
    if (!axis || axis.song !== song || axis.sp !== L.sp) axis = Object.assign(timeAxis(song, L.sp), { song, sp: L.sp });
    const phs = foldT(song, now), x0 = axis.x(phs), X = t => L.playX + axis.x(t) - x0; // screen x of any time t
    c.save();
    c.beginPath(); c.rect(L.sx0, L.staffTop - 30 * k, L.sx1 - L.sx0, L.staffBot - L.staffTop + 60 * k); c.clip();
    // accent on chords outside the key: a breath of scale and a faint pink flash
    if (ch.strong && since >= 0 && since < 0.12) { const sc = 1 + 0.015 * Math.sin(Math.PI * since / 0.12), my = (L.staffTop + L.staffBot) / 2; c.translate(L.cx, my); c.scale(sc, sc); c.translate(-L.cx, -my); }
    // chord boundaries (where each chord arrives), repeated every cycle
    c.strokeStyle = ia(0.07); c.lineWidth = 2 * k;
    for (let m = -2; m <= 2; m++) for (let j = song.n; j < 2 * song.n; j++) {
      const x = X(song.starts[j] + m * song.cycle); if (x < L.sx0 || x > L.sx1) continue;
      c.beginPath(); c.moveTo(x, L.staffTop); c.lineTo(x, L.staffBot); c.stroke();
    }
    c.strokeStyle = ia(0.34); c.lineWidth = 2 * k; c.beginPath(); c.moveTo(L.playX, L.staffTop); c.lineTo(L.playX, L.staffBot); c.stroke();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const stroke = pts => { c.beginPath(); pts.forEach((p, j) => j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
    // sample every 3 px; the time of each sample is shared by all six voices
    const xs = [], ts = []; for (let x = L.sx0 - 8; x <= L.sx1 + 8; x += 3) { xs.push(x); ts.push(foldT(song, axis.t(x0 + (x - L.playX)))); }
    const paths = [];
    for (let v = 5; v >= 0; v--) { const pts = xs.map((x, q) => [x, yOf(song, v, pitchAt(song, v, ts[q]))]); paths.push({ v, pts, split: pts.findIndex(p => p[0] >= L.playX) }); }
    for (const { v, pts, split } of paths) { const f = c.createLinearGradient(L.playX, 0, L.sx1, 0); f.addColorStop(0, rgba(th.voices[v], .62)); f.addColorStop(1, rgba(th.voices[v], .2)); c.strokeStyle = f; c.lineWidth = 7 * k; stroke(pts.slice(split)); }
    for (const { v, pts, split } of paths) {
      const past = pts.slice(0, split + 1);
      c.save(); c.translate(0, 4 * k); c.strokeStyle = ia(0.07); c.lineWidth = 14 * k; stroke(past); c.restore();
      const g = c.createLinearGradient(L.playX - 240 * k, 0, L.playX, 0); g.addColorStop(0, rgba(th.voices[v], 0)); g.addColorStop(1, th.voices[v]);
      c.strokeStyle = g; c.lineWidth = 11 * k; stroke(past);
    }
    // dots, with a ring on the voices that just moved
    const cur = [], seen = new Set();
    for (let v = 0; v < 6; v++) { const p = pitchAt(song, v, phs), key = v === 0 ? 'b' : Math.round(p * 4); if (seen.has(key)) continue; seen.add(key); cur.push({ k: v, p, y: yOf(song, v, p), col: th.voices[v], moved: slotPitch(song, i, v) !== slotPitch(song, i - 1, v) }); }
    cur.sort((a, b) => a.y - b.y);
    for (const d of cur) {
      if (d.moved && since >= 0 && since < 0.35) { const u = easeOutQuad(since / 0.35); c.strokeStyle = rgba(d.col, 0.5 * (1 - u)); c.lineWidth = 3 * k; c.beginPath(); c.arc(L.playX, d.y, 19 * k * (1 + 0.8 * u), 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = d.col; c.beginPath(); c.arc(L.playX, d.y, 17 * k, 0, Math.PI * 2); c.fill();
      c.strokeStyle = th.dotRing; c.lineWidth = 5 * k; c.stroke();
    }
    // note pills in a column, tied to their dots
    const LX = L.playX + 80 * k, GAP = 62 * k, lab = cur.map(d => ({ ...d, ly: d.y }));
    for (let j = 1; j < lab.length; j++) if (lab[j].ly - lab[j - 1].ly < GAP) lab[j].ly = lab[j - 1].ly + GAP;
    const over = lab.length ? lab[lab.length - 1].ly - (L.staffBot - 10 * k) : 0; if (over > 0) lab.forEach(d => { d.ly -= over; });
    for (let j = lab.length - 2; j >= 0; j--) if (lab[j + 1].ly - lab[j].ly < GAP) lab[j].ly = lab[j + 1].ly - GAP;
    const span = Math.min(1.2, (song.starts[i + 1] !== undefined ? song.starts[i + 1] - song.starts[i] : 2) * 0.8);
    for (const d of lab) {
      const nm = noteName(song, noteAt(song, d.k, phs), ch); font(800, 40 * k); const pw = c.measureText(nm).width + 40 * k, ph = 54 * k;
      c.strokeStyle = rgba(d.col, .55); c.lineWidth = 2.5 * k; c.beginPath(); c.moveTo(L.playX + 22 * k, d.y); c.bezierCurveTo(L.playX + 50 * k, d.y, LX - 30 * k, d.ly, LX - 4 * k, d.ly); c.stroke();
      const s = d.moved && since >= 0 && since < 0.22 ? 0.85 + 0.15 * easeOutBack(since / 0.22) : 1;
      c.save(); c.translate(LX + pw / 2, d.ly); c.scale(s, s); c.translate(-pw / 2, 0); // pop from the pill's centre, not its left edge
      c.fillStyle = d.col; rr(0, -ph / 2, pw, ph, ph / 2); c.fill();
      c.fillStyle = th.pillText; c.textAlign = 'left'; c.fillText(nm, 20 * k, 14 * k);
      c.restore();
      if (d.moved && since >= 0 && since < span) {
        const dl = slotPitch(song, i, d.k) - slotPitch(song, i - 1, d.k);
        c.globalAlpha = Math.min(1, (span - since) / 0.3, since / 0.1); font(900, 46 * k); c.fillStyle = d.col; c.textAlign = 'left';
        c.lineWidth = 7 * k; c.strokeStyle = `rgb(${th.paper.join(',')})`; c.lineJoin = 'round';
        const txt = (dl > 0 ? '+' : '−') + Math.abs(dl); c.strokeText(txt, LX + pw + 16 * k, d.ly + 16 * k); c.fillText(txt, LX + pw + 16 * k, d.ly + 16 * k); c.globalAlpha = 1;
      }
    }
    c.restore();
  }

  // ---------- chord lane: previous, current, next ----------
  function drawLane(song, now, i, since) {
    const k = L.k, laneW = L.lx1 - L.lx0, CW = Math.min(300 * k, laneW * 0.29), STEP = CW * 1.1, y = L.laneY, hh = L.laneH, mid = (L.lx0 + L.lx1) / 2;
    const dx = STEP * (1 - easeOut(since / 0.26));
    c.save(); c.beginPath(); c.rect(L.lx0, y - 12 * k, laneW, hh + 24 * k); c.clip();
    for (let j = i - 2; j <= i + 2; j++) {
      const cx = mid + (j - i) * STEP + dx, x = cx - CW / 2, cur = j === i, past = j < i;
      // chips fade out toward the lane's edges instead of being cut mid-letter
      const edge = Math.min(cx - CW / 2 - L.lx0, L.lx1 - (cx + CW / 2)), fade = clamp((edge + 20 * k) / (70 * k)); if (fade <= 0) continue;
      c.globalAlpha = fade; rr(x, y, CW, hh, 20 * k);
      if (cur) { c.fillStyle = th.ink; c.fill(); const p = clamp(since / (song.starts[i + 1] - song.starts[i]));
        c.save(); c.clip(); c.fillStyle = `rgba(${th.paper.join(',')},.14)`; c.fillRect(x, y, CW * p, hh); c.restore(); }
      else if (past) { c.fillStyle = ia(0.07); c.fill(); }
      else { c.strokeStyle = ia(0.3); c.lineWidth = 3 * k; c.stroke(); }
      font(800, 44 * k); c.textAlign = 'center'; c.fillStyle = cur ? th.chipText : ia(past ? 0.4 : 0.78);
      c.fillText(song.chords[song.n + (((j - song.n) % song.n) + song.n) % song.n].label, cx, y + hh / 2 + 15 * k);
    }
    c.restore();
  }

  // ---------- piano ----------
  const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  function kbRange(song) { let mn = 99, mx = 0; for (const v of song.v) { mn = Math.min(mn, v.bass); mx = Math.max(mx, v.upper[0]); } let lo = mn - 1, hi = mx + 1; while (isBlack(lo)) lo--; while (isBlack(hi)) hi++; return [lo, hi]; }
  function drawPiano(song, now, i, since) {
    const k = L.k, [lo, hi] = song.kb || (song.kb = kbRange(song)), phs = foldT(song, now);
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = Math.min(60 * k, (L.kx1 - L.kx0) / whites.length), tw = ww * whites.length, x0 = (L.kx0 + L.kx1) / 2 - tw / 2, pad = 16 * k, y = L.kbY, hh = L.kbH;
    const act = new Map(); for (let v = 5; v >= 0; v--) act.set(noteAt(song, v, phs), th.voices[v]);
    const fresh = new Set(); for (let v = 0; v < 6; v++) if (slotPitch(song, i, v) !== slotPitch(song, i - 1, v)) fresh.add(slotPitch(song, i, v));
    const press = m => act.has(m) ? (fresh.has(m) && since >= 0 && since < 0.08 ? 4 * k * since / 0.08 : 4 * k) : 0;
    c.save();
    c.shadowColor = th.keyShadow; c.shadowBlur = 30 * k; c.shadowOffsetY = 10 * k;
    rr(x0 - pad, y - pad - 6 * k, tw + pad * 2, hh + pad * 2 + 6 * k, 24 * k); c.fillStyle = th.keyFrame; c.fill(); c.shadowColor = 'transparent';
    whites.forEach((m, j) => {
      const x = x0 + j * ww, col = act.get(m), p = press(m), g = c.createLinearGradient(0, y, 0, y + hh);
      if (col) { g.addColorStop(0, rgba(col, .8)); g.addColorStop(1, col); } else { g.addColorStop(0, th.keyWhite[0]); g.addColorStop(1, th.keyWhite[1]); }
      rr(x + 1.5 * k, y + p, ww - 3 * k, hh - p, [0, 0, 9 * k, 9 * k]); c.fillStyle = g; c.fill();
    });
    for (let m = lo; m <= hi; m++) {
      if (!isBlack(m)) continue; const j = whites.indexOf(m - 1); if (j < 0) continue;
      const x = x0 + (j + 1) * ww - ww * 0.31, col = act.get(m), bw = ww * 0.62, bh = hh * 0.6, p = press(m), g = c.createLinearGradient(0, y, 0, y + bh);
      if (col) { g.addColorStop(0, rgba(col, .85)); g.addColorStop(1, col); } else { g.addColorStop(0, th.keyBlack[0]); g.addColorStop(1, th.keyBlack[1]); }
      rr(x, y + p, bw, bh - p * 0.5, [0, 0, 6 * k, 6 * k]); c.fillStyle = g; c.fill();
    }
    for (const [m, col] of act) { if (m < lo || m > hi) continue;
      let x, bw; if (isBlack(m)) { const j = whites.indexOf(m - 1); x = x0 + (j + 1) * ww - ww * 0.31; bw = ww * 0.62; } else { const j = whites.indexOf(m); x = x0 + j * ww + 1.5 * k; bw = ww - 3 * k; }
      c.shadowColor = col; c.shadowBlur = 14 * k; c.fillStyle = col; rr(x + 4 * k, y - pad - 2 * k, bw - 8 * k, 5 * k, 3 * k); c.fill(); }
    c.restore();
  }

  // ---------- frame ----------
  function draw(song, now) {
    c.globalAlpha = 1; c.shadowColor = 'transparent'; drawBg();
    if (!song) { font(700, 44 * L.k); c.fillStyle = ia(0.5); c.textAlign = 'center'; c.fillText('Add a chord to begin', w / 2, h / 2); return; }
    const { i, since } = clockOf(song, now);
    if (song.chords[i].strong && since >= 0 && since < 0.1) { c.fillStyle = rgba(th.pink, 0.03); c.fillRect(0, 0, w, h); }
    drawHeader(song, now, i, since); drawStaff(song, now, i, since); drawLane(song, now, i, since); drawPiano(song, now, i, since);
    if (song.watermark) { c.save(); font(700, 38 * L.k); c.fillStyle = ia(0.62); c.textAlign = 'center'; c.fillText(song.watermark, L.handleX, L.handle); c.restore(); }
  }

  function rebuild() { grain = null; staff = null; staffFor = null; axis = null; }
  return {
    /** Draw the frame at time `now` (seconds on the song's own clock). A null song draws the empty state. */
    draw(song, now) {
      if (!grain) buildGrain();
      if (song && staffFor !== song) { paintStaticLayers(song); staffFor = song; } else if (!song && !staff) paintStaticLayers(null);
      draw(song, now);
    },
    /** Change the frame size (aspect ratio) and/or the theme; the canvas is resized. */
    configure(o = {}) { if (o.w) w = o.w; if (o.h) h = o.h; if (o.theme) th = resolveTheme(o.theme); L = layoutFor(w, h); cv.width = w; cv.height = h; rebuild(); },
    /** What the header shows at `now` (for tests): the chord label. */
    debug(song, now) { const { i } = clockOf(song, now); return { chord: song.chords[i].label }; },
    get layout() { return L; },
    get w() { return w; }, get h() { return h; },
    canvas: cv,
  };
}
