"use strict";
// Compare the approved before snapshot and current runtime, not historical UI.
// Synthetic preview input only. Local GET requests; no persistence or uploads.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { appAssets, transformAppScripts, sourceManifest } = require("./lib/app-source.cjs");
const root = path.resolve(process.env.APP_ROOT || __dirname);
assert(process.env.BASELINE_APP_ROOT, "Set BASELINE_APP_ROOT to the approved source before this refactor");
const baseline = path.resolve(process.env.BASELINE_APP_ROOT);
const output = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, "../../_work/rating-refactor-2026-10-16/parity"));
const allowHeaderShift = process.env.ALLOW_RATING_HEADER_SHIFT === "1";
fs.mkdirSync(output, { recursive: true });
const report = { at: new Date().toISOString(), scope: "Before/after Chrome VM-clock parity of synthetic rating previews; animations disabled for stable geometry. Not physical Safari.",
  baseline, current: root, source: { before: sourceManifest(baseline), after: sourceManifest(root) },
  allowedPresentationChanges: allowHeaderShift ? ["The visible ratingHelp button may move horizontally to make room for the question count."] : [],
  checks: [], states: {}, errors: [], blockedRequests: [] };
const assets = new Map();
for (const [variant, dir] of [["before", baseline], ["after", root]]) {
  const prefix = "/" + variant, files = appAssets(dir, prefix); let hooks = 0;
  transformAppScripts(files, text => {
    const marker = "ratingsOn: () => CONFIG.ratings,";
    if (!text.includes(marker)) return text;
    hooks++;
    return text.replace(marker, marker + "\n      qaRatingTrial: () => trial ? publicTrial(trial) : null,\n      qaRatingRestart: saved => beginRating(saved),");
  }, prefix);
  assert.equal(hooks, 1, "The real rating functions must be inspectable once: " + variant);
  for (const entry of files) assets.set(...entry);
}
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const key = /^\/(?:before|after)\/$/.test(pathname) ? pathname + "index.html" : pathname;
  const data = request.method === "GET" ? assets.get(key) : null;
  response.writeHead(data ? 200 : 404, { "Content-Type": key.endsWith(".css") ? "text/css" : key.endsWith(".js") ? "application/javascript" : "text/html;charset=utf-8", "Cache-Control": "no-store" });
  response.end(data || "missing");
});
let browser, origin, passed = 0;
function check(name, actual, expected = true) { assert.deepEqual(actual, expected, name); passed++; report.checks.push(name); console.log("PASS " + name); }
async function capture(page, name, rows) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => {
    const rect = element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return null;
      const r = element.getBoundingClientRect(), round = value => Math.round(value * 1000) / 1000;
      return { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) };
    };
    const element = id => {
      const e = document.getElementById(id); return e ? { text: e.textContent, disabled: !!e.disabled, hidden: !!e.hidden, rect: rect(e) } : null;
    };
    return {
      screen: __pilot.activeScreen(), phase: __pilot.phase(), help: __pilot.helpState().rating,
      snapshot: __pilot.recoveryState().rating, trial: __pilot.qaRatingTrial(),
      records: __pilot.buildPayload().trials, tutorial: __pilot.buildPayload().device.ratingTutorial || null,
      log: __pilot.buildPayload().device.tutorialLog,
      elements: Object.fromEntries(["ratingHead", "ratTutTitle", "ratTutText", "tutStepLabel", "ratingBackNote", "ratingAnswer", "ratingNext", "ratingSubmit", "ratingBack", "ratingTutPrev", "ratingTutClose", "ratingHelp"].map(id => [id, element(id)])),
      items: [...document.querySelectorAll("#ratingItems .qitem")].map(item => ({ id: item.id, hidden: item.hidden,
        choices: [...item.querySelectorAll("button")].map(button => ({ value: button.dataset.val, text: button.textContent, selected: button.classList.contains("sel"), disabled: button.disabled, checked: button.getAttribute("aria-checked") })) })),
    };
  });
  rows.push({ name, state });
}
async function suite(variant, go, run) {
  const context = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", serviceWorkers: "block" });
  await context.route("**/*", route => {
    const request = route.request();
    if (request.method() === "GET" && new URL(request.url()).origin === origin) return route.continue();
    report.blockedRequests.push({ method: request.method(), url: request.url() }); return route.abort();
  });
  await context.addInitScript(() => {
    window.__ratingClock = 1000;
    Object.defineProperty(performance, "now", { configurable: true, value: () => window.__ratingClock });
    let seed = 348971;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on("pageerror", error => report.errors.push({ variant, go, message: error.message }));
  const rows = [];
  const step = async (name, action, elapsed = 0) => {
    if (elapsed) await page.evaluate(ms => { window.__ratingClock += ms; }, elapsed);
    if (action) await action();
    await capture(page, name, rows);
  };
  try {
    const query = new URLSearchParams({ block: "moral", upload: "0", debug: "1", go, devguard: "0", zoomguard: "0", mic: "0", minread: "0", readgate: "0", attn: "0", instr: "0" });
    await page.goto(origin + "/" + variant + "/?" + query);
    await page.waitForFunction(() => window.__pilot?.storeReady() && __pilot.activeScreen() === "rating");
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    check(variant + "/" + go + ": uploads disabled", await page.evaluate(() => __pilot.uploadUrl() === null));
    await run(page, step);
    check(variant + "/" + go + ": preview stores no answers", await page.evaluate(() => !__pilot.hasBackup() && __pilot.storedSessions().length === 0));
  } finally { await context.close(); }
  return rows;
}
async function tutorial(page, step) {
  const click = id => () => page.locator("#" + id).click();
  const select = (key, value) => () => page.locator('#qitem-' + key + ' button[data-val="' + value + '"]').click();
  await step("introduction");
  await step("hesitation explanation", click("ratingNext"), 13);
  await step("hesitation selected", select("hesitation", 3), 31);
  await step("hesitation changed", select("hesitation", 2), 19);
  await step("confidence explanation", click("ratingNext"));
  await step("confidence selected", select("confidence", 4), 43);
  const saved = await page.evaluate(() => __pilot.recoveryState().rating);
  await step("restored confidence", () => page.evaluate(saved => __pilot.qaRatingRestart(saved), saved), 5000);
  await step("return to hesitation", click("ratingTutPrev"), 17);
  await step("hesitation revised", select("hesitation", 4), 29);
  await step("confidence revisited", click("ratingNext"));
  await step("confidence revised", select("confidence", 5), 37);
  await step("committed then closing explanation", click("ratingSubmit"));
  await step("practice introduction", click("ratingSubmit"), 100);
  await step("continue into practice", click("ratingSubmit"), 100);
}
async function ordinary(page, step) {
  const click = id => () => page.locator("#" + id).click();
  const select = (key, value) => () => page.locator('#qitem-' + key + ' button[data-val="' + value + '"]').click();
  await step("ordinary hesitation");
  await step("ordinary hesitation selected", select("hesitation", 2), 31);
  await step("ordinary confidence", click("ratingNext"));
  await step("ordinary confidence selected", select("confidence", 4), 19);
  await step("review opened", click("ratingHelp"), 7);
  await step("review hesitation", click("ratingNext"), 5000);
  await step("review confidence", click("ratingNext"), 5000);
  await step("review previous", click("ratingTutPrev"));
  await step("review closed", click("ratingTutClose"));
  await step("ordinary confidence revised", select("confidence", 5), 13);
  await step("ordinary submitted", click("ratingSubmit"));
}
(async () => {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  for (const [name, run] of [["rtut", tutorial], ["rating", ordinary]]) {
    const before = await suite("before", name, run), after = await suite("after", name, run);
    report.states[name] = { before, after };
    check(name + ": same stage count", after.length, before.length);
    const comparable = row => {
      if (!allowHeaderShift) return row;
      const copy = structuredClone(row), rect = copy.state.elements.ratingHelp?.rect;
      if (rect) delete rect.x;
      return copy;
    };
    for (let index = 0; index < before.length; index++) check(name + "/" + before[index].name + ": unchanged copy, " + (allowHeaderShift ? "body geometry (only help X position excluded), " : "geometry, ") + "selection, timing, snapshot and log", comparable(after[index]), comparable(before[index]));
  }
  check("no JavaScript errors", report.errors, []); check("no external or write request attempted", report.blockedRequests, []);
})().catch(error => { report.failure = String(error.stack || error); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve));
  report.passed = passed;
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Rating parity: " + passed + " checks passed" + (report.failure ? "; failed" : ""));
});
