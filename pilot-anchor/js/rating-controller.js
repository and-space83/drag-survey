// 評定の状態・進行条件・時刻・教示ログ。DOMや保存/送信の実装を持たない。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PilotRating = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  function immutableCopy(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(immutableCopy));
    if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutableCopy(child)])));
    return value;
  }
  function createController(env) {
    // Keep content identities stable for delayed view callbacks while preventing
    // either a view or the caller's source object from rewriting progress rules.
    const { items: ITEMS, tutorialPages: TUT_PAGES, practiceIntro: RATING_PRACTICE_INTRO } = immutableCopy(env.content);
    const now = env.now, trial = env.getTrial, device = env.getDevice;
    let ratingOnset = 0, ratPage = 0, ratPageAt = 0;
    let ratingTutorialDone = false, tutIdx = -1, tutChanged = false, tutRenderedAt = 0;
    let ratingReview = null, tutIntroDone = false, ratLockUntil = 0;
    let ratPageShownAt = null, ratPageShownIdx = -1;
    let nextDisabled = true, submitDisabled = true;
    const ratingSeenPages = new Set();
    const noop = () => {};
    // No view is needed for state/recording tests. attachView replaces only presentation calls.
    const emptyView = { hasItems: () => true, prepare: noop, restoreSelections: noop, showPage: noop,
      showOrdinaryHelp: noop, resetScroll: noop, prepareTutorial: noop, hideTutorial: noop,
      renderTutorial: noop, select: noop, enterReview: noop, exitReview: noop, flash: noop, addCue: noop };
    let view = emptyView;
    const tutActive = () => tutIdx >= 0;
    const ratingTutorialPage = () => TUT_PAGES[tutIdx] || (tutIdx === TUT_PAGES.length ? RATING_PRACTICE_INTRO : null);
    function label(buttonId) {
      if (tutActive()) {
        const p = ratingTutorialPage();
        if (ratingReview && p.act === "finish") return "回答に戻る";
        if (!ratingReview && p.act === "finish") return "練習問題へ";
        return "次へ";
      }
      return buttonId === "ratingSubmit" ? "決定して次へ" : "次へ";
    }
    const model = Object.freeze({
      items: () => ITEMS, tutorialPages: () => TUT_PAGES, active: tutActive, current: ratingTutorialPage,
      page: () => ratPage, index: () => tutIdx, review: () => !!ratingReview,
      ratings: () => immutableCopy(trial()?.ratings || {}), nextDisabled: () => nextDisabled, submitDisabled: () => submitDisabled,
      label, cueDelay: text => env.readCueDelay(text),
    });
    function attachView(nextView) { view = { ...emptyView, ...nextView }; }
    function begin(restored) {
      ratingOnset = now() - (restored && restored.elapsedMs || 0);
      if (env.getPhase() === "practice" && env.tutorialEnabled() && !ratingTutorialDone) {
        // Keep old indices 0/1/2; 3 is the closing explanation, 4 the unnumbered practice intro.
        const savedIndex = restored && restored.tutorial && restored.tutorial.index;
        tutIdx = Number.isInteger(savedIndex) ? Math.max(0, Math.min(4, savedIndex)) : 0;
        tutIntroDone = restored && restored.tutorial ? !!restored.tutorial.introDone : false;
        ratingSeenPages.clear();
        for (const page of restored && restored.tutorial && restored.tutorial.seen || []) ratingSeenPages.add(page);
      }
      const t = trial(), answer = t.choiceSide === "left" ? t.leftLabel : (t.choiceSide === "right" ? t.rightLabel : null);
      view.prepare({ practice: env.getPhase() === "practice", answer });
      if (!restored) { t.ratings = { confidence: null, hesitation: null }; t.ratingBacks = 0; }
      else view.restoreSelections();
      showPage(restored ? restored.page : 0, tutActive() ? tutIdx : undefined);
      if (restored) ratPageAt = now() - (restored.pageElapsedMs || 0);
      env.showRating();
      env.setResumeStage("rating"); env.saveBackup();
    }
    function showPage(p, explanationIndex) {
      ratPage = p; ratPageAt = now();
      nextDisabled = trial().ratings[ITEMS[0].key] == null;
      submitDisabled = trial().ratings[ITEMS[1].key] == null;
      view.showPage(p);
      if (tutActive()) { tutIdx = explanationIndex == null ? (p === 0 ? (tutIntroDone ? 1 : 0) : 2) : explanationIndex; renderTutorial(); }
      else view.showOrdinaryHelp();
      env.updateProgress();
      view.resetScroll();
      env.focusRating();
      if (env.getResumeStage() === "rating") env.scheduleCheckpoint();
    }
    function next() {
      if (ratPage !== 0) return;
      if (ratingReview) { showExplanation(tutIdx + 1); return; }
      if (tutActive() && TUT_PAGES[tutIdx].act === "intro") {
        if (tooEarly("ratingNext")) return;
        tutIntroDone = true; showExplanation(1); return;
      }
      if (trial().ratings[ITEMS[0].key] == null) return;
      if (tutActive() && tooEarly("ratingNext")) return;
      showPage(1);
    }
    function back() {
      if (ratPage !== 1) return;
      trial().ratingBacks = (trial().ratingBacks || 0) + 1;
      if (tutActive()) device().tutorialLog.push({ kind: "rating", event: "back" });
      showPage(0);
    }
    function showExplanation(index) {
      if (index < 0 || index > TUT_PAGES.length || (ratingReview && index >= TUT_PAGES.length)) return;
      tutIdx = index; tutIntroDone = index > 0;
      showPage(index >= 2 ? 1 : 0, index);
      if (env.getResumeStage() === "rating") env.saveBackup();
    }
    function closeReview() {
      if (!ratingReview) return;
      const retained = ratingReview;
      device().tutorialLog.push({ kind: "rating", event: "close", page: tutIdx + 1 });
      tutIdx = -1; renderTutorial(); ratingReview = null; env.clearReviewState();
      view.exitReview();
      showPage(retained.page);
      ratingOnset = now() - retained.elapsedMs;
      ratPageAt = now() - retained.pageElapsedMs;
      env.saveBackup();
    }
    function openReview() {
      if (tutActive() || !trial() || env.getResumeStage() !== "rating") return;
      ratingReview = { ...env.captureReviewState() };
      device().tutorialLog.push({ kind: "rating", event: "again", phase: env.getPhase(), trial: env.getPhase() === "main" ? env.getTrialIndex() + 1 : null, ratingPage: ratPage + 1 });
      view.enterReview();
      showExplanation(0);
      env.saveBackup();
    }
    function previousExplanation() {
      if (!tutActive() || tutIdx <= 0) return;
      device().tutorialLog.push({ kind: "rating", event: "back", page: tutIdx + 1 });
      if (!ratingReview && tutIdx === 2) trial().ratingBacks = (trial().ratingBacks || 0) + 1;
      showExplanation(tutIdx - 1);
    }
    function replay() {
      device().tutorialLog.push({ kind: "rating", event: "replay" });
      showExplanation(0);
    }
    function tooEarly(buttonId) {
      if (now() >= ratLockUntil) return false;
      device().tutorialLog.push({ kind: "rating", page: tutIdx + 1, event: "early" });
      view.flash("読んでから押してください", buttonId, ratLockUntil);
      return true;
    }
    function stray() {
      if (!tutActive()) return;
      const p = ratingTutorialPage();
      const unselected = !ratingReview && ["hes", "conf"].includes(p.act) && trial().ratings[ITEMS[ratPage].key] == null;
      device().tutorialLog.push({ kind: "rating", page: tutIdx + 1, event: "stray" });
      const buttonId = ratPage === 0 ? "ratingNext" : "ratingSubmit";
      view.flash(unselected ? "1つ選んでください" : "このボタンで進みます", buttonId);
      if (!unselected) view.addCue(buttonId);
    }
    function renderTutorial() {
      // Presentation availability must never skip the reading lock or the recorded state.
      if (ratPageShownIdx >= 0 && ratPageShownAt != null)
        device().tutorialLog.push({ kind: "rating", page: ratPageShownIdx + 1, ms: Math.round(now() - ratPageShownAt) });
      ratPageShownIdx = tutActive() ? tutIdx : -1; ratPageShownAt = tutActive() ? now() : null;
      view.prepareTutorial();
      if (!tutActive()) { view.hideTutorial(); return; }
      const p = ratingTutorialPage();
      const seen = ratingSeenPages.has(tutIdx); ratingSeenPages.add(tutIdx);
      const key = p.act === "conf" ? "confidence" : "hesitation";
      const staticPage = !!ratingReview || !["hes", "conf"].includes(p.act);
      if (ratingReview) { nextDisabled = false; submitDisabled = false; }
      else if (staticPage) { if (ratPage === 0) nextDisabled = false; else submitDisabled = false; }
      else if (p.act === "hes") nextDisabled = trial().ratings[key] == null;
      view.renderTutorial(p);
      tutRenderedAt = now();
      ratLockUntil = (ratingReview || seen) ? 0 : tutRenderedAt + env.minReadMs(p.text);
    }
    function select(key, value) {
      if (ratingReview) return;
      if (tutActive() && !["hes", "conf"].includes(ratingTutorialPage().act)) return;
      if (key !== ITEMS[ratPage].key) return;
      if (tutActive() && trial().ratings[key] && trial().ratings[key].value !== value) tutChanged = true;
      trial().ratings[key] = { value, rt_ms: +(now() - ratPageAt).toFixed(1) };
      nextDisabled = trial().ratings[ITEMS[0].key] == null;
      submitDisabled = trial().ratings[ITEMS[1].key] == null;
      view.select(key, value);
      env.scheduleCheckpoint();
    }
    function submit() {
      if (ratingReview) {
        if (tutIdx === TUT_PAGES.length - 1) closeReview();
        else showExplanation(tutIdx + 1);
        return;
      }
      if (tutActive() && ratingTutorialPage().act === "finish") {
        if (tooEarly("ratingSubmit")) return;
        showExplanation(TUT_PAGES.length); return;
      }
      if (tutActive() && ratingTutorialPage().act === "practiceIntro") {
        if (tooEarly("ratingSubmit")) return;
        tutIdx = -1; ratingTutorialDone = true; renderTutorial();
        device().ratingTutorial = { changed: tutChanged, completed: true, pages: TUT_PAGES.length };
        env.onPracticeComplete(); return;
      }
      if (ITEMS.some(it => trial().ratings[it.key] == null)) return;
      if (ratPage !== 1) return;
      if (tutActive() && tooEarly("ratingSubmit")) return;
      trial().ratingSubmitMs = +(now() - ratingOnset).toFixed(1);
      env.stampMonitors(trial());
      if (tutActive()) { showExplanation(TUT_PAGES.length - 1); return; }
      env.onSubmitted();
    }
    function endTutorial() { tutIdx = -1; renderTutorial(); }
    function restoreSession({ done, changed }) { ratingTutorialDone = done; tutIdx = -1; tutChanged = !!changed; }
    function snapshot(at = now()) {
      return { page: ratPage, elapsedMs: at - ratingOnset, pageElapsedMs: at - ratPageAt,
        tutorial: tutActive() && !ratingReview ? { version: 2, pages: TUT_PAGES.length, index: tutIdx, introDone: tutIntroDone, seen: [...ratingSeenPages] } : null };
    }
    const events = Object.freeze({ next, back, submit, select, help: openReview, close: closeReview, previous: previousExplanation, replay, stray });
    return { attachView, model, events, begin, next, back, select, submit, openReview, closeReview, previousExplanation,
      replay, showExplanation, endTutorial, restoreSession, snapshot,
      setTutorialDone: value => { ratingTutorialDone = value; },
      isActive: tutActive, isReview: () => !!ratingReview, isDone: () => ratingTutorialDone, changed: () => tutChanged,
      state: () => ({ page: ratPage, index: tutIdx, review: !!ratingReview, lockRemainingMs: Math.max(0, ratLockUntil - now()),
        done: ratingTutorialDone, changed: tutChanged, nextDisabled, submitDisabled }),
    };
  }
  return { createController };
});
