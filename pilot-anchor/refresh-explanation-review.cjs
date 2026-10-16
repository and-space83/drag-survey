"use strict";
// Regenerate the fixed review URL from the current app. Never refresh baseline images.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const app = __dirname, repo = path.resolve(app, '../..');
const sourceRoot = path.resolve(process.env.APP_ROOT || app);
const dest = path.join(app, 'reviews/2026-10-12-session-explanations');
const args = process.argv.slice(2);
const from = args.indexOf('--from');
const overlay = args.indexOf('--overlay');
const work = path.resolve(process.env.REVIEW_WORK_DIR || path.join(repo, '_work/explanation-review-refresh'));
// Concurrent review jobs must not overwrite one another's PNGs or capture manifest.
const captureDir = from >= 0 ? path.resolve(args[from + 1]) : path.join(work, 'screens-' + process.pid + '-' + Date.now());
let sizes = { mini: [375, 700], iphone17: [402, 759], ipad: [768, 1024] };
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, value) => fs.writeFileSync(f, JSON.stringify(value, null, 2) + '\n');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = f => hash(fs.readFileSync(path.join(sourceRoot, f), 'utf8').replace(/\r\n/g, '\n'));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const assert = (condition, message) => { if (!condition) throw Error(message); };
const reviewStatePath = path.join(dest, 'review-state.json');
function reviewDecision(page, state, version, published, previousPage) {
  const decision = state && state.items[page.id];
  if (!decision) return { status: 'pending', display: 'pending', reason: 'この表示は未確認です。' };
  assert(['pending', 'review', 'hold', 'approved'].includes(decision.status), 'Unknown review status: ' + page.id);
  const copySha256 = hash(page.after.text);
  const previous = previousPage && previousPage.review;
  const approvedCopySha256 = decision.approvedCopySha256 || (previous && previous.targetVersion === state.targetVersion ? previous.approvedCopySha256 : null);
  // Approval only leaves the active list after this exact captured source is public.
  // Future edits to an approved explanation return it to the active list.
  const matchesApproval = (version === state.targetVersion && !approvedCopySha256) || approvedCopySha256 === copySha256;
  const complete = decision.status === 'approved' && published && matchesApproval;
  let reason = decision.reason || '';
  if (decision.status === 'approved' && !complete) reason = !published ? '修正・承認済み。撮影した版の公開一致を確認するまで、この一覧に残します。' : '承認時の説明から変わっています。改めて確認が必要です。';
  return { ...decision, targetVersion: state.targetVersion, display: complete ? 'complete' : decision.status === 'approved' ? 'pending' : decision.status,
    reason, copySha256, approvedCopySha256: complete ? copySha256 : approvedCopySha256 };
}
function validateReviewState(state, pages) {
  if (!state) return;
  assert(state.schemaVersion === 1 && state.targetVersion && state.items && typeof state.items === 'object', 'Invalid review-state.json');
  const ids = new Set(pages.map(p => p.id));
  for (const [id, item] of Object.entries(state.items)) {
    assert(ids.has(id), 'Unknown comparison in review-state.json: ' + id);
    assert(['pending', 'review', 'hold', 'approved'].includes(item.status), 'Unknown review status: ' + id);
    if (item.retired) assert(item.status === 'approved' && typeof item.retired.text === 'string' && item.retired.text, 'Invalid retirement decision: ' + id);
  }
}
function retirementEffective(decision, version) {
  if (!decision || !decision.retired) return false;
  const current = /^(\d{4}-\d{2}-\d{2})-ui(\d+)$/.exec(version || '');
  const since = /^(\d{4}-\d{2}-\d{2})-ui(\d+)$/.exec(decision.retired.sinceVersion || '');
  assert(current && since, 'Retirement requires concrete source and target versions');
  return current[1] > since[1] || current[1] === since[1] && Number(current[2]) >= Number(since[2]);
}
function comparisonAfter(screen, id, decision, version) {
  if (retirementEffective(decision, version)) {
    assert(!screen, 'Retired screen still included in current capture: ' + id);
    return { image: null, text: decision.retired.text, retired: true, retiredSince: decision.retired.sinceVersion, capturedAt: null };
  }
  assert(screen, 'Missing comparison screenshot: ' + id);
  return { image: 'after/' + screen.file, text: clean(screen, id), sha256: screen.sha256, capturedAt: screen.capturedAt,
    ...(screen.sourceStepId ? { sourceStepId: screen.sourceStepId } : {}), ...(screen.quizIndex != null ? { quizIndex: screen.quizIndex } : {}) };
}
function retainLastActive(page, previousManifest, id) {
  if (!page) return null;
  if (page.lastActive) return page.lastActive;
  if (page.after.retired) return null;
  const lastCapture = read(path.join(dest, 'layout-results.json'));
  assert(lastCapture.appVersion === previousManifest.appVersion, 'Last active capture version differs: ' + id);
  const images = {};
  for (const size of Object.keys(previousManifest.viewports || sizes)) {
    const file = size + '/' + id + '.png';
    const current = path.join(dest, 'after', file), relative = 'retired/' + previousManifest.appVersion + '/' + file;
    const target = path.join(dest, relative);
    // An interrupted build may already have archived and removed this exact image.
    const source = fs.existsSync(current) ? current : target;
    assert(fs.existsSync(source), 'Missing last active screenshot: ' + file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sha256 = hash(fs.readFileSync(source));
    assert(lastCapture.screens.some(s => s.name === size + '/' + id && s.sha256 === sha256), 'Last active capture hash differs: ' + size + '/' + id);
    if (size === 'mini') assert(sha256 === page.after.sha256, 'Last active image changed: ' + id);
    if (source !== target) fs.copyFileSync(source, target);
    images[size] = { image: relative, sha256 };
  }
  return { appVersion: previousManifest.appVersion, text: page.after.text, capturedAt: page.after.capturedAt, images };
}
function removeRetiredCurrentImages(page, folder = dest) {
  const allowed = new Set(['required-early-0', 'required-late-0', 'required-early_late-0', 'required-early_late-1']);
  assert(page.after.retired && allowed.has(page.id) && page.lastActive, 'Unexpected current image retirement: ' + page.id);
  const targets = Object.keys(page.lastActive.images).map(size => {
    const archived = page.lastActive.images[size];
    assert(archived, 'Missing archived viewport: ' + size + '/' + page.id);
    const history = path.resolve(folder, archived.image);
    const historyRoot = path.resolve(folder, 'retired') + path.sep;
    assert(history.startsWith(historyRoot), 'Retirement history outside archive: ' + page.id);
    assert(hash(fs.readFileSync(history)) === archived.sha256, 'Retirement archive hash differs: ' + size + '/' + page.id);
    const currentRoot = path.resolve(folder, 'after', size);
    const current = path.resolve(currentRoot, page.id + '.png');
    assert(path.dirname(current) === currentRoot, 'Current image outside expected viewport: ' + page.id);
    if (fs.existsSync(current)) assert(hash(fs.readFileSync(current)) === archived.sha256, 'Current image differs from archived retirement: ' + size + '/' + page.id);
    return current;
  });
  // Only the four named retired screens are removed; baseline and archive stay intact.
  // Check all three archived images before unlinking any current image.
  for (const target of targets) if (fs.existsSync(target)) fs.unlinkSync(target);
}
function publicationForCapture(r) {
  const files = fs.readdirSync(path.join(app, 'reviews'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(app, 'reviews', d.name, 'publication.json')).filter(f => fs.existsSync(f));
  return files.map(file => ({ file, report: read(file) })).find(({ report: p }) => p.version === r.appVersion && Array.isArray(p.checks) && Object.entries(r.source).every(([f, sha]) => p.checks.some(c => c.file === f && c.match && c.actualSha256LF === sha)));
}
function currentSources(source) {
  for (const [file, expected] of Object.entries(source)) assert(sourceHash(file) === expected, 'App changed since capture: ' + file);
}
function clean(s, name) {
  if (s.copy) return s.copy;
  let lines = s.text.split('\n').filter(x => !x.startsWith('あいうえお0123456789') && !x.startsWith('確認モード（送信しません）'));
  if (/tutorial|main-help|required/.test(name)) {
    let last = -1;
    lines.forEach((l, i) => { if (/^(はじめに|画面の見方 \d \/ \d|操作の練習 \d \/ \d|操作の確認 \d \/ \d)$/.test(l)) last = i; });
    if (last >= 0) lines = lines.slice(last);
  }
  return lines.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}
function sameLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const d = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) d[i][j] = A[i] === B[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const x = new Set(), y = new Set();
  for (let i = 0, j = 0; i < A.length && j < B.length;) {
    if (A[i] === B[j]) { x.add(i++); y.add(j++); }
    else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++;
  }
  return [x, y];
}
function verifySharedCopy(r) {
  const checks = [], flat = s => s.replace(/\s+/g, '');
  const state = fs.existsSync(reviewStatePath) ? read(reviewStatePath) : null;
  for (const size of Object.keys(sizes)) {
    const text = name => clean(r.screens.find(s => s.name === size + '/' + name), name);
    if (r.guided) {
      const step = id => r.guided.steps.find(s => s.id === id);
      const flatText = name => flat(text(name));
      const verify = (source, target, clauses) => {
        const sourceText = source.startsWith('tutorial-') ? flatText(source) : flat(source);
        const targetText = flatText(target), pass = clauses.every(clause => clause.some(term => sourceText.includes(term)) && clause.some(term => targetText.includes(term)));
        checks.push({ size, source, target, mode: 'same-rule-meaning-after-splitting', pass, clauses });
        assert(pass, 'Shared rule meaning differs: ' + size + '/' + source + ' -> ' + target);
      };
      const reminder = flatText('main-help'), intro = step('layout-intro');
      const reminderPass = reminder.includes(flat(intro.copy)) && r.screens.find(s => s.name === size + '/main-help').guidedReview === true;
      checks.push({ size, source: 'tutorial-layout-intro', target: 'main-help', mode: 'same-guided-pages-in-optional-review', pass: reminderPass });
      assert(reminderPass, 'Optional guided review does not show the adopted first page: ' + size);
      const startClauses = [['状況が分かったら'], ['答えを決める前'], ['スタートボタンに指を置', 'スタートに指を置']];
      for (const target of ['practicecheck', 'notice-early', 'notice-early_late']) verify('tutorial-start-rule', target, startClauses);
      const timeCopy = step('time-rule').copy + step('answer-pace').copy;
      for (const target of ['practicecheck', 'notice-late', 'notice-early_late']) verify(timeCopy, target, [['3秒以内'], ['枠の外', 'スタートボタンの外', 'スタートを出る'], ['回答の制限時間では', '回答の期限では'], ['自分のペース']]);
      // The short practice reminder covers the action; the initial range lesson
      // and its review retain the separate "anywhere inside" explanation.
      verify('tutorial-motor', 'practicecheck', [['スタート'], ['指を離さず'], ['選択肢のボックス'], ['ボックスの中で離']]);
      const releaseQuizIndex = r.guided.checks.findIndex(q => q.id === 'release');
      assert(releaseQuizIndex >= 0, 'Release-area review missing from guided questions');
      verify('tutorial-motor-range', 'tutorial-rule-check-' + String(releaseQuizIndex + 1).padStart(2, '0'), [['内側'], ['どこでも', 'どこで指を離しても', 'どこで離しても'], ['離す', '離して', '離せ']]);
      for (const target of ['required-early-0', 'required-early_late-0', 'required-late-0', 'required-early_late-1']) {
        assert(state && state.items[target] && state.items[target].retired, 'Prior required screen lost retirement history: ' + target);
        checks.push({ size, target, mode: 'retired-screen-not-current', pass: !r.screens.some(s => s.name === size + '/' + target) });
      }
      continue;
    }
    const body = (name, lines) => text(name).split('\n').slice(1, lines + 1);
    const contains = (source, target, lines) => {
      const pass = lines.every(line => flat(text(target)).includes(flat(line)));
      checks.push({ size, source, target, pass });
      assert(pass, 'Shared instruction differs: ' + size + '/' + source + ' -> ' + target);
    };
    const requiredCopy = (source, target, lines) => {
      if (r.screens.some(s => s.name === size + '/' + target)) return contains(source, target, lines);
      assert(state && state.items[target] && state.items[target].retired, 'Missing required review without retirement decision: ' + size + '/' + target);
      checks.push({ size, source, target, mode: 'retired-screen-not-current', pass: true });
    };
    // The in-task reminder is deliberately shorter than the introductory page.
    // Verify the same start condition and drag target without requiring identical prose.
    const introduction = flat(text('tutorial-0')), reminder = flat(text('main-help'));
    const mainHelpPass = introduction.includes('状況が分かったら') && reminder.includes('状況が分かったら') &&
      [introduction, reminder].every(copy => copy.includes('スタートボタンに指を置') && copy.includes('指を離さず') && copy.includes('選択肢のボックスまで運び'));
    checks.push({ size, source: 'tutorial-0', target: 'main-help', mode: 'same-procedure-short-reminder', pass: mainHelpPass });
    assert(mainHelpPass, 'Start condition or drag instructions missing: ' + size + '/main-help');
    for (const target of ['required-early-0', 'required-early_late-0']) requiredCopy('tutorial-3', target, body('tutorial-3', 3));
    for (const target of ['required-late-0', 'required-early_late-1']) requiredCopy('tutorial-7', target, body('tutorial-7', 4));
    // Start criteria are the first sentence; the next tutorial sentence only
    // describes when choice labels appear and is not part of the warning.
    for (const target of ['practicecheck', 'notice-early', 'notice-early_late']) contains('tutorial-3', target, body('tutorial-3', 1));
    for (const target of ['practicecheck', 'notice-late', 'notice-early_late']) contains('tutorial-7', target, body('tutorial-7', 4));
    contains('tutorial-4', 'practicecheck', body('tutorial-4', 3).slice(-1));
  }
  return checks;
}
function overlayCapture() {
  assert(from >= 0 && overlay >= 0 && args[overlay + 1], '--overlay requires a full --from capture and a partial capture directory');
  const partialDir = path.resolve(args[overlay + 1]), resultPath = path.join(captureDir, 'results.json');
  const base = read(resultPath), partial = read(path.join(partialDir, 'results.json'));
  assert(!base.selectedCases && Array.isArray(partial.selectedCases) && partial.selectedCases.length, 'Overlay requires full and explicitly scoped partial results');
  assert(partial.failed === 0 && !base.errors.length && !base.remote.length && !partial.errors.length && !partial.remote.length, 'Overlay cannot hide runtime or network failures');
  assert(JSON.stringify(base.source) === JSON.stringify(partial.source) && JSON.stringify(base.viewports) === JSON.stringify(partial.viewports) && base.motionPreference === partial.motionPreference, 'Overlay source, viewport or motion preference differs');
  currentSources(base.source);
  const replacementChecks = new Set(partial.checks.map(c => c.name)), byName = new Map(partial.screens.map(s => [s.name, s]));
  assert(base.checks.filter(c => !c.pass).every(c => replacementChecks.has(c.name)), 'Overlay leaves unrelated failures unresolved');
  const targets = partial.screens.map(s => {
    assert(base.screens.some(b => b.name === s.name && b.file === s.file), 'Overlay introduced an uncaptured screen: ' + s.name);
    const source = path.resolve(partialDir, s.file), target = path.resolve(captureDir, s.file);
    assert(source.startsWith(partialDir + path.sep) && target.startsWith(captureDir + path.sep), 'Overlay image outside its capture directory');
    assert(hash(fs.readFileSync(source)) === s.sha256, 'Overlay image hash differs: ' + s.file);
    return { source, target };
  });
  const supersededChecks = base.checks.filter(c => !c.pass && replacementChecks.has(c.name));
  for (const { source, target } of targets) fs.copyFileSync(source, target);
  base.screens = base.screens.map(s => byName.get(s.name) || s);
  base.checks = base.checks.filter(c => !replacementChecks.has(c.name)).concat(partial.checks);
  base.partialRecaptures = [...(base.partialRecaptures || []), { at: partial.at, cases: partial.selectedCases, source: partial.source, screens: partial.screens.map(s => s.name), checks: partial.checks.length, supersededChecks }];
  base.passed = base.checks.filter(c => c.pass).length; base.failed = base.checks.filter(c => !c.pass).length;
  write(resultPath, base);
  console.log('Same-source partial capture overlay: PASS (' + partial.screens.length + ' screens)');
}
function build() {
  const r = read(path.join(captureDir, 'results.json'));
  assert(!r.selectedCases, 'Partial layout checks cannot replace the fixed review');
  if (r.viewports) sizes = r.viewports;
  assert(r.failed === 0 && r.screens.length, 'Capture checks must pass before replacing the review');
  currentSources(r.source);
  // The published diff must describe the same immutable app used for capture.
  // Validate before replacing any files, so a concurrent edit leaves the review intact.
  for (const [file, expected] of Object.entries(r.source)) assert(hash(fs.readFileSync(path.join(app, file), 'utf8').replace(/\r\n/g, '\n')) === expected, 'Working app differs from captured source for diff: ' + file);
  verifySharedCopy(r);
  assert(new Set(r.screens.map(s => s.name)).size === r.screens.length, 'Duplicate screenshot names');
  const all = r.screens.filter(s => s.name.startsWith('mini/')).map(s => s.name.slice(5));
  for (const name of all) for (const size of Object.keys(sizes)) assert(r.screens.some(s => s.name === size + '/' + name), 'Missing viewport: ' + size + '/' + name);
  const baseline = read(path.join(dest, 'baseline.json'));
  if (r.guided) {
    const known = new Set(baseline.pages.map(p => p.id));
    for (const screen of r.screens.filter(s => s.name.startsWith('mini/') && !s.legacyComparisonAlias && !s.name.endsWith('-wrong') && /\/tutorial-|\/rating-tutorial-|\/guided-example-intro$/.test(s.name))) {
      const id = screen.name.slice(5); if (known.has(id)) continue;
      baseline.pages.push({ id, title: screen.title || id, kind: '新設・分割', purpose: 'ui20で分割または新設した実画面です。変更前に同じ独立画面はなく、基準画像は作り直しません。',
        before: { image: null, text: '', sourceNote: '新設・分割した状態のため変更前画像なし。', createdInVersion: r.appVersion } });
      known.add(id);
    }
    if (r.screens.some(s => s.name === 'mini/welcome-7') && !known.has('welcome-3')) {
      baseline.pages.push({ id: 'welcome-3', title: 'はじめに — 進む順番と休憩', kind: '分割',
        purpose: '所要時間と進め方の説明を2枚へ分割した後半です。旧2枚目の内容を分け、独立して読めるようにしました。',
        before: { image: null, text: '', sourceNote: '旧2枚目から分割したため、この独立画面の変更前画像はありません。', createdInVersion: r.appVersion } });
    }
    write(path.join(dest, 'baseline.json'), baseline);
  }
  const reviewState = fs.existsSync(reviewStatePath) ? read(reviewStatePath) : null;
  validateReviewState(reviewState, baseline.pages);
  const previousManifestPath = path.join(dest, 'copy-manifest.json');
  const previousManifest = fs.existsSync(previousManifestPath) ? read(previousManifestPath) : null;
  const publication = publicationForCapture(r);
  const imageURLs = {};
  for (const s of r.screens) {
    const source = path.join(captureDir, s.file), target = path.join(dest, 'after', s.file);
    assert(hash(fs.readFileSync(source)) === s.sha256, 'Capture image hash mismatch: ' + s.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== s.sha256) fs.copyFileSync(source, target);
    imageURLs[s.name] = 'after/' + s.file + '?v=' + s.sha256.slice(0, 12);
  }
  const purposes = {
    'welcome-2': r.screens.some(s => s.name === 'mini/welcome-7') ? '所要時間と回答のペースに絞った説明です。進む順番と休憩は、次の独立した画面へ分けました。' : '回答を急ぐ必要がないことと、中断についての案内を比較します。',
    'reading-intro': '普段の読む速さを知る目的と、読み終わった後の操作の案内です。',
    'tutorial-0': '問題文を読むところから、指を運んで答えるまでの説明です。',
    'tutorial-2': '問題文についての説明です。「時間を分けて記録する」という説明は削除しています。',
    'tutorial-3': 'スタートに指を置く目安と、選択肢が表示されるタイミングを説明します。',
    'tutorial-4': '選択肢のボックスと、指を離せる範囲を短く説明します。',
    'tutorial-7': '3秒以内に行う操作と、答えを決めたり回答を終えたりする期限との違いを説明します。',
    'practice-early-coach': '練習中の早い押下に対する案内です。表示直後を撮影しています。',
    'practice-complete': '本番直前に、急ぐ必要がないことと操作方法を見直せる場所を伝えます。',
    'post-time_pressure': '課題中の時間圧・焦りを尋ねます。追加10問を除く注記は付けていません。',
    'post-main_start_basis': '本番で実際に使ったスタートの目安を複数選択で尋ねます。「問題文を読み終えること」と「書かれている状況が分かったと思うこと」の両方を選べます。',
    'post-main_three_second_meaning': '本番で3秒の指示をどのように理解していたかを、複数選択で尋ねます。第一選択肢を「答えを決める前に、指を外へ動かす」に変更しています。特に意識しなかった・覚えていないは排他です。',
  };
  const m = { generatedAt: new Date().toISOString(), capturedAt: r.at, baselineCommit: baseline.baselineCommit,
    copyFinalCommit: execFileSync('git', ['log', '-1', '--format=%H', '--', 'tools/pilot-anchor/index.html'], { cwd: repo, encoding: 'utf8' }).trim(),
    appVersion: r.appVersion, instructionVersion: r.instructionVersion, source: r.source,
    viewport: sizes.mini, viewports: sizes, motionPreference: r.motionPreference || 'reduce', limits: r.scope, screensPerSize: all.length, pages: [] };
  const cards = baseline.pages.map((item, i) => {
    const s = r.screens.find(s => s.name === 'mini/' + item.id);
    const previousPage = previousManifest && previousManifest.pages.find(p => p.id === item.id);
    const decision = reviewState && reviewState.items[item.id];
    const b = item.before, a = comparisonAfter(s, item.id, decision, r.appVersion);
    const purpose = a.retired ? '初回の必須見直しを廃止し、注意画面内で説明を確認する手順にまとめました。廃止前の最後の現行画面を履歴として保持します。' : s && s.legacyComparisonAlias
      ? '旧比較IDの履歴を保持しています。現在の画像は新しい「' + s.title + '」（' + s.sourceStepId + '）です。分割された説明全体は、新設・分割の比較と現行画面一覧で確認できます。'
      : purposes[item.id] || item.purpose;
    const page = { ...item, purpose, after: a };
    if (a.retired) {
      page.lastActive = retainLastActive(previousPage, previousManifest, item.id);
      removeRetiredCurrentImages(page);
    }
    page.review = reviewDecision(page, reviewState, r.appVersion, Boolean(publication), previousPage);
    m.pages.push(page);
    const [bs, as] = sameLines(b.text, a.text);
    const panel = (side, v, same) => `<div class="panel ${side}"><h3>${side === 'before' ? '変更前' : '現在'}</h3>${v.image ? `<a class="shot" href="${esc(side === 'after' ? imageURLs[s.name] : v.image)}" target="_blank"><img loading="lazy" src="${esc(side === 'after' ? imageURLs[s.name] : v.image)}" width="375" height="700" alt="${esc(item.title)} ${side === 'before' ? '変更前' : '現在'}"></a>` : `<div class="absent">${v.retired ? 'この画面は廃止されました。' : v.sourceNote && v.text ? '変更前の画像は未撮影です。' : 'この画面・手順は新設です。'}</div>`}<div class="copy">${v.text ? v.text.split('\n').map((line, j) => `<div class="line ${!same.has(j) && line ? 'changed ' + side : ''}">${esc(line) || '&nbsp;'}</div>`).join('') : '変更前の画面はありません。'}</div></div>`;
    const history = page.lastActive ? `<details><summary>廃止前の最後の画面を見る（${esc(page.lastActive.appVersion)}）</summary><p>以下は履歴です。現行の画面一覧には含めていません。</p><div class="links">${Object.entries(page.lastActive.images).map(([size, value]) => `<a href="${esc(value.image)}?v=${value.sha256.slice(0, 12)}" target="_blank">${sizes[size].join(' × ')}</a>`).join('')}</div><a class="shot" href="${esc(page.lastActive.images.mini.image)}?v=${page.lastActive.images.mini.sha256.slice(0, 12)}" target="_blank"><img loading="lazy" src="${esc(page.lastActive.images.mini.image)}?v=${page.lastActive.images.mini.sha256.slice(0, 12)}" width="375" height="700" alt="${esc(item.title)} 廃止前の最後の画面"></a><div class="copy">${esc(page.lastActive.text).replace(/\n/g, '<br>')}</div></details>` : '';
    const labels = { pending: '未確認・反映確認待ち', review: '相談中', hold: '保留', complete: '承認・公開反映済み' };
    return { id: item.id, complete: page.review.display === 'complete', html: `<article id="${item.id}" data-review-status="${page.review.display}"><div class="eyebrow">${String(i + 1).padStart(2, '0')} · ${esc(item.kind)} · ${labels[page.review.display]}</div><h2>${esc(item.title)}</h2>${page.review.reason ? `<p class="status">${esc(page.review.reason)}</p>` : ''}<p>${esc(purpose)}</p><div class="compare">${panel('before', b, bs)}${panel('after', a, as)}</div>${history}<a class="top" href="${page.review.display === 'complete' ? '#completed' : '#contents'}">${page.review.display === 'complete' ? '完了履歴へ' : '目次へ'} ↑</a></article>` };
  });
  const activePages = m.pages.filter(p => p.review.display !== 'complete');
  const completedPages = m.pages.filter(p => p.review.display === 'complete');
  const retiredCount = m.pages.filter(p => p.after.retired).length;
  const requiredCaption = r.screens.some(s => s.name.includes('/required-')) ? '、初回の必須見直し' : '';
  m.reviewState = reviewState ? { file: 'review-state.json', targetVersion: reviewState.targetVersion, reviewedAt: reviewState.reviewedAt, active: activePages.length, completed: completedPages.length } : null;
  m.publicationRecord = publication ? path.relative(dest, publication.file).replace(/\\/g, '/') : null;
  const deployment = publication ? `公開版との一致を確認済みの ${esc(r.appVersion)} を撮り直しました。<a href="${esc(m.publicationRecord)}">公開照合記録</a>：${esc(publication.report.checkedAt)}。` : `撮影対象：${esc(r.appVersion)}。この版と公開ファイルの一致は、この確認資料では未確認です。`;
  const devicePath = path.join(dest, 'device-check.json');
  const device = fs.existsSync(devicePath) ? read(devicePath) : null;
  // Copy-only changes do not silently reopen the completed four-area check.
  // Keep its tested version explicit; record a new check if zoom handling changes.
  const deviceDone = device && device.status === 'complete' && device.checks.length === 4 && device.checks.every(c => c.passed);
  const deviceStatus = deviceDone ? `<b>${esc(device.reportedDate)}：報告された4領域は、iPhone実機で確認完了とユーザーから報告いただきました。この報告時の4領域の確認は完了です。</b>（確認時の版：${esc(device.versionContext)}） <a href="device-check.json">実機確認記録</a>` : '<b>ダブルタップ拡大防止について、実機確認の完了記録はありません。</b>';
  const flowCheckPath = path.join(dest, 'device-ui14-flow-check.json');
  const flowCheck = fs.existsSync(flowCheckPath) ? read(flowCheckPath) : null;
  const flowStatus = flowCheck ? `<p>${esc(flowCheck.reportedDate)}：${esc(flowCheck.versionContext)}のチュートリアル・練習後の確認・注意・アンケートの4画面について、iPhoneで確認できたとのユーザー報告を記録しています。<a href="device-ui14-flow-check.json">確認範囲と報告原文</a>。その後の変更まで実機確認済みとは扱いません。</p>` : '';
  const ts = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'long', timeStyle: 'medium' }).format(new Date(m.generatedAt));
  const links = [['注意の本文・確認ボタン', 'notice&notice=early_late'], ['追加10問の本文・余白', 'instructed'], ['事後アンケートの問い', 'post'], ['未チェック時の「確認して次へ」', 'practicecheck']].map(([t, go]) => `<a href="https://and-space83.github.io/drag-survey/pilot-anchor/?block=moral&amp;upload=0&amp;go=${go.replace(/&/g, '&amp;')}&amp;v=${r.appVersion.replace(/-/g, '')}">${t}</a>`).join('');
  const gallery = all.map(name => `<figure><figcaption>${esc(name)}${({ 'main-rating-hesitation':'（本番の迷い・進捗バーを表示）', 'main-rating-confidence':'（本番の自信・進捗バーを表示）', 'rating-hesitation':'（例題・練習相当の迷い）', 'rating-confidence':'（例題・練習相当の自信）' })[name] || ''}${name === 'legacy-blockintro' ? '（旧経路の本文・単独描画）' : ''}</figcaption><a href="${imageURLs['mini/' + name]}" target="_blank"><img loading="lazy" src="${imageURLs['mini/' + name]}" data-screen="${name}" width="375" height="700" alt="${esc(name)}"></a></figure>`).join('\n');
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>説明・例題・練習の変更と現行画面 — ${r.appVersion}</title><link rel="stylesheet" href="gallery.css?v=${hash(fs.readFileSync(path.join(dest, 'gallery.css'))).slice(0, 12)}"><main>
<header><div class="eyebrow">PARTICIPANT INSTRUCTIONS · CURRENT REVIEW</div><h1>このセッションで変えた説明・問題を、<br>画面と文言で確認する</h1><p>確認待ち・相談中・保留の表示 <b>${activePages.length}組</b>を一覧に並べました。承認と公開反映を確認した <b>${completedPages.length}組</b>は、下の完了履歴に移しています。左がこのセッションの変更前、右が撮影時点の現行版です。画像の下に画面から取得した全文を掲載し、変更行を色で示します。</p><p class="status" id="deployment">${deployment}<br>更新日時：${ts}（日本時間）／教示版：${r.instructionVersion}</p><p>画像と全文は実装済みの文言です。相談中・保留の修正案は、それぞれの状態説明で区別します。</p><p class="limits">変更前の基準：${baseline.baselineCommit.slice(0, 7)}。画像はChromeのタッチ画面エミュレーションです。iPhone Safari実機の画像ではありません。合成データのみ使用し、外部送信は無効にしています。</p><div class="links"><a href="#all">${Object.keys(sizes).length}サイズ・現行${all.length}画面へ</a><a href="#contents">確認待ちの説明へ</a><a href="#completed">承認・公開反映済みの履歴へ</a><a href="#zoom">ダブルタップの確認リンクへ</a></div><p><a href="copy-manifest.json">文言・版・画像の対応表</a> ／ <a href="layout-results.json">今回の撮影と表示検証</a> ／ <a href="gallery-results.json">確認ページの検査</a> ／ <a href="session-source.diff">セッション全体のソース差分</a>${reviewState ? ' ／ <a href="review-state.json">確認状態の記録</a>' : ''}</p></header>
<section class="overview"><h2>このページの更新について</h2><p>以前は別の修正レビューだけを更新し、このページの「現在」が旧版のまま残っていました。今回は「現在」の画像と全文、および3サイズの一覧を同じ撮影結果からまとめて生成しています。新しいstepIdと復習7問、操作成功、例題導入、振り返りの全画面も実際に進めて撮影します。「変更前」は比較基準として保持しています。</p><p>また、「使いにくかった点」3ページの保存名が同じで、最後の画像で上書きされていました。今回はページごとに異なる名前で保存し、重複があれば撮影を失敗として扱います。</p><p>最初の10か所で採用した文言は、同じ説明を使う表示でも照合します。見出しと戻るボタンは、その画面の用途に応じて変わります。</p><table class="summarytable"><tr><th>元の説明</th><th>同じ説明を使う表示</th></tr><tr><td>チュートリアルの採用ページ</td><td>本番の「↻ 操作方法」で同じページを任意に見直す</td></tr><tr><td>スタートの目安</td><td>練習の確認、早いスタートの注意、両方の注意${requiredCaption}</td></tr><tr><td>3秒以内の操作・回答期限との違い</td><td>練習の確認、遅い初動の注意、両方の注意${requiredCaption}</td></tr></table><p>今後はアプリ変更時に <code>node tools/pilot-anchor/refresh-explanation-review.cjs</code> を実行して、この固定URLを更新します。<code>--check</code> ではソースの一致・画像の欠落と改変・3サイズのリンクと表示を検査できます。</p></section>
<nav class="overview" id="contents"><h2>変更した画面：確認待ち・相談中・保留</h2>${activePages.length ? `<ol class="toc">${activePages.map(p => `<li><a href="#${p.id}">${esc(p.title)}</a></li>`).join('')}</ol>` : '<p>確認待ちの画面はありません。</p>'}<p class="limits">承認された表示は、撮影した版と公開版の一致を確認してからこの一覧から外します。練習の確認項目数は、その問題で該当したルールによって変わります。</p></nav>
${cards.filter(c => !c.complete).map(c => c.html).join('\n')}
<section class="appendix" id="completed"><details><summary>承認・公開反映済みの${completedPages.length}画面を見る</summary><p>未確認一覧から外した表示の履歴です。変更前の基準画像と、撮影時点の現行画像・全文を保持しています。${retiredCount ? `このうち${retiredCount}画面は廃止し、最後の現行画像を別の履歴として保持しています。` : ''}今後、承認された説明の本文が変わった場合は、再び確認待ちに戻ります。</p>${completedPages.length ? `<ol class="toc">${completedPages.map(p => `<li><a href="#${p.id}">${esc(p.title)}</a></li>`).join('')}</ol>` : '<p>公開反映まで確認できた表示はありません。</p>'}${cards.filter(c => c.complete).map(c => c.html).join('\n')}</details></section>
<section class="overview" id="zoom"><h2>ダブルタップ対策${deviceDone ? '：過去版の確認記録あり' : ''}</h2><p>ui9までは、課題画面以外の本文・余白・無効ボタンの拡大防止をCSSに依存していました。ui10で、それらの単指タップを取り消す補助処理を追加しています。Chromeで倍率が変わらなかったことだけではSafari実機での防止を保証できなかった点が、前回の検証の限界です。</p><p>Safari内部の原因を端末上で追跡したわけではありません。<a href="https://bugs.webkit.org/show_bug.cgi?id=149854#c25">WebKitの非クリック対象についての説明</a>、<a href="https://bugs.webkit.org/show_bug.cgi?id=218015">関連する不具合報告</a>も参照しています。過去の自動検証は<a href="results.json">ui10の記録</a>、ui11の検証・公開照合は<a href="../2026-10-12-copy-revision/index.html">ui11の修正記録</a>にあります。</p><p id="verification">今回の再撮影：${r.passed}項目成功、${r.failed}項目失敗、${r.screens.length}枚。</p><p class="status">${deviceStatus}</p>${r.guided ? '<p class="limits">過去の4領域の確認を、今回の全面刷新後の全画面確認として扱いません。新しい説明・復習・評定も含めた実機チェックは、別の実施記録が必要です。</p>' : ""}${flowStatus}<h3>確認に使用するリンク（参考・送信しません）</h3><div class="links">${links}</div></section>
<section class="appendix" id="all"><details><summary>今回撮影した現行${all.length}画面を見る（説明が変わっていない画面も含む）</summary><p>この版の対象全画面を${Object.keys(sizes).length}サイズで撮り直しています。例題1問と練習5問の本文・実際の選択肢、新しい事後3問、長い注意・練習確認をスクロールした後の表示も掲載しています。旧経路の1画面は通常の本番では表示されない参考用の単独描画です。</p><label>画面サイズ <select id="size">${Object.entries(sizes).map(([id, value]) => `<option value="${id}">${value.join(" × ")}</option>`).join("")}</select></label><div class="all">${gallery}</div></details></section><p class="limits">参加者の氏名や回答原本は含まれていません。画像・本文・撮影時刻・ソースのハッシュを対応付けて保管しています。</p></main>
<script>const images=${JSON.stringify(imageURLs)},sizes=${JSON.stringify(sizes)};document.getElementById('size').addEventListener('change',e=>{const size=e.target.value;document.querySelectorAll('[data-screen]').forEach(img=>{const src=images[size+'/'+img.dataset.screen];img.src=src;img.parentElement.href=src;[img.width,img.height]=sizes[size];});});function revealHash(){const target=location.hash&&document.getElementById(location.hash.slice(1));if(!target)return;const details=target.tagName==='DETAILS'?target:target.closest('details')||target.querySelector('details');if(details){details.open=true;requestAnimationFrame(()=>target.scrollIntoView());}}addEventListener('hashchange',revealHash);revealHash();</script></html>`;
  write(path.join(dest, 'copy-manifest.json'), m);
  write(path.join(dest, 'layout-results.json'), r);
  fs.writeFileSync(path.join(dest, 'index.html'), html);
  const sourcePaths = require('./lib/app-source.cjs').appAssetPaths(sourceRoot).map(file => 'tools/pilot-anchor/' + file);
  let sourceDiff = execFileSync('git', ['diff', '--unified=0', baseline.baselineCommit, '--', ...sourcePaths], { cwd: repo, maxBuffer: 5 * 1024 * 1024, encoding: 'utf8' });
  // Newly added modules are not shown by git diff before they are tracked.
  // Include their exact captured source without staging or committing anything.
  for (const file of sourcePaths) {
    if (!fs.existsSync(path.join(repo, file)) || execFileSync('git', ['ls-files', '--', file], { cwd: repo, encoding: 'utf8' }).trim()) continue;
    const lines = fs.readFileSync(path.join(repo, file), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    sourceDiff += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map(line => '+' + line).join('\n') + '\n';
  }
  fs.writeFileSync(path.join(dest, 'session-source.diff'), sourceDiff);
  console.log(`Updated ${activePages.length} active and ${completedPages.length} completed comparisons; ${r.screens.length} screenshots (${all.length} per size)`);
}
async function verify() {
  const m = read(path.join(dest, 'copy-manifest.json')), r = read(path.join(dest, 'layout-results.json'));
  if (r.viewports) sizes = r.viewports;
  currentSources(m.source);
  const sharedCopy = verifySharedCopy(r);
  const reviewState = fs.existsSync(reviewStatePath) ? read(reviewStatePath) : null;
  validateReviewState(reviewState, m.pages);
  const publication = publicationForCapture(r);
  for (const page of m.pages) assert(page.review && reviewDecision(page, reviewState, m.appVersion, Boolean(publication), page).display === page.review.display, 'Review status out of date: ' + page.id);
  const activeCount = m.pages.filter(p => p.review.display !== 'complete').length;
  const completedCount = m.pages.length - activeCount;
  assert(JSON.stringify(m.source) === JSON.stringify(r.source), 'Gallery and capture source mismatch');
  assert(new Set(r.screens.map(s => s.name)).size === r.screens.length, 'Duplicate captured screen');
  for (const s of r.screens) assert(hash(fs.readFileSync(path.join(dest, 'after', s.file))) === s.sha256, 'Image out of date: ' + s.file);
  for (const p of m.pages) {
    const s = r.screens.find(s => s.name === 'mini/' + p.id);
    const expected = comparisonAfter(s, p.id, reviewState && reviewState.items[p.id], r.appVersion);
    assert(p.after.text === expected.text && Boolean(p.after.retired) === Boolean(expected.retired), 'Comparison text out of date: ' + p.id);
    if (p.after.retired) {
      assert(!r.screens.some(s => s.name.endsWith('/' + p.id)), 'Retired screen included in current gallery: ' + p.id);
      assert(p.lastActive, 'Missing retirement history: ' + p.id);
      for (const value of Object.values(p.lastActive.images)) assert(hash(fs.readFileSync(path.join(dest, value.image))) === value.sha256, 'Retirement history image changed: ' + p.id);
      for (const size of Object.keys(sizes)) assert(!fs.existsSync(path.join(dest, 'after', size, p.id + '.png')), 'Retired image left in current after directory: ' + size + '/' + p.id);
    }
  }
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-gpu'] });
  const checks = [], errors = [];
  try {
    for (const width of [1200, 375]) {
      const p = await browser.newPage({ viewport: { width, height: 900 } });
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/*', route => { if (route.request().url().startsWith('file:')) return route.continue(); errors.push('Unexpected remote request: ' + route.request().url()); return route.abort(); });
      await p.goto(pathToFileURL(path.join(dest, 'index.html')).href + '#all');
      await p.locator('img').evaluateAll(images => images.forEach(i => i.loading = 'eager'));
      for (const size of Object.keys(sizes)) {
        await p.locator('#size').selectOption(size);
        await p.waitForFunction(() => [...document.images].every(i => i.complete), { timeout: 15000 });
        const state = await p.evaluate(({ expectedSize, count, comparisons, activeCount, completedCount }) => ({
          width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          broken: [...document.images].filter(i => !i.naturalWidth).map(i => i.src),
          wrongSize: [...document.querySelectorAll('[data-screen]')].filter(i => i.naturalWidth !== expectedSize[0] || i.naturalHeight !== expectedSize[1]).map(i => i.src),
          countOK: document.querySelectorAll('[data-screen]').length === count && document.querySelectorAll('article').length === comparisons,
          reviewCountOK: document.querySelectorAll('#contents .toc li').length === activeCount && document.querySelectorAll('#completed article').length === completedCount && [...document.querySelectorAll('article')].every(a => (a.dataset.reviewStatus === 'complete') === Boolean(a.closest('#completed'))),
          badAnchors: [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.querySelector(a.getAttribute('href'))).map(a => a.href),
          badImageLinks: [...document.querySelectorAll('a > img')].filter(i => i.parentElement.href !== i.src).map(i => i.src),
        }), { expectedSize: sizes[size], count: m.screensPerSize, comparisons: m.pages.length, activeCount, completedCount });
        const pass = state.scrollWidth <= width && !state.broken.length && !state.wrongSize.length && state.countOK && state.reviewCountOK && !state.badAnchors.length && !state.badImageLinks.length;
        checks.push({ width, size, pass, ...state });
        assert(pass, 'Gallery failed: ' + JSON.stringify(state));
      }
      if (width === 1200) {
        await p.locator('#size').selectOption('mini');
        await p.locator('#completed > details').evaluate(d => d.open = true);
        for (const id of ['tutorial-3', 'practicecheck', 'notice-early_late', 'post-main_three_second_meaning']) await p.locator('#' + id).screenshot({ path: path.join(work, 'review-' + id + '.png') });
        await p.locator('#completed > details').evaluate(d => d.open = false);
      }
      await p.evaluate(() => scrollTo(0, 0));
      await p.screenshot({ path: path.join(work, 'review-' + width + '.png') });
      await p.close();
    }
  } finally { await browser.close(); }
  assert(!errors.length, errors.join('\n'));
  write(path.join(dest, 'gallery-results.json'), { checkedAt: new Date().toISOString(), appVersion: m.appVersion, source: m.source, screenshots: r.screens.length, reviewCounts: { active: activeCount, completed: completedCount }, sharedCopy, checks, errors, passed: true });
  console.log('Gallery source, image hashes, all viewport sizes, links, text and layout: PASS');
}
module.exports = { reviewDecision, validateReviewState, comparisonAfter, removeRetiredCurrentImages };
if (require.main === module) (async () => {
  fs.mkdirSync(work, { recursive: true });
  if (!args.includes('--check')) {
    if (from < 0) {
      const child = spawnSync(process.execPath, [path.join(app, 'test-screen-layout.cjs')], { env: { ...process.env, APP_ROOT: sourceRoot, OUTPUT_DIR: captureDir }, stdio: 'inherit' });
      assert(child.status === 0, 'Screen capture failed; review left unchanged');
    }
    if (overlay >= 0) overlayCapture();
    build();
  }
  await verify();
})().catch(e => { console.error(e); process.exitCode = 1; });
