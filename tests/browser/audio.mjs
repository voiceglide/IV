// Audio tests, run in a real browser with OfflineAudioContext: every instrument renders an 8-chord progression,
// then the result is checked for clipping, level and clicks.   node tests/browser/audio.mjs [instrument-id …]
import { serve, loadPlaywright, reporter, openApp } from './lib.mjs';

const PEAK_MAX = 0.89;            // −1 dBFS: no saturation
const RMS_DB = [-35, -25];        // every instrument alone sits in this band, so they are comparable
const PAD_DB = [-27, -19];        // the gliding voices are the lead sound: a little above the instruments
const CLICK_MAX = 0.01;           // largest unexplained sample jump (see ui/lab.js)

export async function run(browser, url, r, only = []) {
  const { page, context } = await openApp(browser, url, r);
  const res = await page.evaluate(async only => {
    const L = window.__app.lab, out = [];
    const base = fn => { const p = L.newProject('t', 'C:2 G:2 Am:2 F:2 Dm7:2 G7:2 Cmaj7:2 Bb:2'); p.tempo = 100; p.tracks.voices.mute = true; fn(p); return p; };
    const want = id => !only.length || only.includes(id);
    if (want('voices')) out.push(['voices', 'pad', await L.measure(base(p => { p.tracks.voices.mute = false; }))]);
    for (const i of L.CHORD_INSTRUMENTS) if (want(i.id)) out.push([i.id, 'tonal', await L.measure(base(p => { p.tracks.chords.instrument = i.id; }))]);
    for (const i of L.BASS_INSTRUMENTS) if (want(i.id)) out.push([i.id, 'bass', await L.measure(base(p => { p.tracks.bass.pattern = 'pulse'; p.tracks.bass.instrument = i.id; }))]);
    if (want('drums')) out.push(['drums', 'noise', await L.measure(base(p => { p.tracks.drums.pattern = 'basic'; }))]);
    if (want('mix')) out.push(['mix', 'noise', await L.measure(base(p => { p.tracks.voices.mute = false; p.tracks.chords.instrument = L.CHORD_INSTRUMENTS[0].id; p.tracks.bass.pattern = 'pulse'; p.tracks.drums.pattern = 'four'; p.tracks.melody.notes = [{ t: 0, d: 2, m: 76 }, { t: 2, d: 2, m: 79 }]; }))]);
    return out;
  }, only);
  for (const [id, kind, m] of res) {
    const db = 20 * Math.log10(m.rms);
    const info = `peak ${m.peak.toFixed(3)} · ${db.toFixed(1)} dB · click ${m.click.toFixed(4)}`;
    r.check(m.bad === 0 && m.peak > 0.005, `${id}: makes sound, no invalid samples`, info);
    r.check(m.peak < PEAK_MAX, `${id}: no saturation`, `peak ${m.peak.toFixed(3)}`);
    if (kind === 'pad') r.check(db >= PAD_DB[0] && db <= PAD_DB[1], `${id}: level in its band`, `${db.toFixed(1)} dB`);
    if (kind !== 'noise') r.check(m.click < CLICK_MAX, `${id}: no clicks`, `click ${m.click.toFixed(4)}`);
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
