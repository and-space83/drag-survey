'use strict';
// Disposable preview only. Never touch the participant origin's persisted data.
(() => {
 const q=new URLSearchParams(location.search),valid=q.get('go')==='task'&&q.get('upload')==='0'&&q.get('debug')==='1'&&q.get('mic')==='0';
 if(!valid){location.replace('../index.html');throw Error('Preview requires its fixed no-send entry');}
 const attempts=[],makeStorage=()=>{const m=new Map();return{get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(String(k))??null,setItem:(k,v)=>m.set(String(k),String(v)),removeItem:k=>m.delete(String(k)),clear:()=>m.clear()};};
 Object.defineProperty(window,'localStorage',{value:makeStorage()});Object.defineProperty(window,'sessionStorage',{value:makeStorage()});
 window.__feedbackIsolation={attempts,persistentStorage:false};
 // These disposable answers are never saved. Suppress only this preview's native
 // leave-page prompt; the production listener remains unchanged in its snapshot.
 window.addEventListener('beforeunload',event=>event.stopImmediatePropagation(),{capture:true});
 window.fetch=(...args)=>{attempts.push({api:'fetch',url:String(args[0])});return Promise.reject(new Error('No requests in the preview'));};
 window.XMLHttpRequest=function(){attempts.push({api:'XHR'});throw Error('No XHR in the preview');};
 Object.defineProperty(navigator,'sendBeacon',{value:(url)=>{attempts.push({api:'sendBeacon',url:String(url)});return false;}});
 let seed=742139;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
})();
