'use strict';
const byId=id=>document.getElementById(id),statusLabels={not_verified:'未確認',passed:'合格',failed:'要修正',partial:'一部確認'};
const chapters=[
{id:'all',label:'全体を最初から',before:{go:'tut'},after:{go:'tut'},note:'前後とも操作説明の最初から始めます。必須操作と最短待機は通常の表示を使います。'},
{id:'layout',label:'1 画面の見方',before:{go:'tut'},after:{go:'tut',gstep:'layout-intro'},note:'変更前は「はじめに」から部品紹介へ進みます。変更後は画面の見方の短い導入から始めます。'},
{id:'motor',label:'2 操作の方法',before:{go:'tut'},after:{go:'tut',gstep:'motor-route'},beforeAdvance:5,note:'変更前は前の説明を進んだ先に操作の練習があります。下のボタンで最短待機を守ってその入口まで進められます。変更後は見本と本人の操作を分けます。'},
{id:'rules',label:'3 ルールを確認する',before:{go:'tut'},after:{go:'tut',gstep:'start-rule'},note:'旧版の開始・3秒の説明は導入や操作説明に分散しています。前側は導入を表示し、後側は独立したルール説明を表示します。一対一の画面比較ではありません。'},
{id:'quiz',label:'3 ルールの復習',before:{go:'practicecheck'},after:{go:'tut',gstep:'rule-check-intro'},note:'旧版に独立した7問の復習はありません。前側は正式練習後の確認を参考表示します。後側の復習quizと正式練習後の確認は別の機能です。'},
{id:'example',label:'4 例題',before:{go:'tut'},after:{go:'exampleintro'},note:'旧版の例題は操作成功後に続きます。前側では説明と操作を進めて確認します。後側は独立した例題の案内です。'},
{id:'rating-intro',label:'5 振り返りの導入',before:{go:'rtut'},after:{go:'rtut',rtstep:'0'},note:'前後とも例題に答えた後のダミー回答で、振り返りの導入を表示します。'},
{id:'rating-hesitation',label:'5 迷いの説明',before:{go:'rtut'},after:{go:'rtut',rtstep:'1'},note:'旧版は導入から次へで迷いへ進みます。変更後はdebug確認用の指定で迷いの説明を直接表示します。'},
{id:'rating-confidence',label:'5 自信の説明',before:{go:'rtut'},after:{go:'rtut',rtstep:'2'},note:'旧版は迷いを選んでから自信へ進みます。変更後はdebug確認用の指定で自信の説明を直接表示します。'},
{id:'rating-finish',label:'5 問題ごとの振り返り',before:{go:'rtut'},after:{go:'rtut',rtstep:'3'},note:'変更後に追加した4枚目の説明です。旧版は導入に含まれる案内と比較します。同じ画面はありません。'},
{id:'practice',label:'6 練習問題への流れ',before:{go:'tut'},after:{go:'tut'},note:'前後とも説明→例題→評定→練習を実際に進めて比べます。所定5問と正式な行動ゲートの合否は別の検証で確認します。'},
{id:'main',label:'本番の回答画面',before:{go:'task'},after:{go:'task'},note:'本番のダミー問題で部品の配置と入力を比較します。参加者データとして保存・送信しません。'},
{id:'rating',label:'本番の迷い・自信',before:{go:'rating'},after:{go:'rating'},note:'通常の評定画面を比較します。進捗、質問、5段階、戻る、説明の見直しも確認します。'},
{id:'late',label:'遅い初動の注意',before:{go:'notice',notice:'late'},after:{go:'notice',notice:'late'},note:'初動3秒の再確認を比較します。説明の復習quizとは別の本番中の注意です。'},
{id:'instructed',label:'追加10問の案内',before:{go:'instructed'},after:{go:'instructed'},note:'通常の問題文を読む手順と異なる追加課題の案内を比較します。'},
{id:'post',label:'最後のアンケート',before:{go:'post'},after:{go:'post'},note:'質問の定義・ページ・入力と、本文・余白のタッチを比較します。'},
{id:'done',label:'完了画面',before:{go:'done'},after:{go:'done'},note:'完了の表示だけを比較します。確認モードで保存・送信は行いません。'}
];
let audits=[],advanceToken=0;
function safeUrl(version,params){
 const url=new URL(version==='before'?'before/index.html':'../../index.html',location.href);
 const q=new URLSearchParams({...params,block:'moral',debug:'1',upload:'0',mic:'0'});
 if(!q.get('go'))throw Error('確認モードが必要です');
 url.search=q.toString();return url.href;
}
function loadFrames(){
 advanceToken++;const chosen=chapters.find(c=>c.id===byId('chapter').value)||chapters[0],[width,height]=byId('size').value.split('x').map(Number);
 byId('mapping').textContent=chosen.note;byId('beforeAdvance').hidden=!chosen.beforeAdvance;byId('beforeAdvance').disabled=false;
 for(const version of ['before','after']){const frame=byId(version+'Frame'),url=safeUrl(version,chosen[version]);frame.dataset.loaded='0';frame.style.width=width+'px';frame.style.height=height+'px';frame.src=url;byId(version+'Link').href=url;byId(version+'Status').textContent='読み込み待ち';}
}
for(const version of ['before','after'])byId(version+'Frame').addEventListener('load',()=>{const frame=byId(version+'Frame');try{if(frame.contentWindow.location.href===frame.src)frame.dataset.loaded='1';}catch{}});
for(const chapter of chapters){const option=document.createElement('option');option.value=chapter.id;option.textContent=chapter.label;byId('chapter').append(option);}
byId('size').onchange=loadFrames;byId('chapter').onchange=loadFrames;byId('reload').onclick=loadFrames;
function frameState(version){
 try{const frame=byId(version+'Frame');if(frame.dataset.loaded!=='1')return null;const p=frame.contentWindow?.__pilot;if(!p)return null;
 if(p.uploadUrl()!==null){frame.src='about:blank';byId(version+'Status').textContent='送信無効を確認できなかったため、表示を停止しました。';return null;}
 const help=p.helpState?.(),state={screen:p.activeScreen?.(),phase:p.phase?.(),drag:help?.drag,rating:help?.rating};
 byId(version+'Status').textContent='送信先なしを確認 · '+(state.screen||'')+(state.drag?.index>=0?' · 操作説明 '+(state.drag.stepId||state.drag.index+1):state.rating?.index>=0?' · 評定説明 '+(state.rating.index+1):'');
 return state;
 }catch{return null;}
}
setInterval(()=>{frameState('before');frameState('after');},650);
byId('beforeAdvance').onclick=async()=>{
 const target=chapters.find(c=>c.id===byId('chapter').value)?.beforeAdvance;if(target==null)return;
 const token=++advanceToken,button=byId('beforeAdvance');button.disabled=true;
 try{for(let count=0;count<12&&token===advanceToken;count++){
  const state=frameState('before');if(!state?.drag||state.drag.index<0||state.drag.index>=target)break;
  await new Promise(resolve=>setTimeout(resolve,Math.max(50,state.drag.lockRemainingMs+80)));
  if(token!==advanceToken)break;
  byId('beforeFrame').contentDocument.getElementById('tutPopNext')?.click();
  await new Promise(resolve=>setTimeout(resolve,100));
 }}finally{if(token===advanceToken)button.disabled=false;}
};
function renderAudits(){
 const group=byId('group').value,status=byId('status').value,show=audits.filter(item=>(!group||item.group===group)&&(!status||item.status===status));
 byId('auditList').replaceChildren();byId('auditCount').textContent=audits.length+'機能 · Chrome動作確認 '+audits.filter(i=>i.status==='passed').length+' · 未確認 '+audits.filter(i=>i.status==='not_verified').length;
 for(const item of show){const card=document.createElement('article');card.className='audit-card';
 const head=document.createElement('div');head.className='audit-head';const title=document.createElement('div');const small=document.createElement('small');small.textContent=item.group+' · '+item.id;const h=document.createElement('h3');h.textContent=item.title;title.append(small,h);const badge=document.createElement('span');badge.className='badge status-'+item.status;badge.textContent=statusLabels[item.status]||item.status;head.append(title,badge);card.append(head);
 const columns=document.createElement('div');columns.className='audit-columns';for(const [label,value] of [['変更前の機能',item.before],['変更後に満たす条件',item.requiredAfter]]){const column=document.createElement('div'),strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=label;p.textContent=value;column.append(strong,p);columns.append(column);}card.append(columns);
 const check=document.createElement('div');check.className='audit-check';for(const [label,value] of [['実機で試すこと',item.manualCheck],['自動確認の候補',item.automaticCheck]]){const strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=label;p.textContent=value;check.append(strong,p);}const caveat=document.createElement('p');caveat.className='audit-caveat';caveat.textContent=item.caveat;check.append(caveat);card.append(check);
 const source=document.createElement('p');source.className='audit-source';source.textContent='凍結原本 '+item.source.file+':'+(item.source.line||'未特定')+' · '+item.source.pattern;card.append(source);
 if(item.evidence?.length){const p=document.createElement('p');p.className='audit-source';p.textContent='実施証拠: '+item.evidence.map(e=>typeof e==='string'?e:JSON.stringify(e)).join(' / ');card.append(p);}
 byId('auditList').append(card);}
}
byId('group').onchange=renderAudits;byId('status').onchange=renderAudits;
fetch('inheritance.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('監査データを読み込めません');return r.json();}).then(data=>{audits=data.items;for(const group of [...new Set(audits.map(i=>i.group))]){const o=document.createElement('option');o.value=group;o.textContent=group;byId('group').append(o);}renderAudits();}).catch(e=>{byId('auditCount').textContent=e.message;});
loadFrames();

