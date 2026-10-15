'use strict';

// 進行・読了待機・復習合格・教示ログ・保存/再開を所有する。
// viewへ渡すmodelは読取getterのみ。viewのdisabled属性に依存せず、ここでも進行を制限する。
window.PILOT_GUIDED_TUTORIAL.createEngine = function (env) {
  const config = window.PILOT_GUIDED_TUTORIAL, SCHEMA = config.schema;
  const { dragTutState } = env;
  const STEPS = config.steps;
  const INSTRUCTED_STEPS = env.instructedSteps.map((s, i) => ({ ...s, id: 'instructed-' + i, kind: 'instruction', chapter: '追加10問の操作', title: '追加10問の操作', copy: s.txt, button: i ? '問題に戻る' : '次へ', action: s.op, html: true }));
  const seen = new Set(), completed = new Set();
  let steps = STEPS, idx = -1, replay = false, required = null, returnLabel = '問題に戻る', onDone = null;
  let lockUntil = 0, lockTimer = null, cueTimer = null, nextDisabled = false, pending = false;
  let shownAt = null, shownId = null, quizIndex = 0, quizLockKey = null, selections = [], orders = [], attempts = [], trainingComplete = false, priorInitial = null;
  const device = () => env.getDevice();
  const current = () => steps[idx];
  const log = (event, data = {}) => device().tutorialLog.push({ kind: 'drag', schema: SCHEMA, event, step: idx + 1, stepId: current()?.id || null, ...data });
  const initial = () => !replay && steps === STEPS;
  const shuffle = () => config.checks.map(q => {
    const order = q.labels.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  });
  const passes = () => config.checks.map((q, i) => selections[i] === q.correctIndex);
  const view = config.createView({
    $: env.$, surface: env.surface, startBtn: env.startBtn, stemEl: env.stemEl,
    choiceA: env.choiceA, choiceB: env.choiceB, numA: env.numA, numB: env.numB,
    screens: env.screens, uiScale: env.uiScale,
  }, {
    current, index: () => idx, replay: () => replay,
    isFirstStep: () => required ? idx === required[0] : idx === 0, canClose: () => replay && !required,
    isStandard: () => steps === STEPS, motorDone: () => completed.has('motor'),
    nextDisabled: () => nextDisabled, quizSelection: () => selections[quizIndex],
    pageInfo, label, nextLabel,
  }, {
    advance, back, log, answer,
    close: () => { if (idx >= 0 && replay && !required) { log('close'); finish(); } },
    replay: () => { if (idx >= 0) { log('replay'); idx = 0; render(); } },
    motorComplete: () => { completed.add('motor'); log('motor_complete'); render(); },
  });

  function snapshot() { return { schema: SCHEMA, stepId: current()?.id || null, index: idx, seen: [...seen], completed: [...completed], quiz: { index: quizIndex, selections: [...selections], orders: orders.map(a => a.slice()), attempts: [...attempts] }, completedTraining: trainingComplete }; }
  function save() {
    if (!initial()) return;
    env.setResumeStage('dragTutorial');
    device().guidedTutorial = { schema: SCHEMA, completed: trainingComplete, motorCompleted: completed.has('motor'), quiz: snapshot().quiz };
    env.saveBackup();
  }
  function pageInfo(step) {
    if (step.id === 'layout-intro') return { label: 'はじめに', index: 0, total: 0 };
    if (step.id === 'rule-check-intro') return { label: 'ルールの復習', index: 0, total: 0 };
    if (step.id === 'rule-check') return { label: 'ルールの復習', index: quizIndex + 1, total: config.checks.length };
    const peers = required ? required.map(i => steps[i]) : steps.filter(s => s.chapter === step.chapter && !['layout-intro', 'rule-check-intro', 'rule-check'].includes(s.id));
    return { label: required ? '操作の確認' : step.chapter.replace(/^\d\s/, ''), index: peers.indexOf(step) + 1, total: peers.length };
  }
  function label(step) { const p = pageInfo(step); return p.label + (p.total ? '　' + p.index + ' / ' + p.total : ''); }
  function nextLabel() {
    if (current()?.id === 'rule-check') return quizIndex === config.checks.length - 1 ? (replay ? returnLabel : '例題へ') : '次へ';
    if ((required ? idx === required.at(-1) : idx === steps.length - 1) && replay) return returnLabel;
    return current()?.button || '次へ';
  }
  function logEnd() { if (shownAt != null && shownId) log('stay', { stepId: shownId, ms: Math.round(performance.now() - shownAt) }); shownAt = null; shownId = null; }
  function setLock(text, wasSeen, exempt = false) {
    clearTimeout(lockTimer); lockTimer = null;
    lockUntil = required ? performance.now() + env.minReadMs(text) : (replay || wasSeen || exempt) ? 0 : performance.now() + env.minReadMs(text);
    view.setWaiting(lockUntil > performance.now());
    if (lockUntil > performance.now()) lockTimer = setTimeout(() => view.clearWaiting(), lockUntil - performance.now());
  }
  function render() {
    const before = view.motionSnapshot(); logEnd(); view.prepareRender(); clearTimeout(cueTimer); cueTimer = null;
    const step = current(); if (!step) return;
    const key = step.id, wasSeen = seen.has(key); seen.add(key); shownAt = performance.now(); shownId = key;
    quizLockKey = null;
    nextDisabled = false; pending = false;
    view.showStep(step);
    env.logInstructionExposure(steps === STEPS ? 'dragTutorial' : 'instructedTutorial', { step: idx + 1, stepId: key, schema: SCHEMA, quizIndex: step.kind === 'quiz' ? quizIndex : null });
    nextDisabled = key === 'motor' && !completed.has('motor') && !replay; pending = nextDisabled;
    view.showStage(step);
    if (step.kind === 'quiz') renderQuiz(false);
    if (step.kind !== 'quiz') setLock(step.copy + (step.extraCopy || ''), wasSeen, step.kind === 'motor');
    view.place();
    view.playGraphics(key);
    if (!nextDisabled) cueTimer = setTimeout(() => { if (idx >= 0 && current() === step) view.addCue(); }, replay || wasSeen ? 0 : env.readCueDelay(step.copy));
    view.animate(before); save();
  }
  function renderQuiz(withMotion = true) {
    clearTimeout(cueTimer); cueTimer = null; view.removeCue();
    const before = withMotion ? view.motionSnapshot() : null, q = config.checks[quizIndex], last = quizIndex === config.checks.length - 1, chosen = selections[quizIndex], good = chosen === q.correctIndex;
    const questionKey = 'quiz-' + q.id, visited = seen.has(questionKey); seen.add(questionKey);
    if (quizLockKey !== q.id) { setLock(q.copy + q.labels.join(''), visited); quizLockKey = q.id; }
    nextDisabled = !replay && (!good || (last && !passes().every(Boolean))); pending = nextDisabled;
    view.renderQuiz({ q, chosen, order: orders[quizIndex], nextLabel: last ? (replay ? returnLabel : '例題へ') : '次へ', disabled: nextDisabled });
    if (withMotion) { view.place(); view.animate(before); }
  }
  function answer(originalIndex, hadFocus, q) {
    view.resetFlash(); const answeredAt = quizIndex; selections[quizIndex] = originalIndex; attempts[quizIndex]++; log('rule_answer', { rule: q.id, answerIndex: originalIndex, correct: originalIndex === q.correctIndex, attempt: attempts[quizIndex] }); renderQuiz(false); if (hadFocus) view.focusQuizAnswer(originalIndex); view.place(); save(); if (originalIndex === q.correctIndex) cueTimer = setTimeout(() => { if (idx >= 0 && current()?.kind === 'quiz' && quizIndex === answeredAt && selections[answeredAt] === q.correctIndex && !nextDisabled) view.addCue(); }, env.readCueDelay(q.right));
  }
  function advance() {
    if (idx < 0 || view.isHeld() || nextDisabled) return;
    if (performance.now() < lockUntil) { log('early'); view.flash('読んでから押してください', lockUntil); return; }
    if (current().kind === 'quiz') {
      if (!replay && selections[quizIndex] !== config.checks[quizIndex].correctIndex) return;
      if (quizIndex < config.checks.length - 1) { view.clearHint(); view.resetFlash(); quizIndex++; renderQuiz(); save(); return; }
      if (!replay && !passes().every(Boolean)) return;
    }
    if (required) { const at = required.indexOf(idx); if (at < required.length - 1) { idx = required[at + 1]; render(); } else finish(); }
    else if (idx < steps.length - 1) { idx++; render(); } else finish();
  }
  function back() {
    if (idx < 0 || view.isHeld()) return; log('back'); view.clearHint(); view.resetFlash();
    if (current()?.kind === 'quiz' && quizIndex > 0) { quizIndex--; renderQuiz(); save(); return; }
    if (required) { const at = required.indexOf(idx); if (at > 0) idx = required[at - 1]; else return; }
    else if (idx > 0) idx--; else return;
    render();
  }
  function teardown() {
    logEnd(); view.prepareTeardown(); clearTimeout(cueTimer); clearTimeout(lockTimer); cueTimer = null; lockTimer = null; lockUntil = 0; view.resetFlash();
    view.hide(); idx = -1; dragTutState.active = false; pending = false;
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
    if (env.realBlocks.includes('moral')) env.moralPracticeDefinition(); view.build();
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
    view.enter(); render();
  }
  return { run, abort, snapshot, schema: SCHEMA, state: () => ({ index: idx, stepId: current()?.id || null, schema: SCHEMA, review: replay, instructed: steps === INSTRUCTED_STEPS, lockRemainingMs: Math.max(0, lockUntil - performance.now()), handsDone: completed.has('motor'), pending, quiz: { index: quizIndex, passed: passes(), selections: [...selections], orders: orders.map(a => a.slice()), attempts: [...attempts], complete: passes().every(Boolean) }, completedTraining: trainingComplete }) };
};
