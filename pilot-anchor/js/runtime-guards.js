/*
 * 端末・向き・拡大・タッチ操作の共通ガード。
 * チュートリアルの見た目から独立させ、index.html の元の初期化位置で接続する。
 * getDevice / isRecording はアプリ側の現在値を読み、試行の中断処理は呼び出し側へ委譲する。
 */
(function (global) {
  "use strict";

  function create(env) {
    const { $, query: QS, preview: GO, kiosk: KIOSK, cohort: COHORT, study: STUDY } = env;
    // ===== 横向きガード =====
    // タッチ端末のみ (PC/headless 検証は対象外)。?rotate=0 で無効化 (デバッグ用)。
    // 回転でレイアウト(vmin基準)と geom が変わるため、ドラッグ中なら無効試行にして再呈示。
    const rotateGuardOn = navigator.maxTouchPoints > 0 &&
      new URLSearchParams(location.search).get("rotate") !== "0";
    const typing = () => { const a = document.activeElement; return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")); };   // キーボードによる高さの変化は、物理的な向きやページ拡大と区別する。
    function landscapeOrientation() {
      // Safariでは回転後もscreenの幅・高さが縦向きの値のままになる。物理的な向きを優先し、キーボードによる高さの変化とは分ける。
      const type = screen.orientation && screen.orientation.type;
      if (/^landscape-/.test(type)) return true;
      if (/^portrait-/.test(type)) return false;
      if (typeof window.orientation === "number" && Number.isFinite(window.orientation)) return Math.abs(window.orientation) % 180 === 90;
      if (screen.width && screen.height) return screen.width > screen.height;
      return !typing() && window.innerWidth > window.innerHeight;
    }
    function checkOrientation() {
      if (!rotateGuardOn) return;
      const landscape = landscapeOrientation();
      $("rotateGuard").classList.toggle("show", landscape);
      if (landscape) $("zoomGuard").classList.remove("show");
      if (landscape && env.isRecording()) env.onOrientationInterrupted();
    }
    window.addEventListener("resize", checkOrientation);
    const orientationChanged = () => { checkOrientation(); checkZoom(); };
    window.addEventListener("orientationchange", orientationChanged);
    if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener("change", orientationChanged);
    checkOrientation();
    // ===== 文字サイズ・ページ拡大のガード (2026-09-12 夜) =====
    // pageZoom = screen.width / innerWidth: Safari「ぁあ」・Chrome「ズーム」はページの CSS px 幅を縮める (= 小さい機種と同じ効果) ので、縦向きで 1 から外れる。
    // textZoom = 文字だけの拡大 (見本 B / 見本 A の幅)。どちらも 100%±3% を外れたら止めて戻し方を出す。解析はスタート→箱の直線に正規化するので
    // 機種差と同じ種類の差だが、説明ボックスの収まり (shots.js で 100% 前提で検証) が崩れるため固定する。値は env.getDevice().pageZoom / textZoom に記録
    const ZOOM_GUARD_ON = navigator.maxTouchPoints > 0 && QS.get("zoomguard") !== "0";
    // 本実験は UA で判定した iPhone + 既定の画面寸法。自己申告モデルは判定に使わない。
    // SE 系 (375×667)・8 (375×667)・8 Plus (414×736) を除く。12/13 mini (375×812) は既定では通る (?devmin=844 で外せる)。?devguard=0 で無効 (validate/shots 用)
    const DEVGUARD_ON = !GO && QS.get("devguard") !== "0";
    const DEVMIN_H = (function () { const v = parseInt(QS.get("devmin"), 10); return isFinite(v) && v > 0 ? v : 812; })();
    (function devGuardCheck() {
      const w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height);
      const isIPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isIPhone = /iPhone/i.test(navigator.userAgent) && !isIPad;
      const ipadLink = KIOSK && COHORT === "elderly-inperson-ipad" && !STUDY;
      const platformOk = ipadLink ? isIPad : isIPhone;
      const sizeOk = h >= DEVMIN_H && w >= 375;
      const bad = DEVGUARD_ON && (!platformOk || !sizeOk);
      env.getDevice().isIPhone = isIPhone; env.getDevice().isIPad = isIPad;
      env.getDevice().devGuard = { on: DEVGUARD_ON, minH: DEVMIN_H, w, h, shown: bad, isIPhone, isIPad, ipadLink, platformOk, sizeOk };
      if (bad) {
        if (ipadLink) $("dgMessage").innerHTML = "<b>この調査の対象端末ではありません。</b><br>このリンクは、対面調査の iPad 専用です。";
        $("dgNow").textContent = platformOk ? `お使いの画面: 幅 ${w} × 高さ ${h}（対象: 幅 375・高さ ${DEVMIN_H} 以上）` : "この端末は、対象の端末として確認できませんでした。";
        $("devGuard").classList.add("show");
        for (const el of document.body.children) if (el !== $("devGuard") && !["SCRIPT", "STYLE"].includes(el.tagName)) el.inert = true;
        $("devGuard").focus({ preventScroll: true });
      }
    })();
    function measureZoom() {
      const portrait = !landscapeOrientation();
      const sw = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
      const pageZoom = sw > 0 && innerWidth > 0 ? +(sw / innerWidth).toFixed(3) : 1;
      const a = $("zpA").getBoundingClientRect().width, b = $("zpB").getBoundingClientRect().width;
      const textZoom = a > 0 ? +(b / a).toFixed(3) : 1;
      return { pageZoom, textZoom };
    }
    let zoomGuardWasOn = false;
    function checkZoom() {
      if (rotateGuardOn && landscapeOrientation()) { $("zoomGuard").classList.remove("show"); return false; }
      if (typing()) { $("zoomGuard").classList.remove("show"); return false; }   // 入力中 (キーボード表示) は判定しない (2026-09-29)
      const z = measureZoom(); env.getDevice().pageZoom = z.pageZoom; env.getDevice().textZoom = z.textZoom;
      const off = ZOOM_GUARD_ON && (Math.abs(z.pageZoom - 1) > 0.03 || Math.abs(z.textZoom - 1) > 0.03);
      if (off && !zoomGuardWasOn) env.getDevice().zoomGuardShown++;
      zoomGuardWasOn = off;
      if (off) {   // いまの設定を割合と向きで示す (2026-09-13: 大きめか小さめか分からないと戻せない)
        const zz = Math.abs(z.pageZoom - 1) > 0.03 ? z.pageZoom : z.textZoom;
        $("zgNow").textContent = "いまの設定: 約 " + Math.round(zz * 100) + "%（" + (zz > 1 ? "大きめ" : "小さめ") + "）";
      }
      $("zoomGuard").classList.toggle("show", off);
      return off;
    }
    window.addEventListener("resize", checkZoom);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", checkZoom);
    checkZoom();

    return { checkZoom, measureZoom };
  }

  // 既存の起動処理と回復処理が接続された後、index.html の末尾で一度だけ呼ぶ。
  function installTouchGuards({ surface }) {
    // 課題面のプルリフレッシュ/スクロール抑止 (intro/done の .pad スクロールは妨げない)
    surface.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    document.addEventListener("contextmenu", (e) => { if (!e.target.closest("#ccode")) e.preventDefault(); });   // コピー失敗時はコードを長押しして選択できる
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    // Safariはクリック対象でない本文・余白・disabledボタンでtouch-actionだけでは
    // ダブルタップ拡大を防げない場合がある。操作を持たない領域の単指タップだけを
    // touchendで取り消す。初回から取り消すため、2回目のイベント欠落にも依存しない。
    // 有効なフォーム部品/ラベルはネイティブclickに任せ、clickの手動再送はしない。
    // スワイプ・複数指・キャンセルは除外し、.padの縦スクロールと慣性を維持する。
    (() => {
      let tap = null;
      const options = { capture: true, passive: true };
      document.addEventListener("touchstart", e => {
        const t = e.touches.length === 1 && e.touches[0];
        tap = t ? { id: t.identifier, x: t.clientX, y: t.clientY, moved: false } : null;
      }, options);
      document.addEventListener("touchmove", e => {
        if (!tap) return;
        const t = [...e.touches].find(t => t.identifier === tap.id);
        if (!t || e.touches.length !== 1) { tap = null; return; }
        if (Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10) tap.moved = true;
      }, options);
      document.addEventListener("touchcancel", () => { tap = null; }, options);
      document.addEventListener("touchend", e => {
        const ended = tap; tap = null;
        const t = e.changedTouches.length === 1 && e.changedTouches[0];
        if (!ended || ended.moved || !t || t.identifier !== ended.id || e.touches.length ||
            Math.hypot(t.clientX - ended.x, t.clientY - ended.y) > 10 || !e.cancelable) return;
        const target = e.target instanceof Element ? e.target : e.target?.parentElement;
        if (!target || target.closest("#task")) return; // 課題面は下の既存処理を維持
        const control = target.closest('button, input, select, textarea, a[href], label, [role="button"], [role="link"], [contenteditable="true"], [data-tap-action]');
        const action = control?.tagName === "LABEL" ? control.control : control;
        if (action && !action.matches(':disabled, [aria-disabled="true"]')) return;
        e.preventDefault();
      }, { capture: true, passive: false });
    })();
    // iOS のダブルタップ拡大対策:スタート連打で拡大→復帰不能の実機報告 (2026-07-11)。
    // タスク画面は Pointer Events のみで click 合成に依存しないため、touchend の既定動作
    // (ダブルタップ拡大 + click 合成) を丸ごと抑止できる。他画面はCSSと上の補助処理で対処。
    document.getElementById("task").addEventListener("touchend",
      (e) => { if (e.target && e.target.closest && e.target.closest("button")) return;   // 右上「↻ 操作方法」など課題画面内のボタンは click 合成を止めない (2026-09-29: iPhone で押せなかった)
        if (e.cancelable) e.preventDefault(); }, { passive: false });
  }

  global.PilotRuntimeGuards = { create, installTouchGuards };
})(window);
