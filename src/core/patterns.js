// Patterns: turn the chords of a song into note events for each track. Pure functions, no audio.
// All times are seconds on the song's own clock (the progression unrolled three times, see core/song.js).
import { chordNotes } from './song.js';

/**
 * @typedef {{t:number, d:number, m:number, v:number}} NoteEvent   start, gate length, MIDI note, velocity 0…1
 * @typedef {{t:number, kind:'kick'|'snare'|'hat', v:number}} DrumEvent
 * @typedef {{lo:number, hi:number, from?:number}} Span  only chords that touch [lo, hi] are used; `from` is where
 *   playback starts: notes are never tied across it, so nothing that began earlier is needed.
 */

const EPS = 1e-6;
const pc = m => ((m % 12) + 12) % 12;

function eachChord(song, span, fn) {
  const S = song.starts, n = S.length;
  let fresh = span.from !== undefined;
  for (let i = 0; i < n; i++) {
    const end = i + 1 < n ? S[i + 1] : song.end;
    if (end < span.lo || S[i] > span.hi) continue;
    if (span.from !== undefined && end <= span.from + EPS) continue;
    // the first chord that starts after the play head is struck in full: nothing is tied over from before
    const first = fresh && S[i] >= /** @type {number} */(span.from) - EPS;
    fn(i, S[i], end, first); if (first) fresh = false;
  }
}
const upDown = k => (k >= 4 ? [0, 1, 2, 3, 2, 1] : k === 3 ? [0, 1, 2, 1, 2, 1] : [0, 1, 0, 1, 0, 1]);

/**
 * How an instrument plays the chord track.
 * @param {any} song @param {string} style @param {Span} span @returns {NoteEvent[]}
 */
export function chordEvents(song, style, span) {
  /** @type {NoteEvent[]} */ const out = [];
  const S = song.starts, n = S.length, beat = song.spb;
  eachChord(song, span, (i, start, end, first) => {
    const v = song.v[i], notes = chordNotes(song, i), len = end - start;
    const upper = [...new Set(v.upper)].sort((a, b) => a - b);
    if (style === 'tied') {
      // a note shared with the next chords keeps ringing instead of being struck again.
      // In a loop (song.loop) a note that every chord of the cycle shares is struck again at each cycle start, so it never runs out.
      const cyc = song.n, whole = m => !!song.loop && Array.from({ length: cyc }, (_, c) => chordNotes(song, cyc + c).includes(m)).every(Boolean);
      for (const m of notes) {
        const again = i % cyc === 0 && whole(m);
        if (!first && i > 0 && chordNotes(song, i - 1).includes(m) && !again) continue;
        let j = i + 1; while (j < n && chordNotes(song, j).includes(m) && !(song.loop && j % cyc === 0 && whole(m))) j++;
        out.push({ t: start, d: (j < n ? S[j] : song.end + 1.5) - start, m, v: m < 52 ? 1 : 0.9 });
      }
    } else if (style === 'block') {
      for (const m of notes) out.push({ t: start, d: len, m, v: m < 52 ? 1 : 0.9 });
    } else if (style === 'strum') {
      // six-string feel: bass, then the chord tones low to high, 22 ms apart; a lighter up-stroke on beat 3 of long chords
      const lows = [v.bass < 40 ? v.bass + 12 : v.bass, ...upper], strings = lows.concat(upper.length < 4 ? [upper[0] + 12] : []).slice(0, 6);
      strings.forEach((m, k) => out.push({ t: start + k * 0.022, d: len - k * 0.022, m, v: 1 - 0.05 * k }));
      if (len >= 4 * beat - EPS) strings.slice(1).reverse().forEach((m, k) => out.push({ t: start + 2 * beat + k * 0.016, d: len - 2 * beat, m, v: 0.6 }));
    } else if (style === 'arp' || style === 'arpHigh') {
      const high = style === 'arpHigh';
      const line = high ? upper.map(m => (m + 12 <= 88 ? m + 12 : m)) : [v.bass < 45 ? v.bass + 12 : v.bass, ...upper];
      const k = line.length, pat = upDown(k);
      let j = 0;
      for (let t = start; t < end - EPS; t += beat, j++) out.push({ t, d: high ? 3 : beat * 2.4, m: line[Math.min(pat[j % 6], k - 1)], v: j % 6 === 0 ? 1 : 0.75 });
    } else if (style === 'sweep' || style === 'roll') {
      // chord tones over about two octaves, low to high: a quick finger sweep (42 ms apart) or a slower harp roll
      const pcs = new Set([v.bass, ...v.upper].map(pc)), base = Math.min(...v.upper) - (style === 'roll' ? 12 : 5), tones = [];
      for (let m = base; m <= base + 27 && tones.length < 9; m++) if (pcs.has(pc(m))) tones.push(m);
      const gap = style === 'roll' ? Math.min(0.09, len / (tones.length * 1.5)) : 0.042;
      const sweep = (t, vel) => tones.forEach((m, k) => out.push({ t: t + k * gap, d: Math.max(0.3, len - k * gap), m, v: vel * (0.85 + 0.15 * k / (tones.length - 1 || 1)) }));
      sweep(start, 1);
      if (len >= 4 * beat - EPS) sweep(start + 2 * beat, 0.6);
    }
  });
  return out;
}

