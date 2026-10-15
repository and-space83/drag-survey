'use strict';
(() => {
  const manifest = JSON.parse(document.getElementById('manifest').textContent);
  const devices = manifest.devices;
  const screens = manifest.screens;
  const $ = selector => document.querySelector(selector);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sections = manifest.sections;
  const params = new URLSearchParams(location.search);
  let view = ['flow','branches','all'].includes(params.get('view')) ? params.get('view') : 'flow';
  let device = Object.hasOwn(devices, params.get('device')) ? params.get('device') : 'mini';
  let compare = params.get('compare') === '1';
  let query = '';
  let visible = [];
  let activeId = null;
  let dialogDevice = device;
  let observer;
  const number = n => String(n).padStart(2,'0');
  const source = (screen, size) => screen.images[size];
  screens.forEach((screen, i) => {
    screen.globalIndex = i;
    screen.searchText = [screen.title,screen.description,screen.condition,...Object.values(screen.text || {})].join(' ').toLocaleLowerCase();
  });
  function updateURL(hash) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('view', view);
      url.searchParams.set('device', device);
      if (compare) url.searchParams.set('compare','1'); else url.searchParams.delete('compare');
      if (hash !== undefined) url.hash = hash;
      history.replaceState(null,'',url);
    } catch (_) { /* Local file viewers may disallow history changes. */ }
  }
  function shotHTML(screen, size, modal = false) {
    const shot = source(screen,size);
    const label = devices[size].short;
    const caption = `${esc(label)} <small>${shot.width} × ${shot.height}</small>`;
    const img = `<img src="${esc(shot.src)}" width="${shot.width}" height="${shot.height}" alt="${esc(screen.title)} — ${esc(label)}" ${modal ? '' : 'loading="lazy" decoding="async"'}>`;
    return modal
      ? `<figure style="--shot-width:${Math.min(440,shot.width)}"><figcaption>${caption}</figcaption><a href="${esc(shot.src)}" target="_blank" rel="noopener" aria-label="${esc(label)}の原寸画像を開く">${img}</a></figure>`
      : `<figure class="shot" style="--shot-width:${Math.min(440,shot.width)}"><figcaption>${caption}</figcaption><button class="image-button" data-open="${esc(screen.id)}" data-size="${size}" aria-label="${esc(screen.title)}、${esc(label)}を拡大">${img}</button></figure>`;
  }
  function render() {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    visible = screens.filter(s => (view === 'all' || s.kind === view) && words.every(w => s.searchText.includes(w)));
    $('#gallery').classList.toggle('compare',compare);
    $('[data-device="'+device+'"]').setAttribute('aria-pressed','true');
    document.querySelectorAll('[data-device]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.device===device)));
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.view===view)));
    $('#compare').checked = compare;
    $('#result-count').textContent = `${visible.length} 画面`;
    $('#flow-note').textContent = view === 'branches' ? '発生する状況ごとにまとめています。各画面に表示条件を添えています。' : '表示される順に並んでいます。条件付きの案内には、その条件を添えています。';
    $('#empty').hidden = visible.length > 0;
    const groups = [];
    for (const s of visible) {
      let group = groups.at(-1);
      const key = s.kind + '-' + s.section;
      if (!group || group.key !== key) { group = {key, section:s.section, kind:s.kind, screens:[]}; groups.push(group); }
      group.screens.push(s);
    }
    let flowNumber = 0, branchNumber = 0;
    const indexById = new Map(screens.map(s => [s.id, s.kind==='flow' ? ++flowNumber : ++branchNumber]));
    $('#gallery').innerHTML = groups.map((group,i) => {
      const section = sections[group.section] || { title: group.section, description: '' };
      return `<section class="screen-section" id="section-${esc(group.key)}"><div class="section-heading"><span class="section-number">${number(i+1)}</span><div><h2>${esc(section.title)}</h2><p>${esc(section.description)}</p></div><span class="line"></span><span class="section-count">${group.screens.length} 画面</span></div><div class="cards">${group.screens.map(s => `<article class="screen-card" id="screen-${esc(s.id)}"><div class="card-top"><div class="card-meta"><span class="card-index">${s.kind==='branches'?'E':'S'}${number(indexById.get(s.id))}</span>${s.condition ? '<span class="condition-badge">条件付き</span>':''}</div><h3>${esc(s.title)}</h3></div><div class="shot-list">${(compare?Object.keys(devices):[device]).map(d=>shotHTML(s,d)).join('')}</div><p class="card-caption">${esc(s.description)}${s.condition?`<span class="card-condition">${esc(s.condition)}</span>`:''}</p></article>`).join('')}</div></section>`;
    }).join('');
    let lastKind = null;
    $('#outline').innerHTML = groups.map((g,i) => {
      const separator = view==='all' && lastKind!==g.kind ? `<span class="nav-separator">${g.kind==='flow'?'通常の流れ':'問題が起きたとき・補助'}</span>` : '';
      lastKind = g.kind;
      return `${separator}<a href="#section-${esc(g.key)}"><small>${number(i+1)}</small>${esc(sections[g.section]?.title || g.section)}</a>`;
    }).join('');
    observer?.disconnect();
    observer = new IntersectionObserver(entries => {
      const entry = entries.filter(e => e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if(entry) document.querySelectorAll('#outline a').forEach(a => a.classList.toggle('current',a.hash==='#'+entry.target.id));
    },{rootMargin:'-180px 0px -45% 0px',threshold:0});
    document.querySelectorAll('.screen-section').forEach(s=>observer.observe(s));
    updateURL();
  }
  function showDialog(id, size) {
    activeId = id;
    dialogDevice = size || (compare?'all':device);
    $('#lightbox-device').value = dialogDevice;
    renderDialog();
    if (!$('#lightbox').open) $('#lightbox').showModal();
    document.body.classList.add('modal-open');
    updateURL('screen-'+id);
  }
  function renderDialog() {
    const screen = visible.find(s=>s.id===activeId);
    if(!screen) return;
    const pos = visible.indexOf(screen);
    $('#lightbox-position').textContent = `${pos+1} / ${visible.length} · ${sections[screen.section]?.title || screen.section}`;
    $('#lightbox-title').textContent = screen.title;
    $('#lightbox-content').classList.toggle('multi',dialogDevice==='all');
    $('#lightbox-content').innerHTML = (dialogDevice==='all'?Object.keys(devices):[dialogDevice]).map(d=>shotHTML(screen,d,true)).join('');
    $('#lightbox-description').textContent = [screen.description,screen.condition].filter(Boolean).join(' — ');
    const textDevice = dialogDevice==='all' ? device : dialogDevice;
    $('#lightbox-text').textContent = screen.text?.[textDevice] || 'この画面には取得した本文がありません。';
    $('#previous').disabled = pos===0;
    $('#next').disabled = pos===visible.length-1;
    $('#lightbox').scrollTop = 0;
  }
  function step(direction) {
    const pos = visible.findIndex(s=>s.id===activeId);
    const target = visible[pos+direction];
    if(target){activeId=target.id;renderDialog();updateURL('screen-'+activeId);}
  }
  function renderKeepingPlace() {
    const toolbarBottom = $('#controls').getBoundingClientRect().bottom;
    const current = [...document.querySelectorAll('.screen-card')].find(card=>card.getBoundingClientRect().bottom > toolbarBottom+12);
    const anchor = current ? {id:current.id,top:current.getBoundingClientRect().top} : null;
    render();
    if(anchor)requestAnimationFrame(()=>{
      const element=document.getElementById(anchor.id);
      if(element)window.scrollBy({top:element.getBoundingClientRect().top-anchor.top,behavior:'instant'});
    });
  }
  function resetResults() {
    updateURL('');
    render();
    if($('#controls').getBoundingClientRect().top < 0)$('#controls').scrollIntoView({behavior:'instant',block:'start'});
  }
  document.addEventListener('click',e=>{
    const viewButton=e.target.closest('[data-view]');
    const deviceButton=e.target.closest('[data-device]');
    const openButton=e.target.closest('[data-open]');
    if(viewButton){view=viewButton.dataset.view;resetResults();}
    if(deviceButton){device=deviceButton.dataset.device;compare=false;renderKeepingPlace();}
    if(openButton)showDialog(openButton.dataset.open,compare?'all':openButton.dataset.size);
  });
  $('#compare').addEventListener('change',e=>{compare=e.target.checked;renderKeepingPlace();});
  $('#search').addEventListener('input',e=>{query=e.target.value;resetResults();});
  $('#clear').addEventListener('click',()=>{query='';view='all';$('#search').value='';resetResults();});
  $('#close').addEventListener('click',()=>$('#lightbox').close());
  $('#lightbox').addEventListener('close',()=>{document.body.classList.remove('modal-open');});
  $('#lightbox').addEventListener('click',e=>{if(e.target===$('#lightbox')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
  $('#lightbox-device').addEventListener('change',e=>{dialogDevice=e.target.value;renderDialog();});
  $('#previous').addEventListener('click',()=>step(-1));
  $('#next').addEventListener('click',()=>step(1));
  document.addEventListener('keydown',e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    if($('#lightbox').open){if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}if(e.key==='ArrowRight'){e.preventDefault();step(1);}}
    else if(e.key==='/'){e.preventDefault();$('#search').focus();}
  });
  $('#flow-count').textContent = screens.filter(s=>s.kind==='flow').length;
  $('#branch-count').textContent = screens.filter(s=>s.kind==='branches').length;
  $('#version').textContent = manifest.appVersion || '撮影時点の実装';
  $('#capture-stamp').textContent = '撮影・生成：' + new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'long',timeStyle:'short'}).format(new Date(manifest.generatedAt)) + '（日本時間）';
  const publicStatus=manifest.publication?`${manifest.publication.checks.length}点の本番配信ファイルと撮影元を照合し、一致を確認しています。照合日時：${new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'long',timeStyle:'short'}).format(new Date(manifest.publication.checkedAt))}（日本時間）。`:manifest.publicationPending?'更新版の公開後に14点の配布ファイルを照合する予定です。現在は公開配布版との一致を確認していません。':'公開配布版との同一性を示すものではありません。';
  $('#capture-detail').textContent = `アプリ版：${manifest.appVersion}。${screens.length}画面、${screens.length*3}枚。画像・元ソースのSHA-256を対応表に保存しています。${manifest.sourceMatchesWorkingTree?'サイト生成時のローカル実装と一致しています。':'撮影中にアプリの更新があったため、固定した撮影元の版を掲載しています。'}${manifest.sourceRefreshes?.length?'撮影後の更新に伴う再撮影とソース差分の確認履歴を対応表に残しています。':''}${publicStatus}`;
  if(manifest.publication){
    $('.local-tag').textContent='本番版と照合済み';
    const link=document.createElement('a');link.href='data/publication.json';link.textContent='本番配信の照合記録';
    $('#capture-detail').append(document.createTextNode(' '),link);
  }
  const initialId = decodeURIComponent(location.hash).replace(/^#screen-/,'');
  const initial = screens.find(s=>s.id===initialId);
  if(initial)view=initial.kind;
  render();
  if(initial)requestAnimationFrame(()=>document.getElementById('screen-'+initial.id)?.scrollIntoView());
})();
