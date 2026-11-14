// Audio tests, run in a real browser with OfflineAudioContext: every instrument renders an 8-chord progression,
// then the result is checked for clipping, level and clicks.   node tests/browser/audio.mjs [instrument-id …]
import { serve, loadPlaywright, reporter, openApp } from './lib.mjs';

const PEAK_MAX = 0.89;            // −1 dBFS: no saturation
const RMS_DB = [-35, -25];        // every instrument alone sits in this band, so they are comparable
const PAD_DB = [-27, -19];        // the gliding voices are the lead sound: a little above the instruments
const CLICK_MAX = 0.01;           // largest unexplained sample jump (see ui/lab.js)

/** Tests that need the sound itself, not just its level: pitch against the curve, the loop seam, the live-loop gap, the ceiling. */
async function extra(page, r, only) {
  const res = await page.evaluate(async only => {
    const L = window.__app.lab, out = { pitch: [], seam: [], gap: null, ceiling: null, split: [] };
    const want = id => !only.length || only.includes(id);
    const make = (text, tempo, fn) => { const p = L.newProject('t', text); p.tempo = tempo; for (const t of Object.values(p.tracks)) t.mute = true; fn(p); return L.buildSong(L.normalizeProject(p)).song; };
    const clickOf = d => { let c = 0; for (let i = 3; i < d.length; i++) c = Math.max(c, Math.abs(d[i] - (3 * d[i - 1] - 3 * d[i - 2] + d[i - 3]))); return c; };
    // ---- A6: the pitch of one voice, dry and alone, follows glideCurve (autocorrelation over short windows)
    const track = (d, sr, ts, f0) => {
      const N = 1536, a = Math.round(ts * sr) - N / 2, lo = Math.floor(sr / (f0 * 1.13)), hi = Math.ceil(sr / (f0 / 1.13));
      let e = 0; for (let i = 0; i < N; i++) e += d[a + i] * d[a + i]; if (Math.sqrt(e / N) < 1e-4) return null;
      const ac = lag => { let x = 0, n1 = 0, n2 = 0; for (let i = 0; i < N - lag; i++) { x += d[a + i] * d[a + i + lag]; n1 += d[a + i] ** 2; n2 += d[a + i + lag] ** 2; } return x / Math.sqrt(n1 * n2 + 1e-20); };
      let best = lo, bv = -2; const v = {}; for (let l = lo - 1; l <= hi + 1; l++) { v[l] = ac(l); if (l >= lo && l <= hi && v[l] > bv) { bv = v[l]; best = l; } }
      const y0 = v[best - 1], y1 = v[best], y2 = v[best + 1], off = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1e-9);
      return sr / (best + off);
    };
    const pitchRun = async (id, curve) => {
      const song = make('C:2 G:2 Am:2 F:2 Dm7:2 G7:2 Cmaj7:2 Bb:2', 100, p => { p.tracks.voices.mute = false; p.tracks.voices.sound = id; p.glideStyle.curve = curve; p.glideStyle.vibrato = 0; });
      const sr = 48000, buf = await L.renderLoop(song, sr, { raw: true, passes: 2, dry: true, voice: 1 }), d = buf.getChannelData(0);
      const errs = [];
      for (let tau = song.cycle + 0.12; tau < 2 * song.cycle - 0.12; tau += 0.037) {
        const ts = song.vs + (tau - song.cycle); // pass 2 repeats the loop window
        let i = 0; while (i + 1 < song.starts.length && song.starts[i + 1] <= ts) i++;
        const midi = song.v[i].upper[0] + song.glideCurve(1, ts), f = 440 * Math.pow(2, (midi - 69) / 12), m = track(d, sr, tau, f);
        if (m) errs.push(Math.abs(1200 * Math.log2(m / f)));
      }
      errs.sort((x, y) => x - y);
      return { id, curve, n: errs.length, p95: errs[Math.floor(errs.length * 0.95)], max: errs[errs.length - 1] };
    };
    for (const g of L.GLIDES) if (want(g.id) || want('pitch')) out.pitch.push(await pitchRun(g.id, 'eased'));
    if (want('pitch')) for (const c of ['straight', 'scoop']) out.pitch.push(await pitchRun('strings', c));
    // ---- the loop seam of the rendered loop (WAV / video): the step from the last sample to the first, for every glide sound and a 1-beat loop
    const seamOf = async song => {
      const buf = await L.renderLoop(song, 48000), d = buf.getChannelData(0), n = d.length;
      const joined = new Float32Array(12); for (let i = 0; i < 6; i++) { joined[i] = d[n - 6 + i]; joined[6 + i] = d[i]; }
      let seam = 0; for (let i = 6; i < 9; i++) seam = Math.max(seam, Math.abs(joined[i] - (3 * joined[i - 1] - 3 * joined[i - 2] + joined[i - 3])));
      return { seam, inner: clickOf(d), peak: d.reduce((m, x) => Math.max(m, Math.abs(x)), 0) };
    };
    for (const g of L.GLIDES) if (want(g.id) || want('seam')) {
      const set = p => { p.tracks.voices.mute = false; p.tracks.voices.sound = g.id; };
      out.seam.push({ id: g.id + ' (8 chords)', ...await seamOf(make('C:2 G:2 Am:2 F:2 Dm7:2 G7:2 Cmaj7:2 Bb:2', 100, set)) });
      out.seam.push({ id: g.id + ' (1 beat)', ...await seamOf(make('C:1', 120, set)) });
    }
    if (want('seam')) out.seam.push({ id: 'full mix (2 chords, 1 beat each)', ...await seamOf(make('C:1 G:1', 160, p => { for (const t of Object.values(p.tracks)) t.mute = false; p.tracks.chords.instrument = L.CHORD_INSTRUMENTS[0].id; p.tracks.bass.pattern = 'root'; p.tracks.drums.pattern = 'four'; })) });
    // ---- the live loop has no gap: drum onsets keep the same spacing across every pass boundary
    if (want('gap')) {
      const song = make('C:2 G:2', 120, p => { p.tracks.drums.mute = false; p.tracks.drums.pattern = 'four'; });
      const sr = 48000, buf = await L.renderLoop(song, sr, { raw: true, passes: 4, dry: true, solo: 'drums' }), d = buf.getChannelData(0), hop = Math.round(sr * 0.002), env = [];
      for (let i = 0; i + hop < d.length; i += hop) { let e = 0; for (let j = 0; j < hop; j++) e += d[i + j] ** 2; env.push(Math.sqrt(e / hop)); }
      const on = []; let last = -1e9;
      for (let j = 10; j < env.length; j++) if (env[j] > 0.05 && env[j] > 3 * env[j - 10] && j * 0.002 - last > 0.2) { on.push(j * 0.002); last = j * 0.002; }
      const gaps = on.slice(1).map((t, i) => t - on[i]);
      out.gap = { onsets: on.length, expected: Math.round(4 * song.cycle / song.spb), minGap: Math.min(...gaps), maxGap: Math.max(...gaps), beat: song.spb, cycle: song.cycle };
    }
    // ---- with every fader at 1.0 and everything playing, nothing goes above the ceiling
    if (want('ceiling') || want('mix')) {
      const song = make('C:2 G:2 Am:2 F:2', 100, p => { for (const [id, t] of Object.entries(p.tracks)) { t.mute = false; t.volume = 1; void id; } p.tracks.chords.instrument = L.CHORD_INSTRUMENTS[0].id; p.tracks.bass.pattern = 'root'; p.tracks.drums.pattern = 'four'; p.tracks.melody.notes = [{ t: 0, d: 2, m: 76 }, { t: 2, d: 2, m: 79 }]; });
      const buf = await L.renderLoop(song, 48000); let pk = 0; for (let c = 0; c < 2; c++) for (const x of buf.getChannelData(c)) pk = Math.max(pk, Math.abs(x));
      out.ceiling = pk;
    }
    // ---- per-voice sounds (bass / inner / top), levels and clicks like any other
    if (want('split')) for (const [b, i, t] of [['cello', 'ooh', 'whistle'], ['organ', 'strings', 'lead'], ['cello', null, null], [null, null, 'glass']]) {
      const p = L.newProject('t', 'C:2 G:2 Am:2 F:2 Dm7:2 G7:2 Cmaj7:2 Bb:2'); p.tempo = 100; p.tracks.voices.mute = false; p.tracks.voices.sound = 'pad';
      Object.assign(p.tracks.voices.split, { bass: b, inner: i, top: t });
      out.split.push([[b, i, t].join('/'), await L.measure(p)]);
    }
    return out;
  }, only);
  for (const p of res.pitch) r.check(p.n > 20 && p.p95 < 10 && p.max < 25, `pitch follows glideCurve: ${p.id} (${p.curve})`, `${p.n} windows · 95 % within ${p.p95.toFixed(1)} cents · worst ${p.max.toFixed(1)}`);
  for (const s of res.seam) r.check(s.seam < Math.max(0.04, s.inner * 1.5) && s.peak < PEAK_MAX, `loop seam is smooth: ${s.id}`, `seam ${s.seam.toFixed(4)} · inside the loop ${s.inner.toFixed(4)} · peak ${s.peak.toFixed(3)}`);
  if (res.gap) {
    const g = res.gap;
    r.check(g.onsets === g.expected, 'live loop: no drum hit lost or doubled across pass boundaries', `${g.onsets} of ${g.expected}`);
    r.check(g.minGap > g.beat - 0.006 && g.maxGap < g.beat + 0.006, 'live loop: same beat spacing across the boundary as inside the loop', `gaps ${g.minGap.toFixed(3)}…${g.maxGap.toFixed(3)} s, beat = ${g.beat.toFixed(3)} s, ${4} passes of ${g.cycle.toFixed(2)} s`);
  }
  if (res.ceiling !== null) r.check(res.ceiling < PEAK_MAX, 'all five tracks, every fader at 1.0: peak below the ceiling', `peak ${res.ceiling.toFixed(3)}`);
  for (const [id, m] of res.split) {
    const db = 20 * Math.log10(m.rms);
    r.check(m.bad === 0 && m.peak > 0.005 && m.peak < PEAK_MAX, `split voices ${id}: sound, no saturation`, `peak ${m.peak.toFixed(3)}`);
    r.check(db >= PAD_DB[0] && db <= PAD_DB[1], `split voices ${id}: level in its band`, `${db.toFixed(1)} dB`);
    r.check(m.click < 0.04, `split voices ${id}: no clicks`, `click ${m.click.toFixed(4)}`);
  }
}

