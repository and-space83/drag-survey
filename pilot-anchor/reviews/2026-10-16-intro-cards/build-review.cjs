'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const workspace=path.resolve(__dirname,'../../../..'),beforeRoot=path.resolve(process.env.BEFORE_ROOT||path.join(workspace,'_work/session-guidance-after')),afterRoot=path.resolve(process.env.AFTER_ROOT||path.join(workspace,'_work/intro-cards-after'));
const read=root=>({js:fs.readFileSync(path.join(root,'js/app.js'),'utf8'),html:fs.readFileSync(path.join(root,'index.html'),'utf8')});
function contents(source){const s=source.js;const welcome=vm.runInNewContext(s.slice(s.indexOf('  const WELCOME_DEFAULT = ['),s.indexOf('  const WELCOME = KIOSK'))+';WELCOME_DEFAULT');const common=s.slice(s.indexOf('  const START_CRITERION_HTML ='),s.indexOf('  const noticeKinds ='));const rules=s.slice(s.indexOf('  const PRACTICE_RULES ='),s.indexOf('  function markPracticeRule('));const values=vm.runInNewContext(common+rules+';({rules:PRACTICE_RULES,notices:NOTICE_HTML})');const end=s.slice(s.indexOf('  function endPractice()'),s.indexOf('  function startMain()'));const expression=end.match(/\$\("blockintroBody"\)\.innerHTML\s*=([\s\S]*?);/)[1];const complete=vm.runInNewContext(expression);const breakBody=source.html.match(/<section id="break"[\s\S]*?<div class="pad">([\s\S]*?)<div class="vgap">/)[1].replace(/<p id="breakInfo"><\/p>/,'<p>20 / 55 問が終わりました。</p>').replace(/<div class="session-explanation-card session-transition-card">/,'').replace(/<\/div>\s*$/,'');return{welcome,...values,complete,breakBody};}
const oldSource=read(beforeRoot),newSource=read(afterRoot),a=contents(oldSource),b=contents(newSource),screens=[];
const welcomeCopy=p=>'<h1>'+p.h+'</h1>'+p.b+(p.agree?'<div class="checks">'+p.agree.map(x=>'<p class="copy-check">□ '+x+'</p>').join('')+'</div>':'');
const preserved='6枚の順序、5つの確認項目、未確認・チェック解除時の進行禁止、確認時間の記録。';
for(let n=0;n<6;n++)screens.push({id:'welcome-'+(n+1),file:'welcome-'+(n+1),group:'最初の6枚',title:(n+1)+' / 6 · '+b.welcome[n].h,before:welcomeCopy(a.welcome[n]),after:welcomeCopy(b.welcome[n]),reason:n===1?'長かった進行手順を縦の番号リストにし、説明の見直し・自分のペース・休憩の案内を分けました。BOXと次へは他の5枚と同じ位置です。':n===3?'氏名の用途を「参加確認・謝礼の照合」「研究の分析」「研究成果の公表」に分け、用途ごとに読み取れる形にしました。':'説明を固定サイズのBOXに収め、ページが変わっても上端・高さと戻る/次への位置が動かない構成にしました。',kept:preserved});
const practiceCopy=(rules,keys)=>keys.map(key=>'<h2>'+rules[key].title+'</h2><p>'+rules[key].html+'</p>').join('');
for(const key of ['early','late','release'])screens.push({id:'practice-'+key,file:'practice-'+key,group:'練習の操作確認',title:b.rules[key].title,before:practiceCopy(a.rules,[key]),after:practiceCopy(b.rules,[key]),reason:key==='early'?'状況が分かったらスタートに触れる行動と、答えを決める前という要点を短く示します。':key==='late'?'見出しを短くし、「選択肢を読んだら、答えが決まるのを待たずに動き始める」を最初に強調。3秒の対象区間と回答は自分のペースでよいことも残しました。':'離さず運んで中で離す行動に絞り、下の重複する一文を削りました。離せる範囲の説明は、前の実演とルールの復習に残っています。',kept:'確認する条件・3つのルールの対応・本人の確認チェック・全項目を確認するまで進めない条件・確認記録。'});
for(const [id,title]of [['practice-all','3つの確認が同時に出る場合'],['practice-last','練習5問目のあとに確認する場合']])screens.push({id,file:id,group:'練習の操作確認',title,before:practiceCopy(a.rules,['early','late','release']),after:practiceCopy(b.rules,['early','late','release']),reason:'各ルールの説明を短くし、複数の項目が重なっても必要な行動から読めるようにしました。5問目でも同じ確認を経て、練習完了へ進みます。',kept:'該当する確認だけを表示。すべてにチェック後、確認記録を一度だけ残して先へ進む流れ。'});
for(const [key,title]of [['early','問題文の確認が短かった場合'],['late','スタートを出るまで3秒を超えた場合'],['both','2つの注意が同時に出る場合']]){const kind=key==='both'?'early_late':key;screens.push({id:'main-'+key,file:'main-'+key,group:'本番の注意',title,before:a.notices[kind],after:b.notices[kind],reason:'次にする行動を先に表示し、前問の観測事実は短くして後ろへ移しました。3秒が回答の期限ではないことを保ちながら、文字量と最初の圧迫感を減らします。',kept:'出現条件・種類別の表示上限・次問を出す前に本人が確認する流れ・注意の表示/確認時間の記録。'});}
screens.push({id:'practice-complete',file:'practice-complete',group:'練習完了と休憩',title:'練習完了 → 本番',before:a.complete,after:b.complete,reason:'説明をBOXにまとめ、やり方・回答のペース・操作方法の見直しを箇条書きで整理。本人が進むタイミングを緑の文で案内します。',kept:'本人が「続ける」を押してから本番が始まる。練習5問・本番の問題数・開始時の記録処理。'});
for(const [id,title]of [['break-clear','休憩 → 次の問題'],['break-both','休憩 → 操作の注意 → 次の問題'],['break-both-capped','休憩 → 注意の上限後は次の問題']])screens.push({id,file:id,...(id==='break-both-capped'?{afterFile:'break-both-history-5-early_late'}:{}),group:'練習完了と休憩',title,before:a.breakBody,after:b.breakBody,reason:'休憩の説明と進行の案内を同じBOXにまとめました。休憩後に必要な注意を示す順序と、上限に達した注意を出さない処理はそのままです。',kept:'20問ごとの休憩・本人による再開・休憩時間の記録・前問の注意を経由する条件・種類別の注意上限。'});

