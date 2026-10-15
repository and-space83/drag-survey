/* Freeze the app's own animation player at named phases for readable stills.
 * This does not change participant copy, geometry or input handling. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(process.env.APP_ROOT||path.join(__dirname,'..')),out=__dirname,files=require('./source-assets.cjs');
let captureWriteSeq=0;
function writeCapture(target,data){const resolved=path.resolve(target);if(!resolved.startsWith(path.resolve(out)+path.sep))throw Error('Capture output outside gallery');const temp=resolved+'.tmp-'+process.pid+'-'+(++captureWriteSeq);try{fs.writeFileSync(temp,data);for(let attempt=0;;attempt++){try{fs.renameSync(temp,resolved);return;}catch(error){if(!['UNKNOWN','EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=9)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}}}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
const flow=JSON.parse(fs.readFileSync(path.join(out,'data/flow.json'),'utf8')),assets=new Map();
for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),digest=crypto.createHash('sha256').update(bytes.toString().replace(/\r\n/g,'\n')).digest('hex');if(flow.source[file]!==digest)throw Error('Visual refresh source differs: '+file);assets.set('/'+file,bytes);}
const observe=function(){window.__galleryPlayers={};for(const key of ['createDemo','createTimeDemo']){const original=PILOT_GUIDED_TUTORIAL[key];PILOT_GUIDED_TUTORIAL[key]=function(options){const api=original.call(this,options);window.__galleryPlayers[key]=api;return api;};}};
const html=require('../lib/app-source.cjs').readAppSource(root,assets.get('/index.html').toString());
if(!/const DragTut\s*=/.test(html))throw Error('DragTut connection missing');
require('../lib/app-source.cjs').transformAppScripts(assets,text=>text.replace(/const DragTut\s*=/,'('+observe.toString()+')(); const DragTut ='));
const sizes=[{id:'mini',width:375,height:700,sh:812},{id:'iphone17',width:402,height:759,sh:874},{id:'max',width:440,height:841,sh:956}];
const cases=[
 {step:'motor-route',id:'tutorial-motor-route-moving',factory:'createDemo',phase:'move',cycles:0,title:'操作の見本 — 指を離さずに運ぶ途中'},
 {step:'motor-route',id:'tutorial-motor-route-another',factory:'createDemo',phase:'move',cycles:1,title:'操作の見本 — 別の道すじ'},
 {step:'motor-range',id:'tutorial-motor-range-inside',factory:'createDemo',phase:'release',cycles:0,title:'離す場所の見本 — 枠の内側'},
 {step:'time-rule',id:'tutorial-time-rule-touch',factory:'createTimeDemo',phase:'press',title:'3秒の区間 — スタートに触れる'},
 {step:'time-rule',id:'tutorial-time-rule-exit',factory:'createTimeDemo',phase:'exit',title:'3秒の区間 — スタートの枠を出る'}
];
let browser;const errors=[],remote=[],captured=[];
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,key=pathname==='/'?'/index.html':pathname,data=assets.get(key);if(!data||req.method!=='GET'){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(key)]||'application/octet-stream');res.end(data);});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 for(const size of sizes){const ctx=await browser.newContext({viewport:{width:size.width,height:size.height},screen:{width:size.width,height:size.sh},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'no-preference',locale:'ja-JP',timezoneId:'Asia/Tokyo',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){remote.push(u.href);return route.abort();}return route.continue();});
  await ctx.addInitScript(()=>{let seed=20261015;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  for(const item of cases){await p.goto(origin+'/?block=moral&go=tut&gstep='+item.step+'&debug=1&upload=0&mic=0&minread=0');await p.waitForFunction(id=>window.__pilot?.helpState().drag.stepId===id,item.step);await p.addStyleTag({content:'#goBadge{display:none!important}'});
   const state=await p.evaluate(item=>{const player=window.__galleryPlayers[item.factory];player.sample(item.phase,item.cycles);return player.state();},item);
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const screen=flow.screens.find(s=>s.id==='flow-'+item.id);if(!screen)throw Error('Missing normal-flow still: '+item.id);
   writeCapture(path.join(out,screen.images[size.id].src),await p.screenshot({animations:'disabled'}));screen.title=item.title;screen.text[size.id]=(await p.locator('body').innerText()).replace(/^あいうえお0123456789あいうえお0123456789\n/,'');screen.animationCapture={method:'Native animation sample API; display phase only. Participant input and production source unchanged.',phase:item.phase,...(item.cycles===undefined?{}:{cycles:item.cycles})};captured.push({size:size.id,id:screen.id,phase:state.phase});console.log(size.id+' '+item.id);
  }await ctx.close();
 }
 if(errors.length||remote.length)throw Error(JSON.stringify({errors,remote}));
 flow.verification.animationStills={at:new Date().toISOString(),captured,errors,remote,motionPreference:'no-preference'};writeCapture(path.join(out,'data/flow.json'),JSON.stringify(flow,null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
