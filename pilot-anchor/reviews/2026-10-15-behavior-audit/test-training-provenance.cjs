'use strict';
// Synthetic normal debug sessions, actual UI and local IndexedDB. No GO, live collector, Drive, or participant files.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const app=path.resolve(__dirname,'../..'),before=path.join(app,'reviews/2026-10-15-guided-release/before');
const output=path.join(__dirname,'training-provenance-results.json'),files=require(path.join(app,'screen-gallery/source-assets.cjs'));
const hash=s=>crypto.createHash('sha256').update(s.toString().replace(/\r\n/g,'\n')).digest('hex');
const sources=root=>Object.fromEntries(files.filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
const report={checkedAt:new Date().toISOString(),scope:'旧 ui19 と現行の正常debugローカル合成セッション。DOM操作、Chrome touch emulation、IndexedDB/reload。実機 Safari、実 GAS/Drive、参加者原本は未使用。',source:sources(app),baselineSource:sources(before),checks:[],observations:[],errors:[],blockedRequests:[],scenarios:{}};
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,...(pass?{}:{detail})});console.log((pass?'PASS ':'FAIL ')+name);assert.ok(pass,name);};
const equal=(name,a,b)=>{try{assert.deepEqual(a,b);}catch(e){check(name,false,{actual:a,expected:b});}check(name,true);};
let served='current',browser,server;
const get=p=>p.evaluate(()=>JSON.parse(JSON.stringify({screen:__pilot.activeScreen(),state:__pilot.recoveryState(),help:__pilot.helpState(),payload:__pilot.buildPayload(),mainMs:__pilot.mainElapsedMs()})));
async function checkpointReload(p){check(served+' checkpoint accepted',await p.evaluate(()=>__pilot.recoveryCheckpoint()));await p.waitForTimeout(300);await p.reload();await p.waitForFunction(()=>window.__pilot?.activeScreen()==='resume');await p.locator('#resumeGo').click();await p.waitForFunction(()=>__pilot.activeScreen()!=='resume');await p.waitForTimeout(120);}
async function fill(p){await p.locator('#pid').fill('synthetic training provenance');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic touch phone');await p.locator('#sexSeg [data-val="na"]').click();await p.locator('#handSeg [data-val="right"]').click();await p.locator('#goPractice').click();await p.waitForFunction(()=>__pilot.recoveryState().stage==='dragTutorial');}
async function drag(p,{motor=false,old=false,outside=false}={}){
 const pts=await p.evaluate(({motor,old,outside})=>{const point=e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}},s=point(document.getElementById('start'));let t;
  if(motor&&old&&__pilot.helpState().drag.index===6){const r=document.getElementById('surface').getBoundingClientRect(),shift=parseFloat(getComputedStyle(document.getElementById('task')).getPropertyValue('--tut-shift'))||0;t={x:r.x+r.width*.5,y:r.y+r.height*.34+shift};}
  else t=point(document.getElementById(motor&&!old?'tutSingleTarget':'choiceA'));
  if(outside)t={x:14,y:s.y-75};return[s,t];},{motor,old,outside});
 const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pts[0]]});for(let i=1;i<=18;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pts[0].x+(pts[1].x-pts[0].x)*i/18,y:pts[0].y+(pts[1].y-pts[0].y)*i/18}]});await p.waitForTimeout(12);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await p.waitForTimeout(80);
}
const dwell=(logs,old,key)=>logs.filter(e=>e.kind==='drag'&&Number.isFinite(e.ms)&&(old?e.step===key+1: e.event==='stay'&&e.stepId===key));
async function waitRatingReady(p){await p.waitForFunction(()=>__pilot.activeScreen()==='rating');await p.waitForTimeout(420);}
async function normalRatings(p){await waitRatingReady(p);await p.locator('#qitem-hesitation button[data-val="2"]').click();await p.locator('#ratingNext').click();await p.locator('#qitem-confidence button[data-val="4"]').click();await p.locator('#ratingSubmit').click();await p.waitForTimeout(100);}
(async()=>{
 server=http.createServer((req,res)=>{const root=served==='ui19'?before:app,rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname),fp=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!fp.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(fp)]||'application/octet-stream');res.end(fs.readFileSync(fp));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 for(const version of ['ui19','current']){
  served=version;const old=version==='ui19',ctx=await browser.newContext({viewport:{width:375,height:700},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin&&r.request().method()==='GET')return r.continue();report.blockedRequests.push({method:r.request().method(),url:r.request().url()});return r.abort();});
  const p=await ctx.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push({version,message:e.message}));p.on('dialog',d=>d.accept());
  await p.goto(origin+'/?block=moral&debug=1&upload=0&devguard=0&zoomguard=0&mic=0&readgate=0&minread=0&welcome=0&read=0&attn=0&instr=0&nmain=2');await p.waitForFunction(()=>window.__pilot?.storeReady());
  check(version+' normal session has no GO and no upload endpoint',await p.evaluate(()=>!new URLSearchParams(location.search).has('go')&&__pilot.uploadUrl()===null));await fill(p);
  const initial=await get(p),sessionId=initial.payload.device.sessionId,definition=initial.payload.device.moralPracticeDefinition,visited=[],exposures=[];
  check(version+' starts before main, no raw trials',initial.state.stage==='dragTutorial'&&initial.mainMs===null&&initial.payload.trials.length===0&&initial.payload.invalidAttempts.length===0);
  for(let guard=0;guard<35;guard++){
   const s=await get(p);if(s.state.stage!=='dragTutorial')break;
   const h=s.help.drag,key=old?h.index:h.stepId;visited.push(key);
   const latest=s.payload.device.instructionExposure.at(-1);exposures.push(latest);
   check(version+' actual drag page exposure '+key,latest.screen==='dragTutorial'&&latest.step===h.index+1&&latest.version===(old?'2026-10-15-ui19':'2026-10-15-ui20')&&(old||latest.stepId===h.stepId));
   await p.waitForTimeout(Math.max(420,h.lockRemainingMs+50));
   const motor=old?[6,7].includes(h.index):h.stepId==='motor';
   if(motor){
    check(version+' motor completion initially gates progress '+key,!(await get(p)).help.drag.handsDone);
    await p.locator('#tutPopNext').evaluate(e=>e.click());check(version+' motor cannot advance before operating '+key,(await get(p)).help.drag.index===h.index);
    await drag(p,{motor:true,old,outside:true});const fail=await get(p);
    check(version+' motor outside release remains incomplete '+key,!fail.help.drag.handsDone&&await p.locator('#tutHint').isVisible());
    check(version+' motor failure does not create measured raw '+key,fail.payload.trials.length===0&&fail.payload.invalidAttempts.length===0);
    await drag(p,{motor:true,old});await p.waitForFunction(()=>__pilot.helpState().drag.handsDone);const success=await get(p);
    check(version+' motor success retained in snapshot '+key,old?success.state.preMain.drag.completed.includes(h.index):success.state.preMain.drag.completed.includes('motor'));
    check(version+' motor success does not create measured raw '+key,success.payload.trials.length===0&&success.payload.invalidAttempts.length===0);
   }
   if(!old&&h.stepId==='rule-check'){
    const q0=await get(p),quizOrder=q0.state.preMain.drag.quiz.orders;
    check('current seven quiz questions begin with null selections and zero attempts',q0.state.preMain.drag.quiz.selections.every(v=>v===null)&&q0.state.preMain.drag.quiz.attempts.every(v=>v===0)&&quizOrder.length===7&&quizOrder.every((a,i)=>new Set(a).size===a.length&&a.length===3));
    for(let i=0;i<7;i++){
     const correct=await p.evaluate(i=>PILOT_GUIDED_TUTORIAL.checks[i].correctIndex,i),wrong=(correct+1)%3;
     await p.locator('#tutQuiz button[data-answer-index="'+wrong+'"]').click();let q=await get(p);
     check('current quiz '+(i+1)+' wrong answer gates next',await p.locator('#tutPopNext').isDisabled()&&q.state.preMain.drag.quiz.index===i&&q.state.preMain.drag.quiz.selections[i]===wrong&&q.state.preMain.drag.quiz.attempts[i]===1&&!q.payload.device.guidedTutorial.completed);
     const wrongState=q.state.preMain.drag.quiz;
     await p.locator('#tutPopNext').evaluate(e=>e.click());equal('current quiz '+(i+1)+' disabled click preserves current question',(await get(p)).state.preMain.drag.quiz,wrongState);
     if(i===1){await checkpointReload(p);q=await get(p);equal('current reload preserves quiz index/order/selections/attempts',q.state.preMain.drag.quiz,wrongState);equal('current reload preserves original session identity',q.payload.device.sessionId,sessionId);check('current reload does not claim completion',!q.payload.device.guidedTutorial.completed&&q.help.drag.handsDone&&await p.locator('#tutPopNext').isDisabled());}
     await p.locator('#tutQuiz button[data-answer-index="'+correct+'"]').click();q=await get(p);
     check('current quiz '+(i+1)+' correction records second attempt',q.state.preMain.drag.quiz.selections[i]===correct&&q.state.preMain.drag.quiz.attempts[i]===2&&await p.locator('#tutPopNext').isEnabled());equal('current quiz '+(i+1)+' selection order stays fixed',q.state.preMain.drag.quiz.orders,quizOrder);
     const event=q.payload.device.tutorialLog.at(-1);check('current quiz '+(i+1)+' actual answer has rule/index/correct/attempt provenance',event.event==='rule_answer'&&event.correct===true&&event.answerIndex===correct&&event.attempt===2&&typeof event.rule==='string');
     await p.locator('#tutPopNext').click();await p.waitForTimeout(70);
    }
    const done=await get(p);check('current training completes only after motor and seven corrections',done.payload.device.guidedTutorial.completed&&done.payload.device.guidedTutorial.motorCompleted&&done.payload.device.guidedTutorial.quiz.attempts.every(v=>v===2)&&done.state.preMain.dragDone&&done.state.stage==='exampleIntro');
    check('current quiz entry exposure is root-step scoped, not one per question',done.payload.device.instructionExposure.filter(e=>e.stepId==='rule-check').length===2&&done.payload.device.instructionExposure.filter(e=>e.stepId==='rule-check').every(e=>e.quizIndex===0||e.quizIndex===1));
    break;
   }
   await p.locator('#tutPopNext').click();await p.waitForTimeout(80);const after=await get(p),stays=dwell(after.payload.device.tutorialLog,old,key);
   check(version+' leaving page retains finite dwell '+key,stays.length>0&&stays.every(e=>e.ms>=0&&Number.isInteger(e.ms)));
  }
  let trained=await get(p);
  check(version+' motor has not polluted raw trial records',trained.payload.trials.length===0&&trained.payload.invalidAttempts.length===0);
  const expected=old?[0,1,2,3,4,5,6,7]:await p.evaluate(()=>PILOT_GUIDED_TUTORIAL.steps.map(s=>s.id));equal(version+' all actual drag explanation pages visited',visited,expected);
  const trainingLog=trained.payload.device.tutorialLog,stays=trainingLog.filter(e=>e.kind==='drag'&&Number.isFinite(e.ms));
  check(version+' every visited root explanation has dwell record',expected.every(key=>dwell(trainingLog,old,key).length>0));
  report.scenarios[version]={initialVersion:initial.payload.device.appVersion,visited,dragDwell:stays,instructionExposure:trained.payload.device.instructionExposure,quiz:trained.payload.device.guidedTutorial||null};
  if(!old){check('current distinct example introduction persisted',trained.screen==='guidedintro'&&trained.state.stage==='exampleIntro'&&trained.state.preMain.dragSchema==='guided-2026-10-15');await p.waitForTimeout(420);await p.locator('#guidedIntroGo').click();}
  await p.waitForFunction(()=>__pilot.recoveryState().currentCell?.isTutorial&&__pilot.activeScreen()==='task');const exampleBefore=await get(p);
  check(version+' example precedes exactly five practice questions',exampleBefore.state.queue.length===5&&exampleBefore.payload.trials.length===0&&exampleBefore.mainMs===null);
  await p.waitForTimeout(3500);await drag(p);await waitRatingReady(p);let rated=await get(p);const rec=rated.payload.trials[0];
  check(version+' actual example raw is tutorial phase',rated.payload.trials.length===1&&rec.phase==='tutorial'&&rec.events[0].type==='down'&&rec.events.some(e=>e.type==='reveal')&&rec.events.at(-1).type==='up'&&rec.nDispatched>=18);
  check(version+' example does not start main clock or count as main',rated.mainMs===null&&rated.state.trialIndex===0&&rated.payload.trials.filter(t=>t.phase==='main').length===0);
  await p.locator('#ratingNext').click();await p.waitForTimeout(420);await p.locator('#qitem-hesitation button[data-val="2"]').click();await p.locator('#ratingNext').click();await p.waitForTimeout(420);await p.locator('#qitem-confidence button[data-val="4"]').click();
  await p.locator('#ratingTutPrev').click();rated=await get(p);check(version+' rating back retains selected values',rated.payload.trials[0].ratings.hesitation.value===2&&rated.payload.trials[0].ratings.confidence.value===4);equal(version+' initial rating back-count convention',rated.payload.trials[0].ratingBacks,old?0:1);
  await p.waitForTimeout(420);await p.locator('#ratingNext').click();await p.waitForTimeout(420);await p.locator('#ratingSubmit').click();rated=await get(p);
  const committed=rated.payload.trials[0].ratingSubmitMs,values=rated.payload.trials[0].ratings;check(version+' confidence submit stores finite total and item times',committed>0&&Number.isFinite(values.hesitation.rt_ms)&&Number.isFinite(values.confidence.rt_ms));
  if(!old){
   check('current committed rating leads to finish explanation',rated.state.rating.tutorial.index===3&&!(rated.payload.device.ratingTutorial?.completed));
   await p.waitForTimeout(1250);equal('current finish explanation time does not alter submitted ms',(await get(p)).payload.trials[0].ratingSubmitMs,committed);await checkpointReload(p);rated=await get(p);equal('current finish reload retains ratings',rated.payload.trials[0].ratings,values);equal('current finish reload retains submitted ms',rated.payload.trials[0].ratingSubmitMs,committed);check('current finish reload retains page and incomplete training',rated.state.rating.tutorial.index===3&&!rated.state.preMain.ratingDone);
   await p.waitForTimeout(420);await p.locator('#ratingSubmit').click();await p.waitForTimeout(1250);rated=await get(p);check('current unnumbered five-practice introduction follows finish',rated.state.rating.tutorial.index===4&&await p.locator('#tutStepLabel').isHidden());equal('current practice introduction time does not alter submitted ms',rated.payload.trials[0].ratingSubmitMs,committed);await p.locator('#ratingSubmit').click();
  }
  await p.waitForFunction(()=>__pilot.activeScreen()==='task'&&!__pilot.recoveryState().currentCell?.isTutorial);rated=await get(p);
  equal(version+' selected values and commit time survive transition',rated.payload.trials[0].ratings,values);equal(version+' commit time remains final after all explanations',rated.payload.trials[0].ratingSubmitMs,committed);
  check(version+' one example followed by first of original five practice',rated.payload.trials.length===1&&rated.state.queue.length===4&&rated.payload.device.ratingTutorial.completed&&rated.payload.device.ratingTutorial.pages===(old?3:4));
  const ratingLogs=rated.payload.device.tutorialLog.filter(e=>e.kind==='rating'&&Number.isFinite(e.ms));check(version+' all actual rating explanation pages have finite dwell',Array.from({length:old?3:5},(_,i)=>i+1).every(page=>ratingLogs.some(e=>e.page===page&&e.ms>=0)));
  report.scenarios[version].rating={committed,values,ratingBacks:rated.payload.trials[0].ratingBacks,explanationDwell:ratingLogs,pages:rated.payload.device.ratingTutorial.pages,rawExample:rec,postExampleQueueLength:rated.state.queue.length};
  for(let i=0;i<5;i++){await p.waitForTimeout(3500);await drag(p);await normalRatings(p);if(i<4)await p.waitForFunction(()=>__pilot.activeScreen()==='task');}
  await p.waitForFunction(()=>__pilot.recoveryState().stage==='practiceComplete');const beforeMain=await get(p);
  check(version+' exactly five practice and one example before main',beforeMain.payload.trials.filter(t=>t.phase==='practice').length===5&&beforeMain.payload.trials.filter(t=>t.phase==='tutorial').length===1&&beforeMain.payload.trials.filter(t=>t.phase==='main').length===0&&beforeMain.mainMs===null);
  equal(version+' saved practice stimuli definition unchanged throughout',beforeMain.payload.device.moralPracticeDefinition,definition);
  await p.locator('#blockintroGo').click();await p.waitForFunction(()=>__pilot.phase()==='main'&&__pilot.activeScreen()==='task');const main=await get(p);check(version+' main count starts at zero with its own two-question queue',main.state.trialIndex===0&&main.state.totalMain===2&&main.state.queue.length===1&&main.mainMs>=0&&!main.state.currentCell.isTutorial);
  report.scenarios[version].phaseCounts=Object.fromEntries(['tutorial','practice','main'].map(phase=>[phase,main.payload.trials.filter(t=>t.phase===phase).length]));
  await ctx.close();
 }
 check('No page JavaScript exceptions',report.errors.length===0,report.errors);check('No external or submission requests attempted',report.blockedRequests.length===0,report.blockedRequests);equal('Fourteen production assets unchanged during this audit',sources(app),report.source);equal('Frozen ui19 assets unchanged during this audit',sources(before),report.baselineSource);
 report.observations=[
  '旧 ui19 は8枚・手操作2回。現行は14ルート説明（復習7問はrule-check内）・手操作1回。ページ数と操作回数は承認済み構成差として扱う。',
  '現行クイズは各回答をrule_answerとして記録。instructionExposureとstayはrule-checkルート単位であり、各問ごとの表示イベント/滞在msではない。reload再訪は別の表示イベントになる。',
  '初回評定説明で自信から迷いへ戻る操作のratingBacksは旧0、現行1。通常評定に関する動作差とは区別する。',
  '評定説明は旧3枚、現行4枚＋番号なし練習導入。後続2枚の滞在とreload後もratingSubmitMsは自信確定時の値を保持した。',
  '説明表示・滞在・正答は読了または理解を証明しない。' ];
 report.passed=report.checks.length;report.failed=0;
 }finally{if(browser)await browser.close();server.close();}
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
})().catch(async e=>{report.exception=e.stack;report.failed=report.checks.filter(c=>!c.pass).length||1;report.passed=report.checks.filter(c=>c.pass).length;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.error(e);if(browser)await browser.close().catch(()=>{});if(server)server.close();process.exitCode=1;});
