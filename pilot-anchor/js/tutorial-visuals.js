'use strict';
// 独立試作の実演。座標は描画用のみ。経路の線は描かず、現在の指を動かす。
window.PILOT_GUIDED_TUTORIAL.createDemo=function({canvas,start,target,onReady,onChange,fingerScale}){
 const g=canvas.getContext('2d'),seen=new Set(),durations={press:350,move:1300,release:500,wait:600};
 let frame=0,lastTime=0,s=null,extraReady=null,changed=null;
 const lerp=(a,b,t)=>a+(b-a)*t,random=(a,b)=>a+Math.random()*(b-a),clamp=(a,b,x)=>Math.min(b,Math.max(a,x));
 const bezier=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;};
 function center(el){const r=el.getBoundingClientRect(),p=canvas.parentElement.getBoundingClientRect();return{x:r.x+r.width/2-p.x,y:r.y+r.height/2-p.y,w:r.width,h:r.height};}
 function size(){const dpr=devicePixelRatio||1,r=canvas.parentElement.getBoundingClientRect();canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';g.setTransform(dpr,0,0,dpr,0,0);}
 function clear(){g.save();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,canvas.width,canvas.height);g.restore();}
 function ring(x,y,r,alpha,color){g.save();g.globalAlpha=alpha;g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.stroke();g.restore();}
 function finger(x,y,alpha){
  const scale=fingerScale??Math.min(canvas.parentElement.clientWidth,canvas.parentElement.clientHeight)/375*.82;
  g.save();g.globalAlpha=alpha;g.translate(x,y);g.scale(scale,scale);g.translate(-22,-2);g.fillStyle='#f4d7b8';g.strokeStyle='#5b3a1e';g.lineWidth=1.8;g.lineJoin='round';g.lineCap='round';
  const shape=new Path2D('M22 2 c-3.3 0 -6 2.7 -6 6 v30 c-3 -2.5 -8.5 -3 -11.5 0 c-3 3 -1.5 7.5 1.5 10.5 l9 12 c4.5 7.5 10.5 11.5 20 11.5 h7 c8.5 0 15 -6.5 15 -15 v-18 c0 -3 -2.2 -5 -5 -5 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-1.6 0 -3 0.7 -4 1.9 V8 c0 -3.3 -2.7 -6 -6 -6 z');
  g.fill(shape);g.stroke(shape);g.fillStyle='#fbece0';g.lineWidth=1.2;g.beginPath();g.ellipse(22,9.5,3.6,5.2,0,0,Math.PI*2);g.fill();g.stroke();g.restore();
 }
 function freshPath(){
  const a=center(start),b=center(target);let ex,ey;
  if(s.kind==='range'){
   const points=[[-.29,-.22],[.28,.23],[-.27,.2],[.3,-.2]];const p=points[s.cycles%points.length];ex=b.x+p[0]*b.w;ey=b.y+p[1]*b.h;
  }else{ex=b.x+random(-.28,.28)*b.w;ey=b.y+random(-.23,.23)*b.h;}
  const sx=a.x+random(-.1,.1)*a.w,sy=a.y+random(-.09,.09)*a.h,dx=ex-sx,dy=ey-sy,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
  // 最初は左右の違いが明確な曲線。その後もゼロに近い曲がりを避ける。
  const sign=s.cycles<2?s.firstSign*(s.cycles===0?1:-1):(Math.random()<.5?-1:1);
  const opposite=s.cycles>=2&&Math.random()<.35;
  const o1=sign*random(.22,.31)*L,o2=(opposite?-sign:sign)*random(.24,.32)*L;
  const c1={x:sx+dx*.3+nx*o1,y:sy+dy*.3+ny*o1},c2={x:sx+dx*.72+nx*o2,y:sy+dy*.72+ny*o2};
  const W=canvas.parentElement.clientWidth;c1.x=clamp(36,W-36,c1.x);c2.x=clamp(36,W-36,c2.x);
  s.path={start:{x:sx,y:sy},c1,c2,end:{x:ex,y:ey}};s.pathType=opposite?'s-curve':sign<0?'left-curve':'right-curve';
 }
 function ready(){if(!s.captionVisible){s.captionVisible=true;seen.add(s.key);}extraReady?.(true);onReady?.(true);}
 function draw(){
  if(!s)return;clear();const p=s.path,t=s.elapsed/durations[s.phase];
  start.classList.toggle('armed',s.phase==='press'||s.phase==='move');start.textContent='スタート';target.classList.toggle('arrived',s.phase==='release'||s.phase==='wait');
  if(s.reduced){const a=center(start),b=center(target);ring(a.x,a.y,18,.9,'#b8531a');ring(b.x-b.w*.29,b.y-b.h*.22,17,.9,'#12855a');ring(b.x+b.w*.28,b.y+b.h*.23,17,.9,'#12855a');return;}
  if(s.phase==='press'){finger(p.start.x,p.start.y,1);ring(p.start.x,p.start.y,17+4*t,.8,'#b8531a');}
  else if(s.phase==='move'){const e=t*t*(3-2*t),x=bezier(p.start.x,p.c1.x,p.c2.x,p.end.x,e),y=bezier(p.start.y,p.c1.y,p.c2.y,p.end.y,e);finger(x,y,1);ring(x,y,19,.8,'#b8531a');}
  else if(s.phase==='release'){finger(p.end.x,p.end.y,1-t);ring(p.end.x,p.end.y,19+24*t,1-t,'#12855a');}
 }
 function tick(now){
  frame=0;if(!s||!s.running)return;
  if(!s.paused&&!s.reduced){s.elapsed+=Math.min(80,Math.max(0,now-lastTime));while(s.elapsed>=durations[s.phase]){s.elapsed-=durations[s.phase];if(s.phase==='press')s.phase='move';else if(s.phase==='move')s.phase='release';else if(s.phase==='release'){s.cycles++;s.phase='wait';if(s.cycles>=2)ready();}else{s.phase='press';freshPath();}}draw();}
  lastTime=now;frame=requestAnimationFrame(tick);
 }
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;if(s)s.running=false;s=null;clear();canvas.hidden=true;start.classList.remove('armed');start.textContent='スタート';target.classList.remove('arrived');}
 function begin(options){
  stop();size();extraReady=options.onReady;changed=options.onChange;
  s={key:options.key,kind:options.kind,cycles:0,captionVisible:!!options.captionInitially||seen.has(options.key),paused:false,running:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,phase:'press',elapsed:0,firstSign:options.capture?-1:Math.random()<.5?-1:1,pathType:null,path:null};
  canvas.hidden=false;freshPath();extraReady?.(s.captionVisible);onReady?.(s.captionVisible);
  if(options.capture){sample(options.phase||'after');return;}
  if(s.reduced){s.paused=true;ready();draw();changed?.(s);onChange?.(s);return;}
  lastTime=performance.now();draw();frame=requestAnimationFrame(tick);changed?.(s);onChange?.(s);
 }
 function pause(){if(!s)return;s.paused=!s.paused;lastTime=performance.now();changed?.(s);onChange?.(s);}
 function replay(){if(!s)return;const keep=s.captionVisible;s.cycles=0;s.elapsed=0;s.phase='press';s.paused=s.reduced;s.captionVisible=keep;freshPath();lastTime=performance.now();draw();changed?.(s);onChange?.(s);}
 function sample(phase,cycles){if(!s)return;if(frame)cancelAnimationFrame(frame);frame=0;s.paused=true;s.cycles=Number.isInteger(cycles)?Math.max(0,cycles):phase==='before'?0:2;s.phase=['press','release'].includes(phase)?phase:'move';s.elapsed=durations[s.phase]*.6;freshPath();if(s.captionVisible)seen.add(s.key);extraReady?.(s.captionVisible);onReady?.(s.captionVisible);draw();changed?.(s);}
 return{begin,stop,pause,replay,sample,state:()=>s?JSON.parse(JSON.stringify(s)):null};
};

