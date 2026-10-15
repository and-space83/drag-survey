/* Current participant flow. Synthetic inputs only, immutable local source snapshot,
 * local mock receipts, no external network. Run with Node and Playwright. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(process.env.APP_ROOT||path.join(__dirname,'..')),out=__dirname;
const sourceFiles=require('./source-assets.cjs');
const priorScreens=fs.existsSync(path.join(out,'data/flow.json'))?JSON.parse(fs.readFileSync(path.join(out,'data/flow.json'),'utf8')).screens:[];
const sizes=[{id:'mini',width:375,height:700,sh:812},{id:'iphone17',width:402,height:759,sh:874},{id:'max',width:440,height:841,sh:956}];
const report={screens:[],source:{},errors:[],remote:[],verification:{method:'Local Chromium mobile touch emulation, DPR 1, prefers-reduced-motion: no-preference; actual participant UI; synthetic answers; local protocol-3 mock receipts only.',postPages:{},mainTrials:{},instructedTrials:{}}};
const assets=new Map();
for(const dir of ['', 'vendor/'])for(const f of fs.readdirSync(path.join(root,dir))){const p=path.join(root,dir,f);if(fs.statSync(p).isFile()&&/\.(html|css|js)$/.test(f))assets.set('/'+dir+f,fs.readFileSync(p));}
for(const f of sourceFiles){if(!assets.has('/'+f))assets.set('/'+f,fs.readFileSync(path.join(root,f)));report.source[f]=crypto.createHash('sha256').update(assets.get('/'+f).toString().replace(/\r\n/g,'\n')).digest('hex');}
const snapshotDir=path.join(require('node:os').tmpdir(),'pilot-gallery-flow-'+crypto.createHash('sha256').update(JSON.stringify(report.source)).digest('hex').slice(0,16));fs.mkdirSync(snapshotDir,{recursive:true});for(const [name,bytes]of assets){const target=path.join(snapshotDir,name.slice(1));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
const source=assets.get('/index.html').toString();
report.verification.appVersion=source.match(/appVersion:\s*"([^"]+)"/)[1];
const server=http.createServer((req,res)=>{const key=new URL(req.url,'http://local').pathname==='/'?'/index.html':new URL(req.url,'http://local').pathname,data=assets.get(key);if(req.method!=='GET'||!data){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'html':'text/html;charset=utf-8','css':'text/css','js':'application/javascript'})[key.split('.').at(-1)]||'application/octet-stream');res.end(data);});
let browser,origin;const screenMap=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let captureWriteSeq=0;
function writeCapturedFile(target,data){const resolved=path.resolve(target);if(!resolved.startsWith(path.resolve(out)+path.sep))throw Error('Capture output outside gallery');const temp=resolved+'.tmp-'+process.pid+'-'+(++captureWriteSeq);try{fs.writeFileSync(temp,data);for(let attempt=0;;attempt++){try{fs.renameSync(temp,resolved);return;}catch(error){if(!['UNKNOWN','EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=9)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}}}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function save(){report.screens=[...screenMap.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));fs.mkdirSync(path.join(out,'data'),{recursive:true});writeCapturedFile(path.join(out,'data/flow.json'),JSON.stringify(report,null,2));}
function retireUnusedScreens(){const active=new Set([...screenMap.values()].map(s=>s.id)),retired=priorScreens.filter(s=>!active.has(s.id));const imagesRoot=path.resolve(out,'images')+path.sep;for(const s of retired)for(const info of Object.values(s.images)){const target=path.resolve(out,info.src);if(!target.startsWith(imagesRoot)||!path.basename(target).startsWith('flow-'))throw Error('Unexpected retired flow image path');if(fs.existsSync(target))fs.unlinkSync(target);}report.verification.retiredScreens=retired.map(s=>s.id);}
const syncValues=new Map();
let captureFailure=null;
function abortSync(error){captureFailure??=error;for(const b of syncValues.values())b.reject(error);}
async function syncMax(id,key,value){if(captureFailure)throw captureFailure;let b=syncValues.get(id);if(!b){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});promise.catch(()=>{});b={values:{},promise,resolve,reject};syncValues.set(id,b);}b.values[key]=value;if(Object.keys(b.values).length===sizes.length)b.resolve(Math.max(...Object.values(b.values)));return b.promise;}
async function suite(size){
 const ctx=await browser.newContext({viewport:{width:size.width,height:size.height},screen:{width:size.width,height:size.sh},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'no-preference',locale:'ja-JP',timezoneId:'Asia/Tokyo',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 await ctx.addInitScript(()=>{let n=348971;Math.random=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};});
 const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p);p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());p.on('pageerror',e=>{report.errors.push({size:size.id,error:e.message});save();});
 await ctx.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin){report.remote.push(r.request().url());return r.abort();}if(u.pathname==='/mock-receipt'){
   let raw=r.request().postData(),payload=JSON.parse(raw);if(payload.encoding==='gzip-base64-v1'){raw=zlib.gunzipSync(Buffer.from(payload.data,'base64')).toString();payload=JSON.parse(raw);}const digest=crypto.createHash('sha256').update(raw).digest('hex');
   await sleep(payload.kind==='consent'||payload.kind==='finalize'?1400:150);
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,protocol:3,sessionId:payload.device.sessionId,state:payload.kind==='consent'?'consented':payload.kind==='tasks'?'tasks_received':'completed',consentReceivedAt:new Date().toISOString(),receivedAt:new Date().toISOString(),tasksDigest:digest,finalDigest:digest})});
 }if(r.request().method()!=='GET'){report.remote.push(r.request().url());return r.abort();}return r.continue();});
 await p.clock.install();
 let screenshotClockHeld=false;
 const shot=async(id,title,section,order,description='',condition='通常の進行',sourceScreen=null)=>{
   if(consentRefresh&&section!=='consent')return;
   const frames=p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(screenshotClockHeld)await p.clock.runFor(40);await frames;await sleep(90);
   const filename='flow-'+id+'.png';fs.mkdirSync(path.join(out,'images',size.id),{recursive:true});writeCapturedFile(path.join(out,'images',size.id,filename),await p.screenshot({animations:'disabled'}));
   const active=await p.evaluate(()=>__pilot.activeScreen());let s=screenMap.get(id);if(!s){s={id:'flow-'+id,title,section,order,description,condition,sourceScreen:sourceScreen||active,images:{},text:{}};screenMap.set(id,s);}Object.assign(s,{title,section,order,description});s.images[size.id]={src:'images/'+size.id+'/'+filename,width:size.width,height:size.height};s.text[size.id]=(await p.locator('body').innerText()).replace(/^あいうえお0123456789あいうえお0123456789\n/,'');save();console.log(size.id+' '+id);
 };
 const tap=async sel=>{await p.locator(sel).click();await sleep(60);};
 const settle=async()=>{await p.waitForFunction(()=>__pilot.activeScreen()==='task'&&!__pilot.uiLocked());};
 const helpWait=async(kind='drag')=>{const state=await p.evaluate(k=>__pilot.helpState()[k],kind),n=state.lockRemainingMs;if(n>0)await p.clock.fastForward(n+80);const remaining=await p.evaluate(k=>__pilot.helpState()[k].lockRemainingMs,kind);if(remaining>0)throw Error('Reading clock did not cross the actual deadline');(report.verification.readWaits??={})[size.id]??=[];report.verification.readWaits[size.id].push({kind,stepId:state.stepId||null,index:state.index,quizIndex:state.stepId==='rule-check'?state.quiz.index:null,waitedMs:n>0?n+80:0,remainingMs:remaining});};
 const capScroll=async(id,title,section,order,description='',condition='通常の進行',selector)=>{
   const sel=selector||'#'+await p.evaluate(()=>__pilot.activeScreen())+' .pad';await p.locator(sel).evaluate(e=>e.scrollTop=0);await shot(id,title,section,order,description,condition);
   const g=await p.locator(sel).evaluate(e=>({h:e.clientHeight,total:e.scrollHeight}));const parts=await syncMax('scroll-'+id,size.id,Math.ceil(Math.max(0,g.total-g.h)/(g.h*.8)));
   for(let i=1;i<=parts;i++){await p.locator(sel).evaluate((e,v)=>e.scrollTop=(e.scrollHeight-e.clientHeight)*v,i/parts);await shot(id+'-part'+(i+1),title+'（続き '+(i+1)+'）',section,order+i*.001,description+' スクロール領域を順に撮影。全内容が一画面に収まるサイズでは同じ画面を表示。',condition);}
 };
 const drag=async(target='A',capture=null,fail=false)=>{
   const g=await p.evaluate(t=>{const c=e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}};return{s:c(document.querySelector('#start')),t:t==='sandbox'?c(document.querySelector('#tutSingleTarget')):t==='outside'?{x:18,y:innerHeight*.6}:c(document.querySelector('#choice'+t))};},target);
   const touch=(type,point)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[{x:point.x,y:point.y,id:1}]:[]});await touch('touchStart',g.s);if(capture)await shot(...capture.press);
   if(fail){await touch('touchEnd');await sleep(100);return;}
   for(let i=1;i<=16;i++){const t=i/16;await touch('touchMove',{x:g.s.x+(g.t.x-g.s.x)*t+Math.sin(t*Math.PI)*10,y:g.s.y+(g.t.y-g.s.y)*t});if(i===8&&capture&&capture.move)await shot(...capture.move);await sleep(8);}
   await touch('touchEnd');await sleep(160);
 };
 const rate=async(prefix,section,order,capture)=>{await p.waitForFunction(()=>__pilot.activeScreen()==='rating');if(capture)await shot(prefix+'-hesitation','振り返り 1 / 2 — 迷い',section,order,section==='main'?'迷いの程度を5段階から選択。本番中は問題画面と同じ進捗バーを上部に表示。':'迷いの程度を5段階から選択。');await tap('#qitem-hesitation button:nth-child(3)');await p.clock.fastForward(350);await tap('#ratingNext');if(capture)await shot(prefix+'-confidence','振り返り 2 / 2 — 自信',section,order+1,section==='main'?'選んだ答えへの自信を5段階から選択。本番中は問題画面と同じ進捗バーを上部に表示。':'選んだ答えへの自信を5段階から選択。');await tap('#qitem-confidence button:nth-child(4)');await p.clock.fastForward(350);await tap('#ratingSubmit');await sleep(160);};
 const mainHelp=async()=>{const before=await p.evaluate(()=>({trial:__pilot.trialIndex(),records:__pilot.buildPayload().trials.length}));await tap('#tutAgain');for(let i=1;i<=35&&await p.evaluate(()=>__pilot.helpState().drag.index>=0);i++){const state=await p.evaluate(()=>__pilot.helpState().drag),key=state.stepId==='rule-check'?'quiz-'+await p.evaluate(n=>PILOT_GUIDED_TUTORIAL.checks[n].id,state.quiz.index):state.stepId;await shot('main-help-'+key,'本番の操作方法を見直す — '+await p.locator('#tutPopTitle').innerText(),'main',706+i*.01,'本番中にも説明と復習を読み直し、同じ問題へ戻れます。見直しは本人の操作・再回答を要求しません。','本番で「操作方法」を押した場合');await helpWait();await tap('#tutPopNext');}const after=await p.evaluate(()=>({trial:__pilot.trialIndex(),records:__pilot.buildPayload().trials.length}));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Main help changed the trial or answers');};
 try{
 await p.goto(origin+'/?block=moral&debug=1&consent=1&mic=0&uploadurl=/mock-receipt');await p.waitForFunction(()=>window.__pilot?.storeReady());
 for(let i=1;i<=6;i++){await shot('welcome-'+i,'はじめに '+i+' / 6','welcome',i*10,await p.locator('#wcBody h1').innerText());while(await p.locator('#wcAgree button:not(.sel)').count())await p.locator('#wcAgree button:not(.sel)').first().click();if(i>=5)await shot('welcome-'+i+'-checked','はじめに '+i+' / 6 — 確認済み','welcome',i*10+1,'全項目を確認すると次へ進める。');await tap('#wcNext');}
 await capScroll('entry-empty','あなたについて — 入力前','entry',100,'氏名・年齢・機種名・性別・利き手の入力。');
 await p.locator('#pid').fill('画面確認用');await p.locator('#age').fill('30');await p.locator('#devModel').fill('iPhone（撮影用）');await tap('#sexSeg [data-val="na"]');await tap('#handSeg [data-val="right"]');await p.locator('#pid').blur();await capScroll('entry-ready','あなたについて — 入力済み','entry',110,'入力はすべて撮影用の架空データ。');await tap('#goPractice');
 await capScroll('consent-document','研究説明と協力承諾書','consent',200,'文書枠内の全文を末尾まで撮影。','通常の進行','#consentDocument');
 await p.locator('#consentDocument').evaluate(e=>e.scrollTop=e.scrollHeight);await sleep(100);await shot('consent-read','研究説明 — 末尾まで読んだ状態','consent',210,'末尾まで進むと同意チェックが有効。');await p.locator('#consentCheck').check();await shot('consent-checked','研究説明 — 同意チェック済み','consent',220);await p.locator('#consentGo').click();await p.waitForSelector('#consent-save.active');await shot('consent-saving','同意情報を保存しています','consent',230,'ローカル模擬受領応答の待機画面。');await p.waitForFunction(()=>__pilot.activeScreen()==='reading');if(consentRefresh)return;
 await shot('reading-intro','読む速さの計測 — 説明','reading',300);
 // Pause before timed reading and the tutorial deadline are created. A future
 // target also avoids the protocol round-trip racing a running page clock.
 await p.clock.pauseAt(await p.evaluate(()=>Date.now()+60000));screenshotClockHeld=true;
 await tap('#readDone');for(let i=1;i<=4;i++){await shot('reading-'+i,'読む速さの計測 — 文章 '+i+' / 4','reading',310+i);await p.clock.fastForward(4000);await tap('#readDone');}
 const tutorialSteps=await p.evaluate(()=>PILOT_GUIDED_TUTORIAL.steps.map(s=>({id:s.id,title:s.title,kind:s.kind})));
 report.verification.tutorialStepIds=tutorialSteps.map(s=>s.id);
 for(let i=0;i<tutorialSteps.length;i++){
   const step=tutorialSteps[i],base=400+i*4;await p.waitForFunction(id=>__pilot.helpState().drag.stepId===id,step.id);
   if(step.kind==='quiz'){
     const questions=await p.evaluate(()=>PILOT_GUIDED_TUTORIAL.checks);report.verification.quizIds=questions.map(q=>q.id);
     for(let q=0;q<questions.length;q++){
       await p.waitForFunction(n=>__pilot.helpState().drag.quiz.index===n,q);
       const item=questions[q],id='quiz-'+item.id,order=base+q*.1;
       await shot(id,'ルールの復習 '+(q+1)+' / '+questions.length+' — '+item.title,'tutorial',order,'3択を1問ずつ確認します。正解を選んで「次へ」を押すまで進みません。');
       await p.locator('#tutQuiz [data-answer-index="'+((item.correctIndex+1)%item.labels.length)+'"]').click();
       await shot(id+'-wrong','ルールの復習 '+(q+1)+' / '+questions.length+' — 選びなおす','tutorial',order+.01,'誤答の案内を読み、同じ問題で選びなおします。','復習で誤答を選んだ場合');
       if(!await p.locator('#tutPopNext').isDisabled())throw Error('Incorrect quiz answer unlocked progression: '+item.id);
       await p.locator('#tutQuiz [data-answer-index="'+item.correctIndex+'"]').click();await helpWait();
       await shot(id+'-correct','ルールの復習 '+(q+1)+' / '+questions.length+' — 正解を確認','tutorial',order+.02,'正解の説明を読んで進む。最後のボタンは「例題へ」。');await tap('#tutPopNext');
     }
     continue;
   }
   // The clock is already paused, so screenshot I/O cannot consume this deadline.
   await shot('tutorial-'+step.id,step.title,'tutorial',base,step.kind==='motor'?'ここから本人がスタートからボックスまで運ぶ操作を試します。':step.kind==='demo'||step.id==='motor-range'?'見本を見る画面です。本人は操作せず、読んだら「次へ」で進みます。':'説明を読み、ページ送りで1項目ずつ確認します。');
   if(i===0){await tap('#tutPopNext');await shot('tutorial-read-wait','説明を読む前に「次へ」を押した場合','tutorial',base+.01,'読了待機中は同じ説明に留まり、短い案内を表示します。','初回の読了待機中に「次へ」を押した場合');if(await p.evaluate(()=>__pilot.helpState().drag.stepId!=='layout-intro'))throw Error('Initial reading wait did not hold');screenshotClockHeld=false;await p.clock.resume();}
   if(step.id==='motor-route'){await p.clock.runFor(1200);await shot('tutorial-motor-route-moving','操作の見本 — 指を離さずに運ぶ途中','tutorial',base+.1,'経路を変えながら繰り返す見本。道すじは自由という文を初めから表示。');await p.clock.runFor(4000);await shot('tutorial-motor-route-another','操作の見本 — 別の道すじ','tutorial',base+.2,'複数の曲線の一例。見本の速度や道すじをまねする指示ではありません。');}
   if(step.id==='motor-range'){await p.clock.runFor(1400);await shot('tutorial-motor-range-inside','離す場所の見本 — 枠の内側','tutorial',base+.1,'拡大図の内側全体を示し、異なる内側の位置で離す見本を繰り返します。');}
   if(step.id==='time-rule'){await p.clock.runFor(1000);await shot('tutorial-time-rule-touch','3秒の区間 — スタートに触れる','tutorial',base+.1,'3秒を計る区間の見本。回答を終えるまでの時間ではありません。');await p.clock.runFor(2000);await shot('tutorial-time-rule-exit','3秒の区間 — スタートの枠を出る','tutorial',base+.2,'スタートの枠の外へ出るまでを確認します。');}
   await helpWait();
   if(step.kind==='motor'){
     await p.locator('#surface').tap({position:{x:18,y:size.height*.6}});await shot('tutorial-motor-stray','操作の練習 — スタート以外を触った場合','tutorial',base+.1,'赤い案内は選択肢とスタートの間に4秒表示。スタート接触や画面移動で消えます。','操作練習でスタート以外に触れた場合');
     await drag('sandbox',null,true);await shot('tutorial-motor-retry','操作の練習 — スタートで離した場合','tutorial',base+.2,'スタートからボックスまで指を離さず運び直します。','操作練習で途中で指を離した場合');
     await drag('outside');await shot('tutorial-motor-outside','操作の練習 — 枠外で離した場合','tutorial',base+.3,'選択肢の枠内で離すよう案内します。','操作練習で枠外で指を離した場合');
     await drag('sandbox',{press:['tutorial-motor-press','操作の練習 — スタート押下','tutorial',base+.4],move:['tutorial-motor-drag','操作の練習 — 指を運ぶ途中','tutorial',base+.5,'本人の軌跡は表示せず、現在位置と押下・到達の反応を表示します。']});
     await p.waitForFunction(()=>__pilot.helpState().drag.handsDone);await shot('tutorial-motor-success','操作の練習 — 成功','tutorial',base+.6,'ボックス内で離すと成功の説明が出ます。「ルールを確認する」で次の章へ。');await helpWait();
   }
   await tap('#tutPopNext');
 }
 await p.waitForFunction(()=>__pilot.activeScreen()==='guidedintro');await shot('example-intro','例題 — 説明','tutorial',480,'復習7問のあと、例題を1問試す前の案内。通し番号・ドットはありません。');await p.clock.fastForward(5700);await tap('#guidedIntroGo');
 await shot('example-banner','例の1問をやってみましょう','tutorial',490);await p.clock.fastForward(2400);await p.clock.runFor(550);await p.waitForFunction(()=>document.querySelector('#coach').innerText.includes('問題文を読み、状況が分かったら'));await shot('example-coach','例の1問 — 状況が分かったらスタート','tutorial',490.5,'例題の開始案内が表示された状態。状況を理解してからスタートボタンに指を置く。');await drag('A',{press:['example-press','例の1問 — 押下で選択肢を表示','tutorial',491],move:['example-drag','例の1問 — 選ぶほうへ指を運ぶ','tutorial',492]});
 await p.waitForFunction(()=>__pilot.activeScreen()==='rating');for(let i=0;i<5;i++){await p.waitForFunction(n=>__pilot.helpState().rating.index===n,i);const title=await p.locator('#ratTutTitle').innerText(),id=i===4?'practice-intro':'rating-tutorial-'+(i+1),section=i===4?'practice':'rating-tutorial';await shot(id,title,section,500+i*10,i===4?'5問の練習を始める導入。番号やドットを付けず、読んで「次へ」で始めます。':'例題に答えた後の振り返りの説明。全4画面。');await helpWait('rating');if(i===1||i===2){await tap(i===1?'#qitem-hesitation button:nth-child(3)':'#qitem-confidence button:nth-child(4)');await p.clock.fastForward(350);await shot(id+'-selected',title+' — 選択済み',section,501+i*10,'いちばん近い段階を1つ選ぶと「次へ」が強調されます。');}await tap(await p.locator('#ratingSubmit').isVisible()?'#ratingSubmit':'#ratingNext');}
 for(let i=1;i<=5;i++){await settle();await p.clock.fastForward(7000);const base=600+(i-1)*8;await shot('practice-'+i,'練習 '+i+'問目 — 問題文を読む','practice',base);await drag(i%2?'A':'B',{press:[i===1?'practice-press':'practice-'+i+'-press','練習 '+i+'問目 — スタート押下','practice',base+1],move:[i===1?'practice-drag':'practice-'+i+'-drag','練習 '+i+'問目 — 指を運ぶ途中','practice',base+2]});await rate(i===1?'practice':'practice-'+i,'practice',base+3,true);}
 await p.waitForFunction(()=>__pilot.activeScreen()==='blockintro');await capScroll('practice-complete','練習完了 — 本番を始める前に','practice',650);await tap('#blockintroGo');
 const seenChecks=new Set();let guard=0;while(guard++<130){const active=await p.evaluate(()=>__pilot.activeScreen());if(active==='blockintro')break;if(active==='break'){const n=await p.evaluate(()=>__pilot.trialIndex());await shot('break-'+n,'休憩 — '+n+'問の終了後','break',800+n,'「続ける」は表示時から有効です。待機を強制する別画面はありません。');await tap('#breakContinue');continue;}if(active==='notice'){await tap('#noticeGo');continue;}await settle();const n=await p.evaluate(()=>__pilot.trialIndex()+1);await p.clock.fastForward(7000);const ck=await p.evaluate(()=>__pilot.recoveryState().currentCell?.isCheck);const ckNew=ck&&!seenChecks.has(ck);const ckLabel=({dqs:'指定された側を選ぶ',infreq:'スマートフォン使用の確認',imc:'文中の指示を読む'})[ck];if(ckNew){seenChecks.add(ck);await shot('check-'+ck,'本番の注意確認問題 — '+ckLabel,'main',710+n*.1,'本番に組み込まれる確認問題の一例。出題順はセッションごとに異なります。','本番中の注意確認問題');}if(n===1){await shot('main-1','本番 1問目 — 問題文を読む','main',700,'押下するまで選択肢の内容は隠れている。');await mainHelp();}await drag('A',n===1?{press:['main-press','本番 1問目 — 選択肢が現れる','main',701],move:['main-drag','本番 1問目 — 指を運ぶ途中','main',702]}:ckNew?{press:['check-'+ck+'-choices','本番の注意確認問題 — 選択肢を表示（'+ckLabel+'）','main',710+n*.1+.01,'押下で選択肢が現れます。','本番中の注意確認問題']}:null);await rate('main','main',703,n===1);}
 await p.waitForFunction(()=>__pilot.activeScreen()==='blockintro');await capScroll('instructed-intro','追加の10問 — 説明','instructed',900,'追加問題には振り返りの質問がありません。');await tap('#blockintroGo');await settle();await shot('instructed-1','追加 1 / 10 — 問題画面','instructed',910,'問題文も選択肢も読まずに、適当に指を運ぶ教示。');await tap('#tutAgain');for(let i=1;i<=30&&await p.evaluate(()=>__pilot.helpState().drag.index>=0);i++){await shot('instructed-help-'+i,await p.locator('#tutPopStep').innerText(),'instructed',910+i,'追加問題専用の説明。','追加問題で「操作方法」を押した場合');await tap('#tutPopNext');}
 for(let i=1;i<=10;i++){await settle();await drag(i%2?'A':'B',i===1?{press:['instructed-press','追加 1 / 10 — スタート押下','instructed',914],move:['instructed-drag','追加 1 / 10 — 指を運ぶ途中','instructed',915]}:null);await sleep(180);}
 await p.waitForFunction(()=>__pilot.activeScreen()==='postq');let total=0;const postPageCount=Number((await p.locator('#postStep').innerText()).split('/').at(-1));const problemSeen={};for(let i=1;i<=40;i++){
   const cur=p.locator('#postq .postpage.on');let id=await cur.getAttribute('data-page');if(id==='problems')id+='-'+(problemSeen[id]=(problemSeen[id]||0)+1);const step=await p.locator('#postStep').innerText();const title=(await cur.innerText()).split('\n').find(t=>t.trim())||id;
   await capScroll('post-'+String(i).padStart(2,'0')+'-'+id,'アンケート '+step+' — '+title,'post',1000+i*10,'現在の実装の全ページを表示順に収録。');
   for(const seg of await cur.locator('.seg').all())if(await seg.isVisible())await seg.locator('button').last().click();for(const checks of await cur.locator('.checks').all())if(await checks.isVisible()){if(await checks.evaluate(e=>e.classList.contains('post-multiple'))){const options=checks.locator('button:not([data-none="1"]):visible');for(const b of (await options.all()).slice(0,2))await b.click();await capScroll('post-'+String(i).padStart(2,'0')+'-'+id+'-selected','アンケート '+step+' — 複数選択済み','post',1000+i*10+.5,'複数選択できる質問で2つの回答を選択した状態。回答は撮影用です。');}else{const none=checks.locator('[data-none="1"]:visible');if(await none.count())for(const b of await none.all())await b.click();else await checks.locator('button').first().click();}}for(const input of await cur.locator('input[type="number"]').all())await input.fill('7');
   total=i;if(!await p.locator('#postNext').isVisible())break;if(await p.locator('#postNext').isDisabled())throw Error('Unanswered post page '+id);await tap('#postNext');
 }
 report.verification.postPages[size.id]=total;if(!postPageCount||total!==postPageCount)throw Error('Expected '+postPageCount+' current post pages; got '+total);
 await p.locator('#postSubmit').click();await p.waitForSelector('#done.active');await shot('sending','データを送信しています','completion',1300,'ローカル模擬サーバーの受領応答を待つ状態。');await p.waitForFunction(()=>document.querySelector('#doneTitle').textContent==='完了しました');await capScroll('complete','完了しました','completion',1310,'完了コードと補助の保存操作。コードは撮影用セッションのもの。');const payload=await p.evaluate(()=>__pilot.buildPayload());report.verification.mainTrials[size.id]=payload.trials.filter(t=>t.phase==='main').length;report.verification.instructedTrials[size.id]=payload.trials.filter(t=>t.phase==='instructed').length;if(report.verification.mainTrials[size.id]!==55||report.verification.instructedTrials[size.id]!==10)throw Error('Unexpected trial counts');
 }catch(e){abortSync(e);report.errors.push({size:size.id,error:e.stack});await p.screenshot({path:path.join(out,'images',size.id,'flow-capture-error.png')}).catch(()=>{});save();throw e;}finally{await ctx.close();}
 // Conditional practice review and production guidance use the app's existing preview entries.
 for(const query of ['go=practicecheck','go=notice&notice=early','go=notice&notice=late','go=notice&notice=early_late','go=post&extra=other'])await branches(size,query);
}
async function branches(size,query){
 const ctx=await browser.newContext({viewport:{width:size.width,height:size.height},screen:{width:size.width,height:size.sh},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'no-preference',locale:'ja-JP',timezoneId:'Asia/Tokyo',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}),p=await ctx.newPage();p.setDefaultTimeout(10000);await p.clock.install();await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin&&r.request().method()==='GET')return r.continue();report.remote.push(r.request().url());return r.abort();});p.on('pageerror',e=>report.errors.push({size:size.id,error:e.message}));
 const shot=async(id,title,section,order,description)=>{await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await sleep(80);const filename='flow-'+id+'.png';writeCapturedFile(path.join(out,'images',size.id,filename),await p.screenshot({animations:'disabled'}));const active=await p.evaluate(()=>__pilot.activeScreen());let s=screenMap.get(id);if(!s){s={id:'flow-'+id,title,section,order,description,condition:'該当する操作が検出された場合に表示。通常はスキップされます。',sourceScreen:active,images:{},text:{}};screenMap.set(id,s);}Object.assign(s,{title,section,order,description});s.images[size.id]={src:'images/'+size.id+'/'+filename,width:size.width,height:size.height};s.text[size.id]=(await p.locator('body').innerText()).replace(/^あいうえお0123456789あいうえお0123456789\n/,'');save();console.log(size.id+' '+id);};
 const cap=async(id,title,section,order,description,selector)=>{await p.locator(selector).evaluate(e=>e.scrollTop=0);await shot(id,title,section,order,description);const g=await p.locator(selector).evaluate(e=>({h:e.clientHeight,total:e.scrollHeight})),count=await syncMax('branch-'+id,size.id,Math.ceil(Math.max(0,g.total-g.h)/(g.h*.8)));for(let n=1;n<=count;n++){await p.locator(selector).evaluate((e,v)=>e.scrollTop=(e.scrollHeight-e.clientHeight)*v,n/count);await shot(id+'-part'+(n+1),title+'（続き '+(n+1)+'）',section,order+n*.001,description+' 内部をスクロールして全文を収録。');}};
 try{await p.goto(origin+'/?block=moral&upload=0&debug=1&mic=0&'+query);await p.waitForFunction(()=>window.__pilot?.storeReady());await p.addStyleTag({content:'#goBadge{display:none!important}'});
 if(query==='go=practicecheck'){await cap('practice-check','練習での操作の確認','practice',640,'早い押下・遅い動き始め・途中で離す操作があった場合。今回は3項目すべてが対象の例。','#practiceCheckItems');for(const c of await p.locator('#practiceCheckItems input').all())await c.check();await p.locator('#practiceCheckItems').evaluate(e=>e.scrollTop=e.scrollHeight);await shot('practice-check-checked','練習での操作の確認 — 全項目確認済み','practice',641,'全項目を確認してチェックすると次へ進める。');}
 else if(query==='go=post&extra=other'){
   let otherPagePart;
   for(let i=1;i<=25;i++){
     const cur=p.locator('#postq .postpage.on');const other=cur.locator('#surveyProblems [data-val="other"]');
     if(await other.isVisible()){
       otherPagePart=await other.getAttribute('data-part');
       await other.click();await p.locator('#surveyFree').focus();await p.locator('#surveyFree').blur();await p.waitForTimeout(200);await cap('post-other-required',`使いにくかった点（${otherPagePart}）—「その他」を選択`,'post',1161,'「その他」を選ぶと、具体的な内容の入力が必須になります。','#postq .pad');
       await p.locator('#surveyFree').fill('画面確認用の回答です。');await p.locator('#surveyFree').blur();await cap('post-other-complete',`使いにくかった点（${otherPagePart}）— その他の内容を入力済み`,'post',1162,'内容を入力すると「次へ」が有効になります。入力は撮影用です。','#postq .pad');break;
     }
     for(const seg of await cur.locator('.seg').all())if(await seg.isVisible())await seg.locator('button').last().click();
     for(const checks of await cur.locator('.checks').all())if(await checks.isVisible()){const none=checks.locator('[data-none="1"]:visible');if(await none.count())for(const b of await none.all())await b.click();else await checks.locator('button').first().click();}
     for(const input of await cur.locator('input[type="number"]').all())await input.fill('7');
     if(await p.locator('#postNext').isDisabled())throw Error('Supplement survey page incomplete');await p.locator('#postNext').click();
   }
   for(const [id,s]of screenMap)if(id.startsWith('post-other-'))s.condition=`使いにくかった点（${otherPagePart}）の「その他」を選んだ場合`;save();
 } else{const kind=new URLSearchParams(query).get('notice'),base=({early:750,late:760,early_late:770})[kind],label=({early:'問題文の表示後すぐスタートした場合',late:'動き始めが3秒以上遅れた場合',early_late:'2つの条件が同時に該当した場合'})[kind];await cap('notice-'+kind,'本番中の案内 — '+label,'notice',base,'案内内の説明を読んで「確認して問題に戻る」を1回押すと、続きの問題へ戻ります。','#notice .pad');const before=await p.evaluate(()=>__pilot.buildPayload().trials.length);await p.locator('#noticeGo').click();await p.waitForFunction(()=>__pilot.activeScreen()==='task');const after=await p.evaluate(()=>({trials:__pilot.buildPayload().trials.length,acks:__pilot.buildPayload().device.noticeAcknowledgements.length}));if(after.trials!==before||after.acks!==1)throw Error('Notice acknowledgement did not return once without a trial');}
 }finally{await ctx.close();}
}
const extrasOnly=process.argv.includes('--extras'),consentRefresh=process.argv.includes('--consent-refresh');let refreshRecord=null;
if(extrasOnly||consentRefresh){
 const prior=JSON.parse(fs.readFileSync(path.join(out,'data/flow.json'),'utf8')),newSource={...report.source};
 const changed=[...new Set([...Object.keys(prior.source),...Object.keys(newSource)])].filter(f=>prior.source[f]!==newSource[f]);
 if(extrasOnly&&changed.length)throw Error('Source snapshot changed; rerun full capture');
 if(consentRefresh&&(changed.length!==1||changed[0]!=='consent.js'))throw Error('Consent refresh requires exactly consent.js to differ; found '+changed.join(', '));
 if(consentRefresh)refreshRecord={at:new Date().toISOString(),files:['consent.js'],previousSource:prior.source,source:newSource,screenIds:[],reason:'同意本文更新。他の撮影は変更前ソースで行い、同意モジュール以外一致を確認'};
 Object.assign(report,prior);report.source=newSource;
 for(const s of prior.screens){
   if(consentRefresh&&s.section==='consent'){
     for(const info of Object.values(s.images)){const target=path.resolve(out,info.src),imagesRoot=path.resolve(out,'images')+path.sep;if(!target.startsWith(imagesRoot)||!path.basename(target).startsWith('flow-consent-'))throw Error('Unexpected consent image path');if(fs.existsSync(target))fs.unlinkSync(target);}continue;
   }
   screenMap.set(s.id.replace(/^flow-/,''),s);
 }
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu']});
 try{
  const results=await Promise.allSettled(sizes.map(async size=>{try{return await (extrasOnly?branches(size,'go=post&extra=other'):suite(size));}catch(error){abortSync(error);throw error;}}));
  for(const r of results)if(r.status==='rejected'){console.error(r.reason);report.errors.push({error:r.reason.stack||String(r.reason)});}
  report.verification.screens=screenMap.size;report.verification.images=[...screenMap.values()].reduce((n,s)=>n+Object.keys(s.images).length,0);
  report.verification.complete=[...screenMap.values()].every(s=>sizes.every(z=>s.images[z.id]))&&report.errors.length===0&&report.remote.length===0;
  if(report.verification.complete&&!extrasOnly&&!consentRefresh)retireUnusedScreens();
  if(refreshRecord&&report.verification.complete){refreshRecord.screenIds=[...screenMap.values()].filter(s=>s.section==='consent').sort((a,b)=>a.order-b.order).map(s=>s.id);report.sourceRefreshes=[...(report.sourceRefreshes||[]),refreshRecord];}
  save();console.log(JSON.stringify({screens:report.verification.screens,images:report.verification.images,complete:report.verification.complete,errors:report.errors,remote:report.remote}));
  if(!report.verification.complete)process.exitCode=1;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
 // The live traversal above verifies progression; sample only the extra animation stills.
 if(report.verification.complete&&!extrasOnly&&!consentRefresh)require('node:child_process').execFileSync(process.execPath,[path.join(out,'capture-guided-visuals.cjs')],{stdio:'inherit',env:{...process.env,APP_ROOT:snapshotDir}});
})().catch(e=>{console.error(e);process.exitCode=1;});
