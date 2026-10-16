'use strict';
// Synthetic previous answers are the only injected state. All confirmation, notice,
// pause, consent, checkpoint and recovery actions use the production event handlers.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {appAssets,sourceManifest,transformAppScripts}=require('./lib/app-source.cjs');
const collector=require('./validate-collector.js').harness();
const root=path.resolve(process.env.APP_ROOT||__dirname),out=path.resolve(process.env.OUTPUT_DIR||path.join(__dirname,'reviews/2026-10-16-welcome-details'));
fs.mkdirSync(out,{recursive:true});
const assets=appAssets(root),source=sourceManifest(root),report={at:new Date().toISOString(),scope:'Local synthetic previous-answer fixtures, actual production controls and persistent browser storage, Chrome touch emulation only. No participant or production collector data.',source,checks:[],errors:[],remote:[],localCollector:[],screens:[],layouts:[],flows:[],limitations:['Not physical iPhone Safari.','Fixture observations do not test hardware gesture classification; existing trial and UI regression tests cover that separately.','Consent delivery uses only the in-process mock collector at this ephemeral localhost origin.']};
const baselineSource=process.env.BASELINE_APP_ROOT?sourceManifest(path.resolve(process.env.BASELINE_APP_ROOT)):null;
if(baselineSource)report.baselineSource=baselineSource;
function fixture(){
  const id=c=>c&&(c.itemId||c.id)||null;
  const snapshot=()=>({screen:document.querySelector('.screen.active')?.id,phase,resumeStage,records:records.length,practiceCount:records.filter(r=>r.phase==='practice').length,mainCount:records.filter(r=>r.phase==='main').length,trialIndex,totalMain,queueLength:queue.length,nextItem:id(queue[0]),cellItem:id(cell),practiceKeys:practiceCheckState?.keys.slice()||[],checked:practiceCheckState?.checked.slice()||[],practiceChecks:device.practiceChecks.slice(),notices:device.stopNotices.slice(),noticeAcknowledgements:device.noticeAcknowledgements.slice(),suppressed:device.stopNoticesSuppressed,breaks:device.breaks.slice(),pendingNotice,noticeKind,stemShownT,pendingMainStart,pendingInstructedStart,instructed:device.instructed?JSON.parse(JSON.stringify(device.instructed)):null,welcomeIndex:wcIdx,welcomeChecked:wcAgreed.map(a=>a.slice()),welcomeAgree:device.welcomeAgree,sessionId:device.sessionId,consentReceivedAt:device.consentReceivedAt,consent:device.consent?JSON.parse(JSON.stringify(device.consent)):null});
  function previous({keys=[],number=2,practice=false,noticeHistory=[]}={}){
    const fixturePriorOnset=stemShownT;
    if(CONFIG.uploadUrl!==null||GO)throw Error('Expected an ordinary isolated no-send local session');
    hideBanner();clearIdleCoach();coachHide();setCoach(null);if(dragTutState.active)DragTut.abort();
    if(ratingController.isReview())closeRatingReview();ratingController.endTutorial();dragTutState.done=true;
    recording=false;activePointerId=null;uiLocked=true;streak=number;records.length=0;invalidAttempts.length=0;
    pendingNotice=null;stopNoticeShown=false;pendingMainStart=false;pendingInstructedStart=false;practiceCheckState=null;practiceRuleFlags=[];
    for(const key of ['practiceChecks','stopNotices','noticeAcknowledgements','breaks'])device[key]=[];device.stopNoticesSuppressed=0;
    for(const kind of noticeHistory)device.stopNotices.push({kind,afterTrial:1,ms:100,syntheticOnly:true});
    phase=practice?'practice':'main';seqIndex=0;trialIndex=practice?0:number-1;mainStartedAt=practice?null:performance.now();mainElapsedAtEnd=null;
    let cells=practice?BLOCK.buildPractice(5):BLOCK.buildMain();
    if(!practice&&ATTN_ON&&BLOCK.ratings&&BLOCK.id!=='attn'){cells=insertDqs(cells);cells=cells.concat(shuffle([makeCheckCell('infreq'),makeCheckCell('imc')]));}
    totalMain=practice?0:cells.length;cell=cells[number-1];queue=cells.slice(number);
    const record=(c,n)=>({phase,block:'moral',syntheticOnly:true,index:n,stimulusType:BLOCK.stimulusType,...BLOCK.trialMeta(c),choiceSide:'left',ratings:{hesitation:{value:3,rt_ms:400},confidence:{value:3,rt_ms:400}},events:[],aborts:0,earlyStart:false,lateStart:false,preStartMs:5000,rt_ms:400});
    for(let n=1;n<number;n++)records.push(record(cells[n-1],n));trial=record(cell,number);trial.earlyStart=keys.includes('early');trial.lateStart=keys.includes('late');trial.preStartMs=trial.earlyStart?80:5000;trial.rt_ms=trial.lateStart?3400:400;records.push(trial);
    practiceRuleFlags=keys.includes('release')?['release']:[];pendingNotice=trial.earlyStart&&trial.lateStart?'early_late':trial.earlyStart?'early':trial.lateStart?'late':null;
    sizeCanvas();if(practice)completePracticeTrial();else finishRating();return {...snapshot(),fixturePriorOnset};
  }
  function instructed(){
    previous({number:8});hideBanner();clearIdleCoach();coachHide();setCoach(null);recording=false;activePointerId=null;uiLocked=true;pendingNotice=null;pendingMainStart=false;
    records.length=0;for(const c of BLOCK.buildMain())records.push({phase:'main',block:'moral',syntheticOnly:true,...BLOCK.trialMeta(c),choiceSide:'left',ratings:{hesitation:{value:3},confidence:{value:3}},events:[],aborts:0});
    phase='main';showInstructedIntro();return snapshot();
  }
  window.SessionGuidanceProbe=Object.freeze({previous,instructed,blockIntro:()=>{showBlockIntro();return snapshot();},snapshot,rules:()=>JSON.parse(JSON.stringify(PRACTICE_RULES)),notices:()=>({...NOTICE_HTML}),readingWait:text=>minReadMs(text)});
}
let injected=0;transformAppScripts(assets,(text,file)=>{const marker='  // 自動検証用フック (?debug=1';if(!text.includes(marker))return text;injected++;return text.replace(marker,'  ('+fixture.toString()+')();\n'+marker);});
if(injected!==1)throw Error('Expected exactly one private test-only fixture injection');
const server=http.createServer(async(req,res)=>{if(req.method==='POST'&&new URL(req.url,'http://localhost').pathname==='/collect'){let raw='';for await(const part of req)raw+=part;const received=JSON.parse(raw);report.localCollector.push({kind:received.kind,sessionId:received.device?.sessionId});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(collector.raw(raw)));return;}const pathname=new URL(req.url,'http://localhost').pathname,key=pathname==='/'?'/index.html':pathname,body=assets.get(key);if(req.method!=='GET'||!body){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.css':'text/css','.js':'application/javascript'})[path.extname(key)]||'application/octet-stream');res.end(body);});
let browser,origin;
const check=(name,value,detail)=>{report.checks.push({name,pass:!!value,...(detail===undefined?{}:{detail})});console.log((value?'PASS ':'FAIL ')+name);if(!value)throw Error(name);};
const state=p=>p.evaluate(()=>SessionGuidanceProbe.snapshot());
const cardAppearance=new Map();
const appearance=(p,selector)=>p.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return{border:s.borderTopWidth,color:s.borderTopColor,radius:s.borderTopLeftRadius,background:s.backgroundColor};});
const data=p=>p.evaluate(()=>JSON.parse(JSON.stringify(__pilot.buildPayload())));
async function settle(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function open(size,extra='welcome=0'){
 const ctx=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'});
 await ctx.route('**/*',route=>{const req=route.request();if(new URL(req.url()).origin===origin&&(req.method()==='GET'||req.method()==='POST'&&new URL(req.url()).pathname==='/collect'))return route.continue();report.remote.push({url:req.url(),method:req.method()});return route.abort();});
 const p=await ctx.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto(origin+'/?block=moral&debug=1&'+(extra.includes('uploadurl=')?'':'upload=0&')+'mic=0&devguard=0&zoomguard=0&tut=0&rtut=0&read=0&practice=0&instr=0&'+extra);
 await p.waitForFunction(()=>window.__pilot?.storeReady());return{ctx,p};
}
async function fill(p){await p.locator('#pid').fill('合成画面確認');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic phone');await p.locator('#sexSeg [data-val="na"]').tap();await p.locator('#handSeg [data-val="right"]').tap();await p.locator('#goPractice').tap();}
async function tap(p,selector){const item=p.locator(selector);await item.scrollIntoViewIfNeeded();await item.tap();await settle(p);}
async function shot(p,size,name){const file=size.width+'x'+size.height+'/'+name+'.png';fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});await p.screenshot({path:path.join(out,file)});report.screens.push({file});}
async function layout(p,label,selectors,{noScroll=false}={}){
 await settle(p);const g=await p.evaluate(selectors=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};return{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,boxes:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({selector,...rect(e),scrollX:e.scrollWidth-e.clientWidth,scrollY:e.scrollHeight-e.clientHeight,overflowY:getComputedStyle(e).overflowY})))};},selectors);
 report.layouts.push({label,...g});check(label+' 横のはみ出し・画面外の操作なし',g.documentWidth<=g.width+1&&g.boxes.every(r=>r.x>=-1&&r.right<=g.width+1&&r.y>=-1&&r.bottom<=g.height+1&&r.scrollX<=2),g);
 if(noScroll)check(label+' 内部スクロールなし',g.boxes.every(r=>r.scrollY<=2),g);return g;
}
async function welcome(p,size){
 const label=size.width+'x'+size.height;let anchor,nextAnchor,normalNav;const heights=[];
 for(let n=0;n<7;n++){
  check(label+' 説明'+(n+1)+' 見出しとページ順序',(await state(p)).screen==='welcome'&&(await state(p)).welcomeIndex===n&&await p.locator('#wcStep').innerText()==='はじめに '+(n+1)+' / 7');
  const dots=await p.locator('#wcDots').evaluate(e=>({count:e.querySelectorAll('i').length,active:[...e.querySelectorAll('i')].map((dot,i)=>dot.classList.contains('a')?i:-1).filter(i=>i>=0),role:e.getAttribute('role'),label:e.getAttribute('aria-label')}));
  check(label+' 説明'+(n+1)+' 7ドットと現在位置が一致',dots.count===7&&dots.active.join(',')===String(n)&&dots.role==='img'&&dots.label==='7ページ中'+(n+1)+'ページ目',dots);
  const g=await layout(p,label+' 説明'+(n+1),['#wcBody','#wcCardArea','#wcNav','#wcStep','#wcDots','#wcNext'],{noScroll:true});const box=g.boxes.find(b=>b.selector==='#wcBody'),area=g.boxes.find(b=>b.selector==='#wcCardArea'),nav=g.boxes.find(b=>b.selector==='#wcNav'),next=g.boxes.find(b=>b.selector==='#wcNext');heights.push(box.h);
  check(label+' 説明'+(n+1)+' BOXは利用可能領域の中央',Math.abs(box.y+box.h/2-(area.y+area.h/2))<=1&&Math.abs(box.x+box.w/2-size.width/2)<=1&&box.y>=area.y-1&&box.bottom<=area.bottom+1,{box,area});
  if(!anchor){anchor={box,nav};nextAnchor=next;}else{
   check(label+' 説明'+(n+1)+' BOX中心と横幅を固定',Math.abs(box.y+box.h/2-(anchor.box.y+anchor.box.h/2))<=1&&['x','w'].every(k=>Math.abs(box[k]-anchor.box[k])<=1),{initial:anchor.box,current:box});
   normalNav??=nav;
   check(label+' 説明'+(n+1)+' ナビ高さ位置と通常幅・ボタン寸法を固定',['y','h'].every(k=>Math.abs(nav[k]-anchor.nav[k])<=1)&&['x','w'].every(k=>Math.abs(nav[k]-normalNav[k])<=1)&&['y','w','h'].every(k=>Math.abs(next[k]-nextAnchor[k])<=1),{initialNav:anchor.nav,normalNav,currentNav:nav,initialNext:nextAnchor,currentNext:next});
  }
  const cardParts=await p.locator('#wcBody').evaluate(e=>{const rect=x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};},step=e.querySelector('#wcStep'),heading=e.querySelector('#wcHeading'),dots=e.querySelector('#wcDots'),first=dots.querySelector('i'),last=dots.querySelector('i:last-child');return{first:e.firstElementChild.id,last:e.lastElementChild.id,step:rect(step),stepAlign:getComputedStyle(step).textAlign,heading:rect(heading),dots:rect(dots),firstDot:rect(first),lastDot:rect(last),previous:rect(dots.previousElementSibling),paddingRight:parseFloat(getComputedStyle(e).paddingRight)};});
  check(label+' 説明'+(n+1)+' メタはBOX内の左上',cardParts.first==='wcStep'&&cardParts.step.y>=box.y&&cardParts.step.bottom<=cardParts.heading.y+1&&Math.abs(cardParts.step.x-cardParts.heading.x)<=1&&['left','start'].includes(cardParts.stepAlign),cardParts);
  check(label+' 説明'+(n+1)+' ドットはBOX右下で本文・チェックと重ならない',cardParts.last==='wcDots'&&cardParts.previous.bottom<=cardParts.firstDot.y+1&&cardParts.firstDot.y>=box.y&&cardParts.lastDot.bottom<=box.bottom+1&&Math.abs(cardParts.lastDot.right-(box.right-cardParts.paddingRight-1))<=3&&cardParts.firstDot.x>=box.x+box.w/2,cardParts);
  check(label+' 説明'+(n+1)+' BOXとナビは重ならない',box.bottom<=nav.y+1,g);
  if(n===4){const paragraphs=await p.locator('#wcBody .wc-content > p').allInnerTexts();check(label+' 氏名とデータの原文3段落を保持',JSON.stringify(paragraphs)===JSON.stringify(['氏名は、参加確認と謝礼のお支払いに関する照合に使用します。','研究の分析には、氏名を研究用IDに置き換えたデータを使用します。','研究成果に氏名を掲載することはありません。']),paragraphs);}
  if(n===0)check(label+' 最初の次へは中央で戻るを出さない',Math.abs(next.x+next.w/2-size.width/2)<=1&&!await p.locator('#wcPrev').isVisible(),next);
  else{const prev=await p.locator('#wcPrev').boundingBox();check(label+' 2枚目以降は戻ると次へを分けて表示',!!prev&&await p.locator('#wcPrev').isVisible()&&prev.x+prev.width<=next.x+1,{prev,next});}
  await shot(p,size,'welcome-'+(n+1));const checks=p.locator('#wcAgree button'),count=await checks.count();
  if(count){check(label+' 説明'+(n+1)+' 全確認まで次へ無効',await p.locator('#wcNext').isDisabled());for(let i=0;i<count;i++){await checks.nth(i).tap();check(label+' 説明'+(n+1)+' 確認'+(i+1)+'のゲート',await p.locator('#wcNext').isEnabled()===(i===count-1));}
   await tap(p,'#wcPrev');await tap(p,'#wcNext');check(label+' 説明'+(n+1)+' 前へ戻っても確認を保持',await p.locator('#wcAgree button.sel').count()===count&&await p.locator('#wcNext').isEnabled());
   await p.locator('#wcAgree button').first().tap();check(label+' 説明'+(n+1)+' チェック解除で再び次へ無効',await p.locator('#wcNext').isDisabled());await p.locator('#wcAgree button').first().tap();
  }
  await tap(p,'#wcNext');
 }
 check(label+' 短い説明はBOXの高さも短くなる',Math.max(...heights)-Math.min(...heights)>20,heights);
 const s=await state(p);check(label+' 7枚後に入力へ進み確認項目数を保持',s.screen==='intro'&&s.welcomeAgree.items===5&&s.welcomeAgree.pages===2,s.welcomeAgree);
 const exposures=(await data(p)).device.instructionExposure.filter(e=>e.screen==='welcome');
 check(label+' 分割した2枚とも同じ版で表示を記録',exposures.length===2&&exposures[0].page===2&&exposures[1].page===3&&typeof exposures[0].version==='string'&&exposures[0].version===exposures[1].version,exposures);
}
async function ruleMeaning(p){
 const rules=await p.evaluate(()=>SessionGuidanceProbe.rules()),notices=await p.evaluate(()=>SessionGuidanceProbe.notices());const plain=x=>x.replace(/<[^>]*>/g,'');
 const early=plain(rules.early.html),late=plain(rules.late.html),release=plain(rules.release.html);
 check('練習確認の3ルールだけを保持',Object.keys(rules).join(',')==='early,late,release');
 check('読む・状況理解・決める前のスタートを保つ',/問題文/.test(early)&&/状況/.test(early)&&/分か/.test(early)&&/答えを決める前/.test(early),early);
 check('3秒でスタートを出る目安は見出しに、回答の期限なしは本文に保つ',/3秒以内/.test(rules.late.title)&&/スタートを出る/.test(rules.late.title)&&/回答の(?:制限時間|期限)では/.test(late),rules.late);
 check('答えが決まるのを待たない行動と焦らず進む案内を保つ',/答えが決まるのを待たず/.test(late)&&/動き始め/.test(late)&&/自分のペースで焦らず進めてください/.test(late),late);
 check('短文化で削除した接触後3秒の重複文は本文へ戻さない',!/触れてから3秒以内/.test(late),late);
 const guided=await p.evaluate(()=>({range:PILOT_GUIDED_TUTORIAL.steps.find(s=>s.id==='motor-range'),checks:PILOT_GUIDED_TUTORIAL.checks}));check('内側どこでもの説明は範囲実演と復習に保持',/内側/.test(guided.range.copy)&&/どこでも/.test(guided.range.copy)&&guided.checks.some(q=>/枠の内側ならどこでも/.test(q.right)),guided);
 check('練習の短い確認は離さず運び中で離す行動に絞る',/離さず/.test(release)&&/ボックスの中で離/.test(release)&&!/内側ならどこ/.test(release),release);
 check('答えを決める前に動き始める文を明示して強調',/<b class="movement-action">/.test(rules.late.html));
 check('本番の前問の事実は行動カードより前へ配置',Object.values(notices).every(html=>html.indexOf('notice-observation')>=0&&html.indexOf('notice-observation')<html.indexOf('notice-rule-card')));
 check('短い説明にも行動の太字を保つ',Object.values(rules).every(r=>/<b[ >]/.test(r.html)),rules);
 check('本番注意はearly/late/combinedの3種を保持',['early','late','early_late'].every(k=>typeof notices[k]==='string'&&notices[k].includes('<b')),notices);
 report.copy={rules,notices};
}
async function practice(p,size,keys,number=2){
 const name='practice-'+(number===5?'last':keys.length===3?'all':keys[0]),label=size.width+'x'+size.height+' '+name;
 const before=await p.evaluate(args=>SessionGuidanceProbe.previous(args),{practice:true,number,keys});check(label+' 対象ルールだけ確認に出す',before.screen==='practicecheck'&&before.practiceKeys.join(',')===keys.join(',')&&before.practiceCount===number,before);
 check(label+' 未確認では進めない',await p.locator('#practiceCheckGo').isDisabled());
 check(label+' 共通タイトルと対象数のカード',await p.locator('#practicecheck h1').innerText()==='操作のポイントの確認'&&await p.locator('#practiceCheckItems .rule-check').count()===keys.length);
 cardAppearance.set(size.width,await appearance(p,'#practiceCheckItems .rule-check'));
 await shot(p,size,name);await layout(p,label,['#practicecheck .pad','#practiceCheckItems','#practiceCheckGo'],{noScroll:true});
 for(let n=0;n<keys.length;n++){await p.locator('#practiceCheckItems input[data-rule="'+keys[n]+'"]').check();check(label+' 全項目確認のゲート'+(n+1),await p.locator('#practiceCheckGo').isEnabled()===(n===keys.length-1));}
 await p.locator('#practiceCheckItems input').first().uncheck();check(label+' 確認解除を反映',await p.locator('#practiceCheckGo').isDisabled());await p.locator('#practiceCheckItems input').first().check();await tap(p,'#practiceCheckGo');
 const after=await state(p);check(label+' 確認の記録を1回だけ保存',after.practiceChecks.length===1&&after.practiceChecks[0].rules.join(',')===keys.join(',')&&after.practiceChecks[0].recordIndex===number-1&&after.records===number,after);
 if(number===5){check(label+' 6問目を足さず練習完了で止まる',after.screen==='blockintro'&&after.pendingMainStart&&after.practiceCount===5&&after.phase==='practice',after);await layout(p,label+' 完了',['#blockintroBody','#blockintroGo']);await shot(p,size,'practice-complete');await tap(p,'#blockintroGo');check(label+' 本人が進めて本番が始まる',(await state(p)).screen==='task'&&(await state(p)).phase==='main'&&(await state(p)).mainCount===0&&(await state(p)).totalMain===55);}
 else check(label+' 次の練習へ1回進む',after.screen==='task'&&after.cellItem===before.nextItem&&after.practiceCount===number&&after.queueLength===before.queueLength-1,after);
 report.flows.push({name,size,before,after});
}
async function mainNotice(p,size,keys,{number=8,history=[]}={}){
 const kind=keys.length===2?'both':keys[0]||'clear',name=(number===20?'break-':'main-')+kind+(history.length?'-history-'+history.length+'-'+history[0]:''),label=size.width+'x'+size.height+' '+name;
 const before=await p.evaluate(args=>SessionGuidanceProbe.previous(args),{practice:false,number,keys,noticeHistory:history});let s=before;
 if(number===20){check(label+' 20/55で休憩を先に示す',s.screen==='break'&&s.trialIndex===20&&s.totalMain===55&&s.breaks.length===0&&await p.locator('#breakInfo').innerText().then(t=>t.includes('20 / 55')),s);await layout(p,label,['#break .session-transition-card','#breakContinue']);await shot(p,size,name);await tap(p,'#breakContinue');s=await state(p);check(label+' 休憩の確認を1回だけ記録',s.breaks.length===1&&s.breaks[0].atTrial===20,s.breaks);}
 const remaining=keys.filter(key=>history.filter(k=>k===key||k==='early_late').length<5),expect=remaining.length>0,expectedKind=remaining.length===2?'early_late':remaining[0];
 if(expect){check(label+' 次問の前に対象の注意を示す',s.screen==='notice'&&s.notices.length===history.length&&s.noticeKind===expectedKind,s);
  check(label+' 共通タイトルと対象数の注意カード',await p.locator('#notice h1').innerText()==='操作のポイントの確認'&&await p.locator('#noticeText .notice-rule-card').count()===remaining.length);
  const noticeAppearance=await appearance(p,'#noticeText .notice-rule-card');check(label+' 練習と注意のカード外観を統一',JSON.stringify(noticeAppearance)===JSON.stringify(cardAppearance.get(size.width))&&parseFloat(noticeAppearance.radius)>0&&parseFloat(noticeAppearance.border)>0,noticeAppearance);
  const observation=await p.locator('#notice .notice-observation').evaluate(e=>{const rect=x=>{const r=x.getBoundingClientRect();return{y:r.y,bottom:r.bottom};},h=document.querySelector('#notice h1'),card=document.querySelector('#notice .notice-rule-card');return{heading:rect(h),observation:rect(e),card:rect(card),font:parseFloat(getComputedStyle(e).fontSize),bodyFont:parseFloat(getComputedStyle(card.querySelector('.notice-rule-body')).fontSize),titleFont:parseFloat(getComputedStyle(card.querySelector('.notice-rule-title')).fontSize),beforeCard:!!(e.compareDocumentPosition(card)&Node.DOCUMENT_POSITION_FOLLOWING)};});
  check(label+' 前問の記録はタイトル直下・カード前',observation.beforeCard&&observation.heading.bottom<=observation.observation.y+1&&observation.observation.bottom<=observation.card.y+1,observation);
  check(label+' 前問の記録はカード本文以上の文字サイズ',observation.font>=observation.bodyFont&&observation.font>observation.titleFont,observation);
  await layout(p,label+' 注意',['#notice .pad','#noticeText','#noticeGo','#notice .notice-observation','#notice .notice-rule-card'],{noScroll:true});await shot(p,size,number===8&&!history.length?'main-'+kind:name+'-notice');check(label+' 注意へ入る前から次問の時計を始めていない',s.stemShownT===before.fixturePriorOnset,{before:before.fixturePriorOnset,after:s.stemShownT});check(label+' 新たな時間待機や別操作を要求しない',await p.locator('#noticeGo').isEnabled()&&await p.locator('#notice button').count()===1);const onset=s.stemShownT;await p.waitForTimeout(60);check(label+' 注意中に次問の読解時計を始めない',(await state(p)).stemShownT===onset);const at=await p.evaluate(()=>performance.now());await tap(p,'#noticeGo');s=await state(p);check(label+' 確認後に時計を始め記録する',s.screen==='task'&&s.stemShownT>=at&&s.notices.length===history.length+1&&s.noticeAcknowledgements.length===1,s);}
 else check(label+' 不要・上限後の注意を出さない',s.screen==='task'&&s.noticeAcknowledgements.length===0&&s.notices.length===history.length,s);
 if(history.length)check(label+' 種類別上限で各1回の抑止を記録',s.suppressed===keys.length-remaining.length,s);
 check(label+' 本番の回答と問数を増やさない',s.records===number&&s.mainCount===number&&s.trialIndex===number&&s.totalMain===55,s);report.flows.push({name,size,before,after:s});
}
async function reloadResume(p,label){await p.evaluate(()=>__pilot.recoveryCheckpoint());await p.waitForTimeout(250);await p.reload();await p.waitForFunction(()=>window.__pilot?.storeReady()&&__pilot.activeScreen()==='resume');await tap(p,'#resumeGo');await p.waitForFunction(()=>__pilot.activeScreen()!=='resume');await settle(p);check(label+' 保存から実際に再開できる',(await state(p)).sessionId!=null);}
async function recovery(p){
 await p.evaluate(()=>SessionGuidanceProbe.previous({practice:true,number:2,keys:['early','late','release']}));await p.locator('#practiceCheckItems input[data-rule="early"]').check();const a=await state(p);await reloadResume(p,'練習確認');let s=await state(p);check('再読込で確認済み1項目と未確認2項目をそのまま戻す',s.screen==='practicecheck'&&s.checked.join(',')==='early'&&s.practiceKeys.join(',')==='early,late,release'&&s.records===a.records&&s.sessionId===a.sessionId&&await p.locator('#practiceCheckGo').isDisabled(),s);
 await p.evaluate(()=>SessionGuidanceProbe.previous({number:8,keys:['early','late']}));const b=await state(p);await reloadResume(p,'本番注意');s=await state(p);check('再読込で未確認の本番注意を再表示し確認を重ねない',s.screen==='notice'&&s.noticeKind==='early_late'&&s.notices.length===0&&s.noticeAcknowledgements.length===0&&s.records===b.records&&s.sessionId===b.sessionId,s);await tap(p,'#noticeGo');check('復旧した注意も1回だけ記録',(await state(p)).notices.length===1&&(await state(p)).noticeAcknowledgements.length===1);
 await p.evaluate(()=>SessionGuidanceProbe.previous({number:20,keys:['early','late']}));await reloadResume(p,'休憩');s=await state(p);check('再読込で20問目の休憩を保つ',s.screen==='break'&&s.trialIndex===20&&s.totalMain===55&&s.breaks.length===0,s);await tap(p,'#breakContinue');check('復旧した休憩も前問の注意を経由',(await state(p)).screen==='notice'&&(await state(p)).breaks.length===1);await tap(p,'#noticeGo');check('復旧後も次問へ進む',(await state(p)).screen==='task'&&(await state(p)).records===20);
}
async function instructed(p,size){
 const label=size.width+'x'+size.height+' 追加10問';let before=await p.evaluate(()=>SessionGuidanceProbe.instructed());
 check(label+' 説明BOX専用classを付け練習完了classを外す',before.screen==='blockintro'&&before.pendingInstructedStart&&await p.locator('#blockintroBody').evaluate(e=>e.classList.contains('instructed-intro-card')&&!e.classList.contains('practice-complete-card')));
 const copy=await p.locator('#blockintroBody').innerText();check(label+' 本文の指示と謝礼・振り返りなしを保つ',['問題文も選択肢も、読まずに進めてください。','内容を考えて答えを選ばず、適当に指を運んでください。','謝礼には影響しません。','振り返りはありません。'].every(t=>copy.includes(t)),copy);
 await layout(p,label,['#blockintroBody','#blockintroGo'],{noScroll:true});await shot(p,size,'instructed-intro');
 const style=await appearance(p,'#blockintroBody');check(label+' BOXには枠と角丸がある',parseFloat(style.border)>0&&parseFloat(style.radius)>0,style);
 check(label+' 進むまで問題を開始しない',before.phase==='main'&&before.instructed==null&&await p.locator('#blockintroGo').isEnabled(),before);
 await p.evaluate(()=>SessionGuidanceProbe.blockIntro());check(label+' 通常パート説明へ追加用classを持ち越さない',await p.locator('#blockintroBody').evaluate(e=>!e.classList.contains('instructed-intro-card')&&!e.classList.contains('practice-complete-card')));
 before=await p.evaluate(()=>SessionGuidanceProbe.instructed());await tap(p,'#blockintroGo');const started=await state(p);
 check(label+' 本人の進行で10問を作り最初の課題へ',started.screen==='task'&&started.phase==='instructed'&&!started.pendingInstructedStart&&started.instructed?.n===10&&started.queueLength===9&&started.records===before.records,started);
 if(size.width===375){
  const cdp=await p.context().newCDPSession(p),start=await p.locator('#start').boundingBox();const from={x:start.x+start.width/2,y:start.y+start.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});const target=await p.locator('#choiceA').boundingBox(),to={x:target.x+target.width/2,y:target.y+target.height/2};
  for(let n=1;n<=18;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/18,y:from.y+(to.y-from.y)*n/18}]});await p.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(p);const answered=await state(p);
  check(label+' 実際に回答しても評定を挟まず次問へ進む',answered.screen==='task'&&answered.phase==='instructed'&&answered.records===started.records+1&&answered.queueLength===8,answered);
 }
 await p.evaluate(()=>SessionGuidanceProbe.previous({practice:true,number:5,keys:[]}));check(label+' 練習完了へ追加用classを持ち越さない',(await state(p)).screen==='blockintro'&&await p.locator('#blockintroBody').evaluate(e=>e.classList.contains('practice-complete-card')&&!e.classList.contains('instructed-intro-card')));
 await p.evaluate(()=>SessionGuidanceProbe.blockIntro());check(label+' 通常パートへ練習完了classも持ち越さない',await p.locator('#blockintroBody').evaluate(e=>!e.classList.contains('instructed-intro-card')&&!e.classList.contains('practice-complete-card')));
 report.flows.push({name:'instructed-intro',size,before,after:started});
}
async function consent(size){
 const label=size.width+'x'+size.height+' 電子同意';const {ctx,p}=await open(size,'welcome=0&consent=1&uploadurl=/collect');try{
  await fill(p);await p.waitForFunction(()=>__pilot.activeScreen()==='consent');
  check(label+' 見出しで参加の同意だと分かる',await p.locator('#consent > .pad > h1').innerText()==='研究への参加の同意');
  await layout(p,label,['#consent h1','#consentIdentity','#consentDocument','#consentStatus','#consentChoice','#consentGo','#consent .consent-actions']);await shot(p,size,'consent-start');
  check(label+' 末尾未到達では確認不可',await p.locator('#consentCheck').isDisabled()&&await p.locator('#consentGo').isDisabled());
  await p.locator('#consentDocument').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));});await p.locator('#consentCheck').check();
  check(label+' 末尾到達と本人の確認後だけ進める',await p.locator('#consentGo').isEnabled());
  if(size.width===375){await tap(p,'#consentGo');await p.waitForFunction(()=>__pilot.activeScreen()==='task');const accepted=await state(p);check('電子同意本文と本人の同意を保持',accepted.consent?.accepted===true&&accepted.consent.scrolledToEnd===true&&accepted.consent.name==='合成画面確認',accepted.consent);await reloadResume(p,'同意後の課題');check('保存復帰で同意日時と本文を置き換えない',(await state(p)).screen==='task'&&(await state(p)).sessionId===accepted.sessionId&&(await state(p)).consentReceivedAt===accepted.consentReceivedAt&&typeof accepted.consentReceivedAt==='string'&&JSON.stringify((await state(p)).consent)===JSON.stringify(accepted.consent));}
 }finally{await ctx.close();}
}
(async()=>{if(baselineSource)check('電子同意の文書・同意処理sourceを前版から保持',source['consent.js']===baselineSource['consent.js']);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const size of [{width:375,height:700},{width:402,height:759},{width:440,height:841}]){const {ctx,p}=await open(size,'welcome=1');try{await welcome(p,size);await fill(p);await p.waitForFunction(()=>__pilot.activeScreen()==='task');if(size.width===375)await ruleMeaning(p);for(const keys of [['early'],['late'],['release'],['early','late','release']])await practice(p,size,keys);await practice(p,size,['early','late','release'],5);for(const keys of [['early'],['late'],['early','late'],[]])await mainNotice(p,size,keys);await mainNotice(p,size,[],{number:20});await mainNotice(p,size,['early','late'],{number:20});await mainNotice(p,size,['early','late'],{number:20,history:Array(5).fill('early_late')});if(size.width===375){await mainNotice(p,size,['early','late'],{history:Array(4).fill('early_late')});await mainNotice(p,size,['early','late'],{history:Array(5).fill('early')});await mainNotice(p,size,['early','late'],{history:Array(5).fill('late')});await recovery(p);}await instructed(p,size);}finally{await ctx.close();}await consent(size);}
 check('ブラウザ例外なし',report.errors.length===0,report.errors);check('外部通信なし',report.remote.length===0,report.remote);check('POSTは架空同意1件をlocalhost mock collectorへだけ送る',report.localCollector.length===1&&report.localCollector[0].kind==='consent',report.localCollector);
})().catch(e=>{report.exception=e.stack;console.error(e);if(!report.checks.some(c=>!c.pass))report.checks.push({name:'試験完了',pass:false,detail:e.message});}).finally(async()=>{if(browser)await browser.close();if(server.listening)await new Promise(r=>server.close(r));report.sourceUnchanged=JSON.stringify(sourceManifest(root))===JSON.stringify(source);if(!report.sourceUnchanged)report.checks.push({name:'固定配布資産のrun中安定',pass:false});report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.length-report.passed;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,out}));process.exitCode=report.failed?1:0;});
