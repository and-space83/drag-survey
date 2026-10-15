'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=__dirname;
const port=Number(process.env.PORT || 8042);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let name;
  try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){res.writeHead(400).end();return;}
  if(name==='/')name='/index.html';
  const file=path.resolve(root,'.'+name);
  if(req.method!=='GET'||!file.startsWith(root+path.sep)||!mime[path.extname(file)]){res.writeHead(403).end();return;}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store'});res.end(error?'Not found':bytes);});
}).listen(port,'127.0.0.1',()=>console.log(`Screen gallery: http://127.0.0.1:${port}/`));
