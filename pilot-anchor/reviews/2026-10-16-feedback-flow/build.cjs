'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dir=__dirname,app=path.resolve(dir,'../..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),norm=b=>b.toString().replace(/\r\n/g,'\n');
const manifestPath=path.join(dir,'source-manifest.json'),existing=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null,source={};
const files=existing?Object.keys(existing.source):require(path.join(app,'screen-gallery/source-assets.cjs'));
for(const f of files){const dest=path.join(dir,'app',f);if(existing){if(!fs.existsSync(dest)||sha(norm(fs.readFileSync(dest)))!==existing.source[f])throw Error('Frozen asset changed: '+f);source[f]=existing.source[f];}else{const content=fs.readFileSync(path.join(app,f)),h=sha(norm(content));source[f]=h;fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);}}
let html=fs.readFileSync(path.join(dir,'app/index.html'),'utf8');
const inlineStart=html.indexOf('<script>'),inlineEnd=html.indexOf('</script>',inlineStart);if(inlineStart<0||inlineEnd<0)throw Error('Main runtime marker changed');
let runtime=html.slice(inlineStart+8,inlineEnd),marker='  // 自動検証用フック (?debug=1';const injection=fs.readFileSync(path.join(dir,'fixture-bridge.js'),'utf8');
if(!runtime.includes(marker))throw Error('Runtime injection marker changed');runtime=runtime.replace(marker,()=>injection+'\n'+marker);
fs.writeFileSync(path.join(dir,'app/preview-runtime.js'),runtime);
html=html.slice(0,inlineStart)+'<script src="preview-runtime.js"></script>'+html.slice(inlineEnd+9);
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; worker-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><script src="../fixture-bootstrap.js"></script>');
html=html.replace('</head>','<link rel="stylesheet" href="../candidate.css?v=compact-practice1"></head>').replace('<script src="bank.js','<script src="../changes-data.js?v=compact-practice1"></script><script src="../candidate-ui.js?v=compact-practice1"></script><script src="bank.js').replace(/<title>[^<]*<\/title>/,'<title>練習と本番注意の仮画面 · 送信なし</title>');
fs.writeFileSync(path.join(dir,'app/preview.html'),html);
if(!existing)fs.writeFileSync(manifestPath,JSON.stringify({capturedAt:new Date().toISOString(),appVersion:'2026-10-15-ui20',scope:'Current production source frozen for a disposable UI comparison. app/index.html is unmodified; preview.html/runtime contain explicitly isolated fixtures and presentation overrides.',source},null,2)+'\n');
console.log(JSON.stringify({sourceFiles:files.length,usesFrozenSnapshot:true,productionMutationByBuild:false,preview:'app/preview.html'}));
