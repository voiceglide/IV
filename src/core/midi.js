// Standard MIDI file (format 1) writer.
// tracks: [{name, channel (0-15), program (0-127, ignored on channel 9), notes: [{t, d, m, v}]}]
// with t and d in beats (quarter notes), m a MIDI note number and v a velocity 1-127.

const PPQ = 480;

function vlq(n) {
  const out = [n & 0x7f]; n >>= 7;
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return out;
}
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = s => Array.from(new TextEncoder().encode(s));
function chunk(id, data) { return [...text(id), ...u32(data.length), ...data]; }

function trackChunk(events) {
  // events: [{tick, order, bytes}] — note-offs sort before note-ons on the same tick
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = []; let last = 0;
  for (const e of events) { data.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  data.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', data);
}

/**
 * @param {{bpm:number, tracks:{name:string, channel:number, program?:number, notes:{t:number,d:number,m:number,v?:number}[]}[]}} song
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function encodeMidi(song) {
  const us = Math.round(60e6 / song.bpm);
  const tempo = trackChunk([{ tick: 0, order: 0, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }]);
  const chunks = [tempo];
  for (const tr of song.tracks) {
    const ch = tr.channel & 15, name = text(tr.name);
    const ev = [{ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] }];
    if (ch !== 9 && tr.program !== undefined) ev.push({ tick: 0, order: 1, bytes: [0xc0 | ch, tr.program & 127] });
    for (const n of tr.notes) {
      const m = Math.max(0, Math.min(127, Math.round(n.m))), v = Math.max(1, Math.min(127, Math.round(n.v || 80)));
      const on = Math.max(0, Math.round(n.t * PPQ)), off = Math.max(on + 1, Math.round((n.t + n.d) * PPQ));
      ev.push({ tick: on, order: 3, bytes: [0x90 | ch, m, v] }, { tick: off, order: 2, bytes: [0x80 | ch, m, 0] });
    }
    chunks.push(trackChunk(ev));
  }
  const head = chunk('MThd', [0, 1, (chunks.length >> 8) & 255, chunks.length & 255, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...head, ...chunks.flat()]);
}
