'use strict';
// Reuse the real-flow layout driver; inject only TouchEvents, never PointerEvents,
// into rendered regions. No participant data or external request is permitted.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const app=path.resolve(__dirname,'../..'),driver=path.join(app,'test-screen-layout.cjs');
const variant=process.env.AUDIT_VARIANT||'current';
if(!['before','current'].includes(variant))throw Error('Unknown audit variant');
process.env.APP_ROOT=variant==='before'?path.join(app,'reviews/2026-10-15-guided-release/before'):app;
process.env.OUTPUT_DIR=path.resolve(process.env.OUTPUT_DIR||path.join(app,'../../_work/behavior-audit/guard-'+variant));
let src=fs.readFileSync(driver,'utf8');
const guardProbe=async function(page,name){
 const result=await page.evaluate(()=>{
  const rows=[],seen=new Set(),controlSelector='button,input,select,textarea,a[href],label,[role="button"],[role="link"],[contenteditable="true"],[data-tap-action]';
  const points=[];
  for(let y=8;y<innerHeight;y+=54)for(let x=8;x<innerWidth;x+=54)points.push([x,y]);
  for(const e of document.querySelectorAll('body *')){const r=e.getBoundingClientRect();if(r.width>2&&r.height>2&&r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight)points.push([Math.min(innerWidth-1,Math.max(1,r.x+r.width/2)),Math.min(innerHeight-1,Math.max(1,r.y+r.height/2))]);}
  let sample=null;
  for(const [x,y]of points){
   const el=document.elementFromPoint(x,y);if(!el||seen.has(el))continue;seen.add(el);
   const c=el.closest(controlSelector),action=c?.tagName==='LABEL'?c.control:c,enabled=!!action&&!action.matches(':disabled,[aria-disabled="true"]'),task=!!el.closest('#task'),taskButton=!!el.closest('#task button');
   const chain=[];for(let n=el;n;n=n.parentElement)chain.push({tag:n.tagName,id:n.id,touchAction:getComputedStyle(n).touchAction});
   const cssGuard=chain.some(n=>['none','manipulation','pan-y','pan-x'].includes(n.touchAction));
   const t=new Touch({identifier:48301,target:el,clientX:x,clientY:y});
   el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));
   const end=new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t]});el.dispatchEvent(end);
   const expectedCancel=task?!taskButton:!enabled;
   const cm=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});el.dispatchEvent(cm);
   const code=!!el.closest('#ccode');
   rows.push({target:el.id||el.tagName,point:[x,y],task,enabled,taskButton,expectedCancel,canceled:end.defaultPrevented,cssGuard,contextCanceled:cm.defaultPrevented,code,chain});
   if(!sample&&!task&&!enabled)sample={x,y};
  }
  const gesture=new Event('gesturestart',{bubbles:true,cancelable:true});document.dispatchEvent(gesture);
  return {screen:window.__pilot?.activeScreen(),rows,gestureCanceled:gesture.defaultPrevented,sample,scale:visualViewport.scale};
 });
 // Native Chrome dispatch exercises actual default handling on static regions.
 // Task states may hold a real pointer in the flow driver: never disturb it.
 const tutorialActive=await page.evaluate(()=>{const s=window.__pilot?.helpState();return s?.drag?.index>=0||s?.rating?.index>=0;});
 if(result.sample&&result.screen!=='task'&&!tutorialActive){const cdp=await page.context().newCDPSession(page);for(let i=0;i<2;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[result.sample]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(90);}result.scaleAfter=await page.evaluate(()=>visualViewport.scale);await cdp.detach();}
 report.guardAudit ||= [];report.guardAudit.push({name,...result});
 check(name+': all hit regions keep touch-action guard',result.rows.length>0&&result.rows.every(r=>r.cssGuard),result.rows.filter(r=>!r.cssGuard));
 check(name+': static cancellation and enabled native controls preserved',result.rows.every(r=>r.canceled===r.expectedCancel),result.rows.filter(r=>r.canceled!==r.expectedCancel));
 check(name+': context-menu suppression with completion-code exception',result.rows.every(r=>r.contextCanceled===!r.code));
 check(name+': global gesturestart cancellation',result.gestureCanceled);
 if(result.scaleAfter!==undefined)check(name+': actual Chrome double tap leaves scale unchanged',Math.abs(result.scaleAfter-result.scale)<.001);
};
// The function runs in the driver's lexical scope so checks and results share one report.
src=src.replace('async function capture(page,name,selectors,pairs=[],scroll=false){',guardProbe.toString().replace('async function(page,name)','async function guardProbe(page,name)')+'\nasync function capture(page,name,selectors,pairs=[],scroll=false){');
const marker="report.screens.push({name,file,capturedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(png).digest('hex'),geometry:g,text:await page.locator('body').innerText()});";
if(!src.includes(marker))throw Error('Flow driver capture contract changed');
src=src.replace(marker,marker+'\n await guardProbe(page,name);');
src=src.replace(/const viewports=\[\['mini',375,700\][\s\S]*?;report\.viewports=/,"const viewports=[['guard',402,759]];report.viewports=");
const driverModule=new Module(driver,module);driverModule.filename=driver;driverModule.paths=Module._nodeModulePaths(path.dirname(driver));driverModule._compile(src,driver);
