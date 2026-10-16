"use strict";

// 評定のDOM・配置・装飾と表示用タイマー。判断と記録はmodel/events経由でcontrollerへ委譲する。
window.PilotRatingView = { create(env, model, events) {
  const { $, screens, initChoiceGroup, syncChoiceState, now } = env;
  let ratSpot = null, ratPop = null, ratCueTimer = null, ratFlashTimer = null;
  let ordinaryHintTimer = null, ordinaryHintButton = null, ordinaryHintChoices = null, ordinaryTap = null;
  const FLASH_MS = 1200;
  const current = model.current, active = model.active;
  function prepare({ practice, answer }) {
    clearOrdinaryHint();
    $("ratingHead").className = practice ? "practice" : "";
    $("ratingHead").textContent = practice ? "" : "回答について教えてください";
    $("ratingAnswer").hidden = !answer;
    if (answer) { $("ratingAnswer").innerHTML = ""; const l = document.createElement("span"); l.textContent = "あなたの回答: "; const b = document.createElement("b"); b.textContent = answer; $("ratingAnswer").append(l, b); }
    const host = $("ratingItems");
    host.innerHTML = "";
    for (const item of model.items()) {
      const wrap = document.createElement("div");
      wrap.className = "qitem";
      wrap.id = "qitem-" + item.key;
      const q = document.createElement("div");
      q.className = "qi-text"; q.id = "rating-label-" + item.key; q.textContent = item.q;
      const lk = document.createElement("div");
      lk.className = "likert"; lk.setAttribute("aria-labelledby", q.id);
      for (let v = 1; v <= 5; v++) {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.val = String(v);
        const num = document.createElement("b"); num.textContent = v;
        const lab = document.createElement("span"); lab.textContent = item.labels[v - 1];
        b.append(num, lab);
        b.addEventListener("click", () => events.select(item.key, v), { passive: true });
        lk.appendChild(b);
      }
      initChoiceGroup(lk, false);
      wrap.append(q, lk);
      host.appendChild(wrap);
    }
  }
  function restoreSelections() {
    for (const item of model.items()) {
      const group = $("qitem-" + item.key).querySelector(".likert");
      for (const b of group.children) b.classList.toggle("sel", !!model.ratings()[item.key] && Number(b.dataset.val) === model.ratings()[item.key].value);
      syncChoiceState(group);
    }
  }
  function showPage(p) {
    clearOrdinaryHint();
    const items = model.items();
    for (let i = 0; i < items.length; i++) { const el = $("qitem-" + items[i].key); if (el) el.hidden = i !== p; }
    $("ratingBack").style.display = p === 1 ? "" : "none";
    $("ratBtnRow").classList.toggle("with-back", p === 1);
    $("ratingNext").style.display = p === 0 ? "" : "none";
    $("ratingSubmit").style.display = p === 1 ? "" : "none";
    $("ratingNext").disabled = model.nextDisabled();
    $("ratingSubmit").disabled = model.submitDisabled();
    $("ratingNext").classList.remove("cue"); $("ratingSubmit").classList.remove("cue");
  }
  function showOrdinaryHelp() { $("ratingTutPrev").hidden = true; $("ratingHelp").classList.remove("hidden"); }
  function resetScroll() { $("rating").querySelector(".qwrap").scrollTop = 0; }
  function exitReview() {
    document.body.classList.remove("tut-review");
    $("rating").classList.remove("rating-review");
    for (const b of $("ratingItems").querySelectorAll("button")) b.disabled = false;
  }
  function enterReview() {
    clearOrdinaryHint();
    $("rating").classList.add("rating-review"); document.body.classList.add("tut-review");
    for (const b of $("ratingItems").querySelectorAll("button")) b.disabled = true;
  }
  function flashClear() {
    if (ratFlashTimer) { clearTimeout(ratFlashTimer); ratFlashTimer = null; }
    for (const id of ["ratingNext", "ratingSubmit"]) { const b = $(id); if (b.classList.contains("warn")) { b.classList.remove("warn"); b.textContent = model.label(id); b.style.height = b.dataset.ratHeight || ""; delete b.dataset.ratHeight; } }
  }
  function flash(text, buttonId, maxUntil) {
    const btn = $(buttonId || (model.page() === 0 ? "ratingNext" : "ratingSubmit"));
    if (ratFlashTimer && btn.classList.contains("warn") && btn.textContent === text) return;
    flashClear();
    const at = now(); let end = at + FLASH_MS; if (maxUntil) end = Math.min(end, maxUntil);
    btn.dataset.ratHeight = btn.style.height;
    btn.style.height = btn.getBoundingClientRect().height + "px";
    btn.textContent = text; btn.classList.add("warn");
    ratFlashTimer = setTimeout(() => { ratFlashTimer = null; btn.classList.remove("warn"); btn.textContent = model.label(btn.id); btn.style.height = btn.dataset.ratHeight || ""; delete btn.dataset.ratHeight; }, Math.max(150, end - at));
  }
  // 通常の振り返りでは表示だけを案内する。controllerのstrayは教示ログ専用なので呼ばない。
  function clearOrdinaryHint() {
    ordinaryTap = null;
    if (!ordinaryHintButton) return;
    clearTimeout(ordinaryHintTimer); ordinaryHintTimer = null;
    ordinaryHintChoices?.classList.remove("rating-choice-cue"); ordinaryHintChoices = null;
    ordinaryHintButton.classList.remove("cue"); ordinaryHintButton = null;
    flashClear();
  }
  function showOrdinaryHint() {
    const button = $(model.page() === 0 ? "ratingNext" : "ratingSubmit");
    // 合成clickは再送しない。同じ注意の連打で表示時間を延ばさない。
    if (ordinaryHintButton === button) return;
    clearOrdinaryHint(); ordinaryHintButton = button;
    const key = model.items()[model.page()].key, unselected = model.ratings()[key] == null;
    if (unselected) {
      ordinaryHintChoices = $("qitem-" + key).querySelector(".likert");
      ordinaryHintChoices.classList.add("rating-choice-cue");
    } else button.classList.add("cue");
    flash(unselected ? "1つ選んでください" : "このボタンで進む", button.id);
    ordinaryHintTimer = setTimeout(clearOrdinaryHint, FLASH_MS);
  }
  function ensureSpot() {
    if (ratSpot) return;
    ratSpot = document.createElement("div"); ratSpot.id = "ratSpot"; ratSpot.className = "tut-spot hidden";
    document.body.appendChild(ratSpot);
    ratPop = document.createElement("div"); ratPop.id = "ratPop"; ratPop.className = "tut-pop hidden";
    ratPop.innerHTML = '<div class="s" id="tutStepLabel"></div><h1 id="ratTutTitle"></h1><div class="t" id="ratTutText"></div>' +
      '<div class="rat-card-meta"><div class="g hidden" id="ratPopOp"></div><div class="dots" id="ratPopDots"></div></div>';
    $("rating").querySelector(".qwrap").prepend(ratPop);
    $("ratReplay").addEventListener("click", events.replay, { passive: true });
  }
  function place() {
    if (!active() || !ratPop || !screens.rating.classList.contains("active")) return;
    const p = current();
    ratPop.classList.add("on");
    ratPop.style.top = ""; ratPop.style.left = ""; ratPop.style.marginTop = "0px";
    const wrap = $("rating").querySelector(".qwrap"), row = $("ratBtnRow");
    if (model.review() || ["intro", "finish", "practiceIntro"].includes(p.act)) {
      row.style.bottom = "auto";
      row.style.top = Math.max(12, innerHeight * .88 - Math.min(innerWidth, innerHeight) * .08 - row.getBoundingClientRect().height / 2) + "px";
    } else { row.style.bottom = ""; row.style.top = ""; }
    const buttons = row.getBoundingClientRect();
    const top = model.review() ? $("ratingTutClose").getBoundingClientRect().bottom + 8 : parseFloat(getComputedStyle(wrap).paddingTop);
    if (model.review() || !["hes", "conf"].includes(p.act)) {
      const natural = ratPop.getBoundingClientRect().top;
      ratPop.style.marginTop = Math.max(0, top + (buttons.top - 20 - top - ratPop.offsetHeight) / 2 - natural) + "px";
    } else {
      const natural = ratPop.getBoundingClientRect().top, total = buttons.bottom - natural;
      ratPop.style.marginTop = Math.max(0, top - natural, (innerHeight - 20 - top - total) / 2 + top - natural) + "px";
    }
    wrap.scrollTop = 0;
  }
  function hasItems() { return !!$("qitem-confidence") && !!$("qitem-hesitation"); }
  function prepareTutorial() {
    if (!hasItems()) return;
    const qc = $("qitem-confidence"), qh = $("qitem-hesitation");
    ensureSpot();
    const oldBox = $("tutBox"); if (oldBox) oldBox.remove();
    qc.classList.remove("dim", "tfocus"); qh.classList.remove("dim", "tfocus");
    $("ratingHelp").classList.toggle("hidden", active());
    $("ratingTutClose").classList.toggle("hidden", !active() || !model.review());
    $("ratingTutPrev").hidden = !active() || model.index() === 0;
  }
  function hideTutorial() {
    if (!hasItems() || !ratSpot || !ratPop) return;
    const lkC = $("qitem-confidence").querySelector(".likert"), lkH = $("qitem-hesitation").querySelector(".likert");
    ratSpot.classList.remove("on", "strong"); ratPop.classList.remove("on");
    ratSpot.classList.add("hidden"); ratPop.classList.add("hidden");
    if (lkC) lkC.classList.remove("tut-cue"); if (lkH) lkH.classList.remove("tut-cue");
    flashClear();
    $("ratReplay").classList.add("hidden");
    $("rating").classList.remove("tut-front", "rat-intro", "rat-static");
    $("ratBtnRow").style.top = ""; $("ratBtnRow").style.bottom = "";
    $("ratingBackNote").hidden = true;
    ratPop.style.marginTop = "";
    $("ratingNext").classList.remove("cue"); $("ratingSubmit").classList.remove("cue");
    if (ratCueTimer) { clearTimeout(ratCueTimer); ratCueTimer = null; }
    $("ratingSubmit").textContent = "決定して次へ";
  }
  function renderTutorial(p) {
    if (!hasItems() || !ratSpot || !ratPop) return;
    const idx = model.index(), pages = model.tutorialPages(), review = model.review();
    $("rating").style.removeProperty("--ratReserve");
    flashClear();
    $("tutStepLabel").textContent = idx < pages.length ? `回答の振り返り ${idx + 1} / ${pages.length}` : "";
    $("tutStepLabel").hidden = idx >= pages.length;
    $("ratTutTitle").textContent = p.title;
    const rdots = $("ratPopDots"); rdots.innerHTML = "";
    if (idx < pages.length) for (let i = 0; i < pages.length; i++) { const d = document.createElement("i"); if (i === idx) d.className = "a"; rdots.appendChild(d); }
    $("ratTutText").textContent = p.text;
    $("ratReplay").classList.add("hidden");
    const operation = review ? (idx === pages.length - 1 ? "確認したら「回答に戻る」" : "確認したら「次へ」") : p.op;
    $("ratPopOp").textContent = operation || ""; $("ratPopOp").classList.toggle("hidden", !operation);
    $("ratingBack").style.display = "none";
    $("ratingTutPrev").hidden = idx === 0 || (!review && ["finish", "practiceIntro"].includes(p.act));
    $("ratingTutPrev").textContent = "← 戻る";
    $("ratingBackNote").hidden = review || p.act !== "conf";
    $("ratBtnRow").classList.toggle("with-back", !$("ratingTutPrev").hidden);
    $("rating").classList.add("tut-front");
    if (ratCueTimer) { clearTimeout(ratCueTimer); ratCueTimer = null; }
    $("ratingNext").textContent = model.label("ratingNext");
    $("ratingSubmit").textContent = model.label("ratingSubmit");
    const key = p.act === "conf" ? "confidence" : "hesitation", lk = $("qitem-" + key).querySelector(".likert");
    const lkC = $("qitem-confidence").querySelector(".likert"), lkH = $("qitem-hesitation").querySelector(".likert");
    if (lkC) lkC.classList.remove("tut-cue"); if (lkH) lkH.classList.remove("tut-cue");
    const staticPage = !!review || !["hes", "conf"].includes(p.act);
    $("rating").classList.toggle("rat-intro", staticPage);
    $("rating").classList.toggle("rat-static", staticPage);
    if (review) {
      $("ratingNext").disabled = model.nextDisabled(); $("ratingSubmit").disabled = model.submitDisabled();
    } else if (staticPage) {
      const goBtn = model.page() === 0 ? $("ratingNext") : $("ratingSubmit");
      goBtn.disabled = model.page() === 0 ? model.nextDisabled() : model.submitDisabled();
      ratCueTimer = setTimeout(() => { if (active() && current() === p) goBtn.classList.add("cue"); }, model.cueDelay(p.text));
    } else {
      if (p.act === "hes") $("ratingNext").disabled = model.nextDisabled();
      if (model.ratings()[key] == null) lk.classList.add("tut-cue");
      else (p.act === "conf" ? $("ratingSubmit") : $("ratingNext")).classList.add("cue");
    }
    resetScroll();
    ratSpot.classList.remove("strong", "on"); ratSpot.classList.add("hidden"); ratPop.classList.remove("hidden");
    requestAnimationFrame(place);
  }
  function select(key, value) {
    clearOrdinaryHint();
    const container = $("qitem-" + key).querySelector(".likert"), btn = [...container.children].find(b => Number(b.dataset.val) === value);
    for (const b of container.children) b.classList.toggle("sel", b === btn);
    syncChoiceState(container);
    $("ratingNext").disabled = model.nextDisabled();
    $("ratingSubmit").disabled = model.submitDisabled();
    if (active()) {
      container.classList.remove("tut-cue");
      (model.page() === 0 ? $("ratingNext") : $("ratingSubmit")).classList.add("cue");
    }
  }
  $("ratingNext").addEventListener("click", events.next, { passive: true });
  $("ratingBack").addEventListener("click", events.back, { passive: true });
  $("ratingHelp").addEventListener("click", events.help, { passive: true });
  $("ratingTutClose").addEventListener("click", events.close, { passive: true });
  $("ratingTutPrev").addEventListener("click", events.previous, { passive: true });
  $("ratingSubmit").addEventListener("click", events.submit, { passive: true });
  $("rating").addEventListener("pointerdown", e => {
    const t = e.target;
    if (e.isPrimary === false) { ordinaryTap = null; return; }
    if (!screens.rating.classList.contains("active") || document.body.classList.contains("stop-open") || !t?.closest) return;
    if (!active()) {
      const goBtn = model.page() === 0 ? $("ratingNext") : $("ratingSubmit");
      const control = t.closest('button,input,select,textarea,a[href],label,[role="button"],[role="link"],[contenteditable="true"],[data-tap-action]');
      if (control && (control !== goBtn || !goBtn.disabled)) { clearOrdinaryHint(); return; }
      ordinaryTap = { id: e.pointerId, x: e.clientX, y: e.clientY, page: model.page() }; return;
    }
    if ((!model.review() && t.closest(".likert button")) || t.closest("#ratingBack") || t.closest("#ratingTutPrev") || t.closest("#ratingTutClose") || t.closest("#stopBtn")) return;
    const goBtn = model.page() === 0 ? $("ratingNext") : $("ratingSubmit");
    if (t.closest("#" + goBtn.id) && !goBtn.disabled) return;
    events.stray();
  }, { passive: true });
  $("rating").addEventListener("pointermove", e => {
    if (ordinaryTap?.id === e.pointerId && Math.hypot(e.clientX - ordinaryTap.x, e.clientY - ordinaryTap.y) > 12) clearOrdinaryHint();
  }, { passive: true });
  $("rating").addEventListener("pointerup", e => {
    const tap = ordinaryTap; ordinaryTap = null;
    if (!tap || tap.id !== e.pointerId || tap.page !== model.page() || active() || !screens.rating.classList.contains("active") || document.body.classList.contains("stop-open") ||
        Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
    showOrdinaryHint();
  }, { passive: true });
  $("rating").addEventListener("scroll", clearOrdinaryHint, { capture: true, passive: true });
  document.addEventListener("pointercancel", clearOrdinaryHint, { passive: true });
  document.addEventListener("pointerdown", e => { if (!e.target?.closest?.("#rating")) clearOrdinaryHint(); }, { capture: true, passive: true });
  // 中断・別画面・別アプリへ移った注意を、復帰先へ残さない。
  new MutationObserver(() => { if (!screens.rating.classList.contains("active")) clearOrdinaryHint(); }).observe(screens.rating, { attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearOrdinaryHint(); });
  window.addEventListener("blur", clearOrdinaryHint);
  window.addEventListener("resize", () => requestAnimationFrame(place), { passive: true });
  return { prepare, restoreSelections, showPage, showOrdinaryHelp, resetScroll, enterReview, exitReview,
    hasItems, prepareTutorial, hideTutorial, renderTutorial, select, flash, addCue: id => $(id).classList.add("cue"), place };
} };
