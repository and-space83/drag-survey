'use strict';
window.createFeedbackCandidate=function(env){
 const d=env.document,$=id=>d.getElementById(id);let activePage=0,panels=[],player=null,lastScreen=null,checkState=null;
 const proposal=window.PILOT_FEEDBACK_CHANGES.copy,copy=proposal.practice.rules;
 const el=(tag,cls,text)=>{const e=d.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const scrollObservers=[],scrollUpdates=new Map();
 function scrollCue(container,id,before){
  let cue=$(id);if(!cue){cue=el('p','flow-scroll-cue','下に続きがあります ↓');cue.id=id;cue.hidden=true;before.before(cue);}
  if(scrollUpdates.has(container)){requestAnimationFrame(scrollUpdates.get(container));return;}container.dataset.flowScrollBound='true';
  const update=()=>{cue.hidden=container.clientHeight<1||container.scrollHeight-container.clientHeight-container.scrollTop<4;};
  scrollUpdates.set(container,update);container.addEventListener('scroll',update,{passive:true});container.addEventListener('toggle',()=>requestAnimationFrame(update),true);const ro=new ResizeObserver(update);ro.observe(container);scrollObservers.push(ro);requestAnimationFrame(update);
 }
 function stop(){player?.stop();player=null;}
 function graphic(key){
  const host=el('div','flow-graphic');host.setAttribute('aria-label','操作の見本。触って操作する必要はありません');
  if(key==='late'){player=env.config.createTimeDemo({container:host});player.begin();}
  else if(key==='early'){
   host.classList.add('flow-read-sequence');host.innerHTML='<div><svg viewBox="0 0 60 55" aria-hidden="true"><rect x="9" y="6" width="42" height="41" rx="7"/><path d="M18 18h24M18 26h24M18 34h16"/></svg><span>問題文を読む</span></div><b aria-hidden="true">→</b><div><svg viewBox="0 0 60 55" aria-hidden="true"><path d="M20 32c-15-18 11-35 23-17 6 9-2 14-5 20H24zM25 41h12M28 47h6"/><path d="m24 21 5 5 9-11"/></svg><span>状況が分かる</span></div><b aria-hidden="true">→</b><div><svg viewBox="0 0 60 55" aria-hidden="true"><rect x="5" y="17" width="50" height="29" rx="9"/><path d="M30 8v19m-5-5 5 6 5-6"/></svg><span>スタート</span></div>';
  }else{
   host.classList.add('flow-release-figure');host.innerHTML='<svg viewBox="0 0 300 132" role="img" aria-label="選択肢の枠の内側全体を淡く塗り、文字から離れた左下で指を離す例を示しています"><rect x="38" y="6" width="224" height="94" rx="16" fill="#e7f7ee" stroke="#12855a" stroke-width="2"/><text x="150" y="38" text-anchor="middle" fill="#24443c" font-size="17">選択肢</text><circle cx="91" cy="81" r="14" fill="#12855a" fill-opacity=".15" stroke="#12855a" stroke-opacity=".4"/><path d="m86 126-12-12q-3-5 1-7 4-3 9 4V82q0-8 7-8t7 8v17q4-4 8 0 4-3 8 1 7-2 8 6v13q0 7-8 7z" fill="#fff7ed" stroke="#8f7460" stroke-width="2"/></svg>';
  }
  return host;
 }
 function practice(state){
  stop();checkState=state;activePage=0;panels=[];const screen=$('practicecheck'),pad=screen.querySelector('.pad');pad.classList.add('flow-feedback-pad');
  let header=$('flowPracticeHeader');if(!header){header=el('header','flow-section-heading');header.id='flowPracticeHeader';pad.prepend(header);}header.replaceChildren(el('p','flow-eyebrow','練習の操作を確認'));
  screen.querySelector('h1').hidden=true;const intro=[...pad.children].find(e=>e.tagName==='P');if(intro)intro.hidden=true;
  const items=$('practiceCheckItems');items.classList.add('flow-rule-pages');
  const originalLabels=[...items.querySelectorAll('.rule-check')];
  for(let i=0;i<originalLabels.length;i++){
   const label=originalLabels[i],input=label.querySelector('input'),key=input.dataset.rule,c=copy[key],panel=el('article','flow-rule-panel');panel.dataset.rule=key;
   const count=el('p','flow-page-count',`${i+1} / ${state.keys.length}`),title=el('h2','flow-rule-title',c.title);title.id='flow-rule-title-'+key;panel.setAttribute('aria-labelledby',title.id);
   const body=el('p','flow-rule-body',c.body.join('\n'));panel.append(count,title,body);
   const art=el('div','flow-art-slot');art.dataset.graphic=key;panel.append(art);
   if(c.supporting)panel.append(el('p','flow-support',c.supporting.join('\n')));
   if(c.reasonText){const why=el('details','flow-observation');why.append(el('summary','','動かしながら考える理由'),el('p','',c.reasonText));panel.append(why);}
   const confirm=el('label','flow-confirm');input.id='flow-confirm-'+key;confirm.htmlFor=input.id;confirm.append(input,el('span','',proposal.practice.checkbox));panel.append(confirm);label.replaceWith(panel);panels.push(panel);
   input.addEventListener('change',()=>{updateButtons();});
  }
  let nav=$('flowPracticeNav');if(!nav){nav=el('nav','flow-feedback-nav');nav.id='flowPracticeNav';nav.setAttribute('aria-label','確認の進行');const prev=el('button','btn ghost','戻る');prev.id='flowPracticePrev';prev.type='button';prev.onclick=()=>{if(activePage>0){activePage--;showPage();}};const next=el('button','btn primary','次のポイントへ');next.id='flowPracticeNext';next.type='button';next.onclick=()=>{if(panels[activePage]?.querySelector('input').checked&&activePage<panels.length-1){activePage++;showPage();}};nav.append(prev,next,$('practiceCheckGo'));pad.append(nav);}
  $('practiceCheckGo').textContent=proposal.practice.final;
  let op=$('flowPracticeOp');if(!op){op=el('p','flow-operation');op.id='flowPracticeOp';pad.insertBefore(op,nav);}scrollCue(items,'flowPracticeScrollHint',op);showPage();
 }
 function showPage(){
  stop();panels.forEach((p,i)=>{p.hidden=i!==activePage;p.querySelector('.flow-art-slot').replaceChildren();});
  const panel=panels[activePage];panel.querySelector('.flow-art-slot').append(graphic(panel.dataset.rule));
  const heading=panel.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});$('practiceCheckItems').scrollTop=0;updateButtons();requestAnimationFrame(()=>scrollUpdates.get($('practiceCheckItems'))?.());
 }
 function updateButtons(){
  const panel=panels[activePage];if(!panel)return;const last=activePage===panels.length-1,checked=panel.querySelector('input').checked;
  $('flowPracticePrev').hidden=activePage===0;$('flowPracticeNext').hidden=last;$('flowPracticeNext').disabled=!checked;$('practiceCheckGo').hidden=!last;
  $('flowPracticeOp').textContent=checked?(last?'確認したら「'+$('practiceCheckGo').textContent+'」へ':'確認したら「次のポイントへ」へ'):'読んだら、下の確認欄にチェックしてください';
 }
 function notice(kind){
  stop();const screen=$('notice'),pad=screen.querySelector('.pad');pad.classList.add('flow-notice-pad');
  const h=screen.querySelector('h1');h.textContent=kind==='early_late'?proposal.notice.headingBoth:proposal.notice.heading;h.className='flow-notice-title';
  let top=$('flowNoticeEyebrow');if(!top){top=el('p','flow-eyebrow','操作の確認');top.id='flowNoticeEyebrow';pad.insertBefore(top,h);}
  const original=$('noticeText').innerHTML,body=$('noticeText');body.className='flow-notice-content';body.replaceChildren();
  const keys=kind==='early_late'?['early','late']:[kind];for(const key of keys){const c=proposal.notice.rules[key],card=el('article','flow-notice-card');card.append(el('h2','',c.title),el('p','',c.body.join('\n')));body.append(card);}
  if(keys.includes('late')){body.append(el('p','flow-support',proposal.notice.rules.late.supporting.join('\n')));}
  const details=el('details','flow-observation');details.append(el('summary','',env.context().afterBreak?proposal.notice.observationHeadingAfterBreak:proposal.notice.observationHeading));
  const holder=el('div');holder.innerHTML=original;const observation=holder.querySelector('.notice-observation');
  details.append(el('p','',env.context().afterBreak?proposal.notice.afterBreakObservations[kind]:observation?.textContent||''));if(keys.includes('late'))details.append(el('p','',proposal.notice.rules.late.reasonText));
  body.append(details);$('noticeGo').textContent='確認して次の問題へ';scrollCue(body,'flowNoticeScrollHint',$('noticeGo'));
 }
 function breakScreen(willShowNotice){
  const info=$('breakInfo'),button=$('breakContinue');button.textContent='本番を再開する';
  let note=$('flowBreakContext');if(!note){note=el('p','flow-break-context');note.id='flowBreakContext';info.after(note);}
  note.hidden=!willShowNotice;note.textContent=willShowNotice?proposal.break.pendingNotice:'';
 }
 function onScreen(screen){if(screen===lastScreen)return;lastScreen=screen;if(screen!=='practicecheck')stop();}
 function reset(){stop();activePage=0;panels=[];checkState=null;lastScreen=null;}
 return{practice,notice,break:breakScreen,onScreen,reset,page:()=>({index:activePage,count:panels.length,rule:panels[activePage]?.dataset.rule||null})};
};