'use strict';
// 独立試作の初動説明。回答先を描かず、触れてから枠を出る区間だけを見せる。
window.PILOT_GUIDED_TUTORIAL.createTimeDemo=function({container}){
 const durations={idle:1000,press:650,move:1200,exit:1100,reset:650};
 const bounds={x:102,y:88,width:126,height:56},from={x:160,y:109},to={x:205,y:64};
 let frame=0,lastTime=0,s=null,svg=null,finger=null,ghost=null,button=null,buttonText=null,ring=null,touchLabel=null,exitLabel=null,borderGlow=null;
 const hand='M22 2 c-3.3 0 -6 2.7 -6 6 v30 c-3 -2.5 -8.5 -3 -11.5 0 c-3 3 -1.5 7.5 1.5 10.5 l9 12 c4.5 7.5 10.5 11.5 20 11.5 h7 c8.5 0 15 -6.5 15 -15 v-18 c0 -3 -2.2 -5 -5 -5 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-1.6 0 -3 0.7 -4 1.9 V8 c0 -3.3 -2.7 -6 -6 -6 z';
 const eased=t=>t*t*(3-2*t);
 const bezier=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;};
 function setHand(el,p,alpha=1){el.setAttribute('transform',`translate(${p.x} ${p.y}) scale(.52) translate(-22 -2)`);el.setAttribute('opacity',String(alpha));}
 function mount(){
  container.classList.add('start-exit-demo');
  container.innerHTML=`<svg class="start-exit-svg" viewBox="70 0 200 208" preserveAspectRatio="xMidYMid meet" role="img" aria-label="スタートボタンに指を置き、指を離さず、3秒以内にボタンの枠の外へ動かします。回答先はこの図には表示していません。">
   <rect class="start-exit-border-glow" x="99" y="85" width="132" height="62" rx="17" />
   <rect class="start-exit-button" x="102" y="88" width="126" height="56" rx="14" />
   <text class="start-exit-button-text" x="165" y="122" text-anchor="middle">スタート</text>
   <g class="start-exit-ghost" aria-hidden="true"><path d="${hand}" /></g>
   <circle class="start-exit-ring" r="14" />
   <g class="start-exit-finger" aria-hidden="true"><path d="${hand}" /><ellipse class="start-exit-nail" cx="22" cy="9.5" rx="3.6" ry="5.2" /></g>
   <text class="start-exit-touch-label" x="165" y="168" text-anchor="middle">触れる</text>
   <text class="start-exit-label" x="165" y="48" text-anchor="middle">枠の外へ出る</text>
   <text class="start-exit-interval" x="165" y="196" text-anchor="middle">この間が3秒以内</text>
  </svg>`;
  svg=container.querySelector('svg');finger=svg.querySelector('.start-exit-finger');ghost=svg.querySelector('.start-exit-ghost');button=svg.querySelector('.start-exit-button');buttonText=svg.querySelector('.start-exit-button-text');ring=svg.querySelector('.start-exit-ring');touchLabel=svg.querySelector('.start-exit-touch-label');exitLabel=svg.querySelector('.start-exit-label');borderGlow=svg.querySelector('.start-exit-border-glow');
 }
 function draw(){
  if(!s)return;
  const t=Math.max(0,Math.min(1,s.elapsed/durations[s.phase]));
  let p={...from},alpha=s.phase==='idle'?0:1;
  if(s.phase==='move'){
   const e=eased(t);p={x:bezier(from.x,184,200,to.x,e),y:bezier(from.y,106,78,to.y,e)};
  }else if(s.phase==='exit'||s.phase==='reset'){
   p={...to};if(s.phase==='reset')alpha=1-t;
  }
  if(s.reduced)p={...to};
  const contacted=s.phase!=='idle'||s.reduced,exited=contacted&&p.y<bounds.y;
  s.finger=p;s.exited=exited;s.contacted=contacted;
  setHand(finger,p,alpha);setHand(ghost,from,s.reduced ? .42 : 0);
  button.classList.toggle('armed',contacted);
  buttonText.classList.toggle('armed',contacted);
  buttonText.textContent='スタート';
  ring.setAttribute('cx',String(p.x));ring.setAttribute('cy',String(p.y));
  ring.setAttribute('r',String(exited?14+(!s.reduced&&s.phase==='exit'?2*Math.sin(t*Math.PI):0):12));
  ring.setAttribute('opacity',String(!contacted?0:exited?alpha:.45));
  ring.classList.toggle('outside',exited);
  borderGlow.style.opacity=String(exited ? .45*alpha : 0);
  touchLabel.style.opacity=String(contacted?1:0);
  exitLabel.style.opacity=String(exited?1:0);
 }
 function tick(now){
  frame=0;if(!s||!s.running)return;
  s.elapsed+=Math.min(80,Math.max(0,now-lastTime));
  while(s.elapsed>=durations[s.phase]){
   s.elapsed-=durations[s.phase];
   if(s.phase==='idle')s.phase='press';
   else if(s.phase==='press')s.phase='move';
   else if(s.phase==='move')s.phase='exit';
   else if(s.phase==='exit')s.phase='reset';
   else{s.phase='idle';s.cycles++;}
  }
  lastTime=now;draw();frame=requestAnimationFrame(tick);
 }
 function stop(){
  if(frame)cancelAnimationFrame(frame);frame=0;
  if(s)s.running=false;s=null;
  container.replaceChildren();container.classList.remove('start-exit-demo');
 }
 function sample(phase='exit'){
  if(!s)return;if(frame)cancelAnimationFrame(frame);frame=0;
  s.captured=true;s.phase=durations[phase]?phase:'exit';s.elapsed=durations[s.phase]*(s.phase==='move'?.7:.35);draw();
 }
 function begin(options={}){
  stop();mount();
  s={phase:'idle',elapsed:0,cycles:0,running:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,captured:false,finger:{...from},exited:false,startBounds:{...bounds}};
  const captured=options.capture??(new URLSearchParams(location.search).get('capture')==='1');
  if(captured){sample(options.phase||'exit');return;}
  if(s.reduced){s.phase='exit';draw();return;}
  lastTime=performance.now();draw();frame=requestAnimationFrame(tick);
 }
 return{begin,stop,sample,state:()=>s?JSON.parse(JSON.stringify(s)):null};
};

