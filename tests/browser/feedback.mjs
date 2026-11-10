// Feedback: absent on the default build; on a build with FEEDBACK_URL it sends exactly what it promises.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openApp, serve, ROOT } from './lib.mjs';

export async function run(browser, url, r) {
  // a. default build: no entry
  { const { page, context } = await openApp(browser, url, r);
    await page.click('#menuBtn'); await page.waitForSelector('#menuSheet');
    r.check(await page.locator('#menuSheet button:has-text("Send feedback")').count() === 0, 'default build: no Send feedback entry');
    await context.close(); }

  // b. variant with a local endpoint
  const posts = []; let status = 204;
  const api = createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { posts.push(b); res.writeHead(status, cors); res.end(); });
  });
  await new Promise(ok => api.listen(0, '127.0.0.1', ok));
  const port = api.address().port, out = 'dist-feedback';
  let app;
  try {
    const b = spawnSync('node', ['scripts/build.mjs'], { cwd: ROOT, env: { ...process.env, OUT_DIR: out, FEEDBACK_URL: `http://127.0.0.1:${port}/fb` }, encoding: 'utf8' });
    r.check(b.status === 0, 'variant build succeeds', b.stderr);
    app = await serve(join(ROOT, out));
    const { page, context } = await openApp(browser, app.url, r, { viewport: { width: 375, height: 667 }, mobile: true });
    // openApp records every request to another origin as a failure; the feedback POST (and its preflight) is
    // the one allowed exception, so those entries are removed from r.failures at the end.
    const open = async () => { await page.click('#menuBtn'); await page.click('#menuSheet button:has-text("Send feedback")'); await page.waitForSelector('#feedbackSheet'); };
    await open();
    r.check(true, 'the Send feedback entry exists');
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('#feedbackSheet button, #feedbackSheet textarea, #feedbackSheet .fbseg span')).filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.textContent));
    r.check(small.length === 0, 'feedback controls are at least 44 px', small.join(','));
    r.check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'feedback sheet: no sideways scroll');
    r.check(!(await page.isChecked('#feedbackSheet input[name=attach]')), 'the project box is unchecked by default');
    r.check(await page.isChecked('#feedbackSheet input[value=bug]'), 'Bug is the default type');
    await page.click('#feedbackSheet button:has-text("Send")');
    r.check(await page.isVisible('#feedbackSheet [role=alert]') && posts.length === 0, 'empty text is refused, nothing sent');
    await page.fill('#feedbackSheet textarea', 'The   second chord sounds wrong');
    await page.check("#feedbackSheet input[value=chord]");
    await page.click('#feedbackSheet button:has-text("Send")');
    await page.waitForSelector('#feedbackSheet', { state: 'detached' });
    r.check(posts.length === 1, 'exactly one POST', String(posts.length));
    let j = JSON.parse(posts[0]);
    r.check(Object.keys(j).sort().join() === 'app,kind,message,version' && j.kind === 'chord' && j.version === 1, 'payload has only kind/message/app/version', Object.keys(j).join());
    r.check(await page.locator('#toasts .toast').innerText().then(t => t.includes('Thank you')), 'thank-you toast');

    await open(); await page.fill('#feedbackSheet textarea', 'with project');
    await page.check('#feedbackSheet input[name=attach]');
    await page.click('#feedbackSheet button:has-text("Send")');
    await page.waitForSelector('#feedbackSheet', { state: 'detached' });
    j = JSON.parse(posts[1]);
    r.check(posts.length === 2 && Array.isArray(j.project?.chords) && j.project.chords.length > 0, 'ticked box: project with chords is sent');
    r.check(['id', 'name', 'createdAt', 'updatedAt'].every(k => !(k in j.project)), 'project has no id, name, createdAt, updatedAt');

    status = 500;
    await open(); await page.fill('#feedbackSheet textarea', 'keep me');
    await page.click('#feedbackSheet button:has-text("Send")');
    await page.waitForSelector('#feedbackSheet [role=alert]:not([hidden])');
    r.check(await page.isVisible('#feedbackSheet'), 'on a 500 the sheet stays open');
    r.check((await page.inputValue('#feedbackSheet textarea')) === 'keep me', 'the text is kept');
    r.check((await page.innerText('#feedbackSheet [role=alert]')).startsWith('Could not send.'), 'the alert says what to do');
    r.check(await page.isEnabled('#feedbackSheet button:has-text("Send")'), 'Send is enabled again');
    await context.close();
    for (let i = r.failures.length - 1; i >= 0; i--) if (r.failures[i].startsWith(`third-party request: http://127.0.0.1:${port}/fb`) || /Failed to load resource/.test(r.failures[i]) && r.failures[i].includes('500')) r.failures.splice(i, 1);
  } finally {
    if (app) await app.close();
    await new Promise(ok => api.close(ok));
    rmSync(join(ROOT, out), { recursive: true, force: true });
  }
}
