'use strict';
// Additional evidence for the loop-sync patch. Previous results/images stay untouched.
// Localhost, fresh browser contexts, synthetic input, upload=0; no participant storage.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const child = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const review = __dirname;
const app = path.resolve(review, '../..');
const repo = path.resolve(review, '../../../..');
const scratch = path.join(repo, '_work/rounded-stem-hints/loop-sync');
const baselineRef = '315afd3e9986e1b052ec7d16d02b0f72e7ef0390';
const beforeRoot = path.join(scratch, 'before-app');
const assets = require('../../screen-gallery/source-assets.cjs');
const sizes = [{ width: 375, height: 548 }, { width: 375, height: 700 }, { width: 402, height: 759 }];
const normal = s => String(s).replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const sourceHash = file => hash(normal(fs.readFileSync(file, 'utf8')));
const report = {
  at: new Date().toISOString(),
  scope: 'Additional loop-sync patch only; Chrome touch emulation, not physical iPhone Safari. Prior published reports and images are preserved.',
  baselineRef, beforeSource: {}, source: {}, finalSource: {},
  checks: [], errors: [], unexpectedRequests: [], captures: [], timelines: [], reducedMotion: [],
};
const check = (name, pass, detail) => {
  report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  console.log((pass ? 'PASS ' : 'FAIL ') + name);
  assert.ok(pass, name);
};
fs.mkdirSync(scratch, { recursive: true });
for (const name of assets) {
  const file = path.join(beforeRoot, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, child.execFileSync('git', ['show', baselineRef + ':tools/pilot-anchor/' + name], { cwd: repo, maxBuffer: 8 * 1024 * 1024 }));
  report.beforeSource[name] = sourceHash(file);
  report.source[name] = sourceHash(path.join(app, name));
}
const oldReport = JSON.parse(fs.readFileSync(path.join(review, 'results.json'), 'utf8'));
check('baseline assets exactly match the previous published 333-check report', JSON.stringify(report.beforeSource) === JSON.stringify(oldReport.afterSource));
const preserved = {};
function preserve(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name), rel = path.relative(review, file).replaceAll('\\', '/');
    if (rel.startsWith('shots/loop-sync')) continue;
    if (item.isDirectory()) preserve(file);
    else if ((rel.startsWith('shots/') && rel.endsWith('.png')) || ['results.json', 'range-resize-results.json', 'reduced-motion-results.json', 'orientation-results.json', 'full-validation-results.json', 'device-lab-latest-results.json'].includes(rel)) preserved[rel] = hash(fs.readFileSync(file));
  }
}
preserve(review);
report.preservedEvidence = preserved;
const expectedJs = normal(fs.readFileSync(path.join(beforeRoot, 'guided-tutorial.js'), 'utf8'))
  .replace("button.classList.toggle('armed',(contacted&&s.phase!=='reset')||s.reduced);", "button.classList.toggle('armed',contacted);")
  .replace("buttonText.classList.toggle('armed',(contacted&&s.phase!=='reset')||s.reduced);", "buttonText.classList.toggle('armed',contacted);")
  .replace("buttonText.textContent=(s.phase==='idle'||s.phase==='reset')&&!s.reduced?'スタート':'→';", "buttonText.textContent=s.phase==='idle'&&!s.reduced?'スタート':'→';");
check('guided JavaScript changes are exactly the three display-state lines', normal(fs.readFileSync(path.join(app, 'guided-tutorial.js'), 'utf8')) === expectedJs);
const expectedIndex = normal(fs.readFileSync(path.join(beforeRoot, 'index.html'), 'utf8')).replace('guided-tutorial.js?v=2026-10-15-ui20-stem-hints1', 'guided-tutorial.js?v=2026-10-15-ui20-loop-sync1');
check('index change is exactly the guided JavaScript cache key', normal(fs.readFileSync(path.join(app, 'index.html'), 'utf8')) === expectedIndex);
check('the remaining twelve distribution assets are unchanged', assets.filter(n => !['index.html', 'guided-tutorial.js'].includes(n)).every(n => report.source[n] === report.beforeSource[n]));
report.changedAssets = assets.filter(n => report.source[n] !== report.beforeSource[n]);
report.coreDiff = child.execFileSync('git', ['diff', baselineRef, '--', 'tools/pilot-anchor/guided-tutorial.js', 'tools/pilot-anchor/index.html'], { cwd: repo, encoding: 'utf8' });

