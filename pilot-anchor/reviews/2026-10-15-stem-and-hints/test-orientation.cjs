'use strict';
// Fresh synthetic browser contexts. No participant storage or collector requests.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const app=path.resolve(__dirname,'../..'),workspace=path.resolve(app,'../..'),localBefore=path.join(workspace,'_work/rounded-stem-hints/before-app'),before=process.env.ORIENTATION_BEFORE?path.resolve(process.env.ORIENTATION_BEFORE):fs.existsSync(path.join(localBefore,'index.html'))?localBefore:path.join(app,'reviews/2026-10-15-guided-release/before'),scratch=path.join(__dirname,'shots');
fs.mkdirSync(scratch,{recursive:true});
const report={scope:'Chrome mobile synthetic regression of physical orientation, keyboard height, zoom precedence and real drag cancellation. Safari device confirmation remains separate.',checkedAt:new Date().toISOString(),beforeSource:path.relative(workspace,before).replaceAll('\\','/'),checks:[],errors:[],unexpectedRequests:[],screenshots:{before:'shots/orientation-before-800x400.png',after:'shots/orientation-after-800x400.png'},sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'index.html'))).digest('hex')};
const check=(name,value,detail)=>{report.checks.push({name,pass:!!value,...(detail===undefined?{}:{detail})});console.log((value?'PASS ':'FAIL ')+name);assert(value,name);};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),old=url.pathname.startsWith('/before/'),root=old?before:app,rel=url.pathname.replace(/^\/(before|after)\//,''),file=path.resolve(root,rel);if(req.method!=='GET'||!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}fs.readFile(file,(error,bytes)=>{if(error){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(bytes);});});
function installModel(initial){
 const model={modern:'portrait-primary',legacy:0,sw:400,sh:800,touch:2,...initial},orientation=new EventTarget();
 Object.defineProperty(orientation,'type',{get:()=>model.modern});Object.defineProperty(orientation,'angle',{get:()=>model.modern?.startsWith('landscape')?90:0});
 Object.defineProperty(screen,'orientation',{configurable:true,get:()=>model.modern==null?undefined:orientation});
 Object.defineProperty(screen,'width',{configurable:true,get:()=>model.sw});Object.defineProperty(screen,'height',{configurable:true,get:()=>model.sh});
 Object.defineProperty(window,'orientation',{configurable:true,get:()=>model.legacy==null?undefined:model.legacy});Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,get:()=>model.touch});
 window.__orientationModel={update(change){Object.assign(model,change);window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('orientationchange'));orientation.dispatchEvent(new Event('change'));},orientationOnly(change,legacy=false){Object.assign(model,change);if(legacy)window.dispatchEvent(new Event('orientationchange'));else orientation.dispatchEvent(new Event('change'));},state:()=>({...model})};
}
let browser,origin;const contexts=[];
async function open(initial={},extra='',old=false,viewport={width:400,height:800}){
 const context=await browser.newContext({viewport,screen:{width:400,height:800},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17 Mobile/15E148 Safari/604.1'});contexts.push(context);await context.addInitScript(installModel,initial);
 await context.route('**/*',route=>{const req=route.request();if(new URL(req.url()).origin===origin&&req.method()==='GET')return route.continue();report.unexpectedRequests.push({url:req.url(),method:req.method()});return route.abort();});
 const p=await context.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(origin+(old?'/before/':'/after/')+'index.html?go=task&block=moral&debug=1&upload=0&mic=0&devguard=0'+extra);await p.waitForFunction(()=>window.__pilot&&__pilot.activeScreen()==='task');return p;
}
async function guards(p){return p.evaluate(()=>({rotate:document.getElementById('rotateGuard').classList.contains('show'),zoom:document.getElementById('zoomGuard').classList.contains('show'),measurement:__pilot.measureZoom()}));}
async function model(p,change){await p.evaluate(change=>__orientationModel.update(change),change);await p.waitForTimeout(40);}
async function focus(p,on){await p.evaluate(on=>{let field=document.getElementById('orientationQaInput');if(!field){field=document.createElement('input');field.id='orientationQaInput';field.style.cssText='position:fixed;top:80px;left:20px;z-index:99;font-size:16px';document.body.append(field);}if(on)field.focus();else field.blur();},on);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const p=await open();check('portrait starts without either guard',!(await guards(p)).rotate&&!(await guards(p)).zoom);
 await p.setViewportSize({width:800,height:400});await model(p,{modern:'landscape-primary',legacy:0});let g=await guards(p);
 check('modern landscape is detected even when screen stays portrait',g.rotate&&!g.zoom&&g.measurement.pageZoom===1,g);
 await p.screenshot({path:path.join(scratch,'orientation-after-800x400.png')});
 await p.setViewportSize({width:400,height:800});await model(p,{modern:'portrait-secondary',legacy:90});g=await guards(p);check('modern portrait takes precedence over conflicting legacy angle',!g.rotate&&!g.zoom,g);
 await focus(p,true);await p.setViewportSize({width:400,height:300});await model(p,{modern:'portrait-primary',legacy:0});g=await guards(p);check('keyboard-like viewport height change does not become landscape',!g.rotate&&!g.zoom,g);
 await p.setViewportSize({width:800,height:400});await model(p,{modern:'landscape-secondary',legacy:0});g=await guards(p);check('physical rotation is detected while an input remains focused',g.rotate&&!g.zoom,g);
 await focus(p,false);await p.setViewportSize({width:400,height:800});await model(p,{modern:'portrait-primary',legacy:0});check('portrait return clears rotation guard',!(await guards(p)).rotate);
 await p.setViewportSize({width:300,height:800});await model(p,{});g=await guards(p);check('portrait zoom detection remains active after rotation',!g.rotate&&g.zoom&&Math.abs(g.measurement.pageZoom-1.333)<.002,g);
 await p.evaluate(()=>__orientationModel.orientationOnly({modern:'landscape-primary',legacy:90}));check('modern change event without resize gives rotation precedence',((await guards(p)).rotate&&!(await guards(p)).zoom));
 await p.evaluate(()=>__orientationModel.orientationOnly({modern:'portrait-primary',legacy:0}));check('modern portrait change event alone restores real zoom guidance',(!(await guards(p)).rotate&&(await guards(p)).zoom));
 await p.evaluate(()=>__orientationModel.orientationOnly({modern:null,legacy:90},true));check('legacy orientation event without resize gives rotation precedence',((await guards(p)).rotate&&!(await guards(p)).zoom));
 await p.evaluate(()=>__orientationModel.orientationOnly({modern:null,legacy:0},true));check('legacy portrait event alone restores real zoom guidance',(!(await guards(p)).rotate&&(await guards(p)).zoom));
 await model(p,{modern:'portrait-primary',legacy:0});
 await p.setViewportSize({width:400,height:800});await model(p,{});check('restoring page width clears zoom guard',!(await guards(p)).zoom);
 for(const angle of [90,-90,270]){await p.setViewportSize({width:800,height:400});await model(p,{modern:null,legacy:angle});g=await guards(p);check('legacy physical angle detects landscape: '+angle,g.rotate&&!g.zoom,g);}
 await p.setViewportSize({width:400,height:800});await model(p,{modern:null,legacy:0});check('legacy zero angle restores portrait',!(await guards(p)).rotate);
 await p.setViewportSize({width:800,height:400});await model(p,{modern:null,legacy:null,sw:800,sh:400});check('screen dimensions remain a fallback when APIs are absent',(await guards(p)).rotate);
 await p.setViewportSize({width:800,height:400});await model(p,{modern:null,legacy:null,sw:0,sh:0});check('viewport is the final orientation fallback',(await guards(p)).rotate);
 await focus(p,true);await model(p,{});check('typing suppresses only the viewport-only fallback',!(await guards(p)).rotate);
 await focus(p,false);await p.setViewportSize({width:400,height:800});await model(p,{modern:'portrait-primary',legacy:0,sw:400,sh:800});
 const originalCell=await p.evaluate(()=>JSON.stringify(__pilot.recoveryState().currentCell)),point=await p.locator('#start').boundingBox(),cdp=await p.context().newCDPSession(p);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x+point.width/2,y:point.y+point.height/2}]});await p.waitForFunction(()=>!!__pilot.recoveryState().activeAttempt);
 check('actual task drag begins with a main-phase attempt',await p.evaluate(()=>__pilot.recoveryState().activeAttempt.phase==='main'));
 const invalidBefore=await p.evaluate(()=>__pilot.buildPayload().invalidAttempts.length),abortsBefore=await p.evaluate(()=>__pilot.recoveryState().aborts);
 await model(p,{modern:'landscape-primary',legacy:90});await p.waitForFunction(()=>!__pilot.recoveryState().activeAttempt);
 const cancelled=await p.evaluate(()=>({payload:__pilot.buildPayload(),resume:__pilot.recoveryState()})),last=cancelled.payload.invalidAttempts.at(-1);
 check('physical rotation cancels and preserves exactly one invalid attempt',cancelled.payload.invalidAttempts.length===invalidBefore+1&&last.invalidReason==='orientation_changed'&&last.events.length>0&&last.status==='invalid');
 check('orientation invalidation increments abort count once without recording an answer',cancelled.resume.aborts===abortsBefore+1&&cancelled.payload.trials.length===0);
 await model(p,{});check('repeated orientation events do not duplicate the cancelled attempt',await p.evaluate(n=>__pilot.buildPayload().invalidAttempts.length===n,invalidBefore+1));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await model(p,{modern:'portrait-primary',legacy:0});
 check('portrait return retains the same question for retry',await p.evaluate(old=>JSON.stringify(__pilot.recoveryState().currentCell)===old,originalCell));
 const pc=await open({modern:'landscape-primary',legacy:90,touch:0},'',false,{width:800,height:400});check('non-touch desktop retains no rotation guard',!(await guards(pc)).rotate);
 const opt=await open({modern:'landscape-primary',legacy:90},'&rotate=0',false,{width:800,height:400});g=await guards(opt);check('rotate=0 continues to disable only the rotation guard',!g.rotate&&!g.zoom,g);
 if(fs.existsSync(path.join(before,'index.html'))){const old=await open({modern:'landscape-primary',legacy:90},'',true,{width:800,height:400});const prior=await guards(old);check('frozen previous source reproduces wrong zoom guidance for fixed portrait screen',!prior.rotate&&prior.zoom&&prior.measurement.pageZoom===.5,prior);await old.screenshot({path:path.join(scratch,'orientation-before-800x400.png')});}
 check('no collector/external request was attempted',report.unexpectedRequests.length===0,report.unexpectedRequests);check('no JavaScript exceptions',report.errors.length===0,report.errors);
 report.sourceAfterSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'index.html'))).digest('hex');check('orientation source remained stable during verification',report.sourceAfterSha256===report.sourceSha256);
})().catch(e=>{report.failure=String(e.stack||e);console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.filter(c=>!c.pass).length+(process.exitCode?1:0);fs.writeFileSync(path.join(__dirname,'orientation-results.json'),JSON.stringify(report,null,2)+'\n');});
