'use strict';
// Review copy only: no persisted participant state or collector access.
(() => {
  const attempts=[],storage=()=>{const map=new Map();return{get length(){return map.size;},key:index=>[...map.keys()][index]??null,getItem:key=>map.get(String(key))??null,setItem:(key,value)=>map.set(String(key),String(value)),removeItem:key=>map.delete(String(key)),clear:()=>map.clear()};};
  Object.defineProperty(window,'localStorage',{value:storage()});
  Object.defineProperty(window,'sessionStorage',{value:storage()});
  window.__quizPreviewIsolation={attempts,persistentStorage:false};
  window.addEventListener('beforeunload',event=>event.stopImmediatePropagation(),{capture:true});
  window.fetch=(...args)=>{attempts.push({api:'fetch',url:String(args[0])});return Promise.reject(Error('Network disabled in the review'));};
  window.XMLHttpRequest=function(){attempts.push({api:'XHR'});throw Error('Network disabled in the review');};
  Object.defineProperty(navigator,'sendBeacon',{value:url=>{attempts.push({api:'sendBeacon',url:String(url)});return false;}});
  // Enforce safe entry before any app script reads the URL, even if opened directly.
  const url=new URL(location.href);
  for(const [key,value] of Object.entries({go:'tut',upload:'0',debug:'1',mic:'0',block:'moral'}))url.searchParams.set(key,value);
  if(!url.searchParams.has('gstep'))url.searchParams.set('gstep','rule-check');
  history.replaceState(null,'',url);
})();
