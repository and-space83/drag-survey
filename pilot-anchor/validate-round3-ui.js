// 2026-10-09: 説明の前後移動・評定見直し・追加問題専用説明。
// 合成回答・upload=0 のみ。--round3-shots DIR で画面地図と寸法を保存する。
const fs = require('fs');
const path = require('path');

module.exports = async function round3Ui(cdp, check, base) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const arg = process.argv.indexOf('--round3-shots');
  const out = arg < 0 ? null : path.resolve(process.argv[arg + 1]);
  const shots = [], layout = [];
  const read = expression => cdp.eval(expression);
  const click = id => read(`document.getElementById(${JSON.stringify(id)}).click()`);
  const visible = id => read(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return !!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';})()`);
  const state = () => read('window.__pilot.recoveryState()');
  const payload = () => read('window.__pilot.buildPayload()');
  const help = () => read('window.__pilot.helpState()');
  async function until(expression) {
    for(let i=0;i<100;i++) { if(await read(expression).catch(()=>false))return;await sleep(80); }
    throw new Error('round3 timeout: '+expression+' state='+JSON.stringify(await read('({screen:window.__pilot?.activeScreen(),help:window.__pilot?.helpState?.()})')));
  }
  async function open(query, readGate = false) {
    if(await read('!!window.__pilot').catch(()=>false)) await read('window.__pilot.resetStoredForTest()');
    await cdp.send('Page.navigate',{url:base+'?block=moral&upload=0&debug=1&devguard=0&zoomguard=0&mic=0&readgate=0'+(readGate?'':'&minread=0')+'&'+query});
    await until('!!window.__pilot && !!window.__pilot.helpState');
    await sleep(150);
    check('[round3] 確認セッションは実送信しない',await read('window.__pilot.uploadUrl()===null'));
  }
  async function touch(id) {
    const p=await read(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await sleep(100);
  }
  async function drag(sandbox = false) {
    const ps=await read(`(()=>{const s=document.getElementById('start').getBoundingClientRect(),c=document.getElementById('${sandbox?'tutSingleTarget':'choiceA'}').getBoundingClientRect();return [{x:s.x+s.width/2,y:s.y+s.height/2},{x:c.x+c.width/2,y:c.y+c.height/2}];})()`);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[ps[0]]});
    for(let i=1;i<=20;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ps[0].x+(ps[1].x-ps[0].x)*i/20,y:ps[0].y+(ps[1].y-ps[0].y)*i/20}]});
      await sleep(12);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await sleep(180);
  }
  async function capture(vp,name,boxId,rowId,closeId) {
    // 配置を判定する前に説明ボックスの移動完了を待つ。導入ページを中央へ配置したため、
    // 呼び出し側の250ms待機だけではCSSのtop遷移（550ms）の途中を重なりと誤判定する。
    await read(`new Promise(resolve=>requestAnimationFrame(resolve)).then(()=>Promise.all(document.getElementById(${JSON.stringify(boxId)}).getAnimations().map(a=>a.finished.catch(()=>{}))))`);
    const fit=await read(`(()=>{const b=document.getElementById(${JSON.stringify(boxId)}),n=document.getElementById(${JSON.stringify(rowId)}),c=${closeId?`document.getElementById(${JSON.stringify(closeId)})`:'null'};const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};const br=rect(b),nr=rect(n),cr=c&&c.getClientRects().length&&getComputedStyle(c).visibility!=='hidden'?rect(c):null;const buttons=n?[...n.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'):[];return {width:innerWidth,height:innerHeight,box:br,row:nr,close:cr,boxOverflowX:b.scrollWidth-b.clientWidth,boxOverflowY:b.scrollHeight-b.clientHeight,buttons:buttons.map(e=>({id:e.id,...rect(e),overflowX:e.scrollWidth-e.clientWidth,overflowY:e.scrollHeight-e.clientHeight})),bodyOverflow:document.documentElement.scrollWidth-innerWidth};})()`);
    layout.push({vp,name,...fit});
    const inside=r=>!r||(r.left>=-1&&r.right<=fit.width+1&&r.top>=-1&&r.bottom<=fit.height+1);
    const buttons=fit.buttons.every(b=>inside(b)&&b.height>=43&&b.width>=43&&b.overflowX<=2&&b.overflowY<=2);
    const separated=!fit.row||fit.box.bottom<=fit.row.top+1;
    check(`[round3/layout/${vp}] ${name}: 画面内・文字欠けとボタン重なりなし`,inside(fit.box)&&inside(fit.row)&&inside(fit.close)&&fit.boxOverflowX<=2&&fit.boxOverflowY<=2&&fit.bodyOverflow<=1&&buttons&&separated,JSON.stringify(fit));
    if(boxId==='ratPop') {
      const noOverlap=await read("(()=>{const p=document.getElementById('ratPop').getBoundingClientRect(),a=document.getElementById('ratingAnswer'),q=document.querySelector('#ratingItems .qitem:not([hidden])'),targets=[a,q].filter(e=>e&&!e.hidden&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');return targets.every(e=>p.bottom<=e.getBoundingClientRect().top+1);})()");
      check(`[round3/layout/${vp}] ${name}: 説明ボックスは回答・質問に重ならない`,noOverlap);
    }
    if(!out)return;
    fs.mkdirSync(path.join(out,vp),{recursive:true});
    const pic=await cdp.send('Page.captureScreenshot',{format:'png'});
    const file=vp+'/'+name+'.png';fs.writeFileSync(path.join(out,file),Buffer.from(pic.data,'base64'));shots.push({vp,name,file});
  }
  async function surveyCapture(vp,name) {
    const fit=await read(`(()=>{const p=document.querySelector('#postq .pad'),n=document.getElementById('postNav').getBoundingClientRect(),bad=[...document.querySelectorAll('#postq .postpage.on button')].filter(e=>{const r=e.getBoundingClientRect();return e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1||r.left<0||r.right>innerWidth||r.bottom>n.top;}).map(e=>e.textContent);return {width:innerWidth,height:innerHeight,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,navBottom:n.bottom,bad};})()`);
    layout.push({vp,name,...fit});
    check(`[round3/layout/${vp}] ${name}: 区間ラベルとナビが収まる`,fit.scrollHeight<=fit.clientHeight+2&&fit.scrollWidth<=fit.clientWidth+2&&fit.navBottom<=fit.height&&fit.bad.length===0,JSON.stringify(fit));
    if(!out)return;
    fs.mkdirSync(path.join(out,vp),{recursive:true});const pic=await cdp.send('Page.captureScreenshot',{format:'png'});
    const file=vp+'/'+name+'.png';fs.writeFileSync(path.join(out,file),Buffer.from(pic.data,'base64'));shots.push({vp,name,file});
  }
  async function ratingReview(vp,label,end) {
    const before=await state(), p=await payload();
    const ratings=JSON.stringify(p.trials[0].ratings), events=JSON.stringify(p.trials[0].events), count=p.trials.length;
    await touch('ratingHelp');
    const frozen=await state();await sleep(350);const still=await state();
    await read("document.querySelector('#qitem-hesitation button:nth-child(5)').click();document.querySelector('#qitem-confidence button:nth-child(5)').click()");
    check(`[round3/rating/${vp}] ${label}: 見直し中の回答・試行・時計を保全`,JSON.stringify(still.rating)===JSON.stringify(frozen.rating)&&JSON.stringify((await payload()).trials[0].ratings)===ratings&&still.rating.page===before.rating.page);
    check(`[round3/rating/${vp}] ${label}: 閉じるは44px以上の画面右上`,await read("(()=>{const b=document.getElementById('ratingTutClose'),r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth&&r.top>=0&&r.top<90&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;})()"));
    if(end) {
      for(let i=0;i<4;i++) {await sleep(250);await click(i<2?'ratingNext':'ratingSubmit');}
    } else await touch('ratingTutClose');
    const after=await state(), q=await payload();
    check(`[round3/rating/${vp}] ${label}: ${end?'最後まで進む':'Xで閉じる'}と元の評定へ戻る`,after.stage==='rating'&&after.rating.page===before.rating.page&&q.trials.length===count&&JSON.stringify(q.trials[0].ratings)===ratings&&JSON.stringify(q.trials[0].events)===events&&!await visible('ratingTutClose'));
    check(`[round3/timing/${vp}] ${label}: 説明時間を評定時間に加えない`,after.rating.elapsedMs-frozen.rating.elapsedMs<300&&after.rating.pageElapsedMs-frozen.rating.pageElapsedMs<300,JSON.stringify({before:frozen.rating,after:after.rating}));
  }
  async function reloadFromReview(vp,page) {
    const before=await state(), p=await payload();
    await touch('ratingHelp');await sleep(350);const frozen=await state();
    await read('window.__pilot.recoveryCheckpoint()');await cdp.send('Page.reload');await until("window.__pilot?.activeScreen()==='resume'");
    await click('resumeGo');await until("window.__pilot?.activeScreen()==='rating'");
    const after=await state(), q=await payload();
    check(`[round3/reload/${vp}] 評定${page+1}見直し中の再読込: 元のページと選択を復旧`,after.stage==='rating'&&after.rating.page===page&&JSON.stringify(q.trials[0].ratings)===JSON.stringify(p.trials[0].ratings)&&q.trials.length===p.trials.length&&JSON.stringify(q.trials[0].events)===JSON.stringify(p.trials[0].events)&&after.rating.elapsedMs-frozen.rating.elapsedMs<300&&!await visible('ratingTutClose'),JSON.stringify({before:before.rating,frozen:frozen.rating,after:after.rating}));
  }
  console.log('\n--- round3: explanation navigation / rating review / instructed help ---');
  for(const [vp,width,height,screenHeight] of [['mini',375,700,812],['iphone17',402,759,874],['ipad',820,1180,1180]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight,deviceScaleFactor:2,mobile:true});
    await open('round3=welcome');
    check(`[round3/welcome/${vp}] 最初のページには前へがない`,!await visible('wcPrev'));
    const welcomePages=await read("document.querySelectorAll('#wcDots i').length");
    for(let i=0;i<welcomePages;i++) {
      // 検証対象はpad内の説明とナビ。ボタン列が内側にあるため直接padのスクロールを測る。
      const fit=await read("(()=>{const p=document.querySelector('#welcome .pad'),b=document.getElementById('wcNext').getBoundingClientRect();return {scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,navBottom:b.bottom,height:innerHeight};})()");
      check(`[round3/welcome/${vp}] ${i+1}/${welcomePages}: スクロールなし`,fit.scrollHeight<=fit.clientHeight+2&&fit.scrollWidth<=fit.clientWidth+2&&fit.navBottom<=fit.height,JSON.stringify(fit));
      layout.push({vp,name:'welcome-'+(i+1),...fit});
      if(out) {fs.mkdirSync(path.join(out,vp),{recursive:true});const pic=await cdp.send('Page.captureScreenshot',{format:'png'});const file=vp+'/welcome-'+(i+1)+'.png';fs.writeFileSync(path.join(out,file),Buffer.from(pic.data,'base64'));shots.push({vp,name:'welcome-'+(i+1),file});}
      const confirmationCount=await read("document.querySelectorAll('#wcAgree button').length");
      if(confirmationCount===3) {
        await read("document.querySelectorAll('#wcAgree button').forEach(b=>b.click())");
        await click('wcPrev');await click('wcNext');
        check(`[round3/welcome/${vp}] 同意チェックは前へ・次への往復で保持`,await read("document.querySelectorAll('#wcAgree button.sel').length===3&&!document.getElementById('wcNext').disabled"));
      }
      if(confirmationCount===2) {
        check(`[round3/welcome/${vp}] 未回答の別同意ページは飛ばせない`,await read("document.getElementById('wcNext').disabled"));
        await click('wcPrev');await click('wcNext');
        check(`[round3/welcome/${vp}] 戻っても未回答の必須同意は保持`,await read("document.querySelectorAll('#wcAgree button.sel').length===0&&document.getElementById('wcNext').disabled"));
      }
      await read("document.querySelectorAll('#wcAgree button:not(.sel)').forEach(b=>b.click())");await click('wcNext');
    }
    check(`[round3/welcome/${vp}] 5件の同意を揃えて初めて入力画面へ`,await read("window.__pilot.activeScreen()==='intro'&&window.__pilot.buildPayload().device.welcomeAgree.items===5"));

    // 初回の未読ページの待ち時間は残り、既読ページは前へ直後でも進める。
    await open('go=tut',true);
    const first=await help();await click('tutPopNext');
    check(`[round3/read/${vp}] 初回未読は読了待ちを維持`,(await help()).drag.index===first.drag.index&&(await help()).drag.lockRemainingMs>0);
    await until('window.__pilot.helpState().drag.lockRemainingMs<=0');await click('tutPopNext');
    const second=await help();await click('tutPrev');const revisited=await help();await click('tutPopNext');
    check(`[round3/read/${vp}] 前へで既読に戻ると再読待ちなし`,revisited.drag.lockRemainingMs<=0&&(await help()).drag.index===second.drag.index);

    await open('go=rtut',true);await click('ratingNext');
    check(`[round3/read/${vp}] 評定の初回未読も読了待ちを維持`,(await help()).rating.index===0&&(await help()).rating.lockRemainingMs>0);
    await until('window.__pilot.helpState().rating.lockRemainingMs<=0');await click('ratingNext');
    await click('ratingTutPrev');const ratRevisited=await help();await click('ratingNext');
    check(`[round3/read/${vp}] 評定の前へも既読ページに再読待ちなし`,ratRevisited.rating.lockRemainingMs<=0&&(await help()).rating.index===1&&(await help()).rating.lockRemainingMs<=0);

    await open('go=tut');
    const operationSteps=await read('PILOT_GUIDED_TUTORIAL.steps');
    for(let i=0;i<operationSteps.length;i++) {
      const step=operationSteps[i];await sleep(250);
      await capture(vp,'operation-initial-'+(i+1),'tutPop','tutBtnRow');
      if(step.id==='motor') {
        await click('tutPrev');await click('tutPopNext');
        await click('tutPopNext');
        check(`[round3/hands/${vp}] 初回${i+1}: 前へ往復で未実施の操作確認を飛ばせない`,(await help()).drag.stepId==='motor'&&(await help()).drag.handsDone===false);
        await sleep(250);await drag(true);
        await until('window.__pilot.helpState().drag.handsDone');
        await click('tutPrev');await click('tutPopNext');
        check(`[round3/hands/${vp}] 初回${i+1}: 完了済み操作を戻っても再操作・待ち不要`,(await help()).drag.handsDone===true&&(await help()).drag.lockRemainingMs<=0);
      }
      if(step.kind==='quiz') {
        const count=await read('PILOT_GUIDED_TUTORIAL.checks.length');
        for(let q=0;q<count;q++) {
          if(q) await capture(vp,'operation-rule-check-'+(q+1),'tutPop','tutBtnRow');
          check(`[round3/rules/${vp}] ${q+1}: 未選択なら復習を飛ばせない`,await read('document.getElementById("tutPopNext").disabled'));
          await read('(()=>{const i=__pilot.helpState().drag.quiz.index,a=PILOT_GUIDED_TUTORIAL.checks[i].correctIndex;document.querySelector(`#tutQuiz button[data-answer-index="${a}"]`).click();})()');
          if(q<count-1)await click('tutPopNext');
        }
      }
      if(i<operationSteps.length-1) await click('tutPopNext');
    }
    check(`[round3/hands/${vp}] 初回の説明は最後までXで閉じられない`,!await visible('tutClose'));

    // 評定の初回説明も前へを備え、未選択項目の操作確認は残す。
    await open('go=rtut');
    for(let i=0;i<4;i++) {
      await sleep(250);await capture(vp,'rating-initial-'+(i+1),'ratPop','ratBtnRow');
      if(i===0)await click('ratingNext');
      if(i===1) {
        await click('ratingTutPrev');await click('ratingNext');
        check(`[round3/rating-initial/${vp}] 前へで戻っても迷いの選択は必要`,await read("document.getElementById('ratingNext').disabled"));
        await read("document.querySelector('#qitem-hesitation button:nth-child(3)').click()");await click('ratingNext');
      }
      if(i===2) {
        check(`[round3/rating-initial/${vp}] 自信の未選択を飛ばせず初回Xもない`,await read("document.getElementById('ratingSubmit').disabled")&&!await visible('ratingTutClose'));
        await read("document.querySelector('#qitem-confidence button:nth-child(4)').click()");await click('ratingSubmit');
      }
    }
    await click('ratingSubmit');await sleep(250);await capture(vp,'practice-intro','ratPop','ratBtnRow');
    check(`[round3/rating-initial/${vp}] 練習導入は番号と質問なしの単独画面`,await read('document.getElementById("tutStepLabel").hidden&&getComputedStyle(document.getElementById("ratingItems")).display==="none"'));

    // 実際の記録が存在する本番から評定へ入り、未選択/選択済みを各ページで確認。
    await open('attn=0&instr=1&nmain=1&welcome=0&round3='+vp);
    await until('window.__pilot.storeReady()');await read('window.__pilot.recoveryStartMain()');await drag();
    await until("window.__pilot.activeScreen()==='rating'");
    await ratingReview(vp,'迷い・未選択',false);
    await read("document.querySelector('#qitem-hesitation button:nth-child(3)').click()");
    await ratingReview(vp,'迷い・選択済み',true);
    await reloadFromReview(vp,0);
    await click('ratingNext');
    await ratingReview(vp,'自信・未選択',false);
    await read("document.querySelector('#qitem-confidence button:nth-child(4)').click()");
    await touch('ratingHelp');
    for(let i=0;i<4;i++) {
      await sleep(250);await capture(vp,'rating-review-'+(i+1),'ratPop','ratBtnRow','ratingTutClose');
      if(i<3)await click(i<2?'ratingNext':'ratingSubmit');
    }
    const saved=JSON.stringify((await payload()).trials[0].ratings);
    await click('ratingTutPrev');await click('ratingTutPrev');await click('ratingNext');await click('ratingSubmit');await click('ratingSubmit');
    check(`[round3/rating/${vp}] 説明の前へで選択済みの評定と元ページを変えない`,(await state()).rating.page===1&&JSON.stringify((await payload()).trials[0].ratings)===saved);
    await ratingReview(vp,'自信・選択済み',true);
    await reloadFromReview(vp,1);
    await click('ratingBack');await click('ratingNext');
    check(`[round3/rating/${vp}] 見直し後も通常の回答の戻る操作が有効`,(await state()).rating.page===1&&(await payload()).trials[0].ratingBacks===1);
    await click('ratingSubmit');await until("window.__pilot.recoveryState().stage==='instructedIntro'");
    check(`[round3/instructed/${vp}] 全員の経路は専用説明を挟まず追加問題の案内`,await read("document.getElementById('blockintroBody').textContent.includes('指示どおり読まずに答える問題なので、謝礼には影響しません。')")&&!await visible('tutPop'));
    const introFit=await read("(()=>{const p=document.querySelector('#blockintro .pad'),r=document.getElementById('blockintroGo').getBoundingClientRect();return {scrollHeight:p.scrollHeight,clientHeight:p.clientHeight,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,buttonBottom:r.bottom,height:innerHeight};})()");
    layout.push({vp,name:'instructed-intro',...introFit});
    check(`[round3/layout/${vp}] 追加問題導入: 謝礼の追記も画面内に収まる`,introFit.scrollHeight<=introFit.clientHeight+2&&introFit.scrollWidth<=introFit.clientWidth+2&&introFit.buttonBottom<=introFit.height,JSON.stringify(introFit));
    if(out) {fs.mkdirSync(path.join(out,vp),{recursive:true});const pic=await cdp.send('Page.captureScreenshot',{format:'png'});const file=vp+'/instructed-intro.png';fs.writeFileSync(path.join(out,file),Buffer.from(pic.data,'base64'));shots.push({vp,name:'instructed-intro',file});}
    await click('blockintroGo');await until("window.__pilot.phase()==='instructed'&&window.__pilot.activeScreen()==='task'");
    const before=await state(), count=(await payload()).trials.length;
    await touch('tutAgain');
    let text='';
    for(let i=0;i<2;i++) {
      await sleep(200);text+=await read("document.getElementById('tutPopTxt').textContent");
      await capture(vp,'instructed-review-'+(i+1),'tutPop','tutBtnRow','tutClose');
      if(i===0)await click('tutPopNext');
    }
    check(`[round3/instructed/${vp}] 追加問題専用は2枚・読んでからの逆指示なし`,(await help()).drag.index===1&&/読まず/.test(text)&&!/(問題文を読ん|読み終えて|読んでから)/.test(text),text);
    await click('tutPrev');await click('tutPopNext');await touch('tutClose');
    const after=await state();
    check(`[round3/instructed/${vp}] 専用説明を前後移動して閉じても同じ未回答問題へ`,after.currentCell.itemId===before.currentCell.itemId&&after.instrIndex===before.instrIndex&&JSON.stringify(after.queue)===JSON.stringify(before.queue)&&(await payload()).trials.length===count);
    await touch('tutAgain');await click('tutPopNext');await click('tutPopNext');
    check(`[round3/instructed/${vp}] 専用説明を最後まで進めても同じ問題へ`,!await visible('tutPop')&&(await state()).currentCell.itemId===before.currentCell.itemId&&(await payload()).trials.length===count);
    await drag();await until("window.__pilot.activeScreen()==='postq'");
    check(`[round3/instructed/${vp}] 説明後の追加回答を重複なく記録`,(await payload()).trials.filter(t=>t.phase==='instructed').length===1);

    await open('go=post');
    for(const [page,name] of [['pp-sleep_hours','sleep-hours'],['pp-usage_years','usage-years-hours'],['pp-moral_familiar','concentration-scope'],['pp-rating_meaning','data-use-scope']]) {
      await read(`(()=>{for(let i=0;i<20;i++){const p=document.querySelector('#postq .postpage.on');if(p.id===${JSON.stringify(page)})return;for(const c of p.querySelectorAll('.seg, .post-multiple'))c.querySelector('button').click();document.getElementById('postNext').click();}})()`);
      await surveyCapture(vp,name);
    }
    const scopedNotes = {
      'post-note-data_use': 'この質問への回答だけを理由に、謝礼の有無が変わることはありません。',
      'post-note-main_start_basis': '当時の目安として、あてはまるものをすべて選んでください。',
      'post-note-main_three_second_meaning': '当時の受け止めとして、あてはまるものをすべて選んでください。'
    };
    check(`[round3/survey/${vp}] 除外注記の繰り返しを削除し謝礼注記と複数選択の案内を表示`,await read(`(()=>{const expected=${JSON.stringify(scopedNotes)},nodes=Array.from(document.querySelectorAll('.post-scope'));return nodes.length===Object.keys(expected).length&&nodes.every(n=>n.textContent===expected[n.id]);})()`));
  }
  async function taskStopRoundTrip(label) {
    await sleep(250);const before=await state(), n=(await payload()).trials.length;
    await touch('tutAgain');const frozen=await state();await touch('stopBtn');await click('stopGo');
    await until("window.__pilot.activeScreen()==='postq'");await click('postBack');
    const after=await state();
    check(`[round3/stop] ${label}説明中の終了取消: フェーズ・同じ問題・残り問題を保持`,await read("window.__pilot.activeScreen()==='task'")&&after.stage==='task'&&after.phase===before.phase&&after.currentCell.itemId===before.currentCell.itemId&&JSON.stringify(after.queue)===JSON.stringify(before.queue)&&(await payload()).trials.length===n);
    check(`[round3/stop] ${label}説明中の終了取消: 読んだ時間を保ち説明・中断時間を除外`,after.stemElapsedMs>=frozen.stemElapsedMs&&after.stemElapsedMs-frozen.stemElapsedMs<300,JSON.stringify({before:before.stemElapsedMs,frozen:frozen.stemElapsedMs,after:after.stemElapsedMs}));
    await sleep(250);const later=await state();
    check(`[round3/stop] ${label}終了取消後は古い見直し状態が残らず時計が進む`,later.stemElapsedMs-after.stemElapsedMs>=200&&later.phase===before.phase&&!await visible('tutPop'));
    await touch('tutAgain');await touch('tutClose');
    check(`[round3/stop] ${label}終了取消後も再度見直して同じ問題に戻れる`,(await state()).currentCell.itemId===before.currentCell.itemId&&(await state()).phase===before.phase);
  }
  // 対面で終了をいったん選び、事後質問から取り消した場合も元の段階を復元する。
  // instr=1 は対面の既定ではOFFの追加ブロックをこの合成テストだけで有効にする。
  await open('kiosk=1&stop=1&attn=0&instr=1&nmain=1&welcome=0&round3=stop-cancel');
  await until('window.__pilot.storeReady()');await read('window.__pilot.recoveryStartMain()');
  await taskStopRoundTrip('本番');await drag();await until("window.__pilot.activeScreen()==='rating'");
  await read("document.querySelector('#qitem-hesitation button:nth-child(2)').click()");await click('ratingNext');
  await read("document.querySelector('#qitem-confidence button:nth-child(4)').click()");
  const stopBefore=await payload();await touch('ratingHelp');await touch('stopBtn');
  await click('stopGo');await until("window.__pilot.activeScreen()==='postq'");await click('postBack');
  check('[round3/stop] 評定説明中の終了取消: 元のページと回答を復元',await read("window.__pilot.activeScreen()==='rating'&&window.__pilot.recoveryState().stage==='rating'")&&(await state()).rating.page===1&&JSON.stringify((await payload()).trials[0].ratings)===JSON.stringify(stopBefore.trials[0].ratings));
  await touch('ratingHelp');
  check('[round3/stop] 終了取消後も評定説明を再度開け、保存段階が評定のまま',(await help()).rating.review===true&&(await state()).stage==='rating');
  await touch('ratingTutClose');await click('ratingSubmit');
  const stopAfter=await payload();
  check('[round3/stop] 終了取消後の評定を重複なく確定',stopAfter.trials.length===1&&stopAfter.trials[0].ratingSubmitMs!=null&&!stopAfter.device.partial&&(await state()).trialIndex===1);
  await until("window.__pilot.recoveryState().stage==='instructedIntro'");await click('blockintroGo');
  await taskStopRoundTrip('追加問題');await drag();await until("window.__pilot.activeScreen()==='postq'");
  check('[round3/stop] 終了取消を経ても本番と追加回答を各1件だけ記録',(await payload()).trials.filter(t=>t.phase==='main').length===1&&(await payload()).trials.filter(t=>t.phase==='instructed').length===1);

  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await open('go=tut');
  while((await help()).drag.stepId!=='motor') {await sleep(100);await click('tutPopNext');}
  await sleep(900);
  check('[round3/motion] 動きを減らす設定でも未実施の操作確認は飛ばせない',(await help()).drag.stepId==='motor'&&(await help()).drag.pending&&!(await help()).drag.handsDone);
  await drag(true);
  check('[round3/motion] 動きを減らす設定でも初回の中央ボックス操作を完了できる',(await help()).drag.stepId==='motor'&&(await help()).drag.handsDone,JSON.stringify(await help()));
  await click('tutPrev');await click('tutPopNext');
  check('[round3/motion] 動きを減らす設定でも操作成功を戻って保持できる',(await help()).drag.stepId==='motor'&&(await help()).drag.handsDone,JSON.stringify(await help()));
  while((await help()).drag.index>=0) {
    if((await help()).drag.stepId==='rule-check')await read('(()=>{const i=__pilot.helpState().drag.quiz.index,a=PILOT_GUIDED_TUTORIAL.checks[i].correctIndex;document.querySelector(`#tutQuiz button[data-answer-index="${a}"]`).click();})()');
    await click('tutPopNext');await sleep(100);
  }
  await click('guidedIntroGo');await drag();
  check('[round3/motion] 動きを減らす設定でも例題の左右選択肢へ回答できる',await read('__pilot.activeScreen()==="rating"&&__pilot.buildPayload().trials.length===1'));
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  if(out) {
    fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(layout,null,2)+'\n');
    fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>説明の前後移動と見直し・画面地図</title><style>body{font:16px system-ui;background:#f4f2ec;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px}img{width:100%;height:auto}figure{margin:0;background:white;padding:12px}figcaption{padding:8px 0}</style><h1>説明の前後移動と見直し・小画面確認</h1><p>Chrome のタッチ・画面寸法エミュレーションによる検証です。iOS Safari実機の検証ではありません。最小対象相当は375×700 CSS px。合成回答、送信無効。</p><main>'+shots.map(s=>`<figure><figcaption>${s.vp} / ${s.name}</figcaption><img loading="lazy" src="${s.file}"></figure>`).join('')+'</main></html>');
  }
  await read('window.__pilot.resetStoredForTest()');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:800,deviceScaleFactor:2,mobile:true});
};