const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8' };
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  const version = url.pathname.split('/')[1];
  const root = version === 'before' ? beforeRoot : version === 'after' ? app : null;
  if (!root || req.method !== 'GET') { res.writeHead(403); return res.end(); }
  const relative = decodeURIComponent(url.pathname.slice(version.length + 1)) || '/index.html';
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data);
  });
});
let browser, origin;
async function open(version, size, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === origin && request.method() === 'GET') return route.continue();
    report.unexpectedRequests.push({ url: request.url(), method: request.method() }); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(origin + '/' + version + '/index.html?block=moral&debug=1&upload=0&devguard=0&zoomguard=0&mic=0&readgate=0&minread=0&attn=0&instr=0&go=tut&gstep=time-rule');
  await page.waitForFunction(() => window.__pilot && window.PILOT_GUIDED_TUTORIAL);
  await page.waitForTimeout(350);
  check(version + ' ' + size.width + 'x' + size.height + ' ' + reducedMotion + ' uploads disabled', await page.evaluate(() => __pilot.uploadUrl() === null));
  await page.evaluate(() => {
    window.__loopSyncDemo = PILOT_GUIDED_TUTORIAL.createTimeDemo({ container: document.getElementById('tutGraphic') });
    window.__loopSyncRead = () => {
      const svg = document.querySelector('#tutGraphic svg'), s = __loopSyncDemo.state();
      const button = svg.querySelector('.start-exit-button'), text = svg.querySelector('.start-exit-button-text');
      return {
        phase: s.phase, cycles: s.cycles, contacted: s.contacted, exited: s.exited, reduced: s.reduced,
        buttonText: text.textContent, armed: button.classList.contains('armed'), textArmed: text.classList.contains('armed'),
        buttonFill: getComputedStyle(button).fill, buttonStroke: getComputedStyle(button).stroke, textFill: getComputedStyle(text).fill,
        touch: Number(getComputedStyle(svg.querySelector('.start-exit-touch-label')).opacity),
        exit: Number(getComputedStyle(svg.querySelector('.start-exit-label')).opacity),
      };
    };
  });
  return { context, page };
}
async function sample(view, phase) {
  return view.page.evaluate(phase => { __loopSyncDemo.begin({ capture: true, phase }); return __loopSyncRead(); }, phase);
}
function sync(s) {
  return s.buttonText === (s.contacted ? '→' : 'スタート') && s.armed === s.contacted && s.textArmed === s.contacted &&
    s.touch === (s.contacted ? 1 : 0) && s.exit === (s.exited ? 1 : 0) &&
    s.buttonStroke === (s.contacted ? 'rgb(18, 133, 90)' : 'rgb(184, 83, 26)') && s.textFill === s.buttonStroke;
}
async function screenshot(view, size, version, phase) {
  const image = 'shots/loop-sync/' + size.width + 'x' + size.height + '/' + version + '-' + phase + '.png';
  fs.mkdirSync(path.dirname(path.join(review, image)), { recursive: true });
  await view.page.screenshot({ path: path.join(review, image) }); return image;
}
async function live(view, size) {
  await view.page.evaluate(() => {
    window.__loopSyncTimeline = []; const began = performance.now();
    __loopSyncDemo.begin({ capture: false });
    function observe() {
      const row = { elapsed: performance.now() - began, ...__loopSyncRead() }; __loopSyncTimeline.push(row);
      if (row.cycles < 1 || row.phase === 'idle') requestAnimationFrame(observe);
    }
    observe();
  });
  await view.page.waitForFunction(() => __loopSyncTimeline.some(s => s.cycles === 1 && s.phase === 'press'), null, { timeout: 8000 });
  const frames = await view.page.evaluate(() => __loopSyncTimeline);
  const label = size.width + 'x' + size.height + ' live';
  check(label + ' every observed frame keeps text/color/classes/labels synchronized', frames.every(sync), frames.filter(s => !sync(s)));
  const reset = frames.filter(s => s.phase === 'reset'), idle = frames.filter(s => s.cycles === 1 && s.phase === 'idle');
  check(label + ' reset is observed for multiple frames', reset.length >= 5, { frames: reset.length });
  check(label + ' both labels and the green arrow persist through the entire reset', reset.every(s => s.touch === 1 && s.exit === 1 && s.buttonText === '→' && s.armed && s.textArmed), reset);
  check(label + ' labels disappear with the normal-color start at next idle', idle.length >= 5 && idle.every(s => s.touch === 0 && s.exit === 0 && s.buttonText === 'スタート' && !s.armed && !s.textArmed), idle);
  const first = frames.find(s => s.phase === 'press');
  check(label + ' contact still waits approximately 300ms', first.elapsed >= 280 && first.elapsed <= 650, first);
  const next = frames.find(s => s.cycles === 1 && s.phase === 'press');
  check(label + ' next contact has no stale exit label', next.touch === 1 && next.exit === 0 && next.buttonText === '→' && next.armed, next);
  await view.page.evaluate(() => __loopSyncDemo.stop());
  report.timelines.push({ size, frames });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const size of sizes) {
    const label = size.width + 'x' + size.height;
    const before = await open('before', size), old = await sample(before, 'reset');
    check(label + ' baseline reproduces labels retained while button already resets', old.touch === 1 && old.exit === 1 && old.buttonText === 'スタート' && !old.armed && !old.textArmed, old);
    report.captures.push({ size, version: 'before', phase: 'reset', state: old, image: await screenshot(before, size, 'before', 'reset') });
    await before.context.close();
    const after = await open('after', size);
    for (const phase of ['idle', 'press', 'move', 'exit', 'reset']) {
      const state = await sample(after, phase);
      check(label + ' captured ' + phase + ' text/color/classes/labels are synchronized', sync(state), state);
      if (phase === 'idle') check(label + ' captured idle clears both labels and restores start', state.buttonText === 'スタート' && !state.armed && state.touch === 0 && state.exit === 0, state);
      if (phase === 'reset') check(label + ' captured reset preserves both green labels and arrow', state.buttonText === '→' && state.armed && state.textArmed && state.touch === 1 && state.exit === 1, state);
      report.captures.push({ size, version: 'after', phase, state, ...(['idle', 'reset'].includes(phase) ? { image: await screenshot(after, size, 'after', phase) } : {}) });
    }
    await live(after, size); await after.context.close();
    const reduced = await open('after', size, 'reduce');
    await reduced.page.evaluate(() => __loopSyncDemo.begin({ capture: false }));
    const still = await reduced.page.evaluate(() => __loopSyncRead());
    await reduced.page.waitForTimeout(750);
    const later = await reduced.page.evaluate(() => __loopSyncRead());
    check(label + ' reduced motion keeps a synchronized green static exit', sync(still) && still.phase === 'exit' && still.touch === 1 && still.exit === 1, still);
    check(label + ' reduced motion does not animate or change display state', JSON.stringify(still) === JSON.stringify(later));
    report.reducedMotion.push({ size, still, later }); await reduced.context.close();
  }
  for (const name of assets) report.finalSource[name] = sourceHash(path.join(app, name));
  check('all fourteen source assets remain stable during additional verification', JSON.stringify(report.source) === JSON.stringify(report.finalSource));
  check('previous published reports and images remain byte-for-byte unchanged', Object.entries(preserved).every(([name, digest]) => hash(fs.readFileSync(path.join(review, name))) === digest));
  check('no JavaScript errors', report.errors.length === 0, report.errors);
  check('no external or non-GET requests', report.unexpectedRequests.length === 0, report.unexpectedRequests);
})().catch(e => { report.errors.push(e.stack); console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  report.passed = report.checks.filter(c => c.pass).length;
  report.failed = report.checks.filter(c => !c.pass).length + (process.exitCode ? 1 : 0);
  fs.writeFileSync(path.join(review, 'loop-sync-results.json'), JSON.stringify(report, null, 2) + '\n');
  if (report.failed) process.exitCode = 1;
});
