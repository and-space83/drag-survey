'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const app=path.resolve(__dirname,'../..'),work=path.join(__dirname,'_generated','overlay-guards');
const base=JSON.parse(fs.readFileSync(path.join(__dirname,'layout-results.json'),'utf8'));
const partial={...base,selectedCases:['tutorial'],checks:base.checks.filter(c=>/\/tutorial|\/guided|\/motor|\/example|^no /.test(c.name)),screens:base.screens.filter(s=>/\/(tutorial|guided-example|example)/.test(s.name))};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const report={at:new Date().toISOString(),scope:'部分再撮影による異なる本番ソースの混在・対象外の失敗の隠蔽を拒否し、入力結果を変更しないこと。',checks:[]};
for(const [name,mutate,expected] of [
 ['different-source',(b,p)=>{p.source['index.html']='0'.repeat(64);},'Overlay source, viewport or motion preference differs'],
 ['different-viewport',(b,p)=>{p.viewports.mini=[375,699];},'Overlay source, viewport or motion preference differs'],
 ['unrelated-failure',(b,p)=>{b.checks.push({name:'outside-the-recaptured-case',pass:false});b.failed++;},'Overlay leaves unrelated failures unresolved']
]){
 const folder=path.join(work,name),b=clone(base),p=clone(partial);mutate(b,p);
 fs.mkdirSync(path.join(folder,'base'),{recursive:true});fs.mkdirSync(path.join(folder,'partial'),{recursive:true});
 const input=path.join(folder,'base','results.json');fs.writeFileSync(input,JSON.stringify(b));fs.writeFileSync(path.join(folder,'partial','results.json'),JSON.stringify(p));
 const before=hash(input),child=spawnSync(process.execPath,[path.join(app,'refresh-explanation-review.cjs'),'--from',path.join(folder,'base'),'--overlay',path.join(folder,'partial')],{encoding:'utf8',env:{...process.env,REVIEW_WORK_DIR:folder}});
 const passed=child.status===1&&child.stderr.includes(expected)&&hash(input)===before;
 report.checks.push({name,passed,expected,exitCode:child.status,inputUnchanged:hash(input)===before});console.log((passed?'PASS ':'FAIL ')+name);
}
report.passed=report.checks.every(c=>c.passed);fs.writeFileSync(path.join(__dirname,'overlay-guard-results.json'),JSON.stringify(report,null,2)+'\n');process.exitCode=report.passed?0:1;
