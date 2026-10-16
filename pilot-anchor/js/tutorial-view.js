'use strict';

// DOM・配置・実演の表示を担当する。進行・合格・保存状態はcontrollerの読取getterと
// callbackを介して扱い、view内に別の進行状態を持たない。
window.PILOT_GUIDED_TUTORIAL.createView = function (env, model, events) {
  const config = window.PILOT_GUIDED_TUTORIAL;
  const { $, surface, startBtn, stemEl, choiceA, choiceB, numA, numB } = env;
  const current = model.current, reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeTask = () => env.screens.task.classList.contains('active');
  let built = false;
  let pop, row, hint, graphic, target, position, demo, backdrop, demoPlayer, rangePlayer = null, timePlayer, motion;
  let held = null, hintTimer = null, hintToken = 0, flashTimer = null, flashLabel = '', flashHeight = '';

  function resetFlash() {
    clearTimeout(flashTimer); flashTimer = null;
    if (built && flashLabel) { $('tutPopNext').textContent = flashLabel; $('tutPopNext').style.height = flashHeight; $('tutPopNext').classList.remove('warn'); }
    flashLabel = ''; flashHeight = '';
  }
  function flash(text, maxUntil) {
    const button = $('tutPopNext'), now = performance.now();
    if (flashTimer && button.textContent === text) return;
    resetFlash(); flashLabel = button.textContent; flashHeight = button.style.height;
    button.style.height = button.getBoundingClientRect().height + 'px'; button.textContent = text; button.classList.add('warn');
    flashTimer = setTimeout(resetFlash, Math.max(150, Math.min(1200, maxUntil ? maxUntil - now : 1200)));
  }
  function clearHint() { clearTimeout(hintTimer); hintTimer = null; hintToken++; if (!built) return; hint.classList.add('hidden'); hint.textContent = ''; }
  function setHint(text) {
    clearHint(); hint.textContent = text; hint.className = 'ng'; const token = hintToken;
    placeMotorHint();
    hintTimer = setTimeout(() => { if (hintToken === token) clearHint(); }, 4000);
  }
  function placeMotorHint() {
    if (!built || model.index() < 0 || current()?.id !== 'motor' || hint.classList.contains('hidden')) return;
    const choiceBottom = target.getBoundingClientRect().bottom, startTop = startBtn.getBoundingClientRect().top;
    hint.style.top = (choiceBottom + startTop) / 2 + 'px';
  }
  function disabledHint() {
    return current()?.kind === 'quiz' ? (model.quizSelection() == null ? '答えを1つ選んでください' : 'もう一度選びなおしてください') : '操作してから進みます';
  }
  function hidePosition() { position.style.display = 'none'; target.classList.remove('arrived'); }
  function pointerPosition(e) {
    const r = surface.getBoundingClientRect(); position.style.display = 'block'; position.style.left = (e.clientX - r.left) + 'px'; position.style.top = (e.clientY - r.top) + 'px';
    const t = target.getBoundingClientRect(), hit = e.clientX >= t.left && e.clientX <= t.right && e.clientY >= t.top && e.clientY <= t.bottom;
    target.classList.toggle('arrived', hit); return hit;
  }
  function meta(step) {
    $('tutPopStep').textContent = model.label(step);
    $('tutPopOp').textContent = step.action || (step.kind === 'motor' ? '下のスタートから運んでみてください' : '読んだら「' + model.nextLabel() + '」');
    $('tutPopOp').classList.remove('hidden');
    const dots = $('tutPopDots'), p = model.pageInfo(step); dots.replaceChildren();
    for (let i = 1; i <= p.total; i++) { const dot = document.createElement('i'); if (i === p.index) dot.className = 'a'; dots.append(dot); }
  }
  function build() {
    if (built) return;
    backdrop = document.createElement('div'); backdrop.id = 'tutBackdrop'; document.body.append(backdrop);
    graphic = document.createElement('div'); graphic.id = 'tutGraphic'; graphic.hidden = true; document.body.append(graphic);
    demo = document.createElement('canvas'); demo.id = 'tutDemo'; surface.append(demo);
    const ink = document.createElement('canvas'); ink.id = 'tutInk'; surface.append(ink);
    target = document.createElement('div'); target.id = 'tutSingleTarget'; target.textContent = '選択肢'; surface.append(target);
    position = document.createElement('div'); position.id = 'tutPosition'; surface.append(position);
    const spot = document.createElement('div'); spot.id = 'tutSpot'; spot.className = 'tut-spot hidden'; document.body.append(spot);
    const cap = document.createElement('div'); cap.id = 'tutCap'; cap.hidden = true; surface.append(cap);
    pop = document.createElement('div'); pop.id = 'tutPop'; pop.className = 'tut-pop hidden'; pop.setAttribute('role', 'region'); pop.setAttribute('aria-label', '操作の説明');
    pop.innerHTML = '<div class="s" id="tutPopStep"></div><h2 id="tutPopTitle"></h2><div class="t" id="tutPopTxt"></div><p id="tutExtra" hidden></p><div id="tutQuiz"></div><p id="tutQuizFeedback" aria-live="polite"></p><div class="guided-meta"><div class="g" id="tutPopOp"></div><div class="dots" id="tutPopDots"></div></div>';
    document.body.append(pop);
    const close = document.createElement('button'); close.id = 'tutClose'; close.type = 'button'; close.className = 'hidden'; close.textContent = '× 閉じる'; close.setAttribute('aria-label', '操作方法を閉じる'); document.body.append(close);
    row = document.createElement('div'); row.id = 'tutBtnRow'; row.className = 'tut-btnrow hidden';
    row.innerHTML = '<button class="rp hidden" id="tutReplay">↻ もう一度</button><button type="button" class="pv" id="tutPrev">戻る</button><button type="button" class="nx" id="tutPopNext">次へ</button>';
    document.body.append(row);
    hint = document.createElement('div'); hint.id = 'tutHint'; hint.className = 'hidden'; hint.setAttribute('role', 'status'); document.body.append(hint);
    demoPlayer = config.createDemo({ canvas: demo, start: startBtn, target }); timePlayer = config.createTimeDemo({ container: graphic });
    motion = config.createCardMotion({ getCard: () => !pop.classList.contains('hidden') ? pop : null, disabled: reduced });
    $('tutPopNext').addEventListener('click', events.advance); row.addEventListener('pointerdown', e => { if (model.nextDisabled() && !e.target.closest('#tutPrev')) flash(disabledHint()); });
    $('tutPrev').addEventListener('click', events.back); close.addEventListener('click', events.close);
    $('tutReplay').addEventListener('click', events.replay);
    surface.addEventListener('pointerdown', e => {
      if (model.index() < 0 || !activeTask()) return;
      if (current().kind !== 'motor' || model.motorDone()) return;
      if (held) return;
      const r = startBtn.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { setHint('スタートボタンに指を置いて\nそのまま離さずに運びます'); events.log('stray_motor'); return; }
      motion.finish(); clearHint(); e.preventDefault(); held = e.pointerId;
      try { surface.setPointerCapture(e.pointerId); } catch (_) {}
      startBtn.classList.add('armed'); startBtn.textContent = 'スタート'; row.classList.add('hidden'); pointerPosition(e);
    }, { passive: false });
    surface.addEventListener('pointermove', e => { if (held === e.pointerId) { e.preventDefault(); pointerPosition(e); } }, { passive: false });
    surface.addEventListener('pointerup', e => {
      if (held !== e.pointerId) return;
      e.preventDefault(); const ok = pointerPosition(e); held = null; hidePosition(); startBtn.classList.remove('armed'); startBtn.textContent = 'スタート';
      if (ok) { clearHint(); events.motorComplete(); }
      else { row.classList.remove('hidden'); setHint('選択肢のボックスの中で指を離してください\nスタートボタンからもう一度'); events.log('motor_release_outside'); place(); }
    }, { passive: false });
    surface.addEventListener('pointercancel', cancelPointer, { passive: true }); surface.addEventListener('lostpointercapture', e => { if (held === e.pointerId) cancelPointer(); }, { passive: true });
    document.addEventListener('pointerdown', e => {
      if (model.index() < 0 || !activeTask() || held || document.body.classList.contains('stop-open')) return;
      if (e.target.closest('button,a,input,select,textarea')) return;
      if (current().kind === 'motor' && !model.motorDone()) return;
      if (e.target.closest('#tutQuiz')) return;
      events.log('stray'); flash(model.nextDisabled() ? disabledHint() : 'このボタンで進みます');
    }, { passive: true });
    window.addEventListener('resize', () => { if (model.index() >= 0) { motion.finish(); cancelPointer(); place(); if (current()?.id === 'motor-route') demoPlayer.begin({ key: 'motor-route', kind: 'route', captionInitially: true }); else if (current()?.id === 'motor-range') playRange(); } });
    built = true;
  }
  function cancelPointer() { if (!held) { clearHint(); return; } held = null; clearHint(); hidePosition(); startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; if (model.index() >= 0) { row.classList.remove('hidden'); place(); events.log('motor_cancel'); } }
  function stopGraphics() { demoPlayer.stop(); rangePlayer?.stop(); rangePlayer = null; timePlayer.stop(); graphic.hidden = true; graphic.replaceChildren(); }
  function clearParts() {
    for (const el of [stemEl, choiceA, choiceB, startBtn]) { el.classList.remove('guided-dim', 'guided-focus', 'tut-dim', 'tut-sbxhide'); el.style.visibility = 'hidden'; }
    startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; stemEl.textContent = ''; numA.textContent = ''; numB.textContent = ''; target.style.top = ''; hidePosition();
  }
  function setContent(step) {
    $('tutPopTitle').textContent = step.title;
    if (step.html) $('tutPopTxt').innerHTML = step.copy; else $('tutPopTxt').textContent = step.copy;
    $('tutExtra').hidden = !step.extraCopy; $('tutExtra').textContent = step.extraCopy || '';
    $('tutQuiz').replaceChildren(); $('tutQuizFeedback').textContent = ''; meta(step);
  }
  function prepareRender() { clearHint(); held = null; stopGraphics(); resetFlash(); }
  function showStep(step) {
    document.body.classList.remove('guided-instruction', 'guided-range', 'guided-time', 'guided-quiz', 'guided-motor');
    clearParts(); setContent(step); pop.classList.remove('hidden'); pop.classList.add('on'); row.classList.remove('hidden'); row.classList.remove('pending');
    $('tutPopNext').textContent = model.nextLabel(); $('tutPopNext').disabled = false; $('tutPopNext').classList.remove('cue');
    $('tutPrev').classList.toggle('hidden', model.isFirstStep());
    $('phaseLabel').textContent = model.isStandard() ? step.chapter.replace(/^\d\s/, '') : '追加10問の操作';
  }
  function showStage(step) {
    const key = step.id;
    if (step.kind === 'orientation') {
      stemEl.textContent = 'ここに問題文が表示されます'; stemEl.style.visibility = 'visible';
      if (step.focus !== 'stem') { stemEl.classList.add('guided-dim'); startBtn.style.visibility = 'visible'; }
      if (step.focus === 'choices') { startBtn.classList.add('guided-dim'); for (const [box, text] of [[choiceA, numA], [choiceB, numB]]) { box.style.visibility = 'visible'; box.classList.add('guided-focus'); text.className = 'txt'; text.textContent = '選択肢'; text.style.visibility = 'visible'; } }
      else (step.focus === 'stem' ? stemEl : startBtn).classList.add('guided-focus');
    } else if (key === 'motor-route' || key === 'motor') {
      document.body.classList.add('guided-motor'); startBtn.style.visibility = 'visible';
      if (key === 'motor' && model.motorDone()) {
        $('tutPopTitle').textContent = '操作できました'; $('tutPopTxt').textContent = '次は、実際に問題に回答するときのルールを確認します。'; $('tutPopOp').textContent = '読んだら「ルールを確認する」へ'; $('tutPopNext').textContent = 'ルールを確認する'; startBtn.classList.add('guided-dim'); target.style.display = 'none';
      } else { target.style.display = ''; target.style.opacity = ''; if (model.nextDisabled()) { row.classList.add('pending'); $('tutPopNext').disabled = true; } }
    } else if (key === 'motor-range') {
      document.body.classList.add('guided-range'); graphic.hidden = false; graphic.style.display = 'block';
      graphic.innerHTML = '<div id="tutRangeFigure"><div id="tutRangeTarget">選択肢</div><div id="tutRangeEntry"></div><canvas id="tutRangeInk"></canvas></div>';
    } else if (key === 'time-rule') { document.body.classList.add('guided-time'); graphic.hidden = false; graphic.style.display = 'block'; }
    else { document.body.classList.add(step.kind === 'quiz' ? 'guided-quiz' : 'guided-instruction'); }
  }
  function rangeFingerScale(width) {
    const actualWidth = Math.max(1, choiceA.getBoundingClientRect().width);
    const normalScale = Math.min(surface.clientWidth, surface.clientHeight) / 375 * .82;
    return normalScale * width / actualWidth;
  }
  function playRange() {
    rangePlayer?.stop();
    rangePlayer = config.createDemo({ canvas: $('tutRangeInk'), start: $('tutRangeEntry'), target: $('tutRangeTarget'), fingerScale: rangeFingerScale($('tutRangeTarget').getBoundingClientRect().width) });
    rangePlayer.begin({ key: 'motor-range', kind: 'range', captionInitially: true });
  }
  function playGraphics(key) {
    if (key === 'motor-route') demoPlayer.begin({ key, kind: 'route', captionInitially: true });
    if (key === 'motor-range') playRange();
    if (key === 'time-rule') { timePlayer.begin(); place(); }
  }
  function ruleTop() {
    const title = $('tutPopTitle').textContent, text = $('tutPopTxt').textContent, extra = $('tutExtra').textContent, extraHidden = $('tutExtra').hidden, stepText = $('tutPopStep').textContent;
    let largest = 0;
    for (const step of config.steps.filter(s => s.chapter.startsWith('3 ') && s.kind === 'instruction')) {
      $('tutPopTitle').textContent = step.title; $('tutPopTxt').textContent = step.copy; $('tutExtra').hidden = true; $('tutPopStep').textContent = model.label(step); largest = Math.max(largest, pop.getBoundingClientRect().height);
    }
    $('tutPopTitle').textContent = title; $('tutPopTxt').textContent = text; $('tutExtra').textContent = extra; $('tutExtra').hidden = extraHidden; $('tutPopStep').textContent = stepText;
    return Math.max(48, Math.min((innerHeight - largest) / 2, row.getBoundingClientRect().top - largest - 18));
  }
  function quizHeights() {
    // 従来の予約高は既存の上端を保つためだけに使う。
    // ナビには、各問の本文とその問の解説を組み合わせた実最大高を使う。
    const measure = pop.cloneNode(true);
    measure.setAttribute('aria-hidden', 'true'); measure.inert = true;
    Object.assign(measure.style, { left: '-10000px', top: '0', width: pop.getBoundingClientRect().width + 'px', height: 'auto', maxHeight: 'none', overflow: 'visible', visibility: 'hidden', transform: 'none' });
    document.body.append(measure);
    const title = measure.querySelector('#tutPopTitle'), choices = measure.querySelector('#tutQuiz'), feedback = measure.querySelector('#tutQuizFeedback'), op = measure.querySelector('#tutPopOp'), stepLabel = measure.querySelector('#tutPopStep');
    feedback.style.display = 'block'; feedback.style.minHeight = '0px';
    let feedbackHeight = 0, anchorHeight = 0, maximumHeight = 0;
    for (const q of config.checks) {
      for (const text of [q.right, q.wrong]) { feedback.textContent = text; feedbackHeight = Math.max(feedbackHeight, feedback.getBoundingClientRect().height); }
    }
    feedback.style.minHeight = feedbackHeight + 'px'; feedback.textContent = '';
    for (const q of config.checks) {
      title.textContent = q.copy; choices.replaceChildren();
      for (const label of q.labels) { const button = document.createElement('button'); button.textContent = label; choices.append(button); }
      for (const text of ['もう一度選びなおしてください', '答えを1つ選んで「' + model.nextLabel(0) + '」']) { op.textContent = text; anchorHeight = Math.max(anchorHeight, measure.getBoundingClientRect().height); }
    }
    feedback.style.display = ''; feedback.style.minHeight = '0px';
    for (const [index, q] of config.checks.entries()) {
      title.textContent = q.copy;
      const page = model.pageInfo(current()); stepLabel.textContent = page.label + '　' + (index + 1) + ' / ' + page.total;
      const wrong = q.labels.findIndex((_, i) => i !== q.correctIndex);
      for (const chosen of [null, wrong, q.correctIndex]) {
        const good = chosen === q.correctIndex; choices.replaceChildren();
        for (const [answerIndex, label] of q.labels.entries()) {
          const button = document.createElement('button'); button.textContent = label;
          if (chosen === answerIndex) button.className = 'selected ' + (good ? 'correct' : 'wrong');
          choices.append(button);
        }
        feedback.textContent = chosen == null ? '' : good ? q.right : q.wrong;
        feedback.classList.toggle('wrong', chosen != null && !good);
        op.textContent = chosen != null && !good ? 'もう一度選びなおしてください' : '答えを1つ選んで「' + model.nextLabel(index) + '」';
        maximumHeight = Math.max(maximumHeight, measure.getBoundingClientRect().height);
      }
    }
    measure.remove();
    return { anchorHeight, maximumHeight };
  }
  function place() {
    const idx = model.index();
    if (idx < 0) return; const step = current(), vh = innerHeight, width = Math.min(innerWidth * (idx ? .92 : .72), (idx ? 540 : 420) * env.uiScale), sr = startBtn.getBoundingClientRect();
    row.style.width = width + 'px'; row.style.left = (innerWidth - width) / 2 + 'px'; row.style.bottom = 'auto';
    const bh = row.getBoundingClientRect().height || 52, startVisible = startBtn.style.visibility === 'visible';
    const minTop = model.replay() && !$('tutClose').classList.contains('hidden') ? $('tutClose').getBoundingClientRect().bottom + 12 : 8;
    if (step.kind === 'quiz') {
      const maxNavTop = vh - bh - Math.max(12, vh * .025), gap = 12;
      const { anchorHeight, maximumHeight } = quizHeights(), available = Math.max(0, maxNavTop - gap - minTop);
      const anchor = Math.min(anchorHeight, available), height = Math.min(maximumHeight, available);
      const previousTop = Math.max(minTop, Math.min((vh - anchor) / 2, maxNavTop - anchor - gap));
      const top = Math.max(minTop, Math.min(previousTop, maxNavTop - height - gap)), navTop = top + height + gap;
      pop.style.left = (innerWidth - pop.getBoundingClientRect().width) / 2 + 'px';
      pop.style.top = top + 'px';
      pop.style.maxHeight = height + 'px';
      row.style.top = navTop + 'px'; return;
    }
    pop.style.maxHeight = '';
    const ph = pop.getBoundingClientRect().height;
    if (step.id === 'motor-range' || step.id === 'time-rule') {
      const gap = vh <= 640 ? 10 : 18, top = Math.max(minTop, vh <= 640 ? 24 : 42);
      const maxNavTop = vh - bh - Math.max(12, vh * .025), graphicTop = top + ph + gap;
      const available = Math.max(0, maxNavTop - gap - graphicTop);
      pop.style.left = (innerWidth - pop.getBoundingClientRect().width) / 2 + 'px'; pop.style.top = top + 'px';
      graphic.style.top = graphicTop + 'px';
      if (step.id === 'time-rule') graphic.style.setProperty('--time-demo-max-height', available + 'px');
      else {
        const handPerHeight = rangeFingerScale(60 / 39) * 75;
        const height = Math.min(Math.min(innerWidth, vh) * .39, Math.max(0, Math.min(available - 88, (available - 20) / (1 + handPerHeight))));
        graphic.style.setProperty('--range-target-height', height + 'px');
        graphic.style.setProperty('--range-target-width', height * 60 / 39 + 'px');
        graphic.style.setProperty('--range-entry-space', Math.max(88, rangeFingerScale(height * 60 / 39) * 75 + 20) + 'px');
      }
      graphic.style.left = (innerWidth - graphic.getBoundingClientRect().width) / 2 + 'px';
      row.style.top = Math.min(maxNavTop, Math.max(sr.top + sr.height / 2 - bh / 2, graphic.getBoundingClientRect().bottom + gap)) + 'px';
      return;
    }
    let navTop = startVisible ? vh - bh - Math.max(12, vh * .025) : sr.top + sr.height / 2 - bh / 2;
    if (startVisible && navTop < sr.bottom + 4) navTop = sr.bottom + 4 + bh <= vh - 6 ? sr.bottom + 4 : Math.max(8, sr.top - bh - 12);
    if (!startVisible) {
      let needed = minTop + ph + 16;
      navTop = Math.min(vh - bh - 6, Math.max(navTop, needed));
    }
    row.style.top = navTop + 'px';
    const maxTop = navTop - ph - 16;
    pop.style.left = (innerWidth - pop.getBoundingClientRect().width) / 2 + 'px';
    let top = Math.max(48, Math.min((vh - ph) / 2, maxTop));
    if (step.kind === 'orientation') {
      const r = (step.focus === 'stem' ? stemEl : step.focus === 'start' ? startBtn : choiceA).getBoundingClientRect();
      top = step.focus === 'start' ? r.top - ph - 16 : r.bottom + 16;
      if (step.focus === 'choices') top = Math.max(r.bottom + 12, Math.min(top, sr.top - ph - 8));
      if (navTop < sr.top && step.focus === 'start') top = Math.min(top, maxTop);
    } else if (step.id === 'motor-route' || (step.id === 'motor' && !model.motorDone())) top = Math.max(42, vh * .06);
    else if (step.chapter.startsWith('3 ') && step.kind === 'instruction') top = ruleTop();
    pop.style.top = Math.max(minTop, Math.min(top, maxTop)) + 'px';
    if (step.id === 'motor-route' || step.id === 'motor') {
      const sf = surface.getBoundingClientRect(); target.style.top = Math.max(sf.height * .34, pop.getBoundingClientRect().bottom - sf.top + 18) + 'px';
    }
    placeMotorHint();
  }
  function renderQuiz({ q, chosen, order, nextLabel, disabled }) {
    const good = chosen === q.correctIndex;
    $('tutPopTitle').textContent = q.copy; $('tutPopTxt').textContent = ''; $('tutExtra').hidden = true; meta(current());
    $('tutPopNext').textContent = nextLabel;
    $('tutPopNext').disabled = disabled; row.classList.toggle('pending', disabled);
    $('tutPrev').classList.toggle('hidden', false);
    $('tutPopOp').textContent = chosen != null && !good ? 'もう一度選びなおしてください' : '答えを1つ選んで「' + $('tutPopNext').textContent + '」';
    const feedback = $('tutQuizFeedback'); feedback.textContent = chosen == null ? '' : good ? q.right : q.wrong; feedback.classList.toggle('wrong', chosen != null && !good);
    const choices = $('tutQuiz'); choices.replaceChildren(); choices.setAttribute('role', 'radiogroup'); choices.setAttribute('aria-labelledby', 'tutPopTitle');
    for (const originalIndex of order) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = q.labels[originalIndex]; button.dataset.answerIndex = originalIndex; button.dataset.originalIndex = originalIndex; button.classList.toggle('selected', chosen === originalIndex);
      if (chosen === originalIndex) { button.classList.add(good ? 'correct' : 'wrong'); button.setAttribute('aria-label', q.labels[originalIndex] + (good ? '（正解です）' : '（もう一度選びなおしてください）')); }
      button.onclick = () => events.answer(originalIndex, document.activeElement === button, q);
      button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(chosen === originalIndex));
      choices.append(button);
    }
    const options = [...choices.children], selected = options.find(button => button.dataset.answerIndex === String(chosen));
    for (const button of options) button.tabIndex = button === (selected || options[0]) ? 0 : -1;
    choices.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const at = options.indexOf(event.target); if (at < 0) return; event.preventDefault();
      const n = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : options.length - 1)) % options.length;
      const answer = options[n].dataset.answerIndex; options[n].click(); focusQuizAnswer(answer);
    };
  }
  function focusQuizAnswer(answer) { $('tutQuiz').querySelector('[data-answer-index="' + answer + '"]').focus({ preventScroll: true }); }
  function prepareTeardown() { clearHint(); held = null; stopGraphics(); motion.finish(); }
  function hide() {
    pop.classList.remove('on'); pop.classList.add('hidden'); row.classList.add('hidden'); row.classList.remove('pending'); $('tutClose').classList.add('hidden'); backdrop.style.display = ''; graphic.hidden = true;
    for (const el of [stemEl, choiceA, choiceB, startBtn]) { el.classList.remove('guided-dim', 'guided-focus'); el.style.visibility = ''; }
    startBtn.classList.remove('armed'); startBtn.textContent = 'スタート'; stemEl.textContent = ''; numA.textContent = ''; numB.textContent = ''; target.style.display = ''; hidePosition();
    document.body.classList.remove('guided-tutorial', 'guided-instruction', 'guided-range', 'guided-time', 'guided-quiz', 'guided-motor', 'tut-review');
  }
  function enter() {
    document.body.classList.add('guided-tutorial'); document.body.classList.toggle('tut-review', model.replay()); $('tutAgain').classList.add('hidden'); $('counter').textContent = '';
    $('tutClose').classList.toggle('hidden', !model.canClose());
  }
  return {
    build, prepareRender, showStep, showStage, playGraphics, place, renderQuiz, focusQuizAnswer,
    prepareTeardown, hide, enter, resetFlash, flash, clearHint,
    isHeld: () => !!held,
    motionSnapshot: () => motion.snapshot(), animate: before => motion.run(before),
    removeCue: () => $('tutPopNext').classList.remove('cue'), addCue: () => $('tutPopNext').classList.add('cue'),
    setWaiting: waiting => $('tutPopNext').classList.toggle('wait', waiting), clearWaiting: () => $('tutPopNext').classList.remove('wait'),
  };
};
