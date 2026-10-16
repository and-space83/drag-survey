"use strict";
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.APP_ROOT||__dirname),out=path.resolve(process.env.OUTPUT_DIR||path.join(__dirname,'../../_work/rule-review-2026-10-11/all-layouts'));fs.mkdirSync(out,{recursive:true});
const report={at:new Date().toISOString(),scope:'Local synthetic responses; Chrome touch emulation, not physical Safari',source:{},checks:[],screens:[],errors:[],remote:[]};
const motionPreference=process.env.REVIEW_REDUCED_MOTION==='reduce'?'reduce':'no-preference';report.motionPreference=motionPreference;
const selectedCases=process.env.LAYOUT_CASES?new Set(process.env.LAYOUT_CASES.split(',').filter(Boolean)):null;if(selectedCases)report.selectedCases=[...selectedCases];
const {appAssets,appAssetPaths,readAppSource}=require('./lib/app-source.cjs'),assets=appAssets(root);
const guided=assets.has('/guided-tutorial.js');
const sourceFiles=appAssetPaths(root);
for(const f of sourceFiles)report.source[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const guidedConfig=guided?require('node:vm').runInNewContext(assets.get('/guided-tutorial.js').toString()+';window.PILOT_GUIDED_TUTORIAL',{window:{}}):null;
if(guided)report.guided={schema:guidedConfig.schema,steps:guidedConfig.steps.map(s=>({id:s.id,title:s.title,kind:s.kind,copy:s.copy,extraCopy:s.extraCopy||'',chapter:s.chapter})),checks:guidedConfig.checks.map(q=>({id:q.id,title:q.title,copy:q.copy,correctIndex:q.correctIndex,labels:q.labels}))};
const appSource=readAppSource(root,assets.get('/index.html').toString());
report.appVersion=appSource.match(/appVersion:\s*"([^"]+)"/)[1];
report.instructionVersion=appSource.match(/const INSTRUCTION_VERSION = "([^"]+)"/)[1];
const capturedBank=require('node:vm').runInNewContext(assets.get('/bank.js').toString()+';window.PILOT_BANK',{window:{}});
const expectedExample=Number(report.appVersion.match(/ui(\d+)$/)?.[1])>=18?{a:'止める',b:'見逃す',stem:capturedBank.moral.example.stem}:{a:'海でのんびり',b:'山でハイキング'};
const expectedNoticeButton=Number(report.appVersion.match(/ui(\d+)$/)?.[1])>=22?'確認して次の問題へ':'確認して問題に戻る';
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,key=p==='/'?'/index.html':p,data=assets.get(key);if(req.method!=='GET'||!data){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'html':'text/html;charset=utf-8','css':'text/css','js':'application/javascript'})[key.split('.').at(-1)]);res.end(data);});
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(pass?'':' '+JSON.stringify(detail)));};
let browser,origin;
async function capture(page,name,selectors,pairs=[],scroll=false){
 // Tutorial panels position themselves in requestAnimationFrame after becoming visible.
 // Measure the rendered frame, not their temporary unpositioned DOM boxes.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const g=await page.evaluate(selectors=>{const elements={};for(const sel of selectors){const e=document.querySelector(sel);if(!e||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')continue;const r=e.getBoundingClientRect();let paintBounds=null,paintTouchesEdge=false;if(sel==='#tutRangeInk'){const pixels=e.getContext('2d').getImageData(0,0,e.width,e.height).data;let minX=e.width,minY=e.height,maxX=-1,maxY=-1;for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++)if(pixels[(y*e.width+x)*4+3]>3){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}if(maxX>=0){paintBounds={x:r.x+minX*r.width/e.width,y:r.y+minY*r.height/e.height,right:r.x+(maxX+1)*r.width/e.width,bottom:r.y+(maxY+1)*r.height/e.height};paintTouchesEdge=minX===0||minY===0||maxX===e.width-1||maxY===e.height-1;}}let textBounds=null;if(['#tutAgain','#ratingHelp'].includes(sel)){const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();textBounds={x:t.x,y:t.y,right:t.right,bottom:t.bottom};}elements[sel]={textBounds,paintBounds,paintTouchesEdge,invisibleAnchorOverflow:['#tutGraphic','#tutRangeFigure'].includes(sel)&&!!document.getElementById('tutRangeEntry')&&getComputedStyle(document.getElementById('tutRangeEntry')).opacity==='0',x:r.x,y:r.y,right:r.right,bottom:r.bottom,overflowX:['#tutAgain','#ratingHelp'].includes(sel)?0:e.scrollWidth-e.clientWidth,overflowY:['#tutAgain','#ratingHelp'].includes(sel)?0:e.scrollHeight-e.clientHeight,scrollable:['#noticeText','#practiceCheckItems','#consentDocument','#wcBody'].includes(sel)&&['auto','scroll'].includes(getComputedStyle(e).overflowY)};}if(elements['#tutRangeFigure']){const visible=[elements['#tutRangeTarget'],elements['#tutRangeInk']?.paintBounds].filter(Boolean);if(visible.length)elements['#tutRangeFigure'].visibleBounds={x:Math.min(...visible.map(r=>r.x)),y:Math.min(...visible.map(r=>r.y)),right:Math.max(...visible.map(r=>r.right)),bottom:Math.max(...visible.map(r=>r.bottom))};}return {w:innerWidth,h:innerHeight,elements};},selectors);
 const bad=Object.entries(g.elements).filter(([,r])=>r.x< -1||r.right>g.w+1||(!r.invisibleAnchorOverflow&&r.overflowX>2)||(r.textBounds&&(r.textBounds.x<r.x-1||r.textBounds.right>r.right+1||r.textBounds.y<r.y-1||r.textBounds.bottom>r.bottom+1))||(!scroll&&(r.y< -1||r.bottom>g.h+1||(!r.scrollable&&!r.invisibleAnchorOverflow&&r.overflowY>2))));
 if(g.elements['#tutRangeInk'])check(name+': painted finger does not touch canvas edges',!g.elements['#tutRangeInk'].paintTouchesEdge,g.elements['#tutRangeInk'].paintBounds);
 check(name+': '+(scroll?'no horizontal clipping; vertical scrolling allowed':'text and controls fit'),!bad.length,bad);
 for(const [a,b]of pairs){const ar=g.elements[a]?.visibleBounds||g.elements[a],br=g.elements[b]?.visibleBounds||g.elements[b];check(name+': no overlap '+a+' / '+b,!ar||!br||ar.bottom<=br.y+1||br.bottom<=ar.y+1||ar.right<=br.x+1||br.right<=ar.x+1,{ar,br});}
 if(report.screens.some(s=>s.name===name))throw Error('Duplicate screenshot name: '+name);
 const file=name+'.png';fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});const png=await page.screenshot({path:path.join(out,file)});report.screens.push({name,file,capturedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(png).digest('hex'),geometry:g,text:await page.locator('body').innerText()});
}
async function drag(page,cdp,sandbox=false,onPress=null){const [s,c]=await page.evaluate(sandbox=>{const r=document.getElementById('start').getBoundingClientRect(),target=document.getElementById(sandbox?'tutSingleTarget':'choiceA'),c=target?.getBoundingClientRect(),f=document.getElementById('surface').getBoundingClientRect(),shift=parseFloat(getComputedStyle(document.getElementById('task')).getPropertyValue('--tut-shift'))||0;return [{x:r.x+r.width/2,y:r.y+r.height/2},sandbox&&!c?{x:f.x+f.width*.5,y:f.y+f.height*.34+shift}:{x:c.x+c.width/2,y:c.y+c.height/2}];},sandbox);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[s]});if(onPress)await onPress();for(let i=1;i<=18;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:s.x+(c.x-s.x)*i/18,y:s.y+(c.y-s.y)*i/18}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
async function verifyScrollEnd(page,name,container,controls,sticky=null){
 const result=await page.evaluate(({container,controls,sticky})=>{const e=document.querySelector(container),needed=e.scrollHeight>e.clientHeight+2;e.scrollTop=e.scrollHeight;const er=e.getBoundingClientRect(),buttons=[...document.querySelectorAll(controls)].filter(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden'),last=buttons.at(-1),r=last?.getBoundingClientRect(),nav=sticky&&document.querySelector(sticky)?.getBoundingClientRect();return{needed,scrollTop:e.scrollTop,overflow:getComputedStyle(e).overflowY,container:{top:er.top,bottom:er.bottom},last:r?{top:r.top,bottom:r.bottom}:null,nav:nav?{top:nav.top,bottom:nav.bottom}:null};},{container,controls,sticky});
 check(name+': scroll reaches the last control without covering it',!!result.last&&(!result.needed||(['auto','scroll'].includes(result.overflow)&&result.scrollTop>0))&&result.last.top>=result.container.top-1&&result.last.bottom<=result.container.bottom+1&&(!result.nav||result.last.bottom<=result.nav.top+1),result);
}
async function suite(name,width,height){
 async function run(label,query,fn){if(selectedCases&&!selectedCases.has(label))return;const ctx=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:motionPreference});await ctx.addInitScript(()=>{let seed=348971;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};});await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin&&r.request().method()==='GET')return r.continue();report.remote.push(r.request().url());return r.abort();});const page=await ctx.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>report.errors.push({name,label,message:e.message}));const cdp=await ctx.newCDPSession(page);try{const params=new URLSearchParams('block=moral&upload=0&debug=1&devguard=0&zoomguard=0&mic=0&minread=0&readgate=0');for(const [key,value] of new URLSearchParams(query))params.set(key,value);await page.goto(origin+'/?'+params);await page.waitForFunction(()=>window.__pilot?.storeReady());await page.waitForTimeout(180);if(label==='consent')check(name+'/'+label+': local mock URL only; all POST requests blocked',await page.evaluate(url=>__pilot.uploadUrl()===url,origin+'/consent-capture-only'));else check(name+'/'+label+': upload disabled',await page.evaluate(()=>__pilot.uploadUrl()===null));await fn(page,cdp);}catch(e){check(name+'/'+label+': completes',false,e.message);}finally{await ctx.close();}}
 const cap=(p,n,s,pairs=[],scroll=false)=>capture(p,name+'/'+n,s,pairs,scroll);
 await run('welcome','',async p=>{const count=await p.locator('#wcDots i').count();if(!count)throw Error('Missing welcome progress');for(let i=0;i<count;i++){await cap(p,'welcome-'+(i+1),['#welcome .pad','#wcBody','#wcNav'],[['#wcBody','#wcNav']]);while(await p.locator('#wcAgree button:not(.sel)').count())await p.locator('#wcAgree button:not(.sel)').first().tap();await p.locator('#wcNext').tap();}});
 await run('consent','welcome=0&consent=1&upload=1&uploadurl=/consent-capture-only',async p=>{
  await p.locator('#pid').fill('synthetic consent layout');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic phone');await p.locator('#sexSeg [data-val="na"]').tap();await p.locator('#handSeg [data-val="right"]').tap();await p.locator('#goPractice').tap();await p.waitForFunction(()=>__pilot.activeScreen()==='consent');
  const selectors=['#consent .pad','#consent h1','#consentIdentity','#consentDocument','#consentStatus','#consentChoice','#consentGo','#consent .consent-actions'],pairs=[['#consentDocument','#consentStatus'],['#consentStatus','#consentChoice'],['#consentChoice','#consentGo'],['#consentGo','#consent .consent-actions']];
  await cap(p,'consent-top',selectors,pairs);report.screens.at(-1).copy=await p.locator('#consentDocument').innerText();
  await p.locator('#consentDocument').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));});await cap(p,'consent-end',selectors,pairs);report.screens.at(-1).copy=await p.locator('#consentDocument').innerText();
  check(name+'/consent: no consent created or submitted',await p.evaluate(()=>__pilot.activeScreen()==='consent'&&!__pilot.buildPayload().device.consent));
 });
 await run('practicecheck','go=practicecheck',async p=>{await cap(p,'practicecheck',['#practicecheck .pad','#practiceCheckItems','#practiceCheckGo'],[['#practiceCheckItems','#practiceCheckGo']]);await p.locator('#practiceCheckItems').evaluate(e=>e.scrollTop=e.scrollHeight);await cap(p,'practicecheck-end',['#practicecheck .pad','#practiceCheckItems','#practiceCheckGo'],[['#practiceCheckItems','#practiceCheckGo']]);});
 await run('tutorial','go=tut',async(p,cdp)=>{
  if(guided){
   const aliases={'layout-intro':'tutorial-0','layout-stem':'tutorial-2','layout-start':'tutorial-3','layout-choice':'tutorial-4','time-rule':'tutorial-7'},seenIds=new Set(),seenQuiz=new Set();
   for(let n=0;n<40&&await p.evaluate(()=>__pilot.helpState().drag.index>=0);n++){
    const state=await p.evaluate(()=>__pilot.helpState().drag),key=state.stepId;seenIds.add(key);
    const captureWaitMs=key==='motor-route'?950:key==='motor-range'?1500:key==='time-rule'?2050:380;
    await p.waitForTimeout(captureWaitMs);
    const suffix=key==='rule-check'?'-'+String(state.quiz.index+1).padStart(2,'0'):'',screen='tutorial-'+key+suffix;
    const selectors=['#tutPop','#tutPopTitle','#tutPopTxt','#tutPopOp','#tutBtnRow','#tutPopNext','#tutGraphic','#tutRangeFigure','#tutRangeTarget','#tutRangeInk','#tutGraphic .guided-range-caption','#tutQuiz','#tutQuizFeedback','#stem','#choiceA','#choiceB','#start','#tutSingleTarget'];
    const pairs=[['#tutPop','#tutBtnRow'],['#tutPop','#start'],['#tutBtnRow','#start'],['#tutPop','#tutSingleTarget'],['#tutPop','#choiceA'],['#tutPop','#choiceB'],['#tutRangeFigure','#tutPop'],['#tutRangeFigure','#tutBtnRow']];
    await cap(p,screen,selectors,pairs);
    report.screens.at(-1).copy=await p.evaluate(()=>[document.getElementById('tutPop').innerText,document.getElementById('tutBtnRow').innerText].join('\n'));
    report.screens.at(-1).sourceStepId=key;report.screens.at(-1).title=guidedConfig.steps.find(s=>s.id===key).title;report.screens.at(-1).captureWaitMs=captureWaitMs;
    if(key==='rule-check'){report.screens.at(-1).title=guidedConfig.checks[state.quiz.index].title;report.screens.at(-1).quizIndex=state.quiz.index;}
    if(aliases[key]){const source=report.screens.at(-1),file=name+'/'+aliases[key]+'.png';fs.copyFileSync(path.join(out,source.file),path.join(out,file));report.screens.push({...source,name:name+'/'+aliases[key],file,legacyComparisonAlias:true});}
    if(key==='motor'){
     check(name+'/motor: initial operation is required',await p.locator('#tutPopNext').isDisabled());
     await drag(p,cdp,true);await p.waitForFunction(()=>__pilot.helpState().drag.handsDone);
     await p.waitForTimeout(380);await cap(p,'tutorial-motor-success',selectors,pairs);report.screens.at(-1).copy=await p.locator('#tutPop').innerText();report.screens.at(-1).sourceStepId='motor';report.screens.at(-1).title='操作できました';
    }
    if(key==='rule-check'){
     seenQuiz.add(state.quiz.index);const correct=guidedConfig.checks[state.quiz.index].correctIndex,wrong=guidedConfig.checks[state.quiz.index].labels.findIndex((_,i)=>i!==correct);
     await p.locator('#tutQuiz [data-answer-index="'+wrong+'"]').tap();check(name+'/'+screen+': wrong answer blocks next',await p.locator('#tutPopNext').isDisabled());
     await cap(p,screen+'-wrong',selectors,pairs);report.screens.at(-1).sourceStepId=key;report.screens.at(-1).quizIndex=state.quiz.index;report.screens.at(-1).title=guidedConfig.checks[state.quiz.index].title+'（誤答後）';report.screens.at(-1).copy=await p.locator('#tutPop').innerText();
     await p.locator('#tutQuiz [data-answer-index="'+correct+'"]').tap();check(name+'/'+screen+': correct answer enables next',!await p.locator('#tutPopNext').isDisabled());
    }
    await p.locator('#tutPopNext').tap();await p.waitForTimeout(200);
   }
   check(name+'/guided: all fourteen steps captured',guidedConfig.steps.every(s=>seenIds.has(s.id)),[...seenIds]);
   check(name+'/guided: all seven quizzes answered',seenQuiz.size===guidedConfig.checks.length,[...seenQuiz]);
   await p.waitForFunction(()=>__pilot.activeScreen()==='guidedintro');
   await cap(p,'guided-example-intro',['#guidedintro .guided-intro-card','#guidedIntroTitle','#guidedIntroGo'],[['#guidedintro .guided-intro-card','#guidedIntroGo']]);report.screens.at(-1).copy=await p.locator('#guidedintro').innerText();report.screens.at(-1).title='例題の案内';
   await p.locator('#guidedIntroGo').tap();
  }else{
  for(let n=0;n<16&&await p.evaluate(()=>__pilot.helpState().drag.index>=0);n++){
   const i=await p.evaluate(()=>__pilot.helpState().drag.index);await p.waitForTimeout(i===2?1150:650);
   await cap(p,'tutorial-'+i,['#tutPop','#tutPopTxt','#tutBtnRow','#tutPopNext'],[['#tutPop','#tutBtnRow']]);
   if(i===4)check(name+'/tutorial-4: displayed choices match the example question',await p.evaluate(e=>document.getElementById('numA').textContent===e.a&&document.getElementById('numB').textContent===e.b,expectedExample));
   if(i===7)check(name+'/tutorial-7: hands-on practice keeps generic choices',await p.evaluate(()=>document.getElementById('numA').textContent==='選択肢1'&&document.getElementById('numB').textContent==='選択肢2'));
   if([6,7].includes(i)){await drag(p,cdp,i===6);await p.waitForFunction(()=>__pilot.helpState().drag.handsDone);}
   await p.locator('#tutPopNext').tap();await p.waitForTimeout(300);
  }
  }
  await p.waitForFunction(()=>document.getElementById('coach').innerText.includes('問題文を読み、状況が分かったら'));
  await cap(p,'example-coach',['#stem','#coach','#start'],[['#coach','#start']]);
  report.screens.at(-1).copy=await p.locator('#coach').innerText();
  check(name+'/example-coach: understanding the situation precedes start',!(await p.locator('#coach').innerText()).includes('読み終えたら'));
  await drag(p,cdp,false,async()=>{await cap(p,'example-choice',['#task','#stem','#choiceA','#choiceB','#start']);report.screens.at(-1).copy=await p.evaluate(()=>[document.getElementById('stem').innerText,document.getElementById('numA').innerText,document.getElementById('numB').innerText].join('\n'));check(name+'/example-choice: adopted example question and labels displayed',await p.evaluate(e=>document.getElementById('numA').textContent===e.a&&document.getElementById('numB').textContent===e.b&&(!e.stem||document.getElementById('stem').innerText.replace(/\s/g,'')===e.stem.replace(/[|\s]/g,'')),expectedExample));});
 });
 if(guided)await run('rating-tutorial','go=rtut',async p=>{
  const visited=new Set(),selectors=['#ratPop','#ratTutTitle','#ratTutText','#ratPopOp','#ratingAnswer','#ratingItems','#ratBtnRow','#ratingBackNote','#ratingHelp'];
  for(let n=0;n<7&&await p.evaluate(()=>__pilot.helpState().rating.index>=0);n++){
   const index=await p.evaluate(()=>__pilot.helpState().rating.index);visited.add(index);await p.waitForTimeout(220);
   await cap(p,'rating-tutorial-'+index,selectors,[['#ratPop','#ratingAnswer'],['#ratPop','#ratingItems'],['#ratingItems','#ratBtnRow'],['#ratPop','#ratBtnRow']]);
   report.screens.at(-1).copy=await p.evaluate(()=>[document.getElementById('ratPop').innerText,document.getElementById('ratingAnswer').hidden?'':document.getElementById('ratingAnswer').innerText,document.getElementById('ratingItems').innerText,document.getElementById('ratBtnRow').innerText].join('\n').trim());report.screens.at(-1).title=await p.locator('#ratTutTitle').innerText();
   if(index===1)await p.locator('#qitem-hesitation button').nth(2).tap();
   if(index===2)await p.locator('#qitem-confidence button').nth(2).tap();
   await p.locator(index<2?'#ratingNext':'#ratingSubmit').tap();await p.waitForTimeout(180);
  }
  check(name+'/rating-tutorial: all four explanation pages and practice introduction captured',[0,1,2,3,4].every(i=>visited.has(i)),[...visited]);
 });
 for(const kind of ['early','late','early_late'])await run('notice-'+kind,'go=notice&notice='+kind,async p=>{check(name+'/notice-'+kind+': one confirmation button only',await p.locator('#notice button').count()===1&&await p.locator('#noticeGo').innerText()===expectedNoticeButton,{expected:expectedNoticeButton});await cap(p,'notice-'+kind,['#notice .pad','#notice h1','#noticeText','#noticeGo'],[['#noticeText','#noticeGo']]);if(kind!=='early'){await p.locator('#noticeText').evaluate(e=>e.scrollTop=e.scrollHeight);await cap(p,'notice-'+kind+'-end',['#notice .pad','#noticeText','#noticeGo'],[['#noticeText','#noticeGo']]);}});
 await run('main','go=task',async p=>{await cap(p,'main',['#task','#stem','#choiceA','#choiceB','#start','#tutAgain']);await p.locator('#tutAgain').tap();await cap(p,'main-help',['#tutPop','#tutBtnRow','#tutClose'],[['#tutPop','#tutBtnRow'],['#tutClose','#tutPop']]);if(guided)report.screens.at(-1).guidedReview=await p.evaluate(()=>__pilot.helpState().drag.review);});
 await run('rating','go=rating',async p=>{await cap(p,'rating-hesitation',['#rating .qwrap','#ratingItems','#ratBtnRow'],[['#ratingItems','#ratBtnRow']]);await p.locator('#qitem-hesitation button').nth(2).tap();await p.waitForTimeout(300);await p.locator('#ratingNext').tap();await cap(p,'rating-confidence',['#rating .qwrap','#ratingItems','#ratBtnRow'],[['#ratingItems','#ratBtnRow']]);if(Number(report.appVersion.match(/ui(\d+)$/)?.[1])>=19)check(name+'/rating-preview: example/practice progress remains hidden',!await p.locator('#ratingProgress').isVisible());});
 await run('main-rating','go=task',async(p,cdp)=>{
  const hasProgress=Number(report.appVersion.match(/ui(\d+)$/)?.[1])>=19;
  const taskWidth=await p.locator('#progressFill').evaluate(e=>e.style.width);
  await drag(p,cdp);await p.waitForFunction(()=>__pilot.activeScreen()==='rating');
  const selectors=['#rating .qwrap','#ratingAnswer','#ratingItems','#ratBtnRow','#ratingHelp','#ratingProgress','#ratingProgressFill'];
  const pairs=[['#ratingItems','#ratBtnRow'],['#ratingProgress','#ratingHelp'],['#ratingProgress','#ratingAnswer'],['#ratingProgress','#ratingItems'],['#ratingProgress','#ratBtnRow']];
  await cap(p,'main-rating-hesitation',selectors,pairs);
  if(hasProgress){check(name+'/main-rating-hesitation: progress is visible',await p.locator('#ratingProgress').isVisible());check(name+'/main-rating-hesitation: same progress as the question',await p.locator('#ratingProgressFill').evaluate(e=>e.style.width)===taskWidth);}
  await p.locator('#qitem-hesitation button').nth(2).tap();await p.waitForTimeout(300);await p.locator('#ratingNext').tap();
  await cap(p,'main-rating-confidence',selectors,pairs);
  if(hasProgress){check(name+'/main-rating-confidence: progress is visible',await p.locator('#ratingProgress').isVisible());check(name+'/main-rating-confidence: same progress as hesitation',await p.locator('#ratingProgressFill').evaluate(e=>e.style.width)===taskWidth);await p.locator('#ratingHelp').tap();check(name+'/main-rating-help: progress hidden during the explanation',!await p.locator('#ratingProgress').isVisible());}
 });
 await run('post','go=post',async p=>{let problemPart=0;for(let i=0;i<30;i++){
  let id=await p.locator('#postq .postpage.on').getAttribute('data-page');if(id==='problems')id+='-'+(++problemPart);
  const selectors=['#postq .pad','#postStep','#postq .postpage.on','#postNav'],scrolling=await p.locator('#postq .pad').evaluate(e=>e.scrollHeight>e.clientHeight+2);
  await cap(p,'post-'+id,selectors,scrolling?[]:[['#postq .postpage.on','#postNav']],scrolling);
  await verifyScrollEnd(p,name+'/post-'+id,'#postq .pad','#postq .postpage.on :is(button,input,textarea)','#postNav');
  await cap(p,'post-'+id+'-end',selectors,[],true);
  for(const seg of await p.locator('#postq .postpage.on .seg').all())await seg.locator('button').last().tap();for(const checks of await p.locator('#postq .postpage.on .checks').all()){const none=checks.locator('[data-none="1"]:visible');if(await none.count())for(const b of await none.all())await b.tap();else await checks.locator('button').first().tap();}for(const input of await p.locator('#postq .postpage.on input[type="number"]').all())await input.fill('7');if(!(await p.locator('#postNext').isVisible()))break;if(await p.locator('#postNext').isDisabled())throw Error('Unanswered post page '+id);await p.locator('#postNext').tap();await p.waitForTimeout(100);
 }});
 for(const state of ['break','instructed','done','sending'])await run(state,'go='+state,async p=>{const screen=await p.evaluate(()=>__pilot.activeScreen());await cap(p,state,['#'+screen+' .pad','#'+screen+' h1','#blockintroBody','#blockintroGo','#breakGo','#done .btnrow'],[],state==='done');});
 await run('reading','welcome=0&read=1',async p=>{await p.locator('#pid').fill('synthetic layout');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic phone');await p.locator('#sexSeg [data-val="na"]').tap();await p.locator('#handSeg [data-val="right"]').tap();await cap(p,'entry',['#intro .pad','#goPractice'],[],true);await verifyScrollEnd(p,name+'/entry','#intro .pad','#goPractice');await cap(p,'entry-end',['#intro .pad','#goPractice'],[],true);await p.locator('#goPractice').tap();await p.waitForFunction(()=>__pilot.activeScreen()==='reading');await cap(p,'reading-intro',['#reading .pad','#readIntro','#readDone']);await p.locator('#readDone').tap();await cap(p,'reading-text',['#reading .pad','#readText','#readDone']);});
 await run('practice-complete','welcome=0&read=0&tut=0&rtut=0&attn=0&instr=0&nmain=1',async(p,cdp)=>{await p.locator('#pid').fill('synthetic layout');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic phone');await p.locator('#sexSeg [data-val="na"]').tap();await p.locator('#handSeg [data-val="right"]').tap();await p.locator('#goPractice').tap();for(let i=0;i<25;i++){const sc=await p.evaluate(()=>__pilot.activeScreen());if(sc==='blockintro')break;if(sc==='task'){const n=report.screens.filter(s=>s.name.startsWith(name+'/practice-')&&s.name.endsWith('-question')).length+1;await cap(p,'practice-'+n+'-question',['#task','#stem','#choiceA','#choiceB','#start']);await drag(p,cdp,false,async()=>{await cap(p,'practice-'+n+'-choice',['#task','#stem','#choiceA','#choiceB','#start']);report.screens.at(-1).copy=await p.evaluate(()=>[document.getElementById('stem').innerText,document.getElementById('numA').innerText,document.getElementById('numB').innerText].join('\n'));const expected=capturedBank.moral.practiceBank[n-1];const actual=await p.evaluate(()=>({stem:document.getElementById('stem').innerText,labels:[document.getElementById('numA').innerText,document.getElementById('numB').innerText]}));check(name+'/practice-'+n+': adopted question and labels match the frozen bank',!!expected&&actual.stem.replace(/\s/g,'')===expected.stem.replace(/[|\s]/g,'')&&JSON.stringify(actual.labels.slice().sort())===JSON.stringify([expected.a.label,expected.b.label].sort()),actual);});}if(sc==='rating'){if(Number(report.appVersion.match(/ui(\d+)$/)?.[1])>=19)check(name+'/practice-rating: progress hidden',!await p.locator('#ratingProgress').isVisible());await p.locator('#qitem-hesitation button').nth(2).tap();await p.waitForTimeout(300);await p.locator('#ratingNext').tap();await p.locator('#qitem-confidence button').nth(2).tap();await p.waitForTimeout(300);await p.locator('#ratingSubmit').tap();}if(sc==='notice')await p.locator('#noticeGo').tap();await p.waitForTimeout(1400);}await p.waitForFunction(()=>__pilot.recoveryState().stage==='practiceComplete');check(name+'/practice-complete: all five distinct practice questions captured',report.screens.filter(s=>s.name.startsWith(name+'/practice-')&&s.name.endsWith('-question')).length===5);await cap(p,'practice-complete',['#blockintro .pad','#blockintroBody','#blockintroGo'],[['#blockintroBody','#blockintroGo']]);});
 await run('practice-early-coach','welcome=0&read=0&tut=0&rtut=0&readgate=1',async p=>{
  await p.locator('#pid').fill('synthetic layout');await p.locator('#age').fill('29');await p.locator('#devModel').fill('synthetic phone');await p.locator('#sexSeg [data-val="na"]').tap();await p.locator('#handSeg [data-val="right"]').tap();await p.locator('#goPractice').tap();await p.waitForFunction(()=>__pilot.activeScreen()==='task');await p.locator('#start').tap();
  await p.waitForFunction(()=>document.getElementById('coach').innerText.includes('状況が分かったら'));await cap(p,'practice-early-coach',['#coach']);report.screens.at(-1).copy=await p.locator('#coach').innerText();
 });
 // This fragment is outside the normal moral route. Render it only as an
 // explicitly labelled reference, in the actual blockintro container.
 await run('legacy-blockintro','go=instructed',async p=>{
  const begin=appSource.indexOf("'<h1>道徳的な判断の2択課題"),end=appSource.indexOf('transitionHtml:',begin);
  if(begin<0||end<0)throw Error('Legacy introductory fragment missing');
  const html=require('node:vm').runInNewContext(appSource.slice(begin,end).trim().replace(/,$/,''));
  await p.evaluate(html=>{document.getElementById('blockintroBody').innerHTML='<p class="opt-note">パート 2 / 2</p>'+html;},html);
  await cap(p,'legacy-blockintro',['#blockintro .pad','#blockintroBody','#blockintroGo'],[],true);report.screens.at(-1).copy=await p.locator('#blockintroBody').innerText();report.screens.at(-1).isolatedReference=true;
  await verifyScrollEnd(p,name+'/legacy-blockintro','#blockintro .pad','#blockintroGo');await cap(p,'legacy-blockintro-end',['#blockintro .pad','#blockintroBody','#blockintroGo'],[],true);report.screens.at(-1).isolatedReference=true;
 });

}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu']});const viewports=[['mini',375,700],['iphone17',402,759],['ipad',768,1024],...(guided?[['miniSmall',375,548]]:[])];report.viewports=Object.fromEntries(viewports.map(([n,w,h])=>[n,[w,h]]));try{for(const v of viewports)await suite(...v);}finally{await browser.close();await new Promise(r=>server.close(r));}check('no JS errors',!report.errors.length,report.errors);check('no remote calls or posts',!report.remote.length,report.remote);report.passed=report.checks.filter(x=>x.pass).length;report.failed=report.checks.filter(x=>!x.pass).length;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,screens:report.screens.length}));process.exitCode=report.failed?1:0;})().catch(e=>{console.error(e);process.exitCode=1;});
