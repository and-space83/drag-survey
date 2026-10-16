'use strict';
// Synthetic local interaction only. Production endpoints and participant data are never used.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { appAssets, sourceManifest, transformAppScripts } = require('./lib/app-source.cjs');
const root = path.resolve(process.env.APP_ROOT || __dirname);
const out = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, 'reviews/2026-10-16-tutorial-feedback'));
const assets = appAssets(root), source = sourceManifest(root);
const baselineOnly = process.env.QUIZ_BASELINE === '1', quizOnly = process.env.QUIZ_ONLY === '1';
const report = { at: new Date().toISOString(), scope: 'Local synthetic interaction; Chrome touch emulation, not physical Safari', source, baselineOnly, checks: [], errors: [], remote: [], screens: [], quizLayouts: [], quizReviewLayouts: [], quizNavigation: [] };
fs.mkdirSync(out, { recursive: true });
function check(name, pass, detail) { report.checks.push({ name, pass: !!pass, ...(pass ? {} : { detail }) }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : ' ' + JSON.stringify(detail))); }
// Observe the existing animation APIs without changing phases or participant behavior.
function observePlayers() {
  window.__feedbackPlayers = {};
  for (const name of ['createDemo', 'createTimeDemo']) {
    const original = PILOT_GUIDED_TUTORIAL[name];
    PILOT_GUIDED_TUTORIAL[name] = function (options) {
      const player = original.call(this, options);
      window.__feedbackPlayers[options.canvas?.id || name] = player;
      return player;
    };
  }
}
transformAppScripts(assets, text => text.replace(/const DragTut\s*=/, '(' + observePlayers.toString() + ')(); const DragTut ='));
const server = http.createServer((req, res) => {
  const key = new URL(req.url, 'http://localhost').pathname, file = key === '/' ? '/index.html' : key, bytes = assets.get(file);
  if (req.method !== 'GET' || !bytes) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({ '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' })[path.extname(file)] || 'application/octet-stream');
  res.end(bytes);
});
let browser, origin;
const qs = 'block=moral&debug=1&upload=0&devguard=0&zoomguard=0&mic=0&readgate=0&minread=0&';
async function open(size) {
  const ctx = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await ctx.route('**/*', route => { if (route.request().method() === 'GET' && new URL(route.request().url()).origin === origin) return route.continue(); report.remote.push(route.request().url()); return route.abort(); });
  await ctx.addInitScript(() => {
    window.__feedbackScales = {};
    const scale = CanvasRenderingContext2D.prototype.scale;
    CanvasRenderingContext2D.prototype.scale = function (x, y) { if (this.canvas.id) window.__feedbackScales[this.canvas.id] = [x, y]; return scale.call(this, x, y); };
  });
  const p = await ctx.newPage(); p.setDefaultTimeout(7000); p.on('pageerror', e => report.errors.push(e.message));
  return { ctx, p, cdp: await ctx.newCDPSession(p) };
}
async function go(p, query, wait = 350) { await p.goto(origin + '/?' + qs + query); await p.waitForFunction(() => window.__pilot?.storeReady()); if (wait) await p.waitForTimeout(wait); }
async function settle(p) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function rect(p, selector) { return p.locator(selector).evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; }); }
async function shot(p, size, name) { const file = size.width + 'x' + size.height + '/' + name + '.png'; fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true }); await p.screenshot({ path: path.join(out, file) }); report.screens.push({ file }); }
async function fits(p, label, selectors) {
  const bad = await p.evaluate(selectors => selectors.flatMap(selector => {
    const e = document.querySelector(selector); if (!e || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return [];
    const r = e.getBoundingClientRect(), css = getComputedStyle(e), scrollable = ['auto', 'scroll'].includes(css.overflowY);
    return r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || e.scrollWidth > e.clientWidth + 2 || (!scrollable && e.scrollHeight > e.clientHeight + 2) ? [{ selector, x: r.x, y: r.y, right: r.right, bottom: r.bottom, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight }] : [];
  }), selectors);
  check(label + ' 表示と操作が画面内', !bad.length, bad);
}
async function nudge(p, button, label) {
  await p.mouse.click(5, 150);
  const state = await p.locator(button).evaluate(e => ({ text: e.textContent, warn: e.classList.contains('warn'), animation: getComputedStyle(e).animationName }));
  check(label + ' 余白タップで次へ誘導して揺れる', state.text === 'このボタンで進みます' && state.warn && state.animation.includes('btnNudge'), state);
}
async function quizGeometry(p,index,state) {
 return p.evaluate(({index,state})=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
  const card=document.getElementById('tutPop'),nav=document.getElementById('tutBtnRow'),feedback=document.getElementById('tutQuizFeedback'),meta=card.querySelector('.guided-meta'),css=getComputedStyle(card),fc=getComputedStyle(feedback);
  const boxes={card:rect(card),nav:rect(nav),back:rect(document.getElementById('tutPrev')),next:rect(document.getElementById('tutPopNext')),title:rect(document.getElementById('tutPopTitle')),choices:rect(document.getElementById('tutQuiz')),meta:rect(meta),feedback:rect(feedback)};
  const close=document.getElementById('tutClose'),closeVisible=close&&close.getClientRects().length&&getComputedStyle(close).visibility!=='hidden';
  return {index,state,...boxes,close:closeVisible?rect(close):null,options:[...document.querySelectorAll('#tutQuiz button')].map(e=>({answerIndex:Number(e.dataset.answerIndex),...rect(e)})),feedbackText:feedback.textContent,feedbackDisplay:fc.display,feedbackMinHeight:parseFloat(fc.minHeight)||0,feedbackMarginTop:parseFloat(fc.marginTop)||0,cardPaddingBottom:parseFloat(css.paddingBottom)||0,cardBorderBottom:parseFloat(css.borderBottomWidth)||0,cardScroll:card.scrollHeight-card.clientHeight,cardScrollTop:card.scrollTop,viewport:{w:innerWidth,h:innerHeight},question:__pilot.helpState().drag.quiz,answerLogs:__pilot.buildPayload().device.tutorialLog.filter(e=>e.event==='rule_answer').length,trials:__pilot.buildPayload().trials.length};
 },{index,state});
}
function sameRect(a,b,fields=['x','y','w','h']) {return fields.every(k=>Math.abs(a[k]-b[k])<=1);}
function quizLayoutCheck(label,states,anchor,nav) {
 const base=states[0],promptUnchanged=states.every(s=>sameRect(s.title,base.title)&&sameRect(s.choices,base.choices)&&s.options.length===base.options.length&&s.options.every((o,i)=>o.answerIndex===base.options[i].answerIndex&&sameRect(o,base.options[i])));
 check(label+' 設問と各選択肢は未選択・誤答・正答で動かない',promptUnchanged,states);
 check(label+' BOX上端と戻る・次への位置は全問全状態で一定',states.every(s=>sameRect(s.card,anchor,['x','y','w'])&&sameRect(s.nav,nav)&&sameRect(s.back,base.back)&&sameRect(s.next,base.next)),{anchor,nav,states});
 if(baselineOnly)return;
 check(label+' 未選択には解説用の空間がない',base.feedbackDisplay==='none'&&base.feedback.h===0&&base.feedbackMinHeight===0&&Math.abs(base.card.bottom-(base.meta.bottom+base.cardPaddingBottom+base.cardBorderBottom))<=2,base);
 for(const s of states.slice(1)){
  const addition=s.feedback.h+s.feedbackMarginTop,delta=s.card.h-base.card.h;
  check(label+' '+s.state+'は必要な解説分だけBOX下端が伸びる',s.feedbackDisplay!=='none'&&s.feedbackText.length>0&&s.feedbackMinHeight===0&&delta>0&&Math.abs(delta-addition)<=2&&Math.abs(s.card.bottom-(s.meta.bottom+s.cardPaddingBottom+s.cardBorderBottom))<=2,{delta,addition,state:s});
 }
 check(label+' BOXとナビが重ならず内部スクロールがない',states.every(s=>s.card.bottom<=s.nav.y-8&&s.cardScroll<=2&&s.cardScrollTop===0&&s.card.x>=-1&&s.card.y>=-1&&s.card.right<=s.viewport.w+1&&s.nav.bottom<=s.viewport.h+1),states);
 check(label+' 閉じるがある時もBOXと重ならない',states.every(s=>!s.close||s.close.bottom+11<=s.card.y),states);
}
function quizNavigationCheck(size,mode,states){
 const label=size.width+'x'+size.height+' '+mode,first=states[0],largest=states.reduce((a,b)=>a.card.h>=b.card.h?a:b),gap=first.nav.y-largest.card.bottom;
 report.quizNavigation.push({size,mode,maximum:{index:largest.index,state:largest.state,height:largest.card.h,bottom:largest.card.bottom},nav:first.nav,gap});
 check(label+' 全7問・全状態でナビと両ボタンの座標が一定',states.every(s=>sameRect(s.nav,first.nav)&&sameRect(s.back,first.back)&&sameRect(s.next,first.next)),states);
 if(!baselineOnly)check(label+' 実際に最も大きいBOXの12px下にナビを置く',Math.abs(gap-12)<=1,{gap,largest,nav:first.nav});
}
async function quizzes(p,size) {
 const label=size.width+'x'+size.height;
 await go(p,'go=tut&gstep=motor');
 const cdp=await p.context().newCDPSession(p),start=await rect(p,'#start'),target=await rect(p,'#tutSingleTarget');
 const from={x:start.x+start.w/2,y:start.y+start.h/2},to={x:target.x+target.w/2,y:target.y+target.h/2};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
 for(let n=1;n<=18;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/18,y:from.y+(to.y-from.y)*n/18}]});await p.waitForTimeout(12);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 await p.waitForFunction(()=>__pilot.helpState().drag.handsDone);await p.waitForTimeout(250);
 for(let n=0;n<10&&await p.evaluate(()=>__pilot.helpState().drag.stepId!=='rule-check');n++){await p.locator('#tutPopNext').tap();await p.waitForTimeout(180);}
 await p.waitForFunction(()=>__pilot.helpState().drag.stepId==='rule-check');await p.waitForTimeout(350);
 const anchor=await rect(p,'#tutPop'),nav=await rect(p,'#tutBtnRow'),trialsBefore=await p.evaluate(()=>__pilot.buildPayload().trials.length);
 for(let index=0;index<7;index++){
  const q=await p.evaluate(i=>PILOT_GUIDED_TUTORIAL.checks[i],index),states=[],tag=label+' 復習'+(index+1);
  const unselected=await quizGeometry(p,index,'unselected');states.push(unselected);report.quizLayouts.push({size,...unselected});
  check(tag+' 初回は未回答で次へ進めない',unselected.question.index===index&&unselected.question.selections[index]==null&&unselected.question.attempts[index]===0&&await p.locator('#tutPopNext').isDisabled(),unselected.question);
  await shot(p,size,'quiz-'+(index+1)+'-unselected');
  const wrong=q.labels.findIndex((_,i)=>i!==q.correctIndex);
  await p.locator('#tutQuiz [data-answer-index="'+wrong+'"]').tap();await settle(p);
  const wrongState=await quizGeometry(p,index,'wrong');states.push(wrongState);report.quizLayouts.push({size,...wrongState});
  check(tag+' 誤答で進行せず元の選択・試行回数を記録',await p.locator('#tutPopNext').isDisabled()&&wrongState.question.index===index&&wrongState.question.selections[index]===wrong&&wrongState.question.attempts[index]===1&&!wrongState.question.passed[index],wrongState.question);
  const style=await p.locator('#tutQuiz [data-answer-index="'+wrong+'"]').evaluate(e=>({checked:e.getAttribute('aria-checked'),bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopColor}));
  const red=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[];return n[0]>n[1]&&n[0]>n[2];};
  check(tag+' 誤答は薄い赤背景と赤枠',style.checked==='true'&&red(style.bg)&&red(style.border),style);
  await shot(p,size,'quiz-'+(index+1)+'-wrong');
  for(const target of ['next','background']){
   if(target==='next'){const r=await rect(p,'#tutPopNext');await p.mouse.click(r.x+r.w/2,r.y+r.h/2);}else await p.mouse.click(4,150);
   const txt=await p.locator('#tutPopNext').innerText();check(tag+' 誤答中の'+target+'は選び直しを案内',/もう一度.*選びなおしてください/.test(txt),txt);
  }
  const blocked=await p.evaluate(()=>__pilot.helpState().drag.quiz);
  check(tag+' 誤操作で復習の回答記録を重ねない',JSON.stringify(blocked)===JSON.stringify(wrongState.question),blocked);
  if(index===0)await shot(p,size,'quiz-wrong');
  await p.locator('#tutQuiz [data-answer-index="'+q.correctIndex+'"]').tap();await settle(p);
  const correct=await quizGeometry(p,index,'correct');states.push(correct);report.quizLayouts.push({size,...correct});
  check(tag+' 正答を2回目の試行として記録して進める',await p.locator('#tutPopNext').isEnabled()&&correct.question.index===index&&correct.question.selections[index]===q.correctIndex&&correct.question.attempts[index]===2&&correct.question.passed[index],correct.question);
  await shot(p,size,'quiz-'+(index+1)+'-correct');
  quizLayoutCheck(tag,states,anchor,nav);await fits(p,tag,['#tutPop','#tutBtnRow']);
  await p.locator('#tutPopNext').tap();await p.waitForTimeout(350);
 }
 const final=await p.evaluate(()=>({screen:__pilot.activeScreen(),tutorial:__pilot.buildPayload().device.guidedTutorial,answers:__pilot.buildPayload().device.tutorialLog.filter(e=>e.event==='rule_answer'),trials:__pilot.buildPayload().trials.length}));
 check(label+' 全復習から例題へ進める',final.screen==='guidedintro',final);
 check(label+' 復習完了と7問の正答・試行回数を元の形式で保持',final.tutorial.completed&&final.tutorial.quiz.selections.length===7&&final.tutorial.quiz.selections.every((v,i)=>v===statesCorrect(i))&&final.tutorial.quiz.attempts.every(n=>n===2),final.tutorial);
 function statesCorrect(i){return report.quizLayouts.find(s=>s.size.width===size.width&&s.size.height===size.height&&s.index===i&&s.state==='correct')?.question.selections[i];}
 check(label+' 回答イベントは各問の誤答・正答を1回ずつ記録し課題回答を増やさない',final.answers.length===14&&final.answers.filter(e=>e.correct).length===7&&final.answers.filter(e=>!e.correct).length===7&&final.trials===trialsBefore,final);
 quizNavigationCheck(size,'初回の復習',report.quizLayouts.filter(s=>s.size.width===size.width&&s.size.height===size.height));
}
async function quizReview(p,size){
 const label=size.width+'x'+size.height+' 任意の見直し';await go(p,'go=task');
 const before=await p.evaluate(()=>({trials:__pilot.buildPayload().trials,training:__pilot.buildPayload().device.guidedTutorial,index:__pilot.trialIndex()}));
 await p.locator('#tutAgain').tap();await p.waitForTimeout(350);
 for(let n=0;n<25&&await p.evaluate(()=>__pilot.helpState().drag.stepId!=='rule-check');n++){await p.locator('#tutPopNext').tap();await p.waitForTimeout(180);}
 await p.waitForFunction(()=>__pilot.helpState().drag.stepId==='rule-check');await p.waitForTimeout(350);
 check(label+' 閉じるを表示する任意見直しに入る',await p.locator('#tutClose').isVisible()&&await p.evaluate(()=>__pilot.helpState().drag.review));
 const anchor=await rect(p,'#tutPop'),nav=await rect(p,'#tutBtnRow'),layouts=[];
 for(let index=0;index<7;index++){
  const q=await p.evaluate(i=>PILOT_GUIDED_TUTORIAL.checks[i],index),states=[],tag=label+' 復習'+(index+1);
  for(const [name,chosen]of [['unselected',null],['wrong',q.labels.findIndex((_,i)=>i!==q.correctIndex)],['correct',q.correctIndex]]){
   if(chosen!=null){await p.locator('#tutQuiz [data-answer-index="'+chosen+'"]').tap();await settle(p);}
   const s=await quizGeometry(p,index,name);states.push(s);layouts.push({size,...s});
   check(tag+' '+name+'では任意に進められる',await p.locator('#tutPopNext').isEnabled()&&s.question.index===index);
   await shot(p,size,'quiz-review-'+(index+1)+'-'+name);
  }
  quizLayoutCheck(tag,states,anchor,nav);await fits(p,tag,['#tutPop','#tutBtnRow','#tutClose']);
  if(index<6){await p.locator('#tutPopNext').tap();await p.waitForTimeout(350);}else check(label+' 最後は問題に戻る案内',await p.locator('#tutPopNext').innerText()==='問題に戻る');
 }
 report.quizReviewLayouts.push(...layouts);quizNavigationCheck(size,'閉じる付きの復習',layouts);
 await p.locator('#tutClose').tap();await p.waitForTimeout(350);
 const after=await p.evaluate(()=>({trials:__pilot.buildPayload().trials,training:__pilot.buildPayload().device.guidedTutorial,index:__pilot.trialIndex()}));
 check(label+' 閉じた後も課題回答・合格記録・問題番号を増やさない',await p.evaluate(()=>__pilot.activeScreen()==='task'&&__pilot.helpState().drag.index<0)&&JSON.stringify(before)===JSON.stringify(after),{before,after});
}
function compareQuizBaseline() {
 const file=process.env.QUIZ_BASELINE_RESULTS;if(!file)return;
 const before=JSON.parse(fs.readFileSync(file,'utf8'));report.baselineSource=before.source;report.quizBaselineComparison=[];
 for(const after of report.quizLayouts){
  const base=before.quizLayouts.find(s=>s.size.width===after.size.width&&s.size.height===after.size.height&&s.index===after.index&&s.state===after.state);
  const label=after.size.width+'x'+after.size.height+' 復習'+(after.index+1)+' '+after.state;
  const diff=base?{top:after.card.y-base.card.y,left:after.card.x-base.card.x,width:after.card.w-base.card.w,height:after.card.h-base.card.h,navTop:after.nav.y-base.nav.y,navHeight:after.nav.h-base.nav.h}:null;
  report.quizBaselineComparison.push({size:after.size,index:after.index,state:after.state,before:base?{card:base.card,nav:base.nav}:null,after:{card:after.card,nav:after.nav},delta:diff});
  check(label+' 改修前のBOX上端・幅とボタン寸法を維持しナビだけ上げる',!!base&&sameRect(after.card,base.card,['x','y','w'])&&sameRect(after.nav,base.nav,['x','w','h'])&&after.nav.y<base.nav.y-1,diff);
 }
}
async function visuals(p, size) {
  const label = size.width + 'x' + size.height, colors = [];
  for (const step of ['motor-route', 'motor-range', 'time-rule', 'start-rule']) {
    await go(p, 'go=tut&gstep=' + step, step === 'time-rule' ? 0 : 350);
    colors.push(await p.evaluate(() => {
      const e = document.elementFromPoint(2, 150); return { step: __pilot.helpState().drag.stepId, color: getComputedStyle(e).backgroundColor };
    }));
    if (step === 'motor-range') {
      check(label + ' 拡大図の余分な見出しを除去', !(await p.locator('body').innerText()).includes('見本を見る・選択肢の拡大図'));
      const scale = await p.evaluate(() => {
        const sf = document.getElementById('surface'), target = document.getElementById('tutRangeTarget'), actual = document.getElementById('choiceA');
        return { rendered: window.__feedbackScales.tutRangeInk?.[0], expected: Math.min(sf.clientWidth, sf.clientHeight) / 375 * .82 * target.getBoundingClientRect().width / actual.getBoundingClientRect().width };
      });
      check(label + ' 指も選択肢の拡大倍率に合わせる', Number.isFinite(scale.rendered) && Math.abs(scale.rendered - scale.expected) < .01, scale);
      await fits(p, label + ' 拡大図', ['#tutPop', '#tutGraphic', '#tutBtnRow']); await shot(p, size, 'release-range');
    }
    if (step === 'time-rule') {
      await p.waitForFunction(() => window.__feedbackPlayers.createTimeDemo?.state());
      const idle = await p.evaluate(() => ({ ...window.__feedbackPlayers.createTimeDemo.state(), now: performance.now() }));
      check(label + ' スタート表示直後に触れない', idle.phase === 'idle' && !idle.contacted, idle);
      await p.waitForFunction(() => window.__feedbackPlayers.createTimeDemo.state().phase === 'press');
      const contact = await p.evaluate(() => ({ ...window.__feedbackPlayers.createTimeDemo.state(), now: performance.now() }));
      const delay = contact.now - contact.elapsed - (idle.now - idle.elapsed);
      check(label + ' 接触まで1秒の待機を維持', delay >= 970 && delay <= 1120 && contact.contacted, { delay, contact });
      check(label + ' 押下後のスタート表示を維持', await p.locator('.start-exit-button-text').textContent() === 'スタート');
      const subtitle = await rect(p, '.start-exit-interval'), button = await rect(p, '.start-exit-button'), finger = await rect(p, '.start-exit-finger');
      check(label + ' 3秒の字幕はアニメーションの下', subtitle.y >= Math.max(button.bottom, finger.bottom), { subtitle, button, finger });
      await fits(p, label + ' 3秒の図', ['#tutPop', '#tutGraphic', '#tutBtnRow']); await shot(p, size, 'three-seconds');
    }
  }
  check(label + ' 説明全体の背景色が統一', new Set(colors.map(s => s.color)).size === 1, colors);
}
async function ratings(p, size) {
  const label = size.width + 'x' + size.height;
  for (let index = 0; index < 4; index++) {
    await go(p, 'go=rtut&rtstep=' + index);
    const width = await p.evaluate(() => {
      const card = document.getElementById('ratPop'), body = document.getElementById('ratTutText'), dots = document.getElementById('ratPopDots'), css = getComputedStyle(card), r = card.getBoundingClientRect(), b = body.getBoundingClientRect(), d = dots.getBoundingClientRect();
      return { text: body.textContent, bodyWidth: b.width, expectedWidth: r.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - parseFloat(css.borderLeftWidth) - parseFloat(css.borderRightWidth), dotsRight: d.right, contentRight: r.right - parseFloat(css.paddingRight) - parseFloat(css.borderRightWidth), whiteSpace: getComputedStyle(body).whiteSpace };
    });
    check(label + ' 振り返り' + (index + 1) + 'の丸が右端', Math.abs(width.dotsRight - width.contentRight) <= 1, width);
    if ([1, 3].includes(index)) check(label + ' 振り返り' + (index + 1) + '本文が箱幅で折り返す', Math.abs(width.bodyWidth - width.expectedWidth) <= 1 && width.whiteSpace === 'normal', width);
    if (index === 0) await nudge(p, '#ratingNext', label + ' 初回振り返り');
    await fits(p, label + ' 振り返り' + (index + 1), ['#ratPop', '#ratBtnRow']);
    if ([1, 3].includes(index)) await shot(p, size, 'rating-' + (index + 1));
  }
  await go(p, 'go=task');
  const cdp = await p.context().newCDPSession(p), start = await rect(p, '#start'), target = await rect(p, '#choiceA');
  const from = { x: start.x + start.w / 2, y: start.y + start.h / 2 }, to = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let n = 1; n <= 18; n++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * n / 18, y: from.y + (to.y - from.y) * n / 18 }] }); await p.waitForTimeout(12); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForFunction(() => __pilot.activeScreen() === 'rating');
  await p.locator('#qitem-hesitation button').nth(2).tap();
  const before = await p.evaluate(() => __pilot.buildPayload().trials.at(-1).ratings);
  await p.locator('#ratingHelp').tap(); await p.waitForTimeout(350);
  for (let index = 0; index < 4; index++) {
    const hidden = await p.evaluate(() => {
      const visible = id => { const e = document.getElementById(id); return e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
      return { answer: visible('ratingAnswer'), options: visible('ratingItems') };
    });
    check(label + ' 見直し' + (index + 1) + 'に操作不能の回答・選択肢を出さない', !hidden.answer && !hidden.options, hidden);
    const next = index < 2 ? '#ratingNext' : '#ratingSubmit';
    await nudge(p, next, label + ' 見直し' + (index + 1));
    if (index === 1) await shot(p, size, 'rating-review');
    await p.waitForTimeout(1250); await p.locator(next).tap(); await p.waitForTimeout(350);
  }
  check(label + ' 見直し前の評定値を保持', await p.evaluate(before => JSON.stringify(__pilot.buildPayload().trials.at(-1).ratings) === JSON.stringify(before), before));
  check(label + ' 見直しを閉じて評定操作へ戻る', await p.locator('#qitem-hesitation button').first().isEnabled() && await p.locator('#qitem-hesitation button').first().isVisible());
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-gpu'] });
  for (const size of [{ width: 375, height: 700 }, { width: 402, height: 759 }, { width: 440, height: 841 }]) {
    const { ctx, p } = await open(size);
    try { await quizzes(p, size); if(!baselineOnly)await quizReview(p,size); if (!quizOnly) { await visuals(p, size); await ratings(p, size); } } finally { await ctx.close(); }
  }
  // 375x548 is an optional auxiliary run, outside the three primary device-size criteria.
  if (process.env.QUIZ_INCLUDE_LOW === '1') {
    const low = { width: 375, height: 548 }, { ctx, p } = await open(low);
    try { await quizzes(p, low); } finally { await ctx.close(); }
  }
  compareQuizBaseline();
  check('ブラウザ例外なし', !report.errors.length, report.errors); check('外部通信なし', !report.remote.length, report.remote);
})().catch(error => { report.exception = error.stack; check('検証を完了', false, error.message); console.error(error); }).finally(async () => {
  if (browser) await browser.close(); server.close();
  check('検証中の配布ソース変更なし', JSON.stringify(sourceManifest(root)) === JSON.stringify(source));
  report.passed = report.checks.filter(c => c.pass).length; report.failed = report.checks.length - report.passed;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, out })); process.exitCode = report.failed ? 1 : 0;
});
