'use strict';
// Read-only normalized source comparison. Source identity is not an execution or physical-device test.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),before=path.join(root,'reviews/2026-10-15-guided-release/before');
const norm=s=>s.replace(/\r\n/g,'\n'),sha=s=>crypto.createHash('sha256').update(s).digest('hex'),read=p=>norm(fs.readFileSync(p,'utf8'));
const old=read(path.join(before,'index.html')),current=read(path.join(root,'index.html'));
const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,...(pass?{}:{detail})});console.log((pass?'PASS ':'FAIL ')+name);};
const assets=require(path.join(root,'screen-gallery/source-assets.cjs')).map(file=>({file,before:fs.existsSync(path.join(before,file))?sha(read(path.join(before,file))):null,current:sha(read(path.join(root,file)))}));for(const a of assets)a.same=a.before===a.current;
for(const a of assets.filter(a=>!['index.html','app.css','guided-tutorial.js','guided-tutorial.css'].includes(a.file)))check('Normalized asset identity: '+a.file,a.same,a);
function fn(s,name){const re=new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\) \\{','m'),m=re.exec(s);if(!m)return null;const end=s.indexOf('\n  }',m.index);return end<0?null:s.slice(m.index,end+4);}
const identical=['publicTrial','invalidAttempt','restoreInvalidAttempts','presentStimulus','revealStimulus','pushEvent','computeStops','finalizeDrag','buildPayload','saveBackup','normalizedResume','closeRatingReview','minReadMs','readCueDelay','requestWakeLock','captureIntro','showReading','logInstructionExposure','moralPracticeDefinition'];
const changed=['retryTrial','selectRating','submitRating','beginRating','ratShowPage','resumeState','canResume','doResume','startPractice'];
const functions=[...identical,...changed].map(name=>{const a=fn(old,name),b=fn(current,name);return{name,oldExists:a!=null,currentExists:b!=null,same:a!=null&&b!=null&&a===b,beforeSha:a&&sha(a),currentSha:b&&sha(b),oldLine:a?old.slice(0,old.indexOf(a)).split('\n').length:null,currentLine:b?current.slice(0,current.indexOf(b)).split('\n').length:null};});
for(const name of identical){const f=functions.find(f=>f.name===name);check('Named function source identity: '+name,f.same,f);}
const retryNew=fn(current,'retryTrial')?.replace('    clearDragFeedback();\n','');check('retryTrial differs only by clearing visual feedback',retryNew===fn(old,'retryTrial'));
const selectionNew=fn(current,'selectRating')?.replace('    if (tutActive() && !["hes", "conf"].includes(ratingTutorialPage().act)) return;\n','');check('selectRating differs only by disabling selection on static explanations',selectionNew===fn(old,'selectRating'));
const constants=['ITEMS','CONFIG','PRACTICE_RULES'].map(name=>{const re=new RegExp('^  const '+name+' = [\\s\\S]*?^  [}\\]];','m'),a=old.match(re)?.[0],b=current.match(re)?.[0];return{name,same:!!a&&a===b,beforeSha:a&&sha(a),currentSha:b&&sha(b)};});for(const c of constants)check('Constant definition source identity: '+c.name,c.same,c);
function between(source,start,end,offset=0){const a=source.indexOf(start,offset),b=source.indexOf(end,a+start.length);return a>=0&&b>a?source.slice(a,b):null;}
const sections=[['post questions, answers, navigation and definitions','  // ===== 事後アンケート (','  // ===== エクスポート ====='],['electronic consent wiring','  // ===== 電子同意:','  // ===== ウェルカム ('],['welcome definitions and controls','  // ===== ウェルカム (','  // ===== 起動 ====='],['block definitions and main/practice builders','  // ===== ブロック定義 =====','  // ===== ブロック列 (']].map(([name,start,end])=>{const a=between(old,start,end),b=between(current,start,end);return{name,same:!!a&&a===b,beforeSha:a&&sha(a),currentSha:b&&sha(b)};});for(const section of sections)check('Section source identity: '+section.name,section.same,section);
const trialBefore=between(old,'    trial = {','    pushEvent(e, "down");',old.indexOf('// ===== Pointer Events 記録 =====')),trialCurrent=between(current,'    trial = {','    pushEvent(e, "down");',current.indexOf('// ===== Pointer Events 記録 ====='));check('Measured trial object schema source identity',!!trialBefore&&trialBefore===trialCurrent);
const report={checkedAt:new Date().toISOString(),scope:'LF正規化した凍結ui19と現行のソース照合。動作確認、実機確認、実GAS/Driveの検証ではない。',assets,functions,constants,sections,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,intentionalChanges:[
 '参加者への軌跡描画を現在接触点と枠内ハイライトへ変更。raw events/geom/初動算式とは別。',
 '段階説明・ルール復習・独立例題導入、drag snapshotのschema/stepId/quiz、device.guidedTutorialを追加。resume.v=2は維持し、旧→新の移行を追加。逆方向の互換は検証対象外。',
 '評定説明3枚→4枚＋番号なし練習導入。初回自信から戻ったratingBacksを現行で加算し、説明の再生は選択値を保持。停止確認から評定説明に戻る場合は保存した状態と経過時間を復元。',
 'tutorialLogにschema/stepId/stay/rule_answer等を追加。説明表示versionはui20、開始appVersionは旧セッション再開で保持。',
 '純操作の失敗案内に4秒上限、正しい開始/切替で消去。旧は上限なし。',
 '横向き判定はscreen.orientation/window.orientationを優先し、キーボードと区別。'
],limitations:[
 '関数同一性は呼出順・イベント配送・DOM/CSS由来の変化がないことまで保証しない。動作はtest-data-audit.cjsとtest-training-provenance.cjsを分離して参照。',
 '現行クイズのinstructionExposureとstayはrule-check全体の粒度。各問表示/滞在時間を記録したものではない。各回答のrule_answerと保存済みindex/orders/selections/attemptsを照合する。'
]};
fs.writeFileSync(path.join(__dirname,'static-contract.json'),JSON.stringify(report,null,2)+'\n');assert.equal(report.failed,0,'Static source audit failed');
