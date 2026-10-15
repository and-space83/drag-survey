'use strict';
(() => {
  const data = window.PILOT_DEVICE_CHECKS;
  const TOOL = 'pilot-device-checklist', SCHEMA = 1;
  const STATUS = { pending: '未確認', passed: '確認済み', issue: '要修正', hold: '保留' };
  const MODE = { preview: '確認画面で試す', lab: '保存付き実機確認', synthetic: '追加の合成検証が必要', reference: '資料・設定を見る' };
  const ENV_FIELDS = { device: 'envDevice', os: 'envOs', browser: 'envBrowser', kind: 'envKind', date: 'envDate', notes: 'envNotes' };
  const $ = id => document.getElementById(id);
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    $('storageStatus').textContent = '確認項目を読み込めませんでした。ページを開き直してください。';
    $('storageStatus').className = 'warning'; return;
  }
  const items = data.items, ids = new Set(items.map(i => i.id));
  if (ids.size !== items.length) throw Error('確認項目のIDが重複しています。');
  const storageKey = TOOL + ':' + data.targetVersion + ':v1';
  let state, lastSavedRaw = null, blocked = false, storageFailure = '', saveAt = null;
  const cards = new Map();
  const now = () => new Date().toISOString();
  const uid = () => 'record-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  const clone = value => JSON.parse(JSON.stringify(value));
  const localDate = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
  const current = () => state.records.find(r => r.id === state.activeRecordId);
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
  const textField = (value, max, name) => { if (typeof value !== 'string' || value.length > max) throw Error(name + 'の形式が正しくありません。'); return value; };
  const dateField = (value, name) => { if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw Error(name + 'の日時が正しくありません。'); return value; };
  const newRecord = title => ({ id: uid(), title, createdAt: now(), updatedAt: now(), environment: { device: '', os: '', browser: '', kind: 'actual-device', date: localDate(), notes: '' }, checks: {} });
  function validateRecord(input) {
    if (!plain(input) || !plain(input.environment) || !plain(input.checks)) throw Error('確認記録の形式が正しくありません。');
    const id = textField(input.id, 120, '記録ID');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('記録IDの形式が正しくありません。');
    const environment = {};
    for (const key of Object.keys(ENV_FIELDS)) environment[key] = textField(input.environment[key], key === 'notes' ? 2000 : 160, '確認環境');
    if (!['actual-device', 'pc', 'synthetic'].includes(environment.kind)) throw Error('確認環境の種類が正しくありません。');
    if (environment.date && !/^\d{4}-\d{2}-\d{2}$/.test(environment.date)) throw Error('確認日の形式が正しくありません。');
    const checks = {};
    for (const [checkId, result] of Object.entries(input.checks)) {
      if (!ids.has(checkId)) throw Error('このチェック表にない項目が含まれています：' + checkId);
      if (!plain(result) || !Object.hasOwn(STATUS, result.status)) throw Error('確認状態の形式が正しくありません。');
      checks[checkId] = { status: result.status, note: textField(result.note, 6000, 'メモ'), updatedAt: dateField(result.updatedAt, '項目更新') };
    }
    return { id, title: textField(input.title, 160, '記録名'), createdAt: dateField(input.createdAt, '作成'), updatedAt: dateField(input.updatedAt, '更新'), environment, checks };
  }
  function validateState(input) {
    if (!plain(input) || input.schemaVersion !== SCHEMA || input.tool !== TOOL || input.targetVersion !== data.targetVersion || !Array.isArray(input.records) || !input.records.length || input.records.length > 100) throw Error('保存した確認記録の形式・対象版が一致しません。');
    const records = input.records.map(validateRecord);
    if (new Set(records.map(r => r.id)).size !== records.length || !records.some(r => r.id === input.activeRecordId)) throw Error('保存した記録のIDが正しくありません。');
    return { schemaVersion: SCHEMA, tool: TOOL, targetVersion: data.targetVersion, activeRecordId: input.activeRecordId, records };
  }
  function freshState() { const first = newRecord('確認記録 1'); return { schemaVersion: SCHEMA, tool: TOOL, targetVersion: data.targetVersion, activeRecordId: first.id, records: [first] }; }
  function displayStorage() {
    $('storageStatus').textContent = storageFailure || (saveAt ? 'このブラウザに自動保存しました。' : '変更すると、このブラウザに自動保存します。');
    $('storageStatus').className = storageFailure ? 'warning' : '';
    $('recordUpdated').textContent = '最終更新：' + formatDate(current().updatedAt);
  }
  function persist() {
    if (blocked) { displayStorage(); return; }
    try {
      if (localStorage.getItem(storageKey) !== lastSavedRaw) {
        blocked = true; storageFailure = '別のタブで保存内容が変わりました。上書きせず、この画面の結果を保持しています。JSONを書き出してから開き直してください。'; displayStorage(); return;
      }
      const raw = JSON.stringify(state);
      localStorage.setItem(storageKey, raw); lastSavedRaw = raw; saveAt = now(); storageFailure = '';
    } catch (_) { storageFailure = '自動保存できません。この画面では操作できますが、閉じる前にJSONを書き出してください。'; }
    displayStorage();
  }
  try {
    lastSavedRaw = localStorage.getItem(storageKey);
    state = lastSavedRaw ? validateState(JSON.parse(lastSavedRaw)) : freshState();
  } catch (_) {
    blocked = true; state = freshState();
    storageFailure = '保存内容を読み込めませんでした。元の保存内容は上書きせず、今回の操作はこの画面内に保持します。JSONを書き出してください。';
  }
  function formatDate(value) { return new Date(value).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function resultFor(id) { return current().checks[id] || { status: 'pending', note: '', updatedAt: null }; }
  function changed() { current().updatedAt = now(); persist(); }
  function message(text, error = false) { $('actionStatus').textContent = text; $('actionStatus').className = error ? 'error' : ''; }
  function element(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  function safeLink(link) {
    if (link.query) {
      const allowedGo = new Set(['tut', 'exampleintro', 'rtut', 'rating', 'practicecheck', 'task', 'notice', 'break', 'instructed', 'post', 'done', 'sending', 'reading', 'blockintro', 'micgate', 'welcome']);
      if (!allowedGo.has(link.query.go)) return null;
      const target = location.protocol === 'file:' ? new URL('https://and-space83.github.io/drag-survey/pilot-anchor/index.html') : new URL('../../index.html', location.href);
      for (const [key, value] of Object.entries(link.query)) if (['go', 'gstep', 'rtstep', 'notice', 'postpage', 'stop'].includes(key)) target.searchParams.set(key, String(value));
      for (const [key, value] of Object.entries({ block: 'moral', debug: '1', upload: '0', mic: '0' })) target.searchParams.set(key, value);
      return target.href;
    }
    if (typeof link.href !== 'string') return null;
    const target = new URL(link.href, location.href);
    if (!['file:', 'http:', 'https:'].includes(target.protocol)) return null;
    return target.href;
  }
  function renderCard(item, index) {
    const card = element('article', 'check-card'); card.dataset.checkId = item.id; card.id = 'check-' + item.id;
    const top = element('div', 'check-top'), heading = element('div', 'check-heading');
    heading.append(element('p', 'check-kicker', String(index + 1).padStart(2, '0') + ' · ' + item.group + ' · ' + MODE[item.mode]), element('h3', '', item.title));
    const badge = element('span', 'state-badge'); top.append(heading, badge); card.append(top);
    const place = element('div', 'check-place'); place.append(element('strong', '', '確認する場所'), element('p', '', Array.isArray(item.where) ? item.where.join(' → ') : item.where)); card.append(place);
    if (item.mode === 'lab') card.append(element('p', 'method-note', '本番とは別ドメインの本人用サイトです。同じChatGPTアカウントでログインし、架空の内容で操作します。ブラウザ内保存は実際に行い、送信結果は端末内で模擬します。'));
    if (item.mode === 'synthetic') card.append(element('p', 'method-note', '表示専用の確認画面だけでは、この項目全体を確認できません。「保存付きの実機確認」がある場合はそこで試せる範囲を確認し、旧版互換や記録の照合など残りは合成検証の結果と区別して記録します。'));
    const links = element('div', 'check-links');
    for (const link of item.links || []) { const href = safeLink(link); if (!href) continue; const a = element('a', '', link.label + ' ↗'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); }
    if (links.childElementCount) card.append(links);
    const columns = element('div', 'check-columns');
    for (const [title, list, tag] of [['実際にやること', item.steps, 'ol'], ['こうなれば確認済み', item.expected, 'ul']]) {
      const block = element('div'), ul = element(tag); block.append(element('h4', '', title));
      for (const line of list || []) ul.append(element('li', '', line)); block.append(ul); columns.append(block);
    }
    card.append(columns);
    if (item.note) card.append(element('p', 'check-note', item.note));
    const result = element('div', 'record-result'), resultHead = element('div', 'result-heading'), timestamp = element('span', 'checked-at');
    resultHead.append(element('strong', '', 'この項目の確認結果'), timestamp); result.append(resultHead);
    const buttons = element('div', 'status-buttons'); buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', item.title + 'の確認状態');
    for (const [value, label] of Object.entries(STATUS)) {
      const b = element('button', '', label); b.type = 'button'; b.dataset.status = value;
      b.addEventListener('click', () => setStatus(item.id, value)); buttons.append(b);
    }
    const noteLabel = element('label', 'note-label', 'メモ・気づいたこと'), note = element('textarea'); note.dataset.note = item.id; note.maxLength = 6000; note.rows = 2; note.placeholder = '例：自信の画面で「戻る」を押すと、選択が消えた。';
    note.addEventListener('input', () => { current().checks[item.id] = { ...resultFor(item.id), note: note.value, updatedAt: now() }; changed(); syncCard(item.id, false); applyFilters(); });
    noteLabel.append(note); result.append(buttons, noteLabel); card.append(result, element('p', 'card-id', item.id));
    const searchText = [item.group, item.title, item.where, ...(item.steps || []), ...(item.expected || []), item.note || ''].join(' ').toLocaleLowerCase();
    cards.set(item.id, { card, badge, buttons, note, timestamp, item, searchText }); return card;
  }
  function syncCard(id, updateNote = true) {
    const { card, badge, buttons, note, timestamp } = cards.get(id), result = resultFor(id);
    card.dataset.currentStatus = result.status; badge.className = 'state-badge ' + result.status; badge.textContent = STATUS[result.status];
    for (const b of buttons.children) b.setAttribute('aria-pressed', String(b.dataset.status === result.status));
    if (updateNote) note.value = result.note;
    timestamp.textContent = result.updatedAt ? '記録：' + formatDate(result.updatedAt) : 'まだ記録していません';
  }
  function setStatus(id, status) {
    if (!ids.has(id) || !Object.hasOwn(STATUS, status)) throw Error('確認項目・状態が正しくありません。');
    current().checks[id] = { ...resultFor(id), status, updatedAt: now() }; changed(); syncCard(id); applyFilters();
  }
  function renderRecordOptions() {
    $('recordSelect').replaceChildren();
    for (const record of state.records) { const option = element('option', '', record.title || '名前なしの記録'); option.value = record.id; $('recordSelect').append(option); }
    $('recordSelect').value = state.activeRecordId;
  }
  function renderRecord() {
    renderRecordOptions(); $('recordTitle').value = current().title;
    for (const [field, id] of Object.entries(ENV_FIELDS)) $(id).value = current().environment[field];
    for (const item of items) syncCard(item.id); displayStorage(); applyFilters();
  }
  function applyFilters() {
    const counts = { pending: 0, passed: 0, issue: 0, hold: 0 }, search = $('searchChecks').value.trim().toLocaleLowerCase(), group = $('groupFilter').value, mode = $('modeFilter').value, status = $('statusFilter').value;
    let visible = 0;
    for (const item of items) {
      const result = resultFor(item.id), view = cards.get(item.id); counts[result.status]++;
      view.card.hidden = !!((group && item.group !== group) || (mode && item.mode !== mode) || (status && result.status !== status) || (search && !(view.searchText + ' ' + result.note.toLocaleLowerCase()).includes(search)));
      if (!view.card.hidden) visible++;
    }
    $('progressText').textContent = counts.passed + ' / ' + items.length + ' 項目を確認済み';
    $('progressPercent').textContent = Math.round(counts.passed / items.length * 100) + '%'; $('checkProgress').max = items.length; $('checkProgress').value = counts.passed;
    if (!$('statusSummary').childElementCount) for (const [value, label] of Object.entries(STATUS)) {
      const b = element('button'); b.type = 'button'; b.dataset.summaryStatus = value; b.append(element('span', '', label), element('b'));
      b.addEventListener('click', () => { $('statusFilter').value = $('statusFilter').value === value ? '' : value; applyFilters(); }); $('statusSummary').append(b);
    }
    for (const b of $('statusSummary').children) { b.setAttribute('aria-pressed', String(status === b.dataset.summaryStatus)); b.querySelector('b').textContent = counts[b.dataset.summaryStatus]; }
    $('visibleCount').textContent = visible + ' / ' + items.length + ' 項目を表示'; $('emptyState').hidden = visible !== 0;
  }
  function exportRecord() { return JSON.stringify({ schemaVersion: SCHEMA, tool: TOOL, targetVersion: data.targetVersion, exportedAt: now(), record: clone(current()) }, null, 2); }
  function importRecord(input) {
    if (typeof input === 'string' && input.length > 1000000) throw Error('ファイルが大きすぎます。1MB以下の確認記録を選んでください。');
    let payload;
    try { payload = typeof input === 'string' ? JSON.parse(input) : clone(input); } catch (_) { throw Error('JSON形式の確認記録を選んでください。'); }
    if (!plain(payload) || payload.schemaVersion !== SCHEMA || payload.tool !== TOOL) throw Error('このチェック表から書き出したJSONではありません。');
    if (payload.targetVersion !== data.targetVersion) throw Error('対象版が違います。この表は ' + data.targetVersion + ' 用です。既存の記録は変更していません。');
    if (state.records.length >= 100) throw Error('記録が100件に達しています。新しいブラウザで記録を管理してください。');
    const record = validateRecord(payload.record); record.id = uid(); record.title = (record.title.slice(0, 150) || '確認記録') + '（読込）';
    state.records.push(record); state.activeRecordId = record.id; persist(); renderRecord(); message('別の記録として読み込みました。元の記録は残しています。'); return record.id;
  }
  function download(body, name) {
    const blob = new Blob([body], { type: 'application/json;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function reportText() {
    const record = current(), env = record.environment;
    return ['実機チェック表 · ' + data.targetVersion, record.title, [env.device, env.os, env.browser, env.date].filter(Boolean).join(' / '), '確認環境：' + $('envKind').selectedOptions[0].textContent, env.notes,
      ...items.map(item => { const result = resultFor(item.id); return '\n[' + STATUS[result.status] + '] ' + item.title + (result.note ? '\nメモ：' + result.note : ''); })].filter(Boolean).join('\n');
  }
  $('targetVersion').textContent = data.targetVersion; $('totalCount').textContent = '全 ' + items.length + ' 項目';
  for (const group of new Set(items.map(item => item.group))) { const option = element('option', '', group); option.value = group; $('groupFilter').append(option); }
  $('checkList').append(...items.map(renderCard));
  for (const id of ['statusFilter', 'groupFilter', 'modeFilter']) $(id).addEventListener('change', applyFilters);
  $('searchChecks').addEventListener('input', applyFilters);
  $('clearFilters').addEventListener('click', () => { for (const id of ['statusFilter', 'groupFilter', 'modeFilter', 'searchChecks']) $(id).value = ''; applyFilters(); });
  $('recordTitle').addEventListener('input', () => { current().title = $('recordTitle').value; changed(); renderRecordOptions(); });
  for (const [field, id] of Object.entries(ENV_FIELDS)) $(id).addEventListener(field === 'kind' || field === 'date' ? 'change' : 'input', () => { current().environment[field] = $(id).value; changed(); });
  $('recordSelect').addEventListener('change', () => { state.activeRecordId = $('recordSelect').value; persist(); renderRecord(); message(''); });
  $('newRecord').addEventListener('click', () => {
    if (state.records.length >= 100) { message('記録が100件に達しています。JSONを書き出して別のブラウザで管理してください。', true); return; }
    const record = newRecord('確認記録 ' + (state.records.length + 1)); state.records.push(record); state.activeRecordId = record.id; persist(); renderRecord(); $('environmentDetails').open = true; $('recordTitle').focus(); message('新しい記録を作りました。端末名を入力してください。');
  });
  $('exportRecord').addEventListener('click', () => { download(exportRecord(), 'device-check-' + data.targetVersion + '-' + localDate() + '.json'); message('この記録を書き出しました。別の端末では「記録を読み込む」で開けます。'); });
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { if (file.size > 1000000) throw Error('1MB以下の確認記録を選んでください。'); importRecord(await file.text()); } catch (error) { message(error.message, true); } finally { e.target.value = ''; }
  });
  $('copyReport').addEventListener('click', async () => {
    const text = reportText(); try { await navigator.clipboard.writeText(text); message('確認結果をコピーしました。'); }
    catch (_) { $('copyFallback').value = text; $('copyDialog').showModal(); $('copyFallback').focus(); $('copyFallback').select(); message('コピー用のテキストを表示しました。'); }
  });
  $('closeCopy').addEventListener('click', () => $('copyDialog').close());
  addEventListener('storage', e => { if (e.key === storageKey && e.newValue !== lastSavedRaw) { blocked = true; storageFailure = '別のタブで記録が変わりました。この画面の結果は上書きせず保持します。JSONを書き出してから開き直してください。'; displayStorage(); } });
  window.PILOT_DEVICE_CHECKLIST_API = Object.freeze({ getState: () => ({ ...clone(state), storageKey, items: clone(items), storageFailure }), setStatus, exportRecord, importRecord });
  renderRecord(); if (!lastSavedRaw && !blocked) persist();
  function revealHash() { const id = location.hash.slice(1); if (id.startsWith('check-') && ids.has(id.slice(6))) document.getElementById(id)?.scrollIntoView({ block: 'start' }); }
  addEventListener('hashchange', revealHash); requestAnimationFrame(revealHash);
})();
