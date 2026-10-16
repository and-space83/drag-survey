// 座標・時刻と派生指標の共通取得処理。DOM・説明・保存・画面遷移を持たない。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PilotTrialRecorder = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function create({ STOP_MIN_MS, STOP_NOTICE_MS, STOP_EPS_PX, LATE_START_MS, EARLY_CPS }) {
    const center = r => ({ cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 });
    function begin({ e, phase, trialIndex, instrIndex, recordsLength, aborts, cell, block, stimulusType, meta,
      resumePending, stemShownT, stopNoticeShown, sRect, stRect, aRect, bRect, timeOrigin, dpr }) {
      const sc = center(stRect), ac = center(aRect), bc = center(bRect);
      return {
      index: phase === "main" ? trialIndex + 1 : (phase === "instructed" ? instrIndex + 1 : null),
      trialOrdinal: recordsLength + 1, attemptNumber: aborts + 1,
      timeOrigin,
      isInstructed: phase === "instructed" ? true : undefined,
      // phase 'tutorial' = 導入の例を操作した1回 (練習にも解析にも数えない)。block: 統合セッションで value/moral を分離するため per-trial に記録
      phase: cell.isTutorial ? "tutorial" : phase, block: block, stimulusType: stimulusType,
      pointerType: e.pointerType || "unknown",
      ...meta,  // 通常=ブロック別メタ / 注意チェック=isCheck メタ
      post_check: cell.postCheck === true,   // 弱DQS直後の本試行 (警戒モード汚染を感度分析で除外可能に。§6-2)
      post_resume: resumePending === true,   // 中断→再開の直後の本試行 (§6-6 項17。間隔が空いた分を感度分析で除外可能に)
      choiceSide: null, correct: null,
      // 開始手続き (§6-6 項19。2026-09-26 押下で出現): onset = 場面文の表示、startPressT = 押下 = revealT (選択肢の出現)、initiationT = 枠から出た時刻
      stimulusOnsetT: stemShownT, startPressT: e.timeStamp, preStartMs: +(e.timeStamp - stemShownT).toFixed(1),
      revealT: e.timeStamp, revealXY: { x: +(e.clientX - sRect.left).toFixed(2), y: +(e.clientY - sRect.top).toFixed(2) },
      stopsAfterInit: null, stopFlag: false, lateStart: false, stopNotice: stopNoticeShown,
      initiationT: null, responseT: null,
      rt_ms: null, rt_proxy_ms: null, mt_proxy_ms: null, total_ms: null,
      dispHz: null, nDispatched: 0, nCoalesced: 0, aborts: 0,
      ratings: { confidence: null, hesitation: null },
      geom: {
        surface: { w: sRect.width, h: sRect.height },
        start: { cx: sc.cx - sRect.left, cy: sc.cy - sRect.top },
        A: { cx: ac.cx - sRect.left, cy: ac.cy - sRect.top, w: aRect.width, h: aRect.height },
        B: { cx: bc.cx - sRect.left, cy: bc.cy - sRect.top, w: bRect.width, h: bRect.height },
        dpr,
      },
      _sRect: sRect, _stRect: stRect,
      events: [],
    };
    }
  function pushEvent(trial, e, type) {
    const x = e.clientX - trial._sRect.left, y = e.clientY - trial._sRect.top;
    trial.events.push({ seq: trial.events.length, t: e.timeStamp, x: +x.toFixed(2), y: +y.toFixed(2), type });
  }
    function hasLeftStart(sr, e) { return (e.clientX < sr.left - 4 || e.clientX > sr.right + 4 || e.clientY < sr.top - 4 || e.clientY > sr.bottom + 4); }
  // 出現後の停止 (動的スタート §6-6 項19): 出現以降の down/dispatched/up 点列で、基準点から STOP_EPS_PX 以内に
  // STOP_MIN_MS 以上とどまった区間を数える。iOS は静止中 pointermove を出さないので時間の空白も同じ基準で停止になる
  function computeStops(events, revealT) {
    const out = { n: 0, ms: 0, maxMs: 0 };
    if (revealT == null) return out;
    const pts = events.filter((p) => (p.type === "dispatched" || p.type === "up" || p.type === "reveal") && p.t >= revealT);
    if (!pts.length) return out;
    let ax = pts[0].x, ay = pts[0].y, at = pts[0].t;
    const close = (d) => { if (d >= STOP_MIN_MS) { out.n++; out.ms += d; out.maxMs = Math.max(out.maxMs, d); } };
    for (let i = 1; i < pts.length; i++) {   // 基準点から STOP_EPS_PX を超えて動いた時点で、そこまでの滞在を閉じる
      const p = pts[i];
      if (Math.hypot(p.x - ax, p.y - ay) > STOP_EPS_PX) { close(p.t - at); ax = p.x; ay = p.y; at = p.t; }
    }
    close(pts[pts.length - 1].t - at);   // 離すまでの最後の滞在
    out.ms = Math.round(out.ms); out.maxMs = Math.round(out.maxMs);
    return out;
  }

    function complete(trial, { disp, aborts, stemChars }) {
    const upT = trial.events[trial.events.length - 1].t;
    trial.responseT = upT;
    if (trial.initiationT == null) trial.initiationT = upT;
    trial.rt_ms = +(trial.initiationT - trial.revealT).toFixed(2);
    trial.rt_proxy_ms = trial.rt_ms;
    trial.mt_proxy_ms = +(upT - trial.initiationT).toFixed(2);
    trial.total_ms = +(upT - trial.startPressT).toFixed(2);
    trial.stopsAfterInit = computeStops(trial.events, trial.initiationT);   // 動き出した後の停止 (記録のみ・案内しない)
    trial.stopFlag = trial.stopsAfterInit.maxMs >= STOP_NOTICE_MS;
    trial.lateStart = trial.rt_ms > LATE_START_MS;   // 遅い初動: 選択肢が出てから 3 秒を超えて動かなかった (評定送信後に案内。品質共変量)
    // 早出し: 問題文表示〜スタート押下が固定読了時間より短い（問題文のないブロックは判定しない）
    trial.stemChars = stemChars;
    trial.earlyStart = trial.stemChars > 0 && trial.preStartMs < (trial.stemChars / EARLY_CPS) * 1000;   // 問題文表示〜スタート押下 < 文字数÷25字/秒。読了の有無ではなく時間に基づくフラグ

    // 実効 dispatch レート (dt>0 ガード)
    let span = 0, n = 0;
    for (let i = 1; i < disp.length; i++) { const dt = disp[i].t - disp[i - 1].t; if (dt > 0) { span += dt; n++; } }
    trial.dispHz = n > 0 ? +((n) / (span / 1000)).toFixed(1) : null;
    trial.nDispatched = disp.length;
    trial.nCoalesced = trial.events.filter((p) => p.type === "coalesced").length;
    trial.aborts = aborts;
    }
    return Object.freeze({ begin, pushEvent, hasLeftStart, computeStops, complete });
  }
  return Object.freeze({ create });
});