'use strict';
// 説明箱だけを前の位置から次の位置へつなぐ。本番の操作パーツは動かさない。
window.PILOT_GUIDED_TUTORIAL.createCardMotion=function({getCard,disabled}){
 let animation=null,version=0,current={running:false,from:null,to:null};
 function snapshot(){const el=getCard();if(!el)return null;const r=el.getBoundingClientRect();return r.width&&r.height?{x:r.x,y:r.y,width:r.width,height:r.height}:null;}
 function finish(){version++;if(animation){animation.finish();animation=null;}current.running=false;}
 function run(from){
  version++;if(animation){animation.cancel();animation=null;}current={running:false,from,to:snapshot()};
  const card=getCard();if(!card||disabled())return;
  const to=current.to;if(!to)return;const ticket=version;
  const frames=from?[{transform:'translate('+(from.x-to.x)+'px,'+(from.y-to.y)+'px)',opacity:.78},{transform:'translate(0,0)',opacity:1}]:[{opacity:.35},{opacity:1}];
  current.running=true;animation=card.animate(frames,{duration:from?320:180,easing:'cubic-bezier(.22,.7,.2,1)'});
  animation.finished.then(()=>{if(version===ticket){animation=null;current.running=false;}}).catch(()=>{});
 }
 return{snapshot,run,finish,state:()=>JSON.parse(JSON.stringify(current))};
};
