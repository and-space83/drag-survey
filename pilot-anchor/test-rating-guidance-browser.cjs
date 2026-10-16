"use strict";
// Real runtime, synthetic local input only. No participant storage or uploads.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), crypto = require("node:crypto");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { appAssets, transformAppScripts, sourceManifest } = require("./lib/app-source.cjs");
const root = path.resolve(process.env.APP_ROOT || __dirname);
const baseline = path.resolve(process.env.BASELINE_APP_ROOT || path.join(__dirname, "../../_work/reading-review-after"));
const output = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, "../../_work/rating-guidance-after-dev"));
fs.mkdirSync(path.join(output, "data"), { recursive: true });
const sizes = [[375, 700], [402, 759], [440, 841]];
const report = { at: new Date().toISOString(), scope: "Chrome synthesized touch/pointer input, not physical iPhone Safari; upload=0 and go= previews; no participant data.",
  sourceRoot: root, baselineRoot: baseline, source: sourceManifest(root), beforeSource: sourceManifest(baseline), checks: [], screens: [], parity: [], errors: [], blockedRequests: [] };
const assets = new Map();
for (const [variant, dir] of [["before", baseline], ["after", root]]) {
  const prefix = "/" + variant, files = appAssets(dir, prefix); let hooks = 0;
  transformAppScripts(files, text => {
    const marker = "ratingsOn: () => CONFIG.ratings,";
    if (!text.includes(marker)) return text;
    hooks++;
    return text.replace(marker, marker + "\n      qaRatingTrial: () => trial ? publicTrial(trial) : null,");
  }, prefix);
  assert.equal(hooks, 1);
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
const advance = (page, ms) => page.evaluate(ms => { window.__ratingClock += ms; }, ms);
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const cleanGuidance = page => page.evaluate(() => !document.querySelector("#rating .warn,#rating .rating-choice-cue,#ratingNext.cue,#ratingSubmit.cue"));
const semantic = page => page.evaluate(() => ({ page: __pilot.ratPage(), trial: __pilot.qaRatingTrial(), rating: __pilot.recoveryState().rating,
  records: __pilot.buildPayload().trials, log: __pilot.buildPayload().device.tutorialLog }));
function ratingParity(row) {
  // Real drag events use the browser's native event.timeStamp and display Hz;
  // those clocks vary between runs. Full records are retained in the report,
  // and every stray tap is checked against its own unchanged full record.
  const record = trial => trial && ({ keys: Object.keys(trial).sort(), phase: trial.phase, itemId: trial.itemId, choiceSide: trial.choiceSide,
    ratings: trial.ratings, ratingBacks: trial.ratingBacks, ratingSubmitMs: trial.ratingSubmitMs });
  return { name: row.name, state: { page: row.state.page, trial: record(row.state.trial), rating: row.state.rating, records: row.state.records.map(record), log: row.state.log } };
}
const progress = page => page.evaluate(() => ({ phase: document.getElementById("ratingPhaseLabel")?.textContent,
  count: document.getElementById("ratingCounter")?.textContent, taskCount: document.getElementById("counter").textContent,
  width: document.getElementById("ratingProgressFill").style.width, taskWidth: document.getElementById("progressFill").style.width,
  on: !!document.getElementById("ratingTopbar")?.classList.contains("on"), barOn: document.getElementById("ratingProgress").classList.contains("on") }));
async function screenshot(page, size, kind, state) {
  const file = `after/${size}/rating-${kind}-${state}.png`, absolute = path.join(output, file);
  let ink = null;
  if (state === "hint" || state === "selected-hint") {
    ink = await page.evaluate(kind => {
      const button = document.getElementById(kind === "hesitation" ? "ratingNext" : "ratingSubmit"), range = document.createRange();
      range.selectNodeContents(button);
      const bounds = button.getBoundingClientRect(), rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      return { text: button.textContent, lines: new Set(rects.map(r => Math.round(r.top * 10) / 10)).size,
        inside: rects.every(r => r.left >= bounds.left - .5 && r.right <= bounds.right + .5 && r.top >= bounds.top - .5 && r.bottom <= bounds.bottom + .5),
        button: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        rects: rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })) };
    }, kind);
    check(`${size}/${kind}/${state} message occupies one line inside its button`, ink.lines === 1 && ink.inside);
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true }); await page.screenshot({ path: absolute });
  report.screens.push({ file, kind, state, size, ink, text: await page.locator("#rating").innerText(), sha256: crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"),
    condition: "本番1問目で左の回答を選んだ直後。評定は迷い2・自信4の架空操作。Chrome合成入力、送信0。" });
}
async function contextFor(variant, size, go = "task", reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, hasTouch: true, isMobile: true, reducedMotion, serviceWorkers: "block" });
  await context.route("**/*", route => {
    const r = route.request();
    if (r.method() === "GET" && new URL(r.url()).origin === origin) return route.continue();
    report.blockedRequests.push({ variant, method: r.method(), url: r.url() }); return route.abort();
  });
  await context.addInitScript(() => {
    window.__ratingClock = 1000;
    Object.defineProperty(performance, "now", { configurable: true, value: () => window.__ratingClock });
    let seed = 348971; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    window.__ratingChoiceClicks = [];
    document.addEventListener("click", e => { const button = e.target.closest?.("#ratingItems button"); if (button) window.__ratingChoiceClicks.push({ item: button.closest(".qitem").id, value: button.dataset.val }); });
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on("pageerror", e => report.errors.push({ variant, size, message: e.message }));
  const query = new URLSearchParams({ block: "moral", upload: "0", debug: "1", go, devguard: "0", zoomguard: "0", mic: "0", minread: "0", readgate: "0", attn: "0", instr: "0", stop: "1" });
  await page.goto(origin + "/" + variant + "/?" + query);
  await page.waitForFunction(() => window.__pilot?.storeReady());
  return { page, context };
}
async function answerTask(page) {
  await page.waitForFunction(() => __pilot.activeScreen() === "task" && !__pilot.uiLocked());
  const start = await page.locator("#start").boundingBox(), end = await page.locator("#choiceA").boundingBox();
  const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }, to = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 18; i++) {
    await advance(page, 40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * i / 18, y: from.y + (to.y - from.y) * i / 18 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach();
  await page.waitForFunction(() => __pilot.activeScreen() === "rating"); await settled(page);
}
async function outsideTap(page) {
  const before = await semantic(page); await page.locator("#ratingAnswer").tap();
  check("stray tap preserves every trial field, elapsed clocks, records and logs", await semantic(page), before);
}
async function ordinary(variant, size) {
  const { page, context } = await contextFor(variant, size), after = variant === "after", label = variant + "/" + size.join("x"), states = [];
  const save = async name => states.push({ name, state: await semantic(page) });
  try {
    await answerTask(page); await save("main hesitation");
    const initialProgress = await progress(page);
    if (after) {
      check(label + " count and phase match the task", initialProgress.on && initialProgress.barOn && initialProgress.phase === "本番" && initialProgress.count === initialProgress.taskCount && /^1 \/ \d+$/.test(initialProgress.count) && initialProgress.width === initialProgress.taskWidth);
      await screenshot(page, size.join("x"), "hesitation", "empty");
    }
    const initial = await semantic(page); await outsideTap(page); await save("hesitation stray unselected");
    if (after) {
      check(label + " unselected directs to choices", await page.evaluate(() => document.getElementById("ratingNext").textContent === "1つ選んでください" && document.getElementById("ratingNext").disabled && document.querySelectorAll(".rating-choice-cue").length === 1 && !!document.querySelector("#qitem-hesitation .rating-choice-cue")));
      check(label + " guidance does not touch ratings, timing, logs or records", await semantic(page), initial);
      await screenshot(page, size.join("x"), "hesitation", "hint");
    }
    await advance(page, 31); await page.locator('#qitem-hesitation button[data-val="2"] b').tap(); await save("hesitation selected");
    check(label + " touch produces exactly one native hesitation click", await page.evaluate(() => __ratingChoiceClicks), [{ item: "qitem-hesitation", value: "2" }]);
    if (after) check(label + " option child click clears guidance without swallowing selection", await cleanGuidance(page) && (await semantic(page)).trial.ratings.hesitation.value === 2);
    await outsideTap(page); await save("hesitation stray selected");
    if (after) {
      check(label + " selected points to actual Next and shakes", await page.evaluate(() => document.getElementById("ratingNext").textContent === "このボタンで進む" && !document.getElementById("ratingNext").disabled && getComputedStyle(document.getElementById("ratingNext")).animationName === "btnNudge" && !document.querySelector(".rating-choice-cue")));
      await screenshot(page, size.join("x"), "hesitation", "selected-hint");
    }
    await page.locator("#ratingNext").tap(); await settled(page); await save("confidence page");
    if (after) {
      check(label + " page transition clears warning", await cleanGuidance(page));
      await screenshot(page, size.join("x"), "confidence", "empty");
    }
    await outsideTap(page); await save("confidence stray unselected");
    if (after) {
      check(label + " confidence targets only its choices and Submit", await page.evaluate(() => document.getElementById("ratingSubmit").textContent === "1つ選んでください" && document.getElementById("ratingSubmit").disabled && !!document.querySelector("#qitem-confidence .rating-choice-cue") && !document.getElementById("ratingNext").classList.contains("warn")));
      await screenshot(page, size.join("x"), "confidence", "hint");
    }
    await advance(page, 19); await page.locator('#qitem-confidence button[data-val="4"] span').tap(); await save("confidence selected"); await outsideTap(page); await save("confidence stray selected");
    check(label + " touch produces exactly one native confidence click", await page.evaluate(() => __ratingChoiceClicks), [{ item: "qitem-hesitation", value: "2" }, { item: "qitem-confidence", value: "4" }]);
    if (after) { check(label + " selected confidence targets Submit", await page.locator("#ratingSubmit").textContent(), "このボタンで進む"); await screenshot(page, size.join("x"), "confidence", "selected-hint"); }
    await page.locator("#ratingBack").tap(); await save("back");
    if (after) check(label + " Back keeps native behavior and clears warning", await cleanGuidance(page) && (await semantic(page)).trial.ratingBacks === 1);
    await page.locator("#ratingNext").tap(); await save("confidence revisit"); await outsideTap(page);
    await page.locator("#ratingHelp").tap(); await save("review opened");
    if (after) {
      check(label + " explanation review clears ordinary cues", !await page.evaluate(() => !!document.querySelector("#rating .warn,#rating .rating-choice-cue")));
      const inReview = await progress(page); check(label + " review hides both count and progress", !inReview.on && !inReview.barOn && inReview.count === "");
    }
    await advance(page, 5000); await page.locator("#ratingTutClose").tap(); await save("review closed");
    if (after) check(label + " same trial count and fill through selection, Back and review", await progress(page), initialProgress);
    await outsideTap(page); await page.locator("#stopBtn").tap();
    if (after) check(label + " stop screen clears warning and pending tap", await cleanGuidance(page) && await page.evaluate(() => __pilot.activeScreen() === "stopconfirm"));
    await page.locator("#stopBack").tap(); await save("stop cancelled");
    if (after) check(label + " restored rating has no old guidance", await cleanGuidance(page));
    await page.locator("#ratingSubmit").tap(); await page.waitForFunction(() => __pilot.activeScreen() !== "rating"); await save("submitted");
    // The normal movement reminder may appear between problems; it must retain
    // the old task counter until the next task is actually presented.
    if (await page.evaluate(() => __pilot.activeScreen() === "notice")) { await advance(page, 5000); await page.locator("#noticeGo").tap(); }
    await page.waitForFunction(() => __pilot.activeScreen() === "task" && !__pilot.uiLocked());
    if (after) {
      check(label + " submit clears decoration after leaving rating", await cleanGuidance(page));
      check(label + " counter advances only for next problem", await page.locator("#counter").textContent(), initialProgress.count.replace(/^1 /, "2 "));
    }
    check(label + " preview stores no answers and upload disabled", await page.evaluate(() => __pilot.uploadUrl() === null && !__pilot.hasBackup() && __pilot.storedSessions().length === 0));
  } finally { await context.close(); }
  return states;
}
async function gestureAndTimerChecks() {
  const { page, context } = await contextFor("after", sizes[0], "rating"), label = "gesture/timer";
  try {
    await page.waitForFunction(() => __pilot.activeScreen() === "rating");
    const point = await page.locator("#ratingAnswer").boundingBox(), x = point.x + point.width / 2, y = point.y + point.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 30); await page.mouse.up();
    check(label + " scrolling gesture never shows a tap warning", await cleanGuidance(page));
    await page.locator("#ratingAnswer").dispatchEvent("pointerdown", { pointerId: 12, isPrimary: true, clientX: x, clientY: y });
    await page.locator("#ratingAnswer").dispatchEvent("pointercancel", { pointerId: 12 });
    await page.locator("#ratingAnswer").dispatchEvent("pointerup", { pointerId: 12, isPrimary: true, clientX: x, clientY: y });
    check(label + " canceled touch has no guidance", await cleanGuidance(page));
    await page.locator("#ratingAnswer").dispatchEvent("pointerdown", { pointerId: 12, isPrimary: true, clientX: x, clientY: y });
    await page.locator("#ratingAnswer").dispatchEvent("pointerdown", { pointerId: 13, isPrimary: false, clientX: x, clientY: y });
    await page.locator("#ratingAnswer").dispatchEvent("pointerup", { pointerId: 12, isPrimary: true, clientX: x, clientY: y });
    check(label + " second finger cancels pending tap", await cleanGuidance(page));
    await outsideTap(page); await page.locator("#rating .qwrap").dispatchEvent("scroll"); check(label + " scroll immediately clears existing warning", await cleanGuidance(page));
    await page.locator("#ratingNext").tap({ force: true });
    check(label + " disabled Next tap is received by the parent", await page.locator("#ratingNext").textContent(), "1つ選んでください");
    await page.waitForTimeout(700); await outsideTap(page); await page.waitForTimeout(650);
    check(label + " repeated tap does not extend 1200ms warning", await cleanGuidance(page));
    check(label + " timer restores original button label and height", await page.evaluate(() => document.getElementById("ratingNext").textContent === "次へ" && !document.getElementById("ratingNext").style.height));
    await page.evaluate(() => { const input = document.createElement("input"); input.id = "qaRatingInput"; input.style.cssText = "position:fixed;left:8px;top:80px;width:80px"; document.getElementById("rating").append(input); });
    await page.locator("#qaRatingInput").tap(); await page.locator("#qaRatingInput").fill("input"); check(label + " form input keeps native operation without cue", await cleanGuidance(page) && await page.locator("#qaRatingInput").inputValue() === "input");
    await page.locator("#qaRatingInput").evaluate(e => e.remove());
    await outsideTap(page); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); check(label + " leaving the app clears warning", await cleanGuidance(page));
    await page.emulateMedia({ reducedMotion: "reduce" }); await outsideTap(page);
    check(label + " reduced motion replaces shaking with outline", await page.evaluate(() => getComputedStyle(document.getElementById("ratingNext")).animationName === "none" && getComputedStyle(document.getElementById("ratingNext")).outlineStyle === "solid"));
  } finally { await context.close(); }
  const tutorial = await contextFor("after", sizes[0], "rtut");
  try {
    await tutorial.page.waitForFunction(() => __pilot.activeScreen() === "rating"); await tutorial.page.locator("#ratingAnswer").dispatchEvent("pointerdown", { pointerId: 1, isPrimary: true });
    check("tutorial retains its pointerdown stray log", await tutorial.page.evaluate(() => __pilot.buildPayload().device.tutorialLog.some(e => e.kind === "rating" && e.event === "stray")));
    check("tutorial does not receive ordinary option decoration", await tutorial.page.evaluate(() => !document.querySelector(".rating-choice-cue")));
  } finally { await tutorial.context.close(); }
}
(async () => {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); origin = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  check("controller source unchanged", report.source["js/rating-controller.js"], report.beforeSource["js/rating-controller.js"]);
  for (const size of sizes) {
    const before = await ordinary("before", size), after = await ordinary("after", size); report.parity.push({ size: size.join("x"), before, after });
    check(size.join("x") + " same state count", after.length, before.length);
    for (let i = 0; i < before.length; i++) check(size.join("x") + "/" + before[i].name + " preserves rating values, RT, snapshot, record schema and logs", ratingParity(after[i]), ratingParity(before[i]));
  }
  await gestureAndTimerChecks(); check("no JavaScript errors", report.errors, []); check("no external or write request", report.blockedRequests, []);
  report.sourceUnchanged = JSON.stringify(sourceManifest(root)) === JSON.stringify(report.source);
  check("source remained stable during test", report.sourceUnchanged);
})().catch(error => { report.failure = String(error.stack || error); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve));
  report.passed = passed; report.failed = report.failure ? 1 : 0; report.remote = report.blockedRequests;
  fs.writeFileSync(path.join(output, "data/guidance-results.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Rating guidance: " + passed + " checks passed; " + report.screens.length + " screenshots" + (report.failure ? "; FAILED" : ""));
});
