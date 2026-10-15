'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'),'utf8'));
const result={at:new Date().toISOString(),checks:[],errors:[],remote:[]};
const check=(name,pass,detail)=>{result.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});if(!pass)throw Error(name+': '+JSON.stringify(detail));};
let browser,server;
const all=manifest.screens.length,flow=manifest.screens.filter(s=>s.kind==='flow').length,branches=all-flow;
(async()=>{
  const sourceFiles=require('./source-assets.cjs');
  check('all '+sourceFiles.length+' distribution assets have provenance',Object.keys(manifest.source).length===sourceFiles.length&&sourceFiles.every(f=>manifest.source[f]));
  const flowCapture=JSON.parse(fs.readFileSync(path.join(root,'data/flow.json'),'utf8'));
  const stepIds=flowCapture.verification.tutorialStepIds||[],quizIds=flowCapture.verification.quizIds||[];
  check('all 14 guided tutorial states captured',stepIds.length===14&&stepIds.filter(id=>id!=='rule-check').every(id=>manifest.screens.some(s=>s.id==='flow-tutorial-'+id)));
  check('all 7 review questions with correction captured',quizIds.length===7&&quizIds.every(id=>['','-wrong','-correct'].every(suffix=>manifest.screens.some(s=>s.id==='flow-quiz-'+id+suffix))));
  check('example and unnumbered practice introductions captured',['flow-example-intro','flow-practice-intro'].every(id=>manifest.screens.some(s=>s.id===id)));
  check('four rating explanation pages captured',[1,2,3,4].every(i=>manifest.screens.some(s=>s.id==='flow-rating-tutorial-'+i)));
  check('motor observation and participant states captured',['motor-route-moving','motor-route-another','motor-range-inside','motor-press','motor-drag','motor-success','motor-stray','motor-retry','motor-outside'].every(id=>manifest.screens.some(s=>s.id==='flow-tutorial-'+id)));
  check('animation stills use named native phases',flowCapture.verification.animationStills?.captured?.length===15&&flowCapture.verification.animationStills.errors.length===0&&flowCapture.verification.animationStills.remote.length===0);
  server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'text/plain'});res.end(err?'missing':data);});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  fs.mkdirSync(path.join(root,'data/preview'),{recursive:true});
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
    page.on('pageerror',e=>result.errors.push(e.message));
    await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();result.remote.push(url);return route.abort();});
    await page.goto(base+'/index.html');
    check(width+' initial normal flow',await page.locator('.screen-card').count()===flow);
    const badge=await page.locator('.screen-card').first().locator('.condition-badge').count();
    check(width+' normal screen has no condition badge',badge===0);
    for(const kind of ['flow','branches','all']){
      await page.locator('[data-view="'+kind+'"]').click();
      check(width+' '+kind+' count',await page.locator('.screen-card').count()===({flow,branches,all})[kind]);
      const ids=await page.locator('[id]').evaluateAll(elements=>elements.map(e=>e.id));
      check(width+' '+kind+' unique DOM ids',new Set(ids).size===ids.length);
      const bad=await page.locator('#outline a').evaluateAll(links=>links.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
      check(width+' '+kind+' outline targets',bad.length===0,bad);
    }
    for(const size of Object.keys(manifest.devices)){
      await page.locator('[data-device="'+size+'"]').click();
      const metrics=await page.locator('.image-button img').evaluateAll((images,size)=>({count:images.length,bad:images.filter(i=>!i.getAttribute('src').startsWith('images/'+size+'/')).length}),size);
      check(width+' '+size+' all images switch',metrics.count===all && metrics.bad===0,metrics);
      const first=page.locator('.image-button img').first();
      await first.evaluate(async img=>{if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});});
      check(width+' '+size+' first image decoded',await first.evaluate(img=>img.naturalWidth===Number(img.getAttribute('width'))));
      check(width+' '+size+' no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('#compare').check();
    check(width+' comparison count',await page.locator('.image-button').count()===all*3);
    const scale=await page.locator('.screen-card').first().locator('img').evaluateAll(images=>images.map(img=>img.getBoundingClientRect().width/Number(img.getAttribute('width'))));
    check(width+' comparison same scale',Math.max(...scale)-Math.min(...scale)<.015,scale);
    check(width+' comparison no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.image-button').first().click();
    check(width+' opens comparison dialog',await page.locator('#lightbox').evaluate(e=>e.open) && await page.locator('#lightbox-content img').count()===3);
    const title=await page.locator('#lightbox-title').innerText();
    await page.locator('#next').click();
    check(width+' next screen',await page.locator('#lightbox-title').innerText()!==title);
    await page.locator('#previous').click();
    check(width+' previous screen',await page.locator('#lightbox-title').innerText()===title);
    await page.locator('#lightbox-device').selectOption('iphone17');
    check(width+' dialog device switch',await page.locator('#lightbox-content img').count()===1 && (await page.locator('#lightbox-content img').getAttribute('src')).startsWith('images/iphone17/'));
    await page.keyboard.press('Escape');
    check(width+' Escape closes dialog',!await page.locator('#lightbox').evaluate(e=>e.open));
    await page.locator('[data-view="branches"]').click();
    check(width+' view change clears stale hash',new URL(page.url()).hash==='');
    await page.reload();
    check(width+' selected view survives reload',await page.locator('.screen-card').count()===branches);
    await page.locator('[data-view="all"]').click();
    await page.locator('#search').fill('アンケート');
    check(width+' search returns subset',await page.locator('.screen-card').count()>0 && await page.locator('.screen-card').count()<all);
    await page.locator('#search').fill('zz-no-matching-screen-987');
    check(width+' empty search result',await page.locator('.screen-card').count()===0 && await page.locator('#empty').isVisible());
    await page.locator('#clear').click();
    check(width+' reset shows all',await page.locator('.screen-card').count()===all);
    await page.locator('[data-view="flow"]').click();
    await page.locator('[data-device="mini"]').click();
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(root,`data/preview/${width}-gallery.png`)});
    if(width===1440){
      await page.locator('#compare').check();
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      await page.locator('.screen-card').first().locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
      await page.screenshot({path:path.join(root,'data/preview/compare.png')});
      await page.locator('#search').fill('本番 1問目');
      await page.locator('.screen-card').first().locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
      await page.screenshot({path:path.join(root,'data/preview/main-comparison.png')});
    }
    await page.close();
  }
  const offline=await browser.newPage();
  offline.on('pageerror',e=>result.errors.push(e.message));
  await offline.goto(pathToFileURL(path.join(root,'index.html')).href);
  check('local file opens without fetch',await offline.locator('.screen-card').count()===flow);
  await offline.close();
  check('no browser JavaScript errors',result.errors.length===0,result.errors);
  check('no remote traffic',result.remote.length===0,result.remote);
})().catch(e=>{result.errors.push(e.stack);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  result.passed=result.checks.filter(c=>c.pass).length;result.failed=result.checks.filter(c=>!c.pass).length;
  fs.writeFileSync(path.join(root,'data/verification.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,failed:result.failed,errors:result.errors}));
});
