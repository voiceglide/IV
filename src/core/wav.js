// 16-bit PCM WAV encoder (interleaved). `channels` are Float32Arrays of equal length.

/** @param {Float32Array[]} channels @param {number} sampleRate @returns {Uint8Array<ArrayBuffer>} */
export function encodeWav(channels, sampleRate) {
  const nch = channels.length, n = nch ? channels[0].length : 0, bytes = n * nch * 2;
  const buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, Math.round(s < 0 ? s * 32768 : s * 32767), true); o += 2;
  }
  return new Uint8Array(buf);
}
