'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const { sourceManifest } = require('../../lib/app-source.cjs');
const repo = path.resolve(__dirname, '../../../..');
const beforeRoot = path.resolve(process.env.BEFORE_ROOT || path.join(repo, '_work/intro-cards-after'));
const afterRoot = path.resolve(process.env.AFTER_ROOT || path.join(repo, '_work/welcome-details-after'));
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sizes = ['375x700', '402x759', '440x841'];

function contents(root) {
  const source = read(path.join(root, 'js/app.js'));
  const start = source.indexOf('  const WELCOME_DEFAULT = [');
  const end = source.indexOf('  const WELCOME = KIOSK');
  if (start < 0 || end < start) throw Error('Missing welcome source');
  const welcome = vm.runInNewContext(source.slice(start, end) + ';WELCOME_DEFAULT');
  const rules = source.slice(source.indexOf('  const START_CRITERION_HTML ='), source.indexOf('  const noticeKinds ='));
  const notices = vm.runInNewContext(rules + ';NOTICE_HTML');
  return { welcome, notices };
}

const before = contents(beforeRoot), after = contents(afterRoot);
const result = json(path.join(__dirname, 'results.json'));
const archived = json(path.join(__dirname, 'before/capture.json'));
if (result.failed || !result.sourceUnchanged) throw Error('Final QA is incomplete');
const beforeSource = sourceManifest(beforeRoot), afterSource = sourceManifest(afterRoot);
if (JSON.stringify(result.source) !== JSON.stringify(afterSource)) throw Error('QA source differs from after source');
if (JSON.stringify(archived.source) !== JSON.stringify(beforeSource)) throw Error('Archived source differs from before source');

const screens = [];
function welcomeCopy(page, index, count, version) {
  return '<p>' + (version === 'after' ? 'はじめに ' + (index + 1) + ' / ' + count : 'はじめに') + '</p>' +
    '<h1>' + page.h + '</h1>' + page.b +
    (page.agree ? '<div class="checks">' + page.agree.map(text => '<p class="copy-check">□ ' + text + '</p>').join('') + '</div>' : '');
}
for (let index = 0; index < after.welcome.length; index++) {
  const page = after.welcome[index];
  screens.push({ id: 'welcome-' + (index + 1), file: 'welcome-' + (index + 1), group: 'はじめに',
    title: (index + 1) + ' / ' + after.welcome.length + ' · ' + page.h,
    before: welcomeCopy(before.welcome[index], index, before.welcome.length, 'before'),
    after: welcomeCopy(page, index, after.welcome.length, 'after'),
    reason: index === 3 ? '氏名とデータの説明を、元の3つの文章に戻しました。共通タイトル・ページ番号はBOX左上、丸ぽちは右下へ移しています。' : '共通タイトルとページ番号を説明BOXの左上へ、丸ぽちを右下へ移しました。本文の見出しと進行状況を、同じBOXの中で読めます。',
    kept: '6枚の順序・5つの確認項目・全項目確認後の進行、BOXの中心固定と高さの伸縮、固定ナビ、初回の中央ボタン。' });
}
for (const [key, title] of [['early', '問題文が出てから短い時間で触れた場合'], ['late', 'スタートを出るまで3秒を超えた場合'], ['both', '2つの注意が同時に出る場合']]) {
  const kind = key === 'both' ? 'early_late' : key;
  screens.push({ id: 'main-' + key, file: 'main-' + key, group: '本番の注意', title,
    before: before.notices[kind], after: after.notices[kind],
    reason: '前の問題で起きたことを画面タイトルのすぐ下、ルールカードの前へ移しました。文字を大きくし、なぜこの確認が出たのかを先に読めるようにしました。',
    kept: '観測した事実の文言・注意を出す条件・種類別の5回上限・確認ボタン・記録と保存・次問の時計を始めるタイミング。' });
}

const captured = new Set(result.screens.map(screen => screen.file));
const images = [];
for (const screen of screens) for (const size of sizes) {
  const relative = size + '/' + screen.file + '.png';
  if (!captured.has(relative)) throw Error('Image not in latest QA: ' + relative);
  const original = archived.files.find(file => file.file === relative);
  const old = path.join(__dirname, 'before', relative), current = path.join(__dirname, relative);
  if (!original || !fs.existsSync(old) || !fs.existsSync(current)) throw Error('Missing image: ' + relative);
  if (hash(fs.readFileSync(old)) !== original.sha256) throw Error('Before image changed: ' + relative);
  images.push({ file: relative, beforeSha256: original.sha256, afterSha256: hash(fs.readFileSync(current)) });
}
const data = { generatedAt: new Date().toISOString(), sizes, screens, images,
  source: { before: beforeSource, after: afterSource },
  verification: '対象3サイズで' + result.passed + '項目の自動検査に成功（失敗' + result.failed + '件）。BOX内のタイトル・ページ番号・丸ぽち、中心とナビ位置、確認チェック、注意の順序・文字サイズ、保存復帰を確認しました。' };
fs.writeFileSync(path.join(__dirname, 'review-data.js'), 'window.SESSION_GUIDANCE_REVIEW = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(JSON.stringify({ screens: screens.length, comparisonImages: images.length * 2, passed: result.passed, failed: result.failed }));
