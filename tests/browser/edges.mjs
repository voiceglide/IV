// Edge cases and exports, as a hurried musician and as someone who only wants a file.
import { readFile } from 'node:fs/promises';
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 390, height: 844 }, mobile: true });
  const build = (text, patch = {}) => page.evaluate(async ([text, patch]) => {
    const L = window.__app.lab, p = L.newProject('edge', text); Object.assign(p, patch);
    window.__app.store.open(L.normalizeProject(p)); await new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q)));
    const s = window.__app.song(); return { ok: !!s, err: document.getElementById('songErr').textContent, cycle: s && s.cycle, n: s && s.n };
  }, [text, patch]);

  const cases = [
    ['very slow tempo', 'C G Am F', { tempo: 20 }], ['very fast tempo', 'C G Am F', { tempo: 300 }], ['a single chord', 'C', {}],
    ['very short chords', 'C:0.25 G:0.25 Am:0.25 F:0.25', { tempo: 200 }],
    ['extended and unusual chords', 'Cmaj9 F13 Bbm7b5 E7sus4 Am(maj7) Dmadd9 G#dim7 Db5 Faug A6', {}],
    ['sharps and flats', 'F# C#m G#m B Db Ebm Bbm Gb A#m D#7', {}],
    ['slash chords far from the root', 'C/F# Am/G# F/B G/Db', {}],
    ['many chords', Array.from({ length: 200 }, (_, i) => ['C', 'Am7', 'Dm7', 'G7'][i % 4]).join(' '), {}],
  ];
  for (const [name, text, patch] of cases) {
    const t0 = Date.now(), res = await build(text, patch);
    r.check(res.ok && !res.err, `${name}: builds and draws`, res.err || `${res.n} chords, ${res.cycle.toFixed(1)} s, ${Date.now() - t0} ms`);
  }
  r.check(await page.evaluate(() => { const p = window.__app.store.project; return p.chords.length === 200; }), 'many chords: all 200 are kept');
  // 200 chords: Edit still fits and Play still starts
  await page.click('#editBtn'); await page.click('#play'); await page.waitForTimeout(500);
  r.check(await page.evaluate(() => window.__app.engine.playing && document.documentElement.scrollWidth <= innerWidth), 'many chords: plays, and the chord list stays inside the screen');
  await page.click('#play'); await page.click('#editBtn');

  // a broken chord typed by hand is explained, and the last good progression stays
  const empty = await build('', {});
  r.check(!empty.ok && !empty.err, 'no chords: an empty state, not an error');
  await page.click('#play');
  r.check(await page.locator('.toast').count() === 1, 'Play with no chords says what to do', await page.locator('.toast').innerText().catch(() => ''));
  await page.click('#exportBtn');
  r.check(await page.locator('#exportSheet').count() === 0, 'Export with no chords is refused with a message');

  // tempo field: out-of-range values are refused with a message
  await build('C G Am F', {}); await page.click('#editBtn');
  await page.fill('#tempo', '900'); await page.keyboard.press('Enter');
  r.check(await page.evaluate(() => window.__app.store.project.tempo) === 90 && await page.locator('.toast.error').count() === 1, 'an impossible tempo is refused and explained');
  await page.fill('#tempo', '132'); await page.keyboard.press('Enter');
  r.check(await page.evaluate(() => window.__app.store.project.tempo) === 132, 'a valid tempo is applied');
  // typed chords: a wrong token is pointed out, nothing is lost
  await page.click('summary:has-text("Type the chords")'); await page.fill('#chordText', 'C G Hx7 F'); await page.waitForTimeout(700);
  r.check((await page.innerText('#chordTextErr')).includes('Hx7') && await page.evaluate(() => window.__app.store.project.chords.length) === 4, 'typed chords: the unknown one is named, the progression is kept');
  await page.fill('#chordText', '[Verse] Dm7 G7:2 Cmaj7'); await page.waitForTimeout(700);
  r.check(await page.evaluate(() => window.__app.store.project.chords.map(c => c.sym + (c.beats || '')).join(' ')) === 'Dm7 G72 Cmaj7', 'typed chords: applied with lengths');
  await page.click('#editBtn');

  // exports: audio, MIDI, then video (real-time fallback where the browser has no frame encoder)
  await build('C:2 G:2 Am:2 F:2', { tempo: 120 });
  await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportSheet .ld:has-text("Audio")')]);
  const wav = await readFile(await dl.path());
  r.check(dl.suggestedFilename() === 'edge.wav' && wav.toString('latin1', 0, 4) === 'RIFF' && Math.abs(wav.length - 44 - 4 * 48000 * 4) < 16, 'WAV export: 4-second stereo loop', `${wav.length} bytes`);
  let peak = 0; for (let i = 44; i < wav.length - 1; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  r.check(peak > 1000 && peak < 32000, 'WAV export: has sound and does not clip', String(peak));
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportSheet .ld:has-text("MIDI")')]);
  const mid = await readFile(await dl.path());
  r.check(dl.suggestedFilename() === 'edge.mid' && mid.toString('latin1', 0, 4) === 'MThd', 'MIDI export: a MIDI file is downloaded');
  await page.click('#exportSheet .ld:has-text("Video")');
  await page.waitForSelector('#exportSheet video', { timeout: 60000 }).catch(() => {});
  const vid = await page.evaluate(() => { const v = document.querySelector('#exportSheet video'); return v ? { src: v.src.slice(0, 5), status: document.querySelector('#exportSheet .status').textContent } : null; });
  r.check(!!vid && vid.src === 'blob:', 'video export: a playable result appears', vid ? vid.status : 'no video');
  r.check(await page.evaluate(() => !window.__app.busy() && !document.getElementById('play').disabled), 'after the export the app is usable again');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportSheet button:has-text("Save video")')]);
  r.check(/^edge\.(mp4|webm)$/.test(dl.suggestedFilename()) && (await readFile(await dl.path())).length > 20000, 'video export: the file is saved', dl.suggestedFilename());
  await context.close();
}
