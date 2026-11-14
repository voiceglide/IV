// The chord strip, the inline picker, selection, focus, layout at five sizes, fast start, melody piano roll, dark theme.
import { openApp } from './lib.mjs';

const VIEWPORTS = [['360×640', 360, 640], ['375×667', 375, 667], ['390×844', 390, 844], ['1280×800', 1280, 800], ['1920×1080', 1920, 1080]];

export async function run(browser, url, r) {
  // ---- layout at five sizes, with the picker open
  for (const [name, w, hh] of VIEWPORTS) {
    const { page, context } = await openApp(browser, url, r, { viewport: { width: w, height: hh }, mobile: w < 700 });
    await page.click('#strip .chord >> nth=1');
    const m = await page.evaluate(() => { const b = s => document.querySelector(s).getBoundingClientRect(); const c = b('#cv'), e = b('#edit'), s = b('#strip'); return { cw: c.width, ch: c.height, eh: e.height, ex: e.x, sb: s.bottom, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, visible: !document.getElementById('edit').hidden && !!document.querySelector('#picker .opt').offsetParent }; });
    r.check(m.visible && m.sw <= m.iw && m.sh <= m.ih + 1, `${name}: picker open, the page fits`, JSON.stringify(m));
    if (w < 700) {
      r.check(m.ch >= (hh >= 667 ? 200 : 190), `${name}: the preview stays at least 200 px tall (190 on the smallest) with the picker open`, `${m.cw.toFixed(0)}×${m.ch.toFixed(0)}`);
      r.check(m.eh <= hh * 0.38 + 1, `${name}: the bottom panel is at most 38% of the height`, `${m.eh.toFixed(0)} px`);
      await page.click('#tabTracks');
      r.check(await page.evaluate(() => document.getElementById('cv').getBoundingClientRect().height) >= (hh >= 667 ? 200 : 190), `${name}: the preview keeps its size on the Sound tab`);
      await page.click('#tabMelody');
      r.check(await page.evaluate(() => document.getElementById('cv').getBoundingClientRect().height) >= 190, `${name}: the preview keeps its size with the Melody sheet open`);
    } else {
      r.check(m.ch >= 500 && m.ex > m.cw && m.cw + m.ex > w * 0.5, `${name}: wide layout: big preview on the left, editor on the right`, `${m.cw.toFixed(0)}×${m.ch.toFixed(0)}, editor at x=${m.ex}`);
      await page.click('#tabMelody');
      r.check(await page.evaluate(() => { const e = document.getElementById('edit').getBoundingClientRect(), c = document.querySelector('.mel-scroll').getBoundingClientRect(); return e.height > 400 && c.height > 250; }), `${name}: the Melody tab has no gap on wide screens`);
    }
    await context.close();
  }

  const { page, context } = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  const A = fn => page.evaluate(fn);
  const ids = () => A(() => window.__app.store.project.chords.map(c => c.id));

  // ---- tap on the preview plays and pauses
  await page.click('#cv'); await page.waitForTimeout(400);
  r.check(await A(() => window.__app.engine.playing), 'a tap on the preview plays');
  await page.click('#cv');
  r.check(await A(() => !window.__app.engine.playing), 'a second tap on the preview pauses');

  // ---- Space after a click on a button still plays (the focused button is not the target of Space)
  await page.click('#editBtn'); await page.click('#tabTracks'); await page.keyboard.press(' '); await page.waitForTimeout(300);
  r.check(await A(() => window.__app.engine.playing), 'Space plays even right after clicking a button');
  await page.keyboard.press(' ');
  await page.click('#tabChords');

  // ---- playing chord is highlighted in the strip
  await page.click('#play'); await page.waitForTimeout(500);
  r.check(await page.locator('#strip .chord[aria-current="true"]').count() === 1, 'the playing chord is highlighted in the strip');
  await page.click('#play');

  // ---- focus stays on the control after a pick (the picker is not rebuilt)
  await page.click('#strip .chord >> nth=0');
  await page.focus('#picker .opt[data-q="m"]'); await page.keyboard.press('Enter');
  r.check(await A(() => document.activeElement && document.activeElement.getAttribute('data-q') === 'm' && window.__app.store.project.chords[0].sym === 'Cm'), 'focus stays on the button after a pick, and the chord changes');
  await page.focus('#picker .opt[data-root="2"]'); await page.keyboard.press('Enter');
  r.check(await A(() => window.__app.store.project.chords[0].sym === 'Dm' && document.activeElement.getAttribute('data-root') === '2'), 'root pick keeps focus and the chord type');
  // Escape from a sheet returns focus to its button, not to the page
  await page.click('#projBtn'); await page.waitForSelector('#projectsSheet'); await page.keyboard.press('Escape');
  r.check(await A(() => document.activeElement && document.activeElement.id === 'projBtn'), 'Escape returns focus to the button that opened the sheet');

  // ---- selection: by id, sane after delete, reset on project open
  const first = await ids();
  await page.click('#strip .chord >> nth=3');
  r.check(await A(() => window.__app.store.ui.selectedId) === first[3], 'selecting a chord stores its id');
  await page.click('#strip .rm');
  r.check(await A(() => window.__app.store.ui.selectedId) === first[4], 'after removing a chord the selection moves to the next one');
  await page.click('.toast button:has-text("Undo")');
  r.check((await ids()).length === first.length, 'Undo brings the removed chord back');
  await page.click('#strip .chord >> nth=7');
  await page.click('#strip .rm');
  r.check(await A(() => window.__app.store.ui.selectedId) === first[6], 'removing the last chord selects the one before');
  await page.click('#tabTracks');
  await A(() => { const L = window.__app.lab; window.__app.store.open(L.normalizeProject(L.newProject('other', 'F Bb'))); });
  r.check(await A(() => window.__app.store.ui.selectedId === null && window.__app.store.ui.tab === 'Chords'), 'opening a project clears the selection and returns to the Chords tab');
  r.check(await page.isVisible('#paneChords') && await page.locator('#picker .pk-none').isVisible(), 'the picker asks for a chord when none is selected');

  // ---- add and drag to reorder with the mouse
  await A(() => { const L = window.__app.lab; window.__app.store.open(L.normalizeProject(L.newProject('drag', 'C G Am F'))); });
  const before = await ids();
  const box = async i => (await page.locator('#strip .cw').nth(i).boundingBox());
  const b0 = await box(0), b3 = await box(3);
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2); await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 + 20, b0.y + b0.height / 2, { steps: 4 });
  await page.mouse.move(b3.x + b3.width - 4, b3.y + b3.height / 2, { steps: 8 });
  r.check(await page.locator('#strip .cw.dragging').count() === 1, 'dragging a chord lifts it');
  await page.mouse.up();
  const after = await ids();
  r.check(after[3] === before[0] && after[0] === before[1] && after.length === 4, 'dragging the first chord to the end reorders by id', after.join());
  r.check(await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')) === 'G Am F C', 'the chords follow the drag');
  r.check(await A(() => window.__app.store.canUndo()), 'a reorder can be undone');
  // a finger: press and hold, then drag (the strip still scrolls when you swipe at once)
  const cdp = await context.newCDPSession(page);
  const t0 = await box(3), t1 = await box(0);
  const pt = (b, dx = 0) => [{ x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(t0) });
  await page.waitForTimeout(400);
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(t0, (t1.x - t0.x) * k / 6 - 8) }); await page.waitForTimeout(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  r.check(await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')) === 'C G Am F', 'press, hold and drag with a finger moves a chord back');
  // keyboard: Alt + arrow moves the focused chord
  await page.focus('#strip .chord >> nth=0'); await page.keyboard.press('Alt+ArrowRight');
  r.check(await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')) === 'G C Am F' && await A(() => document.activeElement.classList.contains('chord')), 'Alt + arrow reorders from the keyboard and keeps focus');
  // keyed render: an edit touches only its own chip
  const same = await A(() => { const el = document.querySelectorAll('#strip .cw')[2]; window.__keep = el; window.__app.store.update(p => { p.chords[0].sym = 'D'; }, ''); return document.querySelectorAll('#strip .cw')[2] === window.__keep; });
  r.check(same, 'a change to one chord does not rebuild the other chips');

  // ---- fast start: four chords in three taps from the project button
  let taps = 0;
  await page.click('#projBtn'); taps++; await page.click('#projectsSheet button:has-text("New project")'); taps++;
  await page.waitForSelector('#newSheet [data-prog]');
  r.check(await page.locator('#newSheet [data-prog]').count() >= 10 && await page.locator('#newBlank').count() === 1, 'New project offers Blank and a library of progressions');
  await page.click('#newSheet [data-prog="pop"]'); taps++;
  r.check(await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')) === 'C G Am F', `four chords from the new-project dialog in one tap (${taps} taps from the main screen)`);
  r.check(taps <= 3 && await page.locator('.sheet').count() === 0, 'the dialogs close by themselves');
  // transpose, surprise, tap tempo
  await page.click('#strip .chord >> nth=0'); await page.click('button[aria-label="Transpose up one step"]');
  r.check(await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')) === 'Db Ab Bbm F#', 'Transpose moves every chord', await A(() => window.__app.store.project.chords.map(c => c.sym).join(' ')));
  await page.click('#surprise');
  r.check(await A(() => window.__app.store.project.chords.length) >= 4 && await page.locator('.toast button:has-text("Undo")').count() === 1, 'Surprise me writes a progression and offers Undo');
  for (let k = 0; k < 4; k++) { await page.click('#tapTempo'); await page.waitForTimeout(500); }
  const bpm = await A(() => window.__app.store.project.tempo);
  r.check(bpm > 105 && bpm < 135, 'tap tempo follows the taps', String(bpm));

  // ---- melody as a piano roll
  await page.click('#tabMelody');
  r.check(await A(() => document.querySelector('.mel-grid').getAttribute('role') === 'grid' && document.querySelectorAll('.mel-name.white').length >= 14 && document.querySelectorAll('.mel-name.black').length >= 10), 'the melody is a grid with white and black piano keys');
  r.check(await A(() => [...document.querySelectorAll('.mel-name.c')].every(k => /^C\d$/.test(k.textContent)) && document.querySelectorAll('.mel-name.c').length >= 2), 'C keys are labelled with their octave');
  await page.click('.mel-name.white >> nth=2');
  r.check(await page.locator('.sheet').count() === 0, 'tapping a piano key is harmless and sounds the note');
  await page.focus('.mel-cell[tabindex="0"]'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  r.check(await A(() => window.__app.store.project.tracks.melody.notes.length) === 1 && await A(() => document.activeElement.classList.contains('mel-cell')), 'the roll is operable with the keyboard: arrows move, Enter adds a note, focus stays');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  r.check(await A(() => document.activeElement.dataset.c === '1' || document.activeElement.dataset.c === '2'), 'arrow keys move between squares');
  await context.close();

  // ---- dark theme, borders
  const d = await openApp(browser, url, r, { viewport: { width: 375, height: 667 }, mobile: true });
  await d.page.emulateMedia({ colorScheme: 'dark' });
  const dark = await d.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  r.check(dark === 'rgb(28, 24, 20)', 'dark theme follows the system setting', dark);
  const ratio = async scheme => { await d.page.emulateMedia({ colorScheme: scheme }); return d.page.evaluate(() => {
    const lum = c => { const [R, G, B] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
    document.getElementById('editBtn').click();
    const el = document.getElementById('tempo'), cs = getComputedStyle(el), a = lum(cs.borderTopColor), b = lum(cs.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }); };
  const light = await ratio('light');
  r.check(light >= 3, 'field borders have at least 3:1 contrast (light)', light.toFixed(2));
  const darkR = await ratio('dark');
  r.check(darkR >= 3, 'field borders have at least 3:1 contrast (dark)', darkR.toFixed(2));
  await d.context.close();
}
