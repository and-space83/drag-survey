'use strict';
// 採用済みチュートリアルの表示定義と描画。実課題の計測・保存はindexのエンジンが担当。
window.PILOT_GUIDED_TUTORIAL={
  "schema": "guided-2026-10-15",
  "steps": [
    {
      "id": "layout-intro",
      "chapter": "1 画面の見方",
      "kind": "instruction",
      "focus": null,
      "title": "画面の見方",
      "copy": "まず、画面の見方を説明します。",
      "button": "次へ",
      "action": "読んだら「次へ」"
    },
    {
      "id": "layout-stem",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "stem",
      "title": "問題文",
      "copy": "ここに表示される問題文を読みます。",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "layout-start",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "start",
      "title": "スタートボタン",
      "copy": "このスタートボタンに指を置くと、選択肢が現れます。",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "layout-choice",
      "chapter": "1 画面の見方",
      "kind": "orientation",
      "focus": "choices",
      "title": "選択肢",
      "copy": "ここに2つの選択肢が出ます。選ぶほうへ指を運んで答えます。",
      "button": "操作の方法へ",
      "action": "見るだけです。読んだら「操作の方法へ」"
    },
    {
      "id": "motor-route",
      "chapter": "2 操作の方法",
      "kind": "demo",
      "focus": null,
      "title": "指を離さずに運ぶ",
      "copy": "スタートに指を置いたらそのまま離さずに運び、選択肢のボックスの中で離します。",
      "extraCopy": "道すじは自由です",
      "button": "次へ",
      "action": "見るだけです。読んだら「次へ」"
    },
    {
      "id": "motor-range",
      "chapter": "2 操作の方法",
      "kind": "demo",
      "focus": null,
      "title": "選択肢の枠内で離す",
      "copy": "スタートから指を運び、選択肢のボックスの内側で離すと回答できます。\n枠内ならどこでも大丈夫です。",
      "button": "試してみる",
      "action": "見るだけです。読んだら「試してみる」へ"
    },
    {
      "id": "motor",
      "chapter": "2 操作の方法",
      "kind": "motor",
      "focus": null,
      "title": "実際に運んでみる",
      "copy": "スタートに指を置いて指を離さずに運び、選択肢のボックスの中で離してみましょう。",
      "button": "次へ",
      "action": "下のスタートから運んでみてください"
    },
    {
      "id": "start-rule",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "スタートに指を置くタイミング",
      "copy": "問題文を最後まで読み、状況が分かったら、答えを決める前にスタートボタンに指を置きます。",
      "button": "次へ"
    },
    {
      "id": "movement-reason",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "指を動かし始めるタイミング",
      "copy": "選択肢を読んだら、答えが決まるのを待たずに動き始めてください。\n答えを選んでいる間の指の動きを計測するためです。",
      "button": "次へ"
    },
    {
      "id": "uncertain",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "迷っていても動かしながら考える",
      "copy": "どちらを選ぶか迷っているときも、ゆっくりでよいので指を動かしながら考えてください。",
      "button": "次へ"
    },
    {
      "id": "time-rule",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "3秒以内にスタートの枠を出る",
      "copy": "スタートに触れたら、3秒以内に指をスタートの枠の外へ動かしてください。",
      "button": "次へ"
    },
    {
      "id": "answer-pace",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "自分のペースで回答する",
      "copy": "3秒は回答の制限時間ではありません。\n枠を出たら、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "button": "ルールを復習する",
      "action": "読んだら「ルールを復習する」へ"
    },
    {
      "id": "rule-check-intro",
      "chapter": "3 ルールを確認する",
      "kind": "instruction",
      "focus": null,
      "title": "ルールの復習",
      "copy": "ここまでのルールを、クイズ形式で確認します。\n正解するまで選びなおしてください。",
      "button": "復習を始める",
      "action": "読んだら「復習を始める」へ"
    },
    {
      "id": "rule-check",
      "chapter": "3 ルールを確認する",
      "kind": "quiz",
      "focus": null,
      "title": "ルールの復習",
      "copy": "1つずつ、答えを選んでください。",
      "button": "次へ",
      "action": "答えを1つ選んで「次へ」"
    }
  ],
  "checks": [
    {
      "id": "start-trigger",
      "title": "いつスタートする？",
      "copy": "いつスタートに指を置きますか？",
      "labels": [
        "問題文を最後まで読み、状況が分かったら、答えを決める前に",
        "問題文を読み始めたらすぐに",
        "自分の答えを決め終えてから"
      ],
      "correctIndex": 0,
      "right": "状況が分かったら、答えを決める前にスタートへ。",
      "wrong": "最後まで読み、状況が分かったら始めます。\n答えを決め終えるまで待ちません。",
      "ruleRefs": [
        "start-rule"
      ]
    },
    {
      "id": "move-decision",
      "title": "動き始めるとき",
      "copy": "選択肢を読んだあと、いつ動き始めますか？",
      "labels": [
        "選択肢を読んだら、答えが決まるのを待たずに動く",
        "選択肢を読んで、答えを決め終えてから動く",
        "選択肢を読み、3秒がたったら動く"
      ],
      "correctIndex": 0,
      "right": "選択肢を読んだら、答えが決まるのを待たずに動き始めます。",
      "wrong": "答えが決まるのを待たずに動き始めてください。\n答えを選んでいる間の動きを計測するためです。",
      "ruleRefs": [
        "movement-reason"
      ]
    },
    {
      "id": "uncertain",
      "title": "まだ迷っているとき",
      "copy": "まだ迷っているときは、どう進めますか？",
      "labels": [
        "ゆっくりでよいので、指を動かしながら考える",
        "答えが決まるまで、スタートの中で待つ",
        "迷っていても、急いで答えを決める"
      ],
      "correctIndex": 0,
      "right": "どちらを選ぶか迷っているときも、ゆっくりでよいので指を動かしながら考えます。",
      "wrong": "迷っていても、急いで答えを決める必要はありません。ゆっくりでよいので、動かしながら考えてください。",
      "ruleRefs": [
        "uncertain"
      ]
    },
    {
      "id": "exit-time",
      "title": "3秒以内にすること",
      "copy": "スタートに触れてから3秒以内にするのは？",
      "labels": [
        "指をスタートの枠の外へ動かす",
        "選択肢のボックスに到着する",
        "選択肢で指を離して回答を終える"
      ],
      "correctIndex": 0,
      "right": "3秒は、スタートに触れてからスタートの枠の外へ出るまでの制限時間です。",
      "wrong": "3秒以内にするのは、指をスタートの枠の外へ動かすことです。\n回答を終える制限時間ではありません。",
      "ruleRefs": [
        "time-rule"
      ]
    },
    {
      "id": "answer-pace",
      "title": "回答するときのペース",
      "copy": "スタートの枠を出たあとは、どのペースで回答しますか？",
      "labels": [
        "自分のペースで、焦らずに選ぶ",
        "スタートに触れてから3秒以内に終える",
        "枠を出てから3秒以内に終える"
      ],
      "correctIndex": 0,
      "right": "回答は、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "wrong": "3秒は回答の制限時間ではありません。\n枠を出たら、自分のペースで焦らず選んでください。ゆっくりでも大丈夫です。",
      "ruleRefs": [
        "answer-pace"
      ]
    },
    {
      "id": "path",
      "title": "道すじの選び方",
      "copy": "指を運ぶ道すじは、どうしますか？",
      "labels": [
        "自由な道すじで運ぶ",
        "見本と同じ道すじで運ぶ",
        "必ずまっすぐに運ぶ"
      ],
      "correctIndex": 0,
      "right": "道すじは自由です。\n毎回同じ道すじを意識せず、自然に指を動かしてください。",
      "wrong": "道すじは自由です。まっすぐでも回り道でもかまいません。\n見本や毎回同じ道すじを意識せず、自然に指を動かしてください。",
      "ruleRefs": [
        "motor-route"
      ]
    },
    {
      "id": "release",
      "title": "指を離して回答する",
      "copy": "選択肢へ運んだあと、どうすると回答できますか？",
      "labels": [
        "枠の内側なら、どこで離してもよい",
        "文字の上で離したときだけ回答できる",
        "枠に入れば、指を離さなくても回答できる"
      ],
      "correctIndex": 0,
      "right": "枠の内側ならどこでも、指を離すと回答できます。",
      "wrong": "枠の内側に入るだけでは、まだ回答は決まりません。\n枠の内側ならどこでも、指を離すと回答できます。",
      "ruleRefs": [
        "motor-range",
        "motor"
      ]
    }
  ],
  "legacyStepIds": [
    "layout-intro",
    "layout-stem",
    "layout-stem",
    "layout-start",
    "layout-choice",
    "motor-route",
    "motor",
    "start-rule"
  ]
};

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
  start.classList.toggle('armed',s.phase==='press'||s.phase==='move');start.textContent=s.phase==='press'||s.phase==='move'?'→':'スタート';target.classList.toggle('arrived',s.phase==='release'||s.phase==='wait');
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
 const durations={idle:300,press:650,move:1200,exit:1100,reset:650};
 const bounds={x:102,y:88,width:126,height:56},from={x:160,y:109},to={x:205,y:64};
 let frame=0,lastTime=0,s=null,svg=null,finger=null,ghost=null,button=null,buttonText=null,ring=null,touchLabel=null,exitLabel=null,borderGlow=null;
 const hand='M22 2 c-3.3 0 -6 2.7 -6 6 v30 c-3 -2.5 -8.5 -3 -11.5 0 c-3 3 -1.5 7.5 1.5 10.5 l9 12 c4.5 7.5 10.5 11.5 20 11.5 h7 c8.5 0 15 -6.5 15 -15 v-18 c0 -3 -2.2 -5 -5 -5 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-2 0 -3.4 1 -4.2 2.6 c-0.4 -3.2 -2.4 -5.6 -5.3 -5.6 c-1.6 0 -3 0.7 -4 1.9 V8 c0 -3.3 -2.7 -6 -6 -6 z';
 const eased=t=>t*t*(3-2*t);
 const bezier=(a,b,c,d,t)=>{const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;};
 function setHand(el,p,alpha=1){el.setAttribute('transform',`translate(${p.x} ${p.y}) scale(.52) translate(-22 -2)`);el.setAttribute('opacity',String(alpha));}
 function mount(){
  container.classList.add('start-exit-demo');
  container.innerHTML=`<svg class="start-exit-svg" viewBox="70 0 200 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="スタートボタンに指を置き、指を離さず、3秒以内にボタンの枠の外へ動かします。回答先はこの図には表示していません。">
   <text class="start-exit-interval" x="165" y="19" text-anchor="middle">この間が3秒以内</text>
   <rect class="start-exit-border-glow" x="99" y="85" width="132" height="62" rx="17" />
   <rect class="start-exit-button" x="102" y="88" width="126" height="56" rx="14" />
   <text class="start-exit-button-text" x="165" y="122" text-anchor="middle">スタート</text>
   <g class="start-exit-ghost" aria-hidden="true"><path d="${hand}" /></g>
   <circle class="start-exit-ring" r="14" />
   <g class="start-exit-finger" aria-hidden="true"><path d="${hand}" /><ellipse class="start-exit-nail" cx="22" cy="9.5" rx="3.6" ry="5.2" /></g>
   <text class="start-exit-touch-label" x="165" y="168" text-anchor="middle">触れる</text>
   <text class="start-exit-label" x="165" y="48" text-anchor="middle">枠の外へ出る</text>
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
  buttonText.textContent=s.phase==='idle'&&!s.reduced?'スタート':'→';
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

window.PILOT_GUIDED_TUTORIAL.createEngine = function (env) {
  const config = window.PILOT_GUIDED_TUTORIAL, SCHEMA = config.schema;
  const { $, surface, startBtn, stemEl, choiceA, choiceB, numA, numB, dragTutState } = env;
  const STEPS = config.steps;
  const INSTRUCTED_STEPS = env.instructedSteps.map((s, i) => ({ ...s, id: 'instructed-' + i, kind: 'instruction', chapter: '追加10問の操作', title: '追加10問の操作', copy: s.txt, button: i ? '問題に戻る' : '次へ', action: s.op, html: true }));
  const seen = new Set(), completed = new Set();
  let steps = STEPS, idx = -1, built = false, replay = false, required = null, returnLabel = '問題に戻る', onDone = null;
  let pop, row, hint, graphic, target, position, demo, backdrop, demoPlayer, rangePlayer = null, timePlayer, motion;
  let held = null, lockUntil = 0, lockTimer = null, cueTimer = null, hintTimer = null, hintToken = 0, flashTimer = null, flashLabel = '', flashHeight = '';
  let shownAt = null, shownId = null, quizIndex = 0, quizLockKey = null, selections = [], orders = [], attempts = [], trainingComplete = false, priorInitial = null;
  const device = () => env.getDevice();
  const current = () => steps[idx];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const log = (event, data = {}) => device().tutorialLog.push({ kind: 'drag', schema: SCHEMA, event, step: idx + 1, stepId: current()?.id || null, ...data });
  const activeTask = () => env.screens.task.classList.contains('active');
  const initial = () => !replay && steps === STEPS;
  const shuffle = () => config.checks.map(q => {
    const order = q.labels.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  });
  const passes = () => config.checks.map((q, i) => selections[i] === q.correctIndex);
  function snapshot() { return { schema: SCHEMA, stepId: current()?.id || null, index: idx, seen: [...seen], completed: [...completed], quiz: { index: quizIndex, selections: [...selections], orders: orders.map(a => a.slice()), attempts: [...attempts] }, completedTraining: trainingComplete }; }
  function save() {
    if (!initial()) return;
    env.setResumeStage('dragTutorial');
    device().guidedTutorial = { schema: SCHEMA, completed: trainingComplete, motorCompleted: completed.has('motor'), quiz: snapshot().quiz };
    env.saveBackup();
  }
  function resetFlash() {
    clearTimeout(flashTimer); flashTimer = null;
    if (built && flashLabel) { $('tutPopNext').textContent = flashLabel; $('tutPopNext').style.height = flashHeight; $('tutPopNext').classList.remove('warn'); }
    flashLabel = ''; flashHeight = '';
  }
  function flash(text, maxUntil) {
    const button = $('tutPopNext'), now = performance.now();
    if (flashTimer && button.textContent === text) return;
    resetFlash(); flashLabel = button.textContent; flashHeight = button.style.height;
    button.style.height = button.getBoundingClientRect().height + 'px'; button.textContent = text; button.classList.add('warn');
    flashTimer = setTimeout(resetFlash, Math.max(150, Math.min(1200, maxUntil ? maxUntil - now : 1200)));
  }
  function clearHint() { clearTimeout(hintTimer); hintTimer = null; hintToken++; if (!built) return; hint.classList.add('hidden'); hint.textContent = ''; }
  function setHint(text) {
    clearHint(); hint.textContent = text; hint.className = 'ng'; const token = hintToken;
    placeMotorHint();
    hintTimer = setTimeout(() => { if (hintToken === token) clearHint(); }, 4000);
  }
  function placeMotorHint() {
    if (!built || idx < 0 || current()?.id !== 'motor' || hint.classList.contains('hidden')) return;
    const choiceBottom = target.getBoundingClientRect().bottom, startTop = startBtn.getBoundingClientRect().top;
    hint.style.top = (choiceBottom + startTop) / 2 + 'px';
  }
  function hidePosition() { position.style.display = 'none'; target.classList.remove('arrived'); }
  function pointerPosition(e) {
    const r = surface.getBoundingClientRect(); position.style.display = 'block'; position.style.left = (e.clientX - r.left) + 'px'; position.style.top = (e.clientY - r.top) + 'px';
    const t = target.getBoundingClientRect(), hit = e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top && e.clientY <= t.bottom;
    target.classList.toggle('arrived', hit); return hit;
  }
  function pageInfo(step) {
    if (step.id === 'layout-intro') return { label: 'はじめに', index: 0, total: 0 };
    if (step.id === 'rule-check-intro') return { label: 'ルールの復習', index: 0, total: 0 };
    if (step.id === 'rule-check') return { label: 'ルールの復習', index: quizIndex + 1, total: config.checks.length };
    const peers = required ? required.map(i => steps[i]) : steps.filter(s => s.chapter === step.chapter && !['layout-intro', 'rule-check-intro', 'rule-check'].includes(s.id));
    return { label: required ? '操作の確認' : step.chapter.replace(/^\d\s/, ''), index: peers.indexOf(step) + 1, total: peers.length };
  }
  function label(step) { const p = pageInfo(step); return p.label + (p.total ? '　' + p.index + ' / ' + p.total : ''); }
  function meta(step) {
    $('tutPopStep').textContent = label(step);
    $('tutPopOp').textContent = step.action || (step.kind === 'motor' ? '下のスタートから運んでみてください' : '読んだら「' + nextLabel() + '」');
    $('tutPopOp').classList.remove('hidden');
    const dots = $('tutPopDots'), p = pageInfo(step); dots.replaceChildren();
    for (let i = 1; i <= p.total; i++) { const dot = document.createElement('i'); if (i === p.index) dot.className = 'a'; dots.append(dot); }
  }
  function nextLabel() {
    if (current()?.id === 'rule-check') return quizIndex === config.checks.length - 1 ? (replay ? returnLabel : '例題へ') : '次へ';
    if ((required ? idx === required.at(-1) : idx === steps.length - 1) && replay) return returnLabel;
    return current()?.button || '次へ';
  }
  function build() {
    if (built) return;
    backdrop = document.createElement('div'); backdrop.id = 'tutBackdrop'; document.body.append(backdrop);
    graphic = document.createElement('div'); graphic.id = 'tutGraphic'; graphic.hidden = true; document.body.append(graphic);
    demo = document.createElement('canvas'); demo.id = 'tutDemo'; surface.append(demo);
    const ink = document.createElement('canvas'); ink.id = 'tutInk'; surface.append(ink);
    target = document.createElement('div'); target.id = 'tutSingleTarget'; target.textContent = '選択肢'; surface.append(target);
    position = document.createElement('div'); position.id = 'tutPosition'; surface.append(position);
    const spot = document.createElement('div'); spot.id = 'tutSpot'; spot.className = 'tut-spot hidden'; document.body.append(spot);
    const cap = document.createElement('div'); cap.id = 'tutCap'; cap.hidden = true; surface.append(cap);
    pop = document.createElement('div'); pop.id = 'tutPop'; pop.className = 'tut-pop hidden'; pop.setAttribute('role', 'region'); pop.setAttribute('aria-label', '操作の説明');
    pop.innerHTML = '<div class="s" id="tutPopStep"></div><h2 id="tutPopTitle"></h2><div class="t" id="tutPopTxt"></div><p id="tutExtra" hidden></p><div id="tutQuiz"></div><p id="tutQuizFeedback" aria-live="polite"></p><div class="guided-meta"><div class="g" id="tutPopOp"></div><div class="dots" id="tutPopDots"></div></div>';
    document.body.append(pop);
    const close = document.createElement('button'); close.id = 'tutClose'; close.type = 'button'; close.className = 'hidden'; close.textContent = '× 閉じる'; close.setAttribute('aria-label', '操作方法を閉じる'); document.body.append(close);
    row = document.createElement('div'); row.id = 'tutBtnRow'; row.className = 'tut-btnrow hidden';
    row.innerHTML = '<button class="rp hidden" id="tutReplay">↻ もう一度</button><button type="button" class="pv" id="tutPrev">戻る</button><button type="button" class="nx" id="tutPopNext">次へ</button>';
    document.body.append(row);
    hint = document.createElement('div'); hint.id = 'tutHint'; hint.className = 'hidden'; hint.setAttribute('role', 'status'); document.body.append(hint);
    demoPlayer = config.createDemo({ canvas: demo, start: startBtn, target }); timePlayer = config.createTimeDemo({ container: graphic });
    motion = config.createCardMotion({ getCard: () => !pop.classList.contains('hidden') ? pop : null, disabled: reduced });
    $('tutPopNext').addEventListener('click', advance); row.addEventListener('pointerdown', e => { if ($('tutPopNext').disabled && !e.target.closest('#tutPrev')) flash(current()?.kind === 'quiz' ? (selections[quizIndex] == null ? '答えを1つ選んでください' : '正しい答えを選んでください') : '操作してから進みます'); });
    $('tutPrev').addEventListener('click', back); close.addEventListener('click', () => { if (idx >= 0 && replay && !required) { log('close'); finish(); } });
    $('tutReplay').addEventListener('click', () => { if (idx >= 0) { log('replay'); idx = 0; render(); } });
    surface.addEventListener('pointerdown', e => {
      if (idx < 0 || !activeTask()) return;
      if (current().kind !== 'motor' || completed.has('motor')) return;
      if (held) return;
      const r = startBtn.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { setHint('スタートボタンに指を置いて\nそのまま離さずに運びます'); log('stray_motor'); return; }
      motion.finish(); clearHint(); e.preventDefault(); held = e.pointerId;
      try { surface.setPointerCapture(e.pointerId); } catch (_) {}
      startBtn.classList.add('armed'); startBtn.textContent = '→'; row.classList.add('hidden'); pointerPosition(e);
    }, { passive: false });
    surface.addEventListener('pointermove', e => { if (held === e.pointerId) { e.preventDefault(); pointerPosition(e); } }, { passive: false });
    surface.addEventListener('pointerup', e => {
      if (held !== e.pointerId) return;
      e.preventDefault(); const ok = pointerPosition(e); held = null; hidePosition(); startBtn.classList.remove('armed'); startBtn.textContent = 'スタート';
      if (ok) { clearHint(); completed.add('motor'); log('motor_complete'); render(); }
      else { row.classList.remove('hidden'); setHint('選択肢のボックスの中で指を離してください\nスタートボタンからもう一度'); log('motor_release_outside'); place(); }
    }, { passive: false });
    surface.addEventListener('pointercancel', cancelPointer, { passive: true }); surface.addEventListener('lostpointercapture', e => { if (held === e.pointerId) cancelPointer(); }, { passive: true });
    document.addEventListener('pointerdown', e => {
      if (idx < 0 || !activeTask() || held || document.body.classList.contains('stop-open')) return;
      if (e.target.closest('button,a,input,select,textarea')) return;
      if (current().kind === 'motor' && !completed.has('motor')) return;
      if (e.target.closest('#tutQuiz')) return;
      log('stray'); flash($('tutPopNext').disabled ? '答えを1つ選んでください' : 'このボタンで進みます');
    }, { passive: true });
    window.addEventListener('resize', () => { if (idx >= 0) { motion.finish(); cancelPointer(); place(); if (current()?.id === 'motor-route') demoPlayer.begin({ key: 'motor-route', kind: 'route', captionInitially: true }); else if (current()?.id === 'motor-range') rangePlayer?.begin({ key: 'motor-range', kind: 'range', captionInitially: true }); } });
    built = true;
  }
  function cancelPointer() { if (!held) { clearHint(); return; } held = null; clearHint(); hidePosition(); startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; if (idx >= 0) { row.classList.remove('hidden'); place(); log('motor_cancel'); } }
  function logEnd() { if (shownAt != null && shownId) log('stay', { stepId: shownId, ms: Math.round(performance.now() - shownAt) }); shownAt = null; shownId = null; }
  function stopGraphics() { demoPlayer.stop(); rangePlayer?.stop(); rangePlayer = null; timePlayer.stop(); graphic.hidden = true; graphic.replaceChildren(); }
  function clearParts() {
    for (const el of [stemEl, choiceA, choiceB, startBtn]) { el.classList.remove('guided-dim', 'guided-focus', 'tut-dim', 'tut-sbxhide'); el.style.visibility = 'hidden'; }
    startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; stemEl.textContent = ''; numA.textContent = ''; numB.textContent = ''; target.style.top = ''; hidePosition();
  }
  function setContent(step) {
    $('tutPopTitle').textContent = step.title;
    if (step.html) $('tutPopTxt').innerHTML = step.copy; else $('tutPopTxt').textContent = step.copy;
    $('tutExtra').hidden = !step.extraCopy; $('tutExtra').textContent = step.extraCopy || '';
    $('tutQuiz').replaceChildren(); $('tutQuizFeedback').textContent = ''; meta(step);
  }
  function setLock(text, wasSeen, exempt = false) {
    clearTimeout(lockTimer); lockTimer = null;
    lockUntil = required ? performance.now() + env.minReadMs(text) : (replay || wasSeen || exempt) ? 0 : performance.now() + env.minReadMs(text);
    $('tutPopNext').classList.toggle('wait', lockUntil > performance.now());
    if (lockUntil > performance.now()) lockTimer = setTimeout(() => $('tutPopNext').classList.remove('wait'), lockUntil - performance.now());
  }
  function render() {
    const before = motion.snapshot(); logEnd(); clearHint(); held = null; stopGraphics(); resetFlash(); clearTimeout(cueTimer); cueTimer = null;
    const step = current(); if (!step) return;
    const key = step.id, wasSeen = seen.has(key); seen.add(key); shownAt = performance.now(); shownId = key;
    quizLockKey = null;
    document.body.classList.remove('guided-instruction', 'guided-range', 'guided-time', 'guided-quiz', 'guided-motor');
    clearParts(); setContent(step); pop.classList.remove('hidden'); pop.classList.add('on'); row.classList.remove('hidden'); row.classList.remove('pending');
    $('tutPopNext').textContent = nextLabel(); $('tutPopNext').disabled = false; $('tutPopNext').classList.remove('cue');
    $('tutPrev').classList.toggle('hidden', required ? idx === required[0] : idx === 0);
    $('phaseLabel').textContent = steps === STEPS ? step.chapter.replace(/^\d\s/, '') : '追加10問の操作';
    env.logInstructionExposure(steps === STEPS ? 'dragTutorial' : 'instructedTutorial', { step: idx + 1, stepId: key, schema: SCHEMA, quizIndex: step.kind === 'quiz' ? quizIndex : null });
    if (step.kind === 'orientation') {
      stemEl.textContent = 'ここに問題文が表示されます'; stemEl.style.visibility = 'visible';
      if (step.focus !== 'stem') { stemEl.classList.add('guided-dim'); startBtn.style.visibility = 'visible'; }
      if (step.focus === 'choices') { startBtn.classList.add('guided-dim'); for (const [box, text] of [[choiceA, numA], [choiceB, numB]]) { box.style.visibility = 'visible'; box.classList.add('guided-focus'); text.className = 'txt'; text.textContent = '選択肢'; text.style.visibility = 'visible'; } }
      else (step.focus === 'stem' ? stemEl : startBtn).classList.add('guided-focus');
    } else if (key === 'motor-route' || key === 'motor') {
      document.body.classList.add('guided-motor'); startBtn.style.visibility = 'visible';
      if (key === 'motor' && completed.has('motor')) {
        $('tutPopTitle').textContent = '操作できました'; $('tutPopTxt').textContent = '次は、実際に問題に回答するときのルールを確認します。'; $('tutPopOp').textContent = '読んだら「ルールを確認する」へ'; $('tutPopNext').textContent = 'ルールを確認する'; startBtn.classList.add('guided-dim'); target.style.display = 'none';
      } else { target.style.display = ''; target.style.opacity = ''; if (key === 'motor' && !replay) { row.classList.add('pending'); $('tutPopNext').disabled = true; } }
    } else if (key === 'motor-range') {
      document.body.classList.add('guided-range'); graphic.hidden = false; graphic.style.display = 'block';
      graphic.innerHTML = '<p class="guided-range-caption">見本を見る・選択肢の拡大図</p><div id="tutRangeFigure"><div id="tutRangeTarget">選択肢</div><div id="tutRangeEntry"></div><canvas id="tutRangeInk"></canvas></div>';
    } else if (key === 'time-rule') { document.body.classList.add('guided-time'); graphic.hidden = false; graphic.style.display = 'block'; }
    else { document.body.classList.add(step.kind === 'quiz' ? 'guided-quiz' : 'guided-instruction'); }
    if (step.kind === 'quiz') renderQuiz(false);
    if (step.kind !== 'quiz') setLock(step.copy + (step.extraCopy || ''), wasSeen, step.kind === 'motor');
    place();
    if (key === 'motor-route') demoPlayer.begin({ key, kind: 'route', captionInitially: true });
    if (key === 'motor-range') { rangePlayer = config.createDemo({ canvas: $('tutRangeInk'), start: $('tutRangeEntry'), target: $('tutRangeTarget'), fingerScale: .9 }); rangePlayer.begin({ key, kind: 'range', captionInitially: true }); }
    if (key === 'time-rule') { timePlayer.begin(); place(); }
    if (!$('tutPopNext').disabled) cueTimer = setTimeout(() => { if (idx >= 0 && current() === step) $('tutPopNext').classList.add('cue'); }, replay || wasSeen ? 0 : env.readCueDelay(step.copy));
    motion.run(before); save();
  }
  function ruleTop() {
    const title = $('tutPopTitle').textContent, text = $('tutPopTxt').textContent, extra = $('tutExtra').textContent, extraHidden = $('tutExtra').hidden, stepText = $('tutPopStep').textContent;
    let largest = 0;
    for (const step of STEPS.filter(s => s.chapter.startsWith('3 ') && s.kind === 'instruction')) {
      $('tutPopTitle').textContent = step.title; $('tutPopTxt').textContent = step.copy; $('tutExtra').hidden = true; $('tutPopStep').textContent = label(step); largest = Math.max(largest, pop.getBoundingClientRect().height);
    }
    $('tutPopTitle').textContent = title; $('tutPopTxt').textContent = text; $('tutExtra').textContent = extra; $('tutExtra').hidden = extraHidden; $('tutPopStep').textContent = stepText;
    return Math.max(48, Math.min((innerHeight - largest) / 2, row.getBoundingClientRect().top - largest - 18));
  }
  function place() {
    if (idx < 0) return; const step = current(), vh = innerHeight, width = Math.min(innerWidth * (idx ? .92 : .72), (idx ? 540 : 420) * env.uiScale), sr = startBtn.getBoundingClientRect();
    row.style.width = width + 'px'; row.style.left = (innerWidth - width) / 2 + 'px'; row.style.bottom = 'auto';
    const bh = row.getBoundingClientRect().height || 52, startVisible = startBtn.style.visibility === 'visible';
    const minTop = replay && !$('tutClose').classList.contains('hidden') ? $('tutClose').getBoundingClientRect().bottom + 12 : 8;
    const ph = pop.getBoundingClientRect().height;
    if (step.id === 'motor-range' || step.id === 'time-rule') {
      const gap = vh <= 640 ? 10 : 18, top = Math.max(minTop, vh <= 640 ? 24 : 42);
      const maxNavTop = vh - bh - Math.max(12, vh * .025), graphicTop = top + ph + gap;
      const available = Math.max(0, maxNavTop - gap - graphicTop);
      pop.style.left = (innerWidth - pop.getBoundingClientRect().width) / 2 + 'px'; pop.style.top = top + 'px';
      graphic.style.top = graphicTop + 'px';
      if (step.id === 'time-rule') graphic.style.setProperty('--time-demo-max-height', available + 'px');
      else {
        const caption = graphic.querySelector('.guided-range-caption');
        const captionHeight = caption ? caption.getBoundingClientRect().height + parseFloat(getComputedStyle(caption).marginBottom) : 0;
        const height = Math.min(Math.min(innerWidth, vh) * .39, Math.max(0, available - captionHeight - 88));
        graphic.style.setProperty('--range-target-height', height + 'px');
        graphic.style.setProperty('--range-target-width', height * 60 / 39 + 'px');
      }
      graphic.style.left = (innerWidth - graphic.getBoundingClientRect().width) / 2 + 'px';
      row.style.top = Math.min(maxNavTop, Math.max(sr.top + sr.height / 2 - bh / 2, graphic.getBoundingClientRect().bottom + gap)) + 'px';
      return;
    }
    let navTop = startVisible ? vh - bh - Math.max(12, vh * .025) : sr.top + sr.height / 2 - bh / 2;
    if (startVisible && navTop < sr.bottom + 4) navTop = sr.bottom + 4 + bh <= vh - 6 ? sr.bottom + 4 : Math.max(8, sr.top - bh - 12);
    if (!startVisible) {
      let needed = minTop + ph + 16;
      navTop = Math.min(vh - bh - 6, Math.max(navTop, needed));
    }
    row.style.top = navTop + 'px';
    const maxTop = navTop - ph - 16;
    pop.style.left = (innerWidth - pop.getBoundingClientRect().width) / 2 + 'px';
    let top = Math.max(48, Math.min((vh - ph) / 2, maxTop));
    if (step.kind === 'orientation') {
      const r = (step.focus === 'stem' ? stemEl : step.focus === 'start' ? startBtn : choiceA).getBoundingClientRect();
      top = step.focus === 'start' ? r.top - ph - 16 : r.bottom + 16;
      if (step.focus === 'choices') top = Math.max(r.bottom + 12, Math.min(top, sr.top - ph - 8));
      if (navTop < sr.top && step.focus === 'start') top = Math.min(top, maxTop);
    } else if (step.id === 'motor-route' || (step.id === 'motor' && !completed.has('motor'))) top = Math.max(42, vh * .06);
    else if (step.chapter.startsWith('3 ') && step.kind === 'instruction') top = ruleTop();
    pop.style.top = Math.max(minTop, Math.min(top, maxTop)) + 'px';
    if (step.id === 'motor-route' || step.id === 'motor') {
      const sf = surface.getBoundingClientRect(); target.style.top = Math.max(sf.height * .34, pop.getBoundingClientRect().bottom - sf.top + 18) + 'px';
    }
    placeMotorHint();
  }
  function renderQuiz(withMotion = true) {
    clearTimeout(cueTimer); cueTimer = null; $('tutPopNext').classList.remove('cue');
    const before = withMotion ? motion.snapshot() : null, q = config.checks[quizIndex], last = quizIndex === config.checks.length - 1, chosen = selections[quizIndex], good = chosen === q.correctIndex;
    const questionKey = 'quiz-' + q.id, visited = seen.has(questionKey); seen.add(questionKey);
    if (quizLockKey !== q.id) { setLock(q.copy + q.labels.join(''), visited); quizLockKey = q.id; }
    $('tutPopTitle').textContent = q.copy; $('tutPopTxt').textContent = ''; $('tutExtra').hidden = true; meta(current());
    $('tutPopNext').textContent = last ? (replay ? returnLabel : '例題へ') : '次へ';
    $('tutPopNext').disabled = !replay && (!good || (last && !passes().every(Boolean))); row.classList.toggle('pending', $('tutPopNext').disabled);
    $('tutPrev').classList.toggle('hidden', false);
    $('tutPopOp').textContent = chosen != null && !good ? 'もう一度、答えを選んでください' : '答えを1つ選んで「' + $('tutPopNext').textContent + '」';
    const feedback = $('tutQuizFeedback'); feedback.textContent = chosen == null ? '' : good ? q.right : q.wrong; feedback.classList.toggle('wrong', chosen != null && !good);
    const choices = $('tutQuiz'); choices.replaceChildren(); choices.setAttribute('role', 'radiogroup'); choices.setAttribute('aria-labelledby', 'tutPopTitle');
    for (const originalIndex of orders[quizIndex]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = q.labels[originalIndex]; button.dataset.answerIndex = originalIndex; button.dataset.originalIndex = originalIndex; button.classList.toggle('selected', chosen === originalIndex);
      button.onclick = () => { const hadFocus = document.activeElement === button; resetFlash(); const answeredAt = quizIndex; selections[quizIndex] = originalIndex; attempts[quizIndex]++; log('rule_answer', { rule: q.id, answerIndex: originalIndex, correct: originalIndex === q.correctIndex, attempt: attempts[quizIndex] }); renderQuiz(false); if (hadFocus) $('tutQuiz').querySelector('[data-answer-index="' + originalIndex + '"]').focus({ preventScroll: true }); place(); save(); if (originalIndex === q.correctIndex) cueTimer = setTimeout(() => { if (idx >= 0 && current()?.kind === 'quiz' && quizIndex === answeredAt && selections[answeredAt] === q.correctIndex && !$('tutPopNext').disabled) $('tutPopNext').classList.add('cue'); }, env.readCueDelay(q.right)); };
      button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(chosen === originalIndex));
      choices.append(button);
    }
    const options = [...choices.children], selected = options.find(button => button.dataset.answerIndex === String(chosen));
    for (const button of options) button.tabIndex = button === (selected || options[0]) ? 0 : -1;
    choices.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const at = options.indexOf(event.target); if (at < 0) return; event.preventDefault();
      const n = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : options.length - 1)) % options.length;
      const answer = options[n].dataset.answerIndex; options[n].click(); $('tutQuiz').querySelector('[data-answer-index="' + answer + '"]').focus({ preventScroll: true });
    };
    if (withMotion) { place(); motion.run(before); }
  }
  function advance() {
    if (idx < 0 || held || $('tutPopNext').disabled) return;
    if (performance.now() < lockUntil) { log('early'); flash('読んでから押してください', lockUntil); return; }
    if (current().kind === 'quiz') {
      if (!replay && selections[quizIndex] !== config.checks[quizIndex].correctIndex) return;
      if (quizIndex < config.checks.length - 1) { clearHint(); resetFlash(); quizIndex++; renderQuiz(); save(); return; }
      if (!replay && !passes().every(Boolean)) return;
    }
    if (required) { const at = required.indexOf(idx); if (at < required.length - 1) { idx = required[at + 1]; render(); } else finish(); }
    else if (idx < steps.length - 1) { idx++; render(); } else finish();
  }
  function back() {
    if (idx < 0 || held) return; log('back'); clearHint(); resetFlash();
    if (current()?.kind === 'quiz' && quizIndex > 0) { quizIndex--; renderQuiz(); save(); return; }
    if (required) { const at = required.indexOf(idx); if (at > 0) idx = required[at - 1]; else return; }
    else if (idx > 0) idx--; else return;
    render();
  }
  function teardown() {
    logEnd(); clearHint(); held = null; stopGraphics(); motion.finish(); clearTimeout(cueTimer); clearTimeout(lockTimer); cueTimer = null; lockTimer = null; lockUntil = 0; resetFlash();
    pop.classList.remove('on'); pop.classList.add('hidden'); row.classList.add('hidden'); row.classList.remove('pending'); $('tutClose').classList.add('hidden'); backdrop.style.display = ''; graphic.hidden = true;
    for (const el of [stemEl, choiceA, choiceB, startBtn]) { el.classList.remove('guided-dim', 'guided-focus'); el.style.visibility = ''; }
    startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; stemEl.textContent = ''; numA.textContent = ''; numB.textContent = ''; target.style.display = ''; hidePosition();
    document.body.classList.remove('guided-tutorial', 'guided-instruction', 'guided-range', 'guided-time', 'guided-quiz', 'guided-motor', 'tut-review'); idx = -1; dragTutState.active = false;
  }
  function finish() {
    if (initial() && (!completed.has('motor') || !passes().every(Boolean))) return;
    if (initial()) { trainingComplete = true; dragTutState.schema = SCHEMA; device().guidedTutorial = { schema: SCHEMA, completed: true, motorCompleted: true, quiz: snapshot().quiz }; log('complete'); save(); }
    const cb = onDone; onDone = null; const wasReplay = replay; teardown(); dragTutState.done = true;
    if (wasReplay && priorInitial) restoreState(priorInitial, false); priorInitial = null; replay = false; required = null;
    if (cb) cb();
  }
  function abort() { if (idx < 0 && !dragTutState.active) return; const wasReplay = replay; teardown(); onDone = null; if (wasReplay && priorInitial) restoreState(priorInitial, false); priorInitial = null; replay = false; required = null; dragTutState.done = false; }
  function restoreState(restored, migrate = true) {
    seen.clear(); completed.clear(); selections = config.checks.map(() => null); attempts = config.checks.map(() => 0); orders = shuffle(); quizIndex = 0; quizLockKey = null; trainingComplete = false;
    if (restored?.schema === SCHEMA) {
      for (const key of restored.seen || []) if (STEPS.some(s => s.id === key) || config.checks.some(q => 'quiz-' + q.id === key)) seen.add(key);
      for (const key of restored.completed || []) if (key === 'motor') completed.add(key);
      const q = restored.quiz || {};
      selections = config.checks.map((check, i) => Number.isInteger(q.selections?.[i]) && q.selections[i] >= 0 && q.selections[i] < check.labels.length ? q.selections[i] : null);
      attempts = config.checks.map((_, i) => Math.max(0, Number(q.attempts?.[i]) || 0));
      orders = config.checks.map((check, i) => Array.isArray(q.orders?.[i]) && q.orders[i].length === check.labels.length && new Set(q.orders[i]).size === check.labels.length && q.orders[i].every(n => Number.isInteger(n) && n >= 0 && n < check.labels.length) ? q.orders[i].slice() : orders[i]);
      quizIndex = Math.max(0, Math.min(config.checks.length - 1, Number(q.index) || 0));
      trainingComplete = restored.completedTraining === true && completed.has('motor') && passes().every(Boolean);
    } else if (restored && migrate) {
      for (const n of restored.seen || []) { const key = config.legacyStepIds[n]; if (['layout-intro', 'layout-stem', 'layout-start', 'layout-choice', 'motor-route'].includes(key)) seen.add(key); }
      if ((restored.completed || []).includes(6) || (restored.completed || []).includes(7)) completed.add('motor');
    }
  }
  function run(cb, opts = {}) {
    if (env.realBlocks.includes('moral')) env.moralPracticeDefinition(); build();
    if (idx >= 0) teardown();
    const enteringReplay = !!opts.replay; priorInitial = enteringReplay ? snapshot() : null;
    replay = enteringReplay; steps = opts.instructed ? INSTRUCTED_STEPS : STEPS; returnLabel = opts.returnLabel || '問題に戻る'; onDone = cb;
    restoreState(opts.restored, true);
    required = Array.isArray(opts.requiredSteps) && opts.requiredSteps.length ? [...new Set(opts.requiredSteps.map(n => typeof n === 'string' ? steps.findIndex(s => s.id === n) : opts.instructed ? n : steps.findIndex(s => s.id === config.legacyStepIds[n])).filter(n => n >= 0 && n < steps.length))] : null;
    if (required && !required.length) required = null;
    let wanted = 0;
    if (opts.restored?.schema === SCHEMA) wanted = steps.findIndex(s => s.id === opts.restored.stepId);
    else if (opts.restored && Number.isInteger(opts.restored.index)) wanted = steps.findIndex(s => s.id === config.legacyStepIds[opts.restored.index]);
    else if (typeof opts.start === 'string') wanted = steps.findIndex(s => s.id === opts.start);
    else if (Number.isInteger(opts.start)) wanted = opts.instructed ? opts.start : steps.findIndex(s => s.id === config.legacyStepIds[opts.start]);
    if (!replay && opts.restored && steps === STEPS && wanted > STEPS.findIndex(s => s.id === 'motor') && !completed.has('motor')) wanted = STEPS.findIndex(s => s.id === 'motor');
    if (required) wanted = required[0];
    if (env.debug && env.query.get('gstep') && !opts.restored) { const debugIndex = steps.findIndex(s => s.id === env.query.get('gstep')); if (debugIndex >= 0) wanted = debugIndex; }
    idx = Math.max(0, Math.min(steps.length - 1, wanted < 0 ? 0 : wanted)); dragTutState.active = true;
    if (initial()) { dragTutState.schema = SCHEMA; dragTutState.done = false; }
    env.hideBanner(); env.clearIdleCoach(); env.coachHide(); env.setCoach(null); env.show('task'); env.sizeCanvas(); env.clearCanvas(); env.updateProgress();
    document.body.classList.add('guided-tutorial'); document.body.classList.toggle('tut-review', replay); $('tutAgain').classList.add('hidden'); $('counter').textContent = '';
    $('tutClose').classList.toggle('hidden', !replay || !!required); render();
  }
  return { run, abort, snapshot, schema: SCHEMA, state: () => ({ index: idx, stepId: current()?.id || null, schema: SCHEMA, review: replay, instructed: steps === INSTRUCTED_STEPS, lockRemainingMs: Math.max(0, lockUntil - performance.now()), handsDone: completed.has('motor'), pending: !!row && row.classList.contains('pending'), quiz: { index: quizIndex, passed: passes(), selections: [...selections], orders: orders.map(a => a.slice()), attempts: [...attempts], complete: passes().every(Boolean) }, completedTraining: trainingComplete }) };
};
