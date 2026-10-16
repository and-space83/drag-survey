'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const dir=__dirname,app=path.resolve(process.env.APP_ROOT||path.join(dir,'../..')),workspace=path.resolve(dir,'../../../..');
const {sourceManifest,appAssetPaths}=require('../../lib/app-source.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const report=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));
if(report.failed!==0||!report.passed)throw Error('Final QA has not passed');
const source=sourceManifest(app);if(JSON.stringify(source)!==JSON.stringify(report.source))throw Error('Review and app source differ');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(app,'guided-tutorial.js'),'utf8'),context);
const sizes=[{label:'mini',width:375,height:700},{label:'iPhone 17',width:402,height:759},{label:'Pro Max',width:440,height:841}],images={};
for(const version of ['before','after'])for(const size of sizes)for(let question=1;question<=7;question++)for(const state of ['unselected','wrong','correct']){
  const relative=`${size.width}x${size.height}/quiz-${question}-${state}.png`,file=version==='before'?'before/'+relative:relative,target=path.join(dir,file);
  if(version==='before'&&!fs.existsSync(target)){const baseline=path.join(workspace,'_work/quiz-box-before-qa',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(baseline,target);}
  const bytes=fs.readFileSync(target);if(bytes.readUInt32BE(16)!==size.width||bytes.readUInt32BE(20)!==size.height)throw Error('Image dimensions differ: '+file);images[file]=sha(bytes);
}
const data={generatedAt:new Date().toISOString(),patch:'2026-10-16-quiz-box1',source,sizes,questions:context.window.PILOT_GUIDED_TUTORIAL.checks.map(q=>({id:q.id,copy:q.copy})),images,verification:{passed:report.passed,failed:report.failed,physicalSafari:'not_verified'}};
fs.writeFileSync(path.join(dir,'review-data.js'),'window.QUIZ_BOX_REVIEW = '+JSON.stringify(data,null,2)+';\n');
// A separate review copy: keep the application processing intact, isolate its entry.
const preview=path.join(dir,'app');fs.mkdirSync(preview,{recursive:true});
for(const file of appAssetPaths(app)){const target=path.join(preview,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,file),target);}
let entry=fs.readFileSync(path.join(preview,'index.html'),'utf8');
entry=entry.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; worker-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><script src="preview-bootstrap.js"></script>');
fs.writeFileSync(path.join(preview,'index.html'),entry);
fs.copyFileSync(path.join(dir,'preview-bootstrap.js'),path.join(preview,'preview-bootstrap.js'));
console.log(JSON.stringify({images:Object.keys(images).length,questions:data.questions.length,passed:report.passed}));