/** @param {any} song @param {string} pattern @param {Span} span @returns {NoteEvent[]} */
export function bassEvents(song, pattern, span) {
  /** @type {NoteEvent[]} */ const out = [];
  if (!pattern || pattern === 'off') return out;
  const beat = song.spb;
  eachChord(song, span, (i, start, end) => {
    let root = song.v[i].bass; while (root > 47) root -= 12; while (root < 28) root += 12;
    const len = end - start, ch = song.chords[i];
    const fifth = root + (ch.q === 'dim' || ch.q === 'dim7' || ch.q === 'm7b5' ? 6 : ch.q === 'aug' ? 8 : 7);
    if (pattern === 'root') { out.push({ t: start, d: len * 0.96, m: root, v: 1 }); return; }
    let j = 0;
    for (let t = start; t < end - EPS; t += beat, j++) {
      const d = Math.min(beat * 0.9, end - t);
      const m = pattern === 'fifth' ? (j % 4 === 2 ? fifth - (fifth > 47 ? 12 : 0) : root) : pattern === 'octave' ? (j % 2 ? root + 12 : root) : root;
      if (pattern === 'fifth' && j % 2 === 1) continue;
      out.push({ t, d: pattern === 'fifth' ? Math.min(beat * 1.8, end - t) : d, m, v: j % 4 === 0 ? 1 : 0.8 });
    }
  });
  return out;
}

/** @param {any} song @param {string} pattern @param {Span} span @returns {DrumEvent[]} */
export function drumEvents(song, pattern, span) {
  /** @type {DrumEvent[]} */ const out = [];
  if (!pattern || pattern === 'off') return out;
  const beat = song.spb;
  eachChord(song, span, (i, start, end) => {
    let j = 0;
    for (let t = start; t < end - EPS; t += beat, j++) {
      const b = j % 4, half = t + beat / 2 < end - EPS;
      if (pattern === 'soft') {
        if (b === 0) out.push({ t, kind: 'kick', v: 0.7 });
        out.push({ t, kind: 'hat', v: b === 0 ? 0.5 : 0.3 });
      } else if (pattern === 'basic') {
        if (b === 0 || b === 2) out.push({ t, kind: 'kick', v: b === 0 ? 1 : 0.8 }); else out.push({ t, kind: 'snare', v: 0.8 });
        out.push({ t, kind: 'hat', v: 0.5 }); if (half) out.push({ t: t + beat / 2, kind: 'hat', v: 0.3 });
      } else if (pattern === 'four') {
        out.push({ t, kind: 'kick', v: b === 0 ? 1 : 0.85 });
        if (b === 1 || b === 3) out.push({ t, kind: 'snare', v: 0.7 });
        if (half) out.push({ t: t + beat / 2, kind: 'hat', v: 0.5 });
      } else if (pattern === 'half') {
        if (b === 0) out.push({ t, kind: 'kick', v: 1 });
        if (b === 2) out.push({ t, kind: 'snare', v: 0.85 });
        out.push({ t, kind: 'hat', v: b % 2 ? 0.3 : 0.5 });
      }
    }
  });
  return out;
}

/**
 * The melody is written against one pass of the loop (beats from the loop start); it repeats with every cycle.
 * @param {any} song @param {{t:number,d:number,m:number}[]} notes @param {Span} span @returns {NoteEvent[]}
 */
export function melodyEvents(song, notes, span) {
  /** @type {NoteEvent[]} */ const out = [];
  if (!notes || !notes.length) return out;
  for (let c = 0; c < 3; c++) for (const n of notes) {
    if (n.t >= song.beats - EPS) continue;
    const t = c * song.cycle + n.t * song.spb, d = Math.min(n.d, song.beats - n.t) * song.spb;
    if (t + d <= span.lo + EPS || t > span.hi) continue;
    if (span.from !== undefined && t + d <= span.from + EPS) continue;
    out.push({ t, d: d * 0.95, m: n.m, v: 0.9 });
  }
  return out;
}

/**
 * Polyphony limit: when more than `max` notes would sound together, the oldest ones are cut short
 * (their gate ends where the newcomer starts; the instrument's own release fades them out).
 * @param {NoteEvent[]} events @param {number} max @returns {NoteEvent[]}
 */
export function limitPolyphony(events, max) {
  const sorted = events.map(e => ({ ...e })).sort((a, b) => a.t - b.t);
  /** @type {NoteEvent[]} */ let active = [];
  for (const e of sorted) {
    active = active.filter(a => a.t + a.d > e.t + EPS);
    while (active.length >= max) { const old = active.shift(); if (old) old.d = Math.max(0.02, e.t - old.t); }
    active.push(e);
  }
  return sorted;
}