for(const s of screens){
 if(s.id.startsWith('welcome-'))s.reason='共通タイトル「はじめに」と丸ぽちを追加。BOXの中心をそろえ、本文量に応じて高さを変えます。最初の「次へ」は中央に置き、2枚目以降の戻る・次へは同じ位置です。';
 else if(s.id.startsWith('practice-')&&s.id!=='practice-complete')s.reason='タイトルを「操作のポイントの確認」に統一。3秒の枠外移動は見出しと前のルール説明で伝えているため、重複する一文を省きました。選択肢を読んだら動き始める行動と、回答を急がなくてよいことを短く残します。';
 else if(s.id.startsWith('main-'))s.reason='練習と同じタイトル・ルールごとのカード表示にそろえました。本番は読んだ後の確認ボタンだけで進み、チェック操作は増やしていません。';
 else s.reason='今回ここは変更していません。前後のつながりと、追加10問のBOXが練習完了へ漏れないことも確認できます。';
}
function instructed(source){const region=source.js.slice(source.js.indexOf('  function showInstructedIntro()'),source.js.indexOf('  function startInstructed()'));return vm.runInNewContext(region.match(/\$\(\"blockintroBody\"\)\.innerHTML\s*=([\s\S]*?);/)[1]);}
const consentHeading=source=>source.html.match(/<section id=\"consent\"[\s\S]*?<h1>(.*?)<\/h1>/)[1];
screens.push({id:'consent-start',file:'consent-start',group:'同意と追加10問',title:'研究への参加の同意',before:'<h1>'+consentHeading(oldSource)+'</h1>',after:'<h1>'+consentHeading(newSource)+'</h1>',reason:'同意する画面だと一目で分かる見出しに変更しました。',kept:'研究説明・協力承諾書の本文、同意文書の版、末尾到達と本人確認の条件、同意の保存処理。'});
screens.push({id:'instructed-intro',file:'instructed-intro',group:'同意と追加10問',title:'追加の10問の説明',before:instructed(oldSource),after:instructed(newSource),reason:'追加の10問の説明も同じ説明BOXへ。やり方が変わる点の強調と本文は維持しました。',kept:'10問の内容・読まずに答える指示・謝礼の説明・追加課題の開始条件・記録と保存。'});

const result=JSON.parse(fs.readFileSync(path.join(__dirname,'results.json'),'utf8'));
if(result.failed||!result.sourceUnchanged)throw Error('Final QA is incomplete');
const {sourceManifest}=require('../../lib/app-source.cjs');
if(JSON.stringify(result.source)!==JSON.stringify(sourceManifest(afterRoot)))throw Error('QA source differs from after source');
const beforeCapture=JSON.parse(fs.readFileSync(path.join(__dirname,'before/capture.json'),'utf8'));
if(JSON.stringify(beforeCapture.source)!==JSON.stringify(sourceManifest(beforeRoot)))throw Error('Before image source differs');
const shotFiles=new Set(result.screens.map(s=>s.file));
for(const s of screens)for(const size of ['375x700','402x759','440x841']){
 const afterFile=size+'/'+(s.afterFile||s.file)+'.png',beforeFile=size+'/'+(s.beforeFile||s.file)+'.png';
 if(!shotFiles.has(afterFile))throw Error('After image not in latest QA: '+afterFile);
 if(!fs.existsSync(path.join(__dirname,afterFile))||!fs.existsSync(path.join(__dirname,'before',beforeFile)))throw Error('Missing comparison image');
 const old=beforeCapture.files.find(f=>f.file===beforeFile);if(!old||crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'before',beforeFile))).digest('hex')!==old.sha256)throw Error('Before image changed: '+beforeFile);
}

const data={generatedAt:new Date().toISOString(),sizes:['375x700','402x759','440x841'],screens,source:{beforeApp:crypto.createHash('sha256').update(oldSource.js.replace(/\r\n/g,'\n')).digest('hex'),afterApp:crypto.createHash('sha256').update(newSource.js.replace(/\r\n/g,'\n')).digest('hex')},verification:'対象3サイズで、'+result.passed+'項目の自動検査に成功（失敗'+result.failed+'件）。説明BOXの中心・ナビ位置と進行表示、確認チェック、次問への進行、注意上限、休憩記録、保存からの復帰、電子同意の保持を確認しました。'};
fs.writeFileSync(path.join(__dirname,'review-data.js'),'window.SESSION_GUIDANCE_REVIEW = '+JSON.stringify(data,null,2)+';\n');console.log(JSON.stringify({screens:screens.length,passed:result.passed,failed:result.failed}));
