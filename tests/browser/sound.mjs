// Sound tab: scenes, a sound per voice, glide feel, undo of a scene; the Melody roll's opening view on a phone.
import { openApp } from './lib.mjs';

export async function run(browser, url, r) {
  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  const proj = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__app.store.project)));
  await page.click('#editBtn'); await page.click('#tabTracks');

  r.check(await page.locator('.tile.scene').count() >= 8, 'Sound: at least eight scenes are offered');
  r.check(await page.evaluate(() => { const t = document.querySelector('.tile.scene').getBoundingClientRect(), a = document.querySelector('details.advanced').getBoundingClientRect(); return t.top < a.top; }), 'Sound: scenes come first');
  const before = await proj();
  await page.click('.tile.scene[data-scene="stringschoir"]'); await page.waitForTimeout(500);
  const a = await proj();
  r.check(a.tracks.voices.sound === 'strings' && a.tracks.voices.split.bass === 'cello' && a.tracks.voices.split.top === 'ooh' && a.glideStyle.swell === 0.8, 'a scene changes the sound, the split and the glide style');
  r.check(await page.evaluate(() => window.__app.engine.playing), 'a scene plays at once');
  r.check(await page.getAttribute('.tile.scene[data-scene="stringschoir"]', 'aria-pressed') === 'true', 'the current scene is highlighted');
  await page.click('.tile.scene[data-scene="latenight"]'); await page.waitForTimeout(300);
  const b = await proj();
  r.check(b.tracks.drums.pattern === 'soft' && b.tracks.chords.instrument === 'lofikeys' && b.tracks.bass.pattern === 'root', 'a scene sets layer, bass and drums');
  await page.click('#undoBtn'); await page.waitForTimeout(300);
  const c = await proj();
  r.check(JSON.stringify(c.tracks) === JSON.stringify(a.tracks) && c.glide === a.glide && JSON.stringify(c.glideStyle) === JSON.stringify(a.glideStyle), 'one Undo restores the previous scene exactly');
  await page.click('#undoBtn'); await page.waitForTimeout(200);
  r.check(JSON.stringify((await proj()).tracks) === JSON.stringify(before.tracks), 'a second Undo returns to the start');
  await page.click('#redoBtn'); await page.click('.tile.scene[data-scene="plain"]');
  r.check(await page.locator('.tile.scene[aria-pressed="true"]').count() === 1, 'exactly one scene is highlighted');

  // per-voice sounds and glide feel
  await page.click('details.advanced summary');
  await page.selectOption('select[aria-label="Bass voice: sound"]', 'cello');
  await page.selectOption('select[aria-label="Inner voices: sound"]', 'flute');
  await page.selectOption('select[aria-label="Top voice: sound"]', 'whistle');
  let p = await proj();
  r.check(p.tracks.voices.split.bass === 'cello' && p.tracks.voices.split.inner === 'flute' && p.tracks.voices.split.top === 'whistle', 'the three voice pickers write tracks.voices.split');
  r.check(await page.locator('.tile.scene[aria-pressed="true"]').count() === 0, 'no scene stays highlighted once a voice differs');
  await page.selectOption('select[aria-label="Top voice: sound"]', '');
  r.check((await proj()).tracks.voices.split.top === null, '"Same as main" clears a voice');
  await page.click('button[aria-label="Hear the bass voice"]');
  await page.click('button[data-curve="scoop"]');
  await page.fill('input[aria-label="Vibrato when it lands"]', '0.9'); await page.fill('input[aria-label="Swell on each change"]', '0.15');
  await page.selectOption('select[aria-label="Glide length"]', '0.42');
  p = await proj();
  r.check(p.glideStyle.curve === 'scoop' && p.glideStyle.vibrato === 0.9 && p.glideStyle.swell === 0.15 && p.glide === 0.42, 'glide controls write glideStyle and glide length');
  // live, with the play head kept
  if (!await page.evaluate(() => window.__app.engine.playing)) await page.click('#play');
  await page.waitForTimeout(1500);
  const t0 = await page.evaluate(() => window.__app.engine.time());
  await page.click('button[data-curve="straight"]'); await page.selectOption('select[aria-label="Top voice: sound"]', 'flute'); await page.waitForTimeout(300);
  r.check(await page.evaluate(t => window.__app.engine.playing && window.__app.engine.time() > t, t0), 'voice and glide changes apply while playing and keep the play head');
  await page.click('#play');
  r.check(await page.locator('#drumsSection').count() === 1, 'the Drums slot exists for the drums section');

  // 44 px targets at 375 px
  const small = await page.evaluate(() => [...document.querySelectorAll('#paneTracks button, #paneTracks select, #paneTracks input')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.height < 43.5 || b.width < 43.5); }).map(e => e.getAttribute('aria-label') || e.textContent));
  r.check(small.length === 0, 'Sound: every control is at least 44 px', small.join(', '));
  r.check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Sound: no sideways page scroll at 375 px');

  // Melody roll: opens on a chord tone, at least ten rows visible, zoom and fit
  await page.click('#tabMelody'); await page.waitForTimeout(300);
  const roll = await page.evaluate(() => {
    const sc = document.querySelector('.mel-scroll'), s = sc.getBoundingClientRect(), rows = [];
    for (const el of document.querySelectorAll('.mel-name')) { const b = el.getBoundingClientRect(); if (b.top >= s.top + 30 - 1 && b.bottom <= s.bottom + 1) rows.push(+el.dataset.m); }
    const tones = [...document.querySelectorAll('.mel-cell.tone[data-c="0"]')].filter(el => { const b = el.getBoundingClientRect(); return b.top >= s.top + 30 - 1 && b.bottom <= s.bottom + 1; });
    return { rows: rows.length, tones: tones.length, labelled: [...document.querySelectorAll('.mel-name.white')].every(e => e.textContent.length >= 2) };
  });
  r.check(roll.rows >= 7, 'Melody: at least 7 rows are visible at 375 × 667 (the preview keeps its room)', JSON.stringify(roll));
  r.check(roll.tones >= 1, 'Melody: the first view shows a chord tone');
  r.check(roll.labelled, 'Melody: every white key is labelled');
  const view = await page.evaluate(() => {
    const cv = document.getElementById('cv').getBoundingClientRect(), ed = document.getElementById('edit').getBoundingClientRect(), s = document.querySelector('.mel-scroll').getBoundingClientRect();
    const c4 = document.querySelector('.mel-name[data-m="60"]'), k = c4 && c4.getBoundingClientRect();
    return { canvas: Math.min(cv.bottom, ed.top) - Math.max(cv.top, 0), c4: !!k && k.top >= s.top + 30 - 1 && k.bottom <= s.bottom + 1 };
  });
  r.check(view.canvas >= 160, 'Melody: at least 160 px of the preview stay visible above the sheet', String(view.canvas));
  r.check(view.c4, 'Melody: an empty melody opens with the C4 row in view');
  const w0 = await page.evaluate(() => document.querySelector('.mel-grid').scrollWidth);
  await page.click('button[aria-label="Fit the whole loop in view"]');
  const fit = await page.evaluate(() => { const c = document.querySelector('.mel-cell').getBoundingClientRect(); return { cell: c.width, w: document.querySelector('.mel-grid').scrollWidth, label: document.querySelector('.mel-page').textContent }; });
  r.check(fit.cell >= 20 && fit.w < w0 && /^Bars? \d/.test(fit.label), 'Melody: Fit never goes below a tappable 20 px and the bars label says where you are', JSON.stringify(fit));
  await page.click('button[aria-label="Zoom in"]');
  r.check(await page.evaluate(() => { const s = document.querySelector('.mel-scroll'); return s.scrollWidth > s.clientWidth; }), 'Melody: Zoom in makes the roll wider again');
  await context.close();

  // a long loop (24 chords) on the three common phone widths: Fit pages by bars, no label is ever cut, every cell can be tapped
  for (const [w, hh] of [[360, 640], [375, 667], [390, 844]]) {
    const a = await openApp(browser, url, r, { viewport: { width: w, height: hh }, mobile: true });
    const pg = a.page;
    await pg.click('#editBtn'); await pg.click('summary:has-text("Type the chords")');
    await pg.fill('#chordText', Array.from({ length: 24 }, (_, i) => ['C', 'G', 'Am', 'F'][i % 4]).join(' ')); await pg.waitForTimeout(800);
    const n = await pg.evaluate(() => window.__app.store.project.chords.length);
    await pg.click('#tabMelody'); await pg.waitForTimeout(300);
    const cut = () => pg.evaluate(() => [...document.querySelectorAll('#paneMelody .mel-len, #paneMelody .mel-page, #paneMelody button')].filter(e => e.offsetParent).map(e => [e.className || e.getAttribute('aria-label'), e.scrollWidth, e.clientWidth]).filter(([, sw, cw]) => sw > cw + 0.5));
    r.check(n === 24 && (await cut()).length === 0, `Melody ${w}×${hh}: the hint and every button label fit (nothing is cut)`, JSON.stringify(await cut()));
    await pg.click('button[aria-label="Fit the whole loop in view"]');
    const f = await pg.evaluate(() => { const s = document.querySelector('.mel-scroll'), cells = [...document.querySelectorAll('.mel-cell')]; return { cell: Math.min(...cells.slice(0, 40).map(c => c.getBoundingClientRect().width)), sw: s.scrollWidth, cw: s.clientWidth, label: document.querySelector('.mel-page').textContent, pageSw: document.documentElement.scrollWidth, iw: innerWidth }; });
    r.check(f.cell >= 20 && f.pageSw <= f.iw && /^Bars 1–\d+$/.test(f.label), `Melody ${w}×${hh}: Fit on 24 chords keeps squares at least 20 px and shows the bars label`, JSON.stringify(f));
    await pg.click('button[aria-label="Next bars"]');
    const f2 = await pg.evaluate(() => ({ label: document.querySelector('.mel-page').textContent, left: document.querySelector('.mel-scroll').scrollLeft }));
    r.check(f2.left > 0 && f2.label !== f.label && /^Bars? \d+/.test(f2.label), `Melody ${w}×${hh}: Next bars turns the page`, JSON.stringify(f2));
    await pg.click('button[aria-label="Previous bars"]');
    r.check(await pg.evaluate(() => document.querySelector('.mel-scroll').scrollLeft) === 0, `Melody ${w}×${hh}: Previous bars goes back to the start`);
    // an end square really takes a tap: go to the last page and tap the last visible square
    for (let i = 0; i < 30; i++) { if (await pg.locator('button[aria-label="Next bars"]').isDisabled()) break; await pg.click('button[aria-label="Next bars"]'); }
    const lastCell = pg.locator('.mel-cell[data-r="12"]').last(); await lastCell.click();
    r.check(await pg.evaluate(() => window.__app.store.project.tracks.melody.notes.length) === 1, `Melody ${w}×${hh}: a square on the last page can be tapped`);
    // the note bar is not cramped either: select it and look again
    r.check((await cut()).length === 0 && await pg.evaluate(() => { const l = document.querySelector('[aria-label="Selected note"] .mel-len'); return !!l && l.scrollWidth <= l.clientWidth && /beat/.test(l.textContent); }), `Melody ${w}×${hh}: the selected-note label ("G4 · 1 beat") is not cut`);
    await a.context.close();
  }

  // a phone on its side: the roll keeps at least four rows, the preview stays, the page does not scroll
  {
    const a = await openApp(browser, url, r, { viewport: { width: 667, height: 375 }, mobile: true });
    await a.page.click('#editBtn'); await a.page.click('#tabMelody'); await a.page.waitForTimeout(300);
    const m = await a.page.evaluate(() => { const s = document.querySelector('.mel-scroll').getBoundingClientRect(); let rows = 0; for (const el of document.querySelectorAll('.mel-name')) { const b = el.getBoundingClientRect(); if (b.top >= s.top + 20 && b.bottom <= s.bottom + 1) rows++; }
      return { rows, cv: document.getElementById('cv').getBoundingClientRect().height, sh: document.documentElement.scrollHeight, ih: innerHeight, play: document.getElementById('melPlay').getBoundingClientRect().bottom <= innerHeight && document.getElementById('melPlay').getBoundingClientRect().top >= 0 }; });
    r.check(m.rows >= 4 && m.cv >= 160 && m.sh <= m.ih && m.play, 'Melody 667×375: at least four pitch rows visible, preview kept, Play reachable', JSON.stringify(m));
    await a.context.close();
  }
}