export async function run(browser, url, r, only = []) {
  const { page, context } = await openApp(browser, url, r);
  const res = await page.evaluate(async only => {
    const L = window.__app.lab, out = [];
    const base = fn => { const p = L.newProject('t', 'C:2 G:2 Am:2 F:2 Dm7:2 G7:2 Cmaj7:2 Bb:2'); p.tempo = 100; p.tracks.voices.mute = true; fn(p); return p; };
    const want = id => !only.length || only.includes(id);
    for (const g of L.GLIDES) if (want(g.id) || want('voices')) out.push(['glide ' + g.id, 'pad', await L.measure(base(p => { p.tracks.voices.mute = false; p.tracks.voices.sound = g.id; }))]);
    for (const i of L.CHORD_INSTRUMENTS) if (want(i.id)) out.push([i.id, 'tonal', await L.measure(base(p => { p.tracks.chords.instrument = i.id; }))]);
    for (const i of L.BASS_INSTRUMENTS) if (want(i.id)) out.push([i.id, 'bass', await L.measure(base(p => { p.tracks.bass.pattern = 'pulse'; p.tracks.bass.instrument = i.id; }))]);
    if (want('drums')) out.push(['drums', 'noise', await L.measure(base(p => { p.tracks.drums.pattern = 'basic'; }))]);
    if (want('mix')) out.push(['mix', 'noise', await L.measure(base(p => { p.tracks.voices.mute = false; p.tracks.chords.instrument = L.CHORD_INSTRUMENTS[0].id; p.tracks.bass.pattern = 'pulse'; p.tracks.drums.pattern = 'four'; p.tracks.melody.notes = [{ t: 0, d: 2, m: 76 }, { t: 2, d: 2, m: 79 }]; }))]);
    return out;
  }, only);
  await extra(page, r, only);
  for (const [id, kind, m] of res) {
    const db = 20 * Math.log10(m.rms);
    const info = `peak ${m.peak.toFixed(3)} · ${db.toFixed(1)} dB · click ${m.click.toFixed(4)}`;
    r.check(m.bad === 0 && m.peak > 0.005, `${id}: makes sound, no invalid samples`, info);
    r.check(m.peak < PEAK_MAX, `${id}: no saturation`, `peak ${m.peak.toFixed(3)}`);
    if (kind === 'pad') r.check(db >= PAD_DB[0] && db <= PAD_DB[1], `${id}: level in its band`, `${db.toFixed(1)} dB`);
    // sawtooth-based glide sounds have steep wave edges by nature: their limit is higher, a real click is far above it
    if (kind !== 'noise') r.check(m.click < (kind === 'pad' ? 0.04 : CLICK_MAX), `${id}: no clicks`, `click ${m.click.toFixed(4)}`);
    if (kind === 'tonal' || kind === 'bass') r.check(db >= RMS_DB[0] && db <= RMS_DB[1], `${id}: level comparable to the others`, `${db.toFixed(1)} dB`);
    r.check(Math.abs(m.dc) < 0.002, `${id}: no DC offset`);
  }
  await context.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pw = loadPlaywright();
  if (!pw) { console.log('Playwright is not installed here: audio tests skipped.'); process.exit(0); }
  const s = await serve(), b = await pw.chromium.launch(), r = reporter();
  try { await run(b, s.url, r, process.argv.slice(2)); } finally { await b.close(); await s.close(); }
  if (r.failures.length) { console.error(`\n${r.failures.length} failure(s):\n` + r.failures.join('\n')); process.exit(1); }
}
