'use strict';
(() => {
  const data=window.QUIZ_BOX_REVIEW,$=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  let question=Math.max(0,Math.min(data.questions.length-1,Number(query.get('question')||1)-1));
  if(!Number.isFinite(question))question=0;
  let state=['unselected','wrong','correct'].includes(query.get('state'))?query.get('state'):'unselected';
  let version=query.get('version')==='before'?'before':'after';
  const stateNames={unselected:'未回答',wrong:'誤答',correct:'正答'},versionNames={before:'変更前',after:'変更後'};
  for(const [index,q] of data.questions.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1} / ${data.questions.length}　${q.copy}`;$('question').append(option);}
  for(const size of data.sizes){const card=document.createElement('article');card.className='device';const title=document.createElement('h3');title.textContent=size.label;const dimensions=document.createElement('p');dimensions.className='dimensions';dimensions.textContent=`${size.width} × ${size.height}`;const link=document.createElement('a');link.target='_blank';link.rel='noopener';const img=document.createElement('img');img.width=size.width;img.height=size.height;img.loading='eager';link.append(img);card.append(title,dimensions,link);$('screens').append(card);}
  function render(){
    $('question').value=String(question);
    for(const button of document.querySelectorAll('[data-state]'))button.setAttribute('aria-pressed',String(button.dataset.state===state));
    for(const button of document.querySelectorAll('[data-version]'))button.setAttribute('aria-pressed',String(button.dataset.version===version));
    const q=data.questions[question];$('selection').textContent=`${versionNames[version]} · ${question+1} / ${data.questions.length} · ${stateNames[state]}：${q.copy}`;
    for(const [index,size] of data.sizes.entries()){const file=`${version==='before'?'before/':''}${size.width}x${size.height}/quiz-${question+1}-${state}.png`,url=file+'?v='+data.images[file].slice(0,12),card=$('screens').children[index];card.querySelector('a').href=url;const img=card.querySelector('img');img.src=url;img.alt=`${versionNames[version]} ${size.label} 復習${question+1} ${stateNames[state]}`;}
    const url=new URL(location.href);url.searchParams.set('question',String(question+1));url.searchParams.set('state',state);url.searchParams.set('version',version);history.replaceState(null,'',url);
  }
  $('question').addEventListener('change',()=>{question=Number($('question').value);render();});
  for(const button of document.querySelectorAll('[data-state]'))button.addEventListener('click',()=>{state=button.dataset.state;render();});
  for(const button of document.querySelectorAll('[data-version]'))button.addEventListener('click',()=>{version=button.dataset.version;render();});
  $('verification').textContent=`Chromeの合成操作で${data.verification.passed}項目成功。変更前後の座標と進行・記録を照合しています。実機Safariは未確認です。`;
  window.QuizBoxReview=Object.freeze({state:()=>({question:question+1,state,version})});render();
})();
