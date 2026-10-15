'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const app = path.resolve(process.env.APP_ROOT || path.join(root,'..'));
const workingApp = path.resolve(root,'..');
const sourceFiles=require('./source-assets.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const norm = data => data.toString().replace(/\r\n/g,'\n');
const assert = (ok,message) => { if(!ok)throw Error(message); };
const read = name => JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const flow = read('flow.json');
const branches = read('branches.json');
const devices = {
  mini:{short:'mini',name:'iPhone 12 / 13 mini 相当',width:375,height:700,screenWidth:375,screenHeight:812},
  iphone17:{short:'iPhone 17',name:'iPhone 17 相当',width:402,height:759,screenWidth:402,screenHeight:874},
  max:{short:'Pro Max',name:'iPhone 17 Pro Max 相当',width:440,height:841,screenWidth:440,screenHeight:956}
};
const sections = {
  welcome:{title:'はじめに',description:'参加前に読む案内と確認事項'},
  entry:{title:'あなたについて',description:'入力から研究の説明へ'},
  consent:{title:'研究説明と電子同意',description:'長い文書は、先頭から続けて掲載'},
  reading:{title:'読む速さの確認',description:'説明と4つの文章'},
  tutorial:{title:'操作の説明と例題',description:'画面の見方・見本・本人の操作・5つのルール・復習7問・例題'},
  'rating-tutorial':{title:'振り返りの説明',description:'例題のあとに読む説明と、迷い・自信を試す全4画面'},
  practice:{title:'練習と本番の準備',description:'回答・振り返り・操作の確認'},
  main:{title:'本番の1問目',description:'問題文から回答後の振り返りまで'},
  notice:{title:'本番中の注意・見直し',description:'該当する場合に、振り返りの後で表示'},
  break:{title:'途中の休憩',description:'本番の途中に表示される休憩画面'},
  instructed:{title:'追加の10問',description:'追加問題に入る前の説明と操作'},
  post:{title:'最後のアンケート',description:'現行実装の全ページを、ページ送り順に掲載'},
  completion:{title:'送信と完了',description:'送信中から、完了コードの表示まで'},
  guard:{title:'端末・表示の確認',description:'機種、画面の向き、文字とページの倍率'},
  interruption:{title:'途中で中断したとき',description:'中断直後に表示される案内'},
  recovery:{title:'再開・前回のデータ',description:'再開できる場合と、研究者への連絡が必要な場合'},
  storage:{title:'端末内の保存・タブの競合',description:'保存や復元を続けられない場合の案内'},
  delivery:{title:'送信で問題が起きたとき',description:'通信・送信の失敗と再試行'},
  'practice-support':{title:'操作中の案内・補助',description:'途中で指を離した場合などの操作案内'},
  optional:{title:'限定機能・その他の表示',description:'通常の本番リンクでは使用しない表示も含む'}
};
const source = {};
for(const [name,result] of [['flow',flow],['branches',branches]]) {
  assert(result.screens?.length,`No screens: ${name}`);
  assert(!(result.errors?.length),`Capture errors in ${name}: ${JSON.stringify(result.errors)}`);
  assert(!(result.remote?.length),`Unexpected remote requests in ${name}`);
  assert(sourceFiles.length===14&&Object.keys(result.source||{}).length===14&&sourceFiles.every(f=>result.source[f]),`Missing distribution provenance in ${name}`);
  for(const [file,digest] of Object.entries(result.source || {})) {
    assert(!source[file] || source[file]===digest,`Captures use different source: ${file}`);
    assert(hash(norm(fs.readFileSync(path.join(app,file))))===digest,`App changed since capture: ${file}`);
    source[file]=digest;
  }
}
assert(source['index.html'] && source['app.css'],'Source provenance missing');
const ids = new Set();
const imagePaths = new Set();
const screens=[];
for(const [kind,result] of [['flow',flow],['branches',branches]]) {
  for(const screen of result.screens) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(screen.id),'Unsafe screen ID: '+screen.id);
    assert(!ids.has(screen.id),'Duplicate screen ID: '+screen.id); ids.add(screen.id);
    assert(screen.title && screen.section,'Missing title or section: '+screen.id);
    assert(sections[screen.section],'Unknown section: '+screen.section);
    const images={};
    for(const device of Object.keys(devices)) {
      const image=screen.images?.[device];
      assert(image?.src && image.width>0 && image.height>0,`Missing ${device} capture: ${screen.id}`);
      const file=path.resolve(root,image.src);
      assert(file.startsWith(root+path.sep) && image.src.startsWith('images/'),'Image outside gallery');
      assert(!imagePaths.has(image.src),'Duplicate image filename: '+image.src); imagePaths.add(image.src);
      const bytes=fs.readFileSync(file);
      assert(bytes.subarray(1,4).toString()==='PNG','Expected original PNG: '+image.src);
      assert(bytes.readUInt32BE(16)===image.width && bytes.readUInt32BE(20)===image.height,'PNG dimensions disagree: '+image.src);
      images[device]={...image,sha256:hash(bytes)};
    }
    const condition=screen.condition==='通常の進行'?'':screen.condition;
    const text=Object.fromEntries(Object.entries(screen.text || {}).map(([key,value])=>[key,String(value).split('\n').filter(line=>!line.startsWith('あいうえお0123456789')&&!line.startsWith('確認モード（送信しません）')).join('\n').trim()]));
    const isTrouble=/^flow-(tutorial-read-wait|tutorial-motor-(stray|retry|outside)|quiz-[a-z-]+-wrong)$/.test(screen.id);
    screens.push({...screen,condition,text,kind:isTrouble?'branches':kind,section:isTrouble?'practice-support':screen.section,images});
  }
}
const branchSections=['guard','practice-support','interruption','recovery','storage','delivery','optional'];
screens.sort((a,b)=>a.kind===b.kind?(a.kind==='branches'?branchSections.indexOf(a.section)-branchSections.indexOf(b.section):0):a.kind==='flow'?-1:1);
const appText = fs.readFileSync(path.join(app,'index.html'),'utf8');
const sourceMatchesWorkingTree=Object.entries(source).every(([file,digest])=>hash(norm(fs.readFileSync(path.join(workingApp,file))))===digest);
const sourceRefreshes=[...(flow.sourceRefreshes || []),...(branches.sourceRefreshes || [])];
const publicationPath=path.join(root,'data/publication.json');
const publicRecord=fs.existsSync(publicationPath)?JSON.parse(fs.readFileSync(publicationPath,'utf8')):null;
const publication=publicRecord?.allMatch && Object.entries(source).every(([file,digest])=>publicRecord.checks.some(c=>c.file===file&&c.match&&c.actualSha256LF===digest))?publicRecord:null;
const manifest={generatedAt:new Date().toISOString(),appVersion:appText.match(/appVersion:\s*"([^"]+)"/)?.[1] || 'unknown',instructionVersion:appText.match(/const INSTRUCTION_VERSION = "([^"]+)"/)?.[1] || 'unknown',devices,sections,source,sourceRefreshes,sourceMatchesWorkingTree,publication,screens,captureScope:'Chrome touch emulation. Local synthetic data and collector responses. Not physical Safari.'};
manifest.publicationPending=publicRecord?.status==='pending';
fs.writeFileSync(path.join(root,'data/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const embedded=JSON.stringify(manifest).replace(/</g,'\\u003c');
const html=fs.readFileSync(path.join(root,'template.html'),'utf8').replace('__MANIFEST__',()=>embedded);
fs.writeFileSync(path.join(root,'index.html'),html);
const updateSummary={checkedAt:new Date().toISOString(),toVersion:manifest.appVersion,sourceSha256LF:source,allScreensRecaptured:!sourceRefreshes.length,screens:screens.length,images:imagePaths.size,devices,verification:'data/verification.json',publicationStatus:publication?'matched':publicRecord?.status==='pending'?'pending':'not verified',publication:'data/publication.json',flowCoverage:{tutorialStepIds:flow.verification.tutorialStepIds,quizIds:flow.verification.quizIds,ratingExplanationPages:4,practiceIntroNumbered:false,practiceTrials:5},retiredFlowScreens:flow.verification.retiredScreens||[],scope:'現行画面の索引を3サイズで再撮影。合成データのみ使用。Safari実機の検証ではありません。'};
fs.writeFileSync(path.join(root,'data/update-summary.json'),JSON.stringify(updateSummary,null,2)+'\n');
console.log(JSON.stringify({screens:screens.length,flow:flow.screens.length,branches:branches.screens.length,images:imagePaths.size,appVersion:manifest.appVersion}));
