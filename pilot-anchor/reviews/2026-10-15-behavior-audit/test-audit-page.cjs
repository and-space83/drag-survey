'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=__dirname,app=path.resolve(dir,'../..'),report={at:new Date().toISOString(),scope:'Static audit HTML, local GET only; no participant interaction',checks:[],errors:[],remote:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const server=http.createServer((req,res)=>{let f=path.resolve(app,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(req.method!=='GET'||!f.startsWith(app+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end();}const ext=path.extname(f);res.setHeader('Content-Type',ext==='.html'?'text/html;charset=utf-8':ext==='.png'?'image/png':ext==='.json'?'application/json':ext==='.css'?'text/css':ext==='.js'?'application/javascript':'text/plain;charset=utf-8');res.end(fs.readFileSync(f));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/reviews/2026-10-15-behavior-audit/';let browser;
try{browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu']});
for(const width of [375,1200]){const ctx=await browser.newContext({viewport:{width,height:850}});await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin&&r.request().method()==='GET')return r.continue();report.remote.push(r.request().url());return r.abort();});const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
for(const file of ['index.html','data-audit.html','lab-history.html']){await p.goto(base+file);check(file+'/'+width+': no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check(file+'/'+width+': all images loaded',await p.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
const links=await p.locator('a[href]').evaluateAll(es=>es.map(e=>e.href));
for(const href of links){
 const u=new URL(href);if(u.origin!==origin)continue;
 let target=path.resolve(app,'.'+decodeURIComponent(u.pathname));if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
 check(file+': local link '+u.pathname,fs.existsSync(target));
 if(u.hash&&fs.existsSync(target)&&target.endsWith('.html')){
  const id=decodeURIComponent(u.hash.slice(1));
  if(u.pathname.endsWith('/checklist.html')){const linked=await ctx.newPage();await linked.goto(href);await linked.waitForSelector('#'+id);check(file+': dynamic fragment '+id,await linked.locator('#'+id).count()===1);await linked.close();}
  else {const html=fs.readFileSync(target,'utf8');check(file+': fragment '+id,html.includes('id="'+id+'"')||html.includes("id='"+id+"'"));}
 }
}
if(file==='index.html'){check('guard table presents separate before/current state counts',/117状態/.test(await p.locator('body').innerText())&&/91状態/.test(await p.locator('body').innerText()));await p.screenshot({path:path.join(dir,'audit-'+width+'.png'),fullPage:true});}}
await ctx.close();}
}catch(e){report.errors.push(e.stack||String(e));}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
check('no JS errors',!report.errors.length,report.errors);check('no external requests or POSTs',!report.remote.length,report.remote);report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.filter(c=>!c.pass).length;fs.writeFileSync(path.join(dir,'audit-page-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
