// Standard MIDI file (format 1) writer.
// tracks: [{name, channel (0-15), program (0-127, ignored on channel 9), notes: [{t, d, m, v}]}]
// with t and d in beats (quarter notes), m a MIDI note number and v a velocity 1-127.

const PPQ = 480;
/** The largest value a 4-byte variable-length quantity holds. */
const MAX_VLQ = 0x0fffffff;

function vlq(n) {
  n = Math.max(0, Math.min(MAX_VLQ, Math.floor(n) || 0));
  const out = [n & 0x7f]; n = Math.floor(n / 128);
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  return out;
}
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = s => Array.from(new TextEncoder().encode(s));
function chunk(id, data) { return [...text(id), ...u32(data.length), ...data]; }

function trackChunk(events, endTick = 0) {
  // events: [{tick, order, bytes}] — note-offs sort before note-ons on the same tick
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = []; let last = 0;
  for (const e of events) { data.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  data.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0); // end of track, no earlier than endTick
  return chunk('MTrk', data);
}

/**
 * `endBeat` (optional) is where every track ends, so a track that stops early still lasts as long as the loop.
 * @param {{bpm:number, endBeat?:number, tracks:{name:string, channel:number, program?:number, notes:{t:number,d:number,m:number,v?:number}[]}[]}} song
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function encodeMidi(song) {
  const bpm = isFinite(song.bpm) && song.bpm > 0 ? song.bpm : 120;
  const us = Math.max(1, Math.min(0xffffff, Math.round(60e6 / bpm))); // the tempo field has 3 bytes
  const endTick = Math.max(0, Math.min(MAX_VLQ, Math.round((song.endBeat || 0) * PPQ)));
  const tempo = trackChunk([{ tick: 0, order: 0, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }], endTick);
  const chunks = [tempo];
  for (const tr of song.tracks) {
    const ch = tr.channel & 15, name = text(tr.name);
    const ev = [{ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] }];
    if (ch !== 9 && tr.program !== undefined) ev.push({ tick: 0, order: 1, bytes: [0xc0 | ch, tr.program & 127] });
    /** @type {{on:number, off:number, m:number, v:number}[]} */ const ns = [];
    for (const n of tr.notes) {
      const m = Math.max(0, Math.min(127, Math.round(n.m))), v = Math.max(1, Math.min(127, Math.round(n.v || 80)));
      const on = Math.max(0, Math.min(MAX_VLQ - 1, Math.round(n.t * PPQ) || 0)), off = Math.max(on + 1, Math.min(MAX_VLQ, Math.round((n.t + n.d) * PPQ) || 0));
      ns.push({ on, off, m, v });
    }
    // a pitch that is struck again while it still rings ends where the new strike begins, or the old note-off would cut the new note
    ns.sort((a, b) => a.m - b.m || a.on - b.on);
    const kept = [];
    for (let i = 0; i < ns.length; i++) {
      const prev = kept[kept.length - 1];
      if (prev && prev.m === ns[i].m) {
        if (ns[i].on === prev.on) continue; // the same pitch struck twice at the same moment is one note
        if (prev.off > ns[i].on) prev.off = ns[i].on;
      }
      kept.push({ ...ns[i] });
    }
    for (const n of kept) ev.push({ tick: n.on, order: 3, bytes: [0x90 | ch, n.m, n.v] }, { tick: n.off, order: 2, bytes: [0x80 | ch, n.m, 0] });
    chunks.push(trackChunk(ev, endTick));
  }
  const head = chunk('MThd', [0, 1, (chunks.length >> 8) & 255, chunks.length & 255, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...head, ...chunks.flat()]);
}
