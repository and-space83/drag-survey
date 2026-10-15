'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const app=path.resolve(process.env.APP_ROOT || path.join(__dirname,'..'));
const baseUrl='https://and-space83.github.io/drag-survey/pilot-anchor/';
const files=require('./source-assets.cjs');
const digest=text=>crypto.createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const localHtml=require('../lib/app-source.cjs').readAppSource(app);
const report={checkedAt:new Date().toISOString(),version:localHtml.match(/appVersion:\s*"([^"]+)"/)[1],baseUrl,normalUrls:true,checks:[],saveNotices:[]};
if(process.argv.includes('--pending')){
 report.status='pending';report.checkedAt=null;report.expectedFiles=files;report.allMatch=false;report.reason='更新版の公開後に配布ファイル一式を照合します。';
 fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});fs.writeFileSync(path.join(__dirname,'data/publication.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version:report.version,status:report.status,files:files.length}));
}else
(async()=>{
 const results=await Promise.all(files.map(async file=>{
   const response=await fetch(baseUrl+file,{cache:'no-store',signal:AbortSignal.timeout(20000)});
   const actual=await response.text(),expected=fs.readFileSync(path.join(app,file),'utf8');
   const actualSha256LF=digest(actual),expectedSha256LF=digest(expected);
   if(file==='index.html')for(const id of ['consentSaveNote','sendWaitNote']){
     const inner=actual.match(new RegExp('<p[^>]*id="'+id+'"[^>]*>(.*?)</p>','s'))?.[1] || '';
     report.saveNotices.push({id,lineBreak:inner.includes('<br>'),wholeSentenceBold:inner.includes('<strong>ブラウザの更新（再読み込み）や「戻る」は使わず、画面を閉じずにそのままお待ちください。</strong>')});
   }
   return {file,status:response.status,expectedSha256LF,actualSha256LF,match:response.ok&&actualSha256LF===expectedSha256LF};
 }));
 report.checks=results;
 report.allMatch=results.every(c=>c.match)&&report.saveNotices.every(n=>n.lineBreak&&n.wholeSentenceBold)&&report.saveNotices.length===2;
 fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
 fs.writeFileSync(path.join(__dirname,'data/publication.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({version:report.version,allMatch:report.allMatch,files:results.length,saveNotices:report.saveNotices,mismatches:results.filter(c=>!c.match).map(c=>c.file)}));
 if(!report.allMatch)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
