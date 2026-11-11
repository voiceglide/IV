// Smoke test: the built app loads with no error and no outside request, fits a phone screen, and the main
// actions work (play, edit a chord, undo, tabs, export sheet).
import { openApp } from './lib.mjs';

const PHONES = [['375×667', { width: 375, height: 667 }], ['390×844', { width: 390, height: 844 }]];

export async function run(browser, url, r) {
  for (const [name, viewport] of PHONES) {
    const { page, context } = await openApp(browser, url, r, { viewport, mobile: true });
    const box = sel => page.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height, r: q.right, b: q.bottom }; }, sel);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }));
    r.check(m.sw <= m.iw, `${name}: no sideways scroll`, JSON.stringify(m));
    r.check(m.sh <= m.ih + 1, `${name}: the main screen fits without scrolling`);
    const c = await box('#cv');
    r.check(c.w >= 150 && c.r <= viewport.width && Math.abs(c.w / c.h - 9 / 16) < 0.01, `${name}: preview visible and 9:16`, `${c.w.toFixed(0)}×${c.h.toFixed(0)}`);
    for (const sel of ['#projBtn', '#undoBtn', '#redoBtn', '#menuBtn', '#play', '#editBtn', '#exportBtn']) {
      const b = await box(sel);
      r.check(b.h >= 44 && b.w >= 44 && b.r <= viewport.width + 0.5 && b.b <= viewport.height + 0.5, `${name}: ${sel} on screen and at least 44 px`, `${b.w.toFixed(0)}×${b.h.toFixed(0)}`);
    }
    r.check(await page.evaluate(() => { const d = document.getElementById('cv').getContext('2d').getImageData(0, 0, 1080, 1920).data; let dark = 0; for (let k = 0; k < d.length; k += 4 * 97) if (d[k] < 120) dark++; return dark > 50; }), `${name}: the preview is drawn`);

    // play and stop
    await page.click('#play'); await page.waitForTimeout(700);
    r.check(await page.evaluate(() => window.__app.engine.playing && window.__app.engine.context.state === 'running'), `${name}: Play starts the sound on the first tap`);
    r.check((await page.innerText('#play')).trim() === 'Stop', `${name}: the button reads Stop while playing`);
    await page.click('#play');
    r.check(await page.evaluate(() => !window.__app.engine.playing), `${name}: Stop stops`);

    // edit: change a chord, undo, redo
    await page.click('#editBtn');
    r.check(await page.isVisible('#paneChords'), `${name}: Edit opens on the chords`);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('#edit button, #edit select, #edit input')).filter(e => e.offsetParent && (e.getBoundingClientRect().height < 43.5 || (e.tagName === 'BUTTON' && e.getBoundingClientRect().width < 43.5))).map(e => e.id || e.textContent || e.tagName));
    r.check(small.length === 0, `${name}: every control in Edit is at least 44 px`, small.join(','));
    await page.click('.chord >> nth=1'); await page.waitForTimeout(150);
    r.check(await page.locator('#chordSheet').count() === 0 && await page.evaluate(() => { const a = window.__app, s = a.song(); return Math.abs(+document.getElementById('scrub').value - s.starts[s.n + 1]) < 0.02; }), `${name}: one tap on a chord shows it in the preview (and plays it)`);
    await page.click('.chord >> nth=1'); await page.waitForSelector('#chordSheet');
    await page.click('#chordSheet .opt:has-text("minor")');
    r.check(await page.evaluate(() => window.__app.store.project.chords[1].sym) === 'Gm', `${name}: tapping a type changes the chord`);
    const over = await page.evaluate(() => { const p = document.querySelector('#chordSheet .panel').getBoundingClientRect(); return p.right > innerWidth + 0.5 || p.bottom > innerHeight + 0.5; });
    r.check(!over, `${name}: the chord sheet fits the screen`);
    await page.click('#chordSheet button:has-text("Done")');
    await page.click('#undoBtn');
    r.check(await page.evaluate(() => window.__app.store.project.chords[1].sym) === 'G', `${name}: Undo restores the chord`);
    await page.click('#redoBtn');
    r.check(await page.evaluate(() => window.__app.store.project.chords[1].sym) === 'Gm', `${name}: Redo applies it again`);
    await page.click('.chord.add'); await page.waitForSelector('#chordSheet');
    await page.click('#chordSheet button[aria-label="Delete this chord"]');
    r.check(await page.evaluate(() => window.__app.store.project.chords.length) === 8, `${name}: add then delete leaves 8 chords`);
    await page.waitForTimeout(200);
    // sound: pick an instrument and a drum pattern, mute, solo; melody: tap two notes, undo one
    await page.click('#tabTracks');
    await page.click('.tile[data-glide="strings"]'); await page.waitForTimeout(400);
    r.check(await page.evaluate(() => window.__app.engine.playing && window.__app.store.project.tracks.voices.sound === 'strings'), `${name}: choosing a glide sound plays it`);
    const before = await page.evaluate(() => window.__app.engine.time());
    await page.waitForTimeout(1500); await page.click('.tile[data-glide="ooh"]'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.__app.engine.time());
    r.check(after > before + 1, `${name}: changing the sound does not send the loop back to its start`, `${before.toFixed(2)} → ${after.toFixed(2)}`);
    await page.evaluate(() => window.__app.store.update(p => { p.chords[2].sym = 'A'; }, ''));
    await page.waitForTimeout(300);
    r.check(await page.evaluate(() => window.__app.engine.time()) > after, `${name}: changing a chord while playing keeps the play head`);
    await page.selectOption('select[aria-label="Chord instrument"]', 'kalimba'); await page.selectOption('select[aria-label="Drum pattern"]', 'basic'); await page.selectOption('select[aria-label="Bass pattern"]', 'root');
    await page.waitForTimeout(500);
    r.check(await page.evaluate(() => window.__app.engine.playing && window.__app.store.project.tracks.chords.instrument === 'kalimba'), `${name}: choosing an instrument starts the loop so it is heard`);
    await page.selectOption('select[aria-label="Chord instrument"]', 'choir'); await page.waitForTimeout(300);
    r.check(await page.evaluate(() => window.__app.engine.playing), `${name}: changing instrument while playing keeps playing`);
    await page.click('button[aria-label="Mute Drums"]'); await page.click('button[aria-label="Solo Bass"]');
    r.check(await page.evaluate(() => { const t = window.__app.store.project.tracks; return t.drums.mute && t.bass.solo && window.__app.engine.playing; }), `${name}: mute and solo apply without stopping`);
    await page.click('#play');
    await page.click('#tabMelody');
    await page.click('.mel-cell >> nth=0'); await page.click('.mel-cell >> nth=70');
    r.check(await page.evaluate(() => window.__app.store.project.tracks.melody.notes.length) === 2, `${name}: tapping the grid adds melody notes`);
    await page.click('.mel-cell >> nth=0');
    r.check(await page.evaluate(() => window.__app.store.project.tracks.melody.notes.length) === 1, `${name}: tapping a note removes it`);
    r.check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: the melody grid scrolls inside itself, not the page`);
    for (const tab of ['Tracks', 'Text', 'Chords']) { await page.click('#tab' + tab); r.check(await page.isVisible('#pane' + tab), `${name}: tab ${tab} opens`); }
    await page.click('#editBtn');
    r.check(await page.isHidden('#edit'), `${name}: Edit closes`);

    // export sheet lists the four formats and fits
    await page.click('#exportBtn'); await page.waitForSelector('#exportSheet');
    r.check(await page.locator('#exportSheet .ld').count() === 4, `${name}: Export offers video, audio, MIDI and project file`);
    await page.keyboard.press('Escape');
    r.check(await page.locator('.sheet').count() === 0, `${name}: Escape closes the sheet`);
    await context.close();
  }
}
