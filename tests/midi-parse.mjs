// Test helper: a small Standard MIDI file reader, to check what encodeMidi / songToMidi really wrote.
/** @param {Uint8Array} b */
export function parseMidi(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = o => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'MThd') throw new Error('no MThd');
  const out = { format: dv.getUint16(8), ntrks: dv.getUint16(10), ppq: dv.getUint16(12), tempo: 0, tracks: /** @type {any[]} */ ([]) };
  let o = 14;
  while (o < b.length) {
    if (tag(o) !== 'MTrk') throw new Error('no MTrk at ' + o);
    const len = dv.getUint32(o + 4); let p = o + 8; const end = p + len;
    let tick = 0, status = 0, name = '', ended = -1; const open = new Map(), notes = [];
    const vlq = () => { let n = 0, c; do { c = b[p++]; n = n * 128 + (c & 127); } while (c & 128); return n; };
    while (p < end) {
      tick += vlq();
      let st = b[p];
      if (st === 0xff) {
        const type = b[p + 1]; p += 2; const l = vlq();
        if (type === 0x03) name = String.fromCharCode(...b.slice(p, p + l));
        if (type === 0x51) out.tempo = (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];
        if (type === 0x2f) ended = tick;
        p += l; continue;
      }
      if (st & 128) { status = st; p++; } else st = status;
      const kind = st & 0xf0, ch = st & 15;
      if (kind === 0xc0 || kind === 0xd0) { p += 1; continue; }
      const a = b[p], v = b[p + 1]; p += 2;
      if (kind === 0x90 && v > 0) { const k = ch + ':' + a; if (open.has(k)) throw new Error('note-on while sounding ' + k); open.set(k, { tick, v }); }
      else if (kind === 0x80 || kind === 0x90) {
        const k = ch + ':' + a, on = open.get(k);
        if (!on) throw new Error('note-off without note-on ' + k);
        open.delete(k); notes.push({ ch, m: a, on: on.tick, off: tick, v: on.v });
      }
    }
    if (p !== end) throw new Error('track length mismatch');
    if (open.size) throw new Error('hanging notes');
    out.tracks.push({ name, notes, ended });
    o = end;
  }
  return out;
}
