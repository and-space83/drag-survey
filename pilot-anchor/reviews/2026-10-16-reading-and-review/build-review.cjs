'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {sourceManifest}=require('../../lib/app-source.cjs');
const root=path.resolve(__dirname,'../..'),gallery=path.join(root,'screen-gallery');
const beforeRoot=path.resolve(process.env.BEFORE_ROOT||path.join(root,'../../_work/welcome-details-after'));
const afterRoot=path.resolve(process.env.AFTER_ROOT||path.join(root,'../../_work/reading-review-after'));
const json=file=>JSON.parse(fs.readFileSync(file,'utf8')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const archived=json(path.join(__dirname,'before/capture.json')),current=json(path.join(gallery,'data/manifest.json')),qa=json(path.join(__dirname,'results.json'));
const before=sourceManifest(beforeRoot),after=sourceManifest(afterRoot);
for(const [label,a,b]of [['before',archived.source,before],['gallery',current.source,after],['qa',qa.source,after],['working app',sourceManifest(root),after]])if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+' source mismatch');
if(qa.failed||!qa.sourceUnchanged)throw Error('QA incomplete');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=text=>'<p>'+escape(text).replace(/\n/g,'<br>')+'</p>';
const sizes=['375x700','402x759','440x841'],devices=['mini','iphone17','max'],screens=[],images=[];
for(const s of archived.scenes){const now=current.screens.find(x=>x.id===s.afterId);if(!now)throw Error('Missing after '+s.afterId);
 let reason,kept;
 if(s.id.startsWith('welcome-')){const n=Number(s.id.split('-')[1]);reason=n===2||n===3?'旧2枚目の説明を「所要時間と回答のペース」と「進む順番と休憩」に分けました。この2枚では同じ変更前画面と比較しています。':'時間と進め方を分割したため、全7枚の番号と丸ぽちへ更新しています。';kept='元の説明の意味、5つの確認項目と全項目確認後の進行、BOXの中心と内容に応じた高さ、固定ボタン、最初の中央ボタン。';}
 else if(s.id.startsWith('reading-')){reason=s.id==='reading-intro'?'読む速さの説明だけをBOXにまとめ、画面上方に寄りすぎない位置へ下げました。':'実際の文章にはBOXを付けず、番号をタイトルの横へ移しました。見出しと本文の間隔54pxを保ち、全体を24px下げています。';kept='「文章を読む速さの計測」の見出し、4つの文章、字数、表示から読了までの時間、400msの連打防止、保存・再開、合計字数と時間からの読む速さの計算。';}
 else{reason='最も大きい説明BOXの直下へボタンを上げました。全7問・未選択/誤答/正解でボタン位置を共通にし、BOXの上端を固定して注意文の分だけ下へ広げます。';kept='設問・選択肢・説明文、正誤判定、正解するまで進めない条件、戻ったときの選択保持、最後の例題への遷移、見直しからの復帰と記録。';}
 screens.push({id:s.id,file:s.id,group:s.group,title:now.title,before:copy(s.beforeText),after:copy(now.text.mini),reason,kept});
 for(let i=0;i<sizes.length;i++){const file=sizes[i]+'/'+s.id+'.png',old=archived.files.find(x=>x.file===file),oldBytes=fs.readFileSync(path.join(__dirname,'before',file));if(!old||sha(oldBytes)!==old.sha256)throw Error('Before drift '+file);const image=now.images[devices[i]],bytes=fs.readFileSync(path.join(gallery,image.src));if(sha(bytes)!==image.sha256)throw Error('After drift '+image.src);const dest=path.join(__dirname,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);images.push({file,beforeSha256:old.sha256,afterSha256:image.sha256});}}
const data={generatedAt:new Date().toISOString(),sizes,screens,images,source:{before,after},verification:'対象3サイズで位置・進行条件・記録と復帰を自動確認。'+qa.passed+'項目成功、失敗'+qa.failed+'件。全画面の撮影元と検証元の27ファイルが一致しています。'};
fs.writeFileSync(path.join(__dirname,'review-data.js'),'window.SESSION_GUIDANCE_REVIEW = '+JSON.stringify(data,null,2)+';\n');
console.log(JSON.stringify({screens:screens.length,comparisonImages:images.length*2,passed:qa.passed,failed:qa.failed}));
