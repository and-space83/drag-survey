// pilot-anchor の headless 自動検証 (依存パッケージなし / Node >= 22: 組み込み WebSocket 使用)
// 使い方:
//   1) 別ターミナルで: node serve.js
//   2) node validate.js
// 検証内容 (ブロック駆動エンジンの両ブロックを通す):
//   - ① anchor (?block=anchor 既定・評定OFF): 練習の行動ゲート (正解3連続で本番解錠。2026-07-07) を
//       無効試行1回 (途中で離す→コーチング+aborts記録) + 不正解1回 (streak リセット) + 正解3連続で通過し、
//       本番12 をタッチドラッグで完走。practiceSummary の記録も確認
//   - (② value 単体セッションと ②③統合 combo セッションは 2026-09-10 に削除: ②は 2026-07-29 廃止・本番構成は③のみ)
//   - ③ moral (?block=moral・評定ON): 練習ゲート → 本番24 (2026-07-15 増強) を完走。4類型×3葛藤水準・場面文ステム・
//       明確のみ better 定義(中/拮抗 null)・2項目評定を確認
//   - ②③ 統合 (?block=combo&order=vm|mv): 1セッションで value→moral (or 逆) を通し、ブロック順CB・
//       per-trial block タグ・practiceSummaryByBlock・事後アンケート1回 を確認
//   - ⑤ 注意チェック (combo 既定ON): 弱DQS(③に 4・post_check)・末尾attn(infrequency+強IMC・評定OFF)・
//       check の correct 記録・デブリーフィング表示 を確認
//   - 事後アンケート (②③=評定ブロックのみ): 使いにくさ複数選択(その他含む)+操作しやすさ+自由記述1欄を
//       回答し device.survey に記録されること (anchor は survey=null で非表示。その他選択時は自由記述必須)
//   - 事後アンケート 拡充分 (2026-09-06 §6-6 項8): 評定ブロックを含むクラウド配布で 24 項目が出て全回答が
//       device.post に記録される (postMs>0)。anchor / 対面 (stop・kiosk) では出ない (post=null)
//   - チュートリアルパネル (#coach) が練習中は表示・本番では非表示であること
//   - 練習スキップ導線 (goMain) が存在しないこと (練習必須化)
//   - 各試行のイベント記録・geom・dispHz・ブロック別メタ (anchor=congruency / value=domain/価値差/EV/評定) を確認
//   - 環境音モニタ (?mic=mock。2026-07-21 §6-6 項10): 事前チェック (騒音→進行ブロック / 静音→通過)・
//       評定送信後ノイズゲート (騒音中はブロック→持続静音で解錠・noisePause 記録)・切断→試行境界で再取得・
//       device.mic / trials[].noise の記録 (既定フローの検証は mic=0 = headless にマイクなし)
//   - 集中監視+完了コード (§6-6 項11-12): 全試行の vis:{count,totalMs} (headless=離脱なし)・device.wakeLock・
//       完了コードの発行 (XXXX-XXXX)+done 画面表示+データ記録の一致
//   - 完了画面で localStorage チェックポイントが残っている (未回収データの保全)
//   - リロード後に保存した進行状況または完了画面へ復旧する
//   - landscape で横向きガードが表示され、portrait で消える
//   - 対面セッション (?stop=1 / ?maxmin=N。2026-09-04 §6-6 項15): 事前アンケートの URL プリセット+欄の非表示・
//       中断ボタンの表示範囲 (課題系の画面のみ・確認画面では消える)・誤タップ復帰 (課題に戻る)・
//       中断/時間上限での終了 → 事後アンケート (途中終了は必須にしない) → done で partial/endedBy/cohort/
//       mainCompleted が記録されること・?strat=1 で打ち切っても水準構成が偏らないこと・
//       クラウド配布 URL (既定) では中断ボタンが出ないこと
//   - kiosk 連続実施 (?kiosk=1。2026-09-05 §6-6 項16): ウェルカム2枚・参加者IDの自動採番・年代タップ・
//       注意チェックと完了コードの省略・「つぎの人にわたす」・**未送信キュー** (送信先が死んでいる →
//       端末に貯まる → 生きた送信先で開き直すと起動時に自動再送されて空になる)
//   - 中断からの再開 (2026-09-06 §6-6 項17): 本番3問後に再読込 → 再開画面 → 続きから (記録・カウンタ・
//       device.resumes・post_resume・itemId 非重複・完走)・オンラインの削除導線なし・3時間超/別URLでは保存保持と終了案内・
//       mic=mock では再開時に環境音チェックを通ってから続き・kiosk は再開せず前の人の途中データを未送信キューへ退避
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
// 組込みWebSocketがCDP応答を受け取れないランタイムでは互換実装を指定できる。
const WebSocketImpl = process.env.PILOT_WS_MODULE ? (require(process.env.PILOT_WS_MODULE).ws || require(process.env.PILOT_WS_MODULE)) : globalThis.WebSocket;

const BASE = process.env.PILOT_BASE_URL || "http://127.0.0.1:8000/";
// upload=0: 検証中に GAS へゴミデータを送らない (アップロード経路は curl / 実機 E2E で確認)
// mic=0: 既定フローの検証はマイク無効で行う (headless にマイクなし)。環境音モニタは mic=mock の専用節で検証
// practice は指定しない (既定バッチ + 行動ゲートの実挙動をそのまま検証する)
// tut=0: ドラッグ導入チュートリアル (§6-6 項14) を無効化。既存フロー (練習→本番) の回帰検証はチュートリアル抜きで行う。
//        チュートリアル自体 (①②③→練習への引き渡し) の headless smoke 検証は後続コミットで追加予定。現状は実機確認で担保。
const ANCHOR_URL = BASE + "?devguard=0&minread=0&readgate=0&reps=1&debug=1&upload=0&mic=0&tut=0";
const VALUE_URL = BASE + "?devguard=0&minread=0&readgate=0&block=value&reps=1&debug=1&upload=0&mic=0&attn=0&tut=0";  // ②は廃止・残置バンクの回帰。attn は③(moral)で検証するため value 単体では OFF
const MORAL_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&reps=1&debug=1&upload=0&mic=0&tut=0";
const CDP_PORT = Number(process.env.PILOT_CDP_PORT || 9223);
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
].filter((p) => p && fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra) {
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

// ---- 最小 CDP クライアント ----
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocketImpl(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener("open", res);
      this.ws.addEventListener("error", rej);
    });
    this.ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Page.javascriptDialogOpening")   // beforeunload (本番中の再読込確認) 等は受理して進める
        this.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
      if (m.method === "Fetch.requestPaused" && this.onRequestPaused)
        Promise.resolve(this.onRequestPaused(m.params)).catch((err) => {
          check("[fixture] ローカル送信応答", false, err.message);
          this.send("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "Failed" }).catch(() => {});
        });
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error("CDP timeout: " + method)); }, 30000);
      this.pending.set(id, { res: value => { clearTimeout(timer); res(value); }, rej: error => { clearTimeout(timer); rej(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error("page eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + " / " + expression);
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch (_) {} }
}

async function main() {
  if (typeof WebSocket === "undefined") {
    console.error("Node 22 以上が必要です (組み込み WebSocket)。現在: " + process.version);
    process.exit(1);
  }
  if (CHROME_PATHS.length === 0) {
    console.error("Chrome が見つかりません。環境変数 CHROME_PATH で指定してください。");
    process.exit(1);
  }
  // serve.js が起動しているか
  try { await fetch(BASE); }
  catch (_) { console.error("serve.js が起動していません: 先に `node serve.js` を実行"); process.exit(1); }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-validate-"));
  const playwright = process.env.PILOT_PLAYWRIGHT_MODULE ? require(process.env.PILOT_PLAYWRIGHT_MODULE) : null;
  let harnessBrowser = null;
  const chrome = playwright ? null : spawn(CHROME_PATHS[0], [
    "--headless=new", `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    let cdp;
    if (playwright) {
      harnessBrowser = await playwright.chromium.launch({ headless: true, executablePath: CHROME_PATHS[0], args: ["--disable-gpu"] });
      const context = await harnessBrowser.newContext(), page = await context.newPage(), native = await context.newCDPSession(page);
      cdp = { send: (method, params = {}) => native.send(method, params), eval: CDP.prototype.eval, close: () => native.detach().catch(() => {}) };
      native.on("Page.javascriptDialogOpening", () => cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}));
      native.on("Fetch.requestPaused", params => { if (cdp.onRequestPaused) Promise.resolve(cdp.onRequestPaused(params)).catch(err => {
        check("[fixture] ローカル送信応答", false, err.message); cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" }).catch(() => {});
      }); });
    } else {
    // CDP ターゲット取得 (起動待ちポーリング)
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = list.find((t) => t.type === "page");
      } catch (_) {}
    }
    if (!target) throw new Error("Chrome CDP に接続できません");
    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready;
    }
    // CDPは寸法だけを変えると、PC画面由来のlandscape-primaryへ戻る。
    // 通常の寸法・キーボード検証は縦向きの端末を維持し、実際の回転だけ明示する。
    const nativeSend = cdp.send.bind(cdp);
    cdp.send = (method, params = {}) => nativeSend(method, method === "Emulation.setDeviceMetricsOverride" && !params.screenOrientation ? { ...params, screenOrientation: { type: "portraitPrimary", angle: 0 } } : params);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");   // Page.javascriptDialogOpening を受けるため

    // ---- モバイル相当のエミュレーション (portrait + touch) ----
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 400, height: 800, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    if (process.argv.includes("--notice-overlap")) {
      await require("./validate-notice-overlap.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nNotice overlap checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--pre-main-recovery")) {
      await require("./validate-pre-main-recovery.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nPre-main recovery checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--o14-feedback")) {
      await require("./validate-o14-feedback.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nO14 feedback checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--round4-copy")) {
      await require("./validate-round4-copy.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nRound 4 copy checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--round3-ui")) {
      await require("./validate-round3-ui.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nRound 3 UI checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--survey-intervals")) {
      await require("./validate-survey-intervals.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nSurvey interval checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--review-ui")) {
      await require("./validate-review-ui")(cdp, check, BASE);
      console.log(failures === 0 ? "\nReview UI checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--adopted-decisions")) {
      await require("./validate-adopted-decisions.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nAdopted decision checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (process.argv.includes("--accessibility") || process.argv.includes("--recovery")) {
      if (process.argv.includes("--accessibility")) await require("./validate-accessibility.js")(cdp, check, BASE);
      if (process.argv.includes("--recovery")) await require("./validate-recovery.js")(cdp, check, BASE);
      console.log(failures === 0 ? "\nTargeted checks passed" : `\n${failures} checks failed`);
      cdp.close(); process.exitCode = failures ? 1 : 0; return;
    }
    if (!process.argv.includes("--tutorial-smoke") && !process.argv.includes("--rating-progress")) {
    await require("./validate-o14-feedback.js")(cdp, check, BASE);
    await require("./validate-round4-copy.js")(cdp, check, BASE);
    await require("./validate-round3-ui.js")(cdp, check, BASE);
    await require("./validate-survey-intervals.js")(cdp, check, BASE);
    await require("./validate-review-ui")(cdp, check, BASE);
    }

    // ---- 操作ヘルパ (CDP) ----
    const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
    // ボタンは click リスナーなので .click() で叩く (スクロールで画面外でも確実)。
    const tap = (id) => require("./test-rule-review-helpers.cjs").clickId(cdp, id);
    const tapSel = (sel) => cdp.eval(`(() => { const el = document.querySelector('${sel}');
      if (!el) return false; el.click(); return true; })()`);
    async function dragStartToChoice(side) {   // side: 'left'(choiceA) | 'right'(choiceB)
      const target = side === "right" ? "choiceB" : "choiceA";
      const g = await cdp.eval(`(() => {
        const c = (id) => { const r = document.getElementById(id).getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
        return { s: c('start'), t: c('${target}') }; })()`);
      await touch("touchStart", [{ x: g.s.x, y: g.s.y }]);
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        await touch("touchMove", [{ x: g.s.x + (g.t.x - g.s.x) * i / steps,
                                    y: g.s.y + (g.t.y - g.s.y) * i / steps }]);
        await sleep(14); // ~60Hz 相当
      }
      await touch("touchEnd", []);
    }
    // 無効試行の注入: START から出て、どちらのボックスにも入らない位置で離す
    // (練習中の「指が途中で離れました」コーチング + streak リセット + aborts 記録の検証用)
    async function abortDrag() {
      const g = await cdp.eval(`(() => {
        const r = document.getElementById('start').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await touch("touchStart", [{ x: g.x, y: g.y }]);
      for (let i = 1; i <= 8; i++) {
        await touch("touchMove", [{ x: g.x, y: g.y - i * 40 }]);
        await sleep(14);
      }
      await touch("touchEnd", []);
    }
    // 評定画面 (2項目・2026-07-15)。チュートリアル v2 (2026-07-22・練習1問目) は専用ウォークスルーで
    // 全6ページを踏み、各ページの DOM 状態 (減光/強調/覆い/確定可否) とネガティブパス (説明ページ中の
    // 評定タップ・同値タップ・途中確定) を採取する — programmatic click は pointer-events/display:none を
    // 素通りするため、JS ガードと CSS 状態の両方を明示的に検証する (レビューWF 2026-07-22 反映)。
    let tutorialStates = null;   // 直近セッションで採取したページ状態 (runSession ごとにリセット)
    let tutSeenCount = 0;        // チュートリアル遭遇回数 (本番・DQS への再出現=1超 を検出)
    async function fillRatings() {
      const tutVisible = await cdp.eval("window.__pilot.ratTut()");   // 同期値 (吹き出しの .on は rAF 後なので使わない)
      if (tutVisible) {
        tutSeenCount++;
        await sleep(350);   // 連打デバウンス (300ms) を跨いでから操作
        // 4枚: 導入→迷い→自信(確定)→1問ずつ考え直す→番号なしの練習導入。
        const hes = "document.querySelectorAll('#ratingItems .qitem')[0].querySelectorAll('.likert button')";
        const conf = "document.querySelectorAll('#ratingItems .qitem')[1].querySelectorAll('.likert button')";
        const st = {};
        st.p0 = await cdp.eval(`(() => ({ step: (document.getElementById('tutStepLabel') || {}).textContent, page: window.__pilot.ratPage(),
          nextEnabled: !document.getElementById('ratingNext').disabled,
          rowCueOff: !document.querySelector('#qitem-hesitation .likert').classList.contains('tut-cue'),
          noAnswer: getComputedStyle(document.getElementById('ratingAnswer')).display === 'none',
          noQuestion: getComputedStyle(document.getElementById('ratingItems')).display === 'none' }))()`);
        await tap("ratingNext"); await sleep(450);   // 導入 → 迷いのページ (評定画面は 0 のまま)
        st.p0.afterPage = await cdp.eval("window.__pilot.ratPage()");
        st.p0.afterStep = await cdp.eval("(document.getElementById('tutStepLabel') || {}).textContent");
        st.p0.nextDisabledAfter = await cdp.eval("document.getElementById('ratingNext').disabled");
        st.p1 = await cdp.eval(`(() => ({
          step: (document.getElementById('tutStepLabel') || {}).textContent,
          spotOn: !!(document.getElementById('ratSpot') && document.getElementById('ratSpot').classList.contains('on')),
          dots: (() => { const d = document.querySelectorAll('#ratPopDots i'); return d.length + ':' + [...d].findIndex((x) => x.className === 'a'); })(),   // 点=ページ数:現在
          hesShown: !document.getElementById('qitem-hesitation').hidden, confHidden: document.getElementById('qitem-confidence').hidden,
          nextShown: document.getElementById('ratingNext').style.display !== 'none', nextDisabled: document.getElementById('ratingNext').disabled,
          submitHidden: document.getElementById('ratingSubmit').style.display === 'none', backHidden: document.getElementById('ratingBack').style.display === 'none',
          cueTarget: document.querySelector('#qitem-hesitation .likert').classList.contains('tut-cue'),
          labels: [...${hes}].map((b) => b.textContent).join('/'),
          vertical: (() => { const r = [...${hes}].map((b) => b.getBoundingClientRect()); return r.every((x, i) => i === 0 || x.top >= r[i - 1].bottom - 1); })(),
          titleSize: getComputedStyle(document.getElementById('ratTutTitle')).fontSize,
          bodySize: getComputedStyle(document.getElementById('ratTutText')).fontSize,
          replayHidden: document.getElementById('ratReplay').classList.contains('hidden') }))()`);
        st.p1Reserve = await cdp.eval(`(() => { const b = document.getElementById('ratPop').getBoundingClientRect(),   // 説明BOXが評定行に被らない
          c = document.getElementById('qitem-hesitation').getBoundingClientRect(); return b.bottom <= c.top; })()`);
        await cdp.eval(`(() => { ${hes}[3].click(); })()`); await sleep(80);   // 迷い=4
        st.p1Sel = await cdp.eval(`(() => ({ sel: ${hes}[3].classList.contains('sel'),
          nextEnabled: !document.getElementById('ratingNext').disabled, nextCue: document.getElementById('ratingNext').classList.contains('cue'),
          rowCueOff: !document.querySelector('#qitem-hesitation .likert').classList.contains('tut-cue') }))()`);
        await cdp.eval(`(() => { ${hes}[1].click(); })()`); await sleep(60);   // 迷い=2 に変更 (changed=true の観察)
        st.p1Change = await cdp.eval(`(() => ${hes}[1].classList.contains('sel') && !${hes}[3].classList.contains('sel'))()`);
        await tap("ratingSubmit"); await sleep(60);   // 迷いの画面での確定は無効 (rating に留まる)
        st.p1NoSubmit = (await cdp.eval("window.__pilot.activeScreen()")) === "rating" && (await cdp.eval("window.__pilot.ratPage()")) === 0;
        await tap("ratingNext"); await sleep(450);   // → ページ2 (自信)
        st.p2 = await cdp.eval(`(() => ({
          step: (document.getElementById('tutStepLabel') || {}).textContent,
          hesHidden: document.getElementById('qitem-hesitation').hidden, confShown: !document.getElementById('qitem-confidence').hidden,
          backShown: !document.getElementById('ratingTutPrev').hidden, nextHidden: document.getElementById('ratingNext').style.display === 'none',
          submitShown: document.getElementById('ratingSubmit').style.display !== 'none', submitDisabled: document.getElementById('ratingSubmit').disabled,
          submitLabel: document.getElementById('ratingSubmit').textContent,
          cueTarget: document.querySelector('#qitem-confidence .likert').classList.contains('tut-cue'),
          spotOn: !!(document.getElementById('ratSpot') && document.getElementById('ratSpot').classList.contains('on')),
          rowSide: document.getElementById('ratReplay').classList.contains('hidden') }))()`);   // 「もう一度」は出さない (戻ると同じ役割。2026-09-09)
        await sleep(650);   // 説明BOXの移動アニメーション (top .55s) を待ってから位置を測る
        st.p2.popAboveTarget = await cdp.eval(`(() => { const p = document.getElementById('ratPop').getBoundingClientRect(),
            t = document.getElementById('qitem-confidence').getBoundingClientRect(); return p.bottom <= t.top + 6; })()`);
        await cdp.eval(`(() => { ${conf}[1].click(); })()`); await sleep(80);    // 自信=2
        st.p2Sel = await cdp.eval(`(() => ({ submitEnabled: !document.getElementById('ratingSubmit').disabled,
          submitCue: document.getElementById('ratingSubmit').classList.contains('cue') }))()`);
        await tap("ratingTutPrev"); await sleep(400);   // 説明の前へ → 迷いの画面 (選択は保持)
        st.back = await cdp.eval(`(() => ({ page: window.__pilot.ratPage(), step: (document.getElementById('tutStepLabel') || {}).textContent,
          hesKept: ${hes}[1].classList.contains('sel'), nextCue: document.getElementById('ratingNext').classList.contains('cue') }))()`);
        await tap("ratingNext"); await sleep(400);   // もう一度 自信の画面へ (自信の選択も保持)
        st.back.confKept = await cdp.eval(`(() => ${conf}[1].classList.contains('sel') && !document.getElementById('ratingSubmit').disabled)()`);
        await tap("ratingSubmit"); await sleep(400);   // 自信の選択を確定→4枚目。後続説明時間を評定計時へ足さない。
        st.p3 = await cdp.eval(`(() => ({ step: document.getElementById('tutStepLabel').textContent,
          title: document.getElementById('ratTutTitle').textContent, copy: document.getElementById('ratTutText').textContent,
          button: document.getElementById('ratingSubmit').textContent, noQuestion: getComputedStyle(document.getElementById('ratingItems')).display === 'none',
          index: __pilot.recoveryState().rating.tutorial.index }))()`);
        await tap("ratingSubmit"); await sleep(400);   // 練習問題へ→単独の練習導入。呼び出し元の確定tapで既存5問へ進む。
        st.practiceIntro = await cdp.eval(`(() => ({ text: document.getElementById('ratTutText').textContent,
          numbered: !document.getElementById('tutStepLabel').hidden, index: __pilot.recoveryState().rating.tutorial.index,
          button: document.getElementById('ratingSubmit').textContent }))()`);
        tutorialStates = st;
        return;
      }
      // 通常の評定画面 (1 項目 1 画面): 迷い=2 → 次へ → 自信=2
      await cdp.eval(`(() => { const items = document.querySelectorAll('#ratingItems .qitem');
        const hes = items[0] ? items[0].querySelectorAll('.likert button') : []; if (hes[1]) hes[1].click(); })()`);
      await sleep(40); await tap("ratingNext"); await sleep(80);
      await cdp.eval(`(() => { const items = document.querySelectorAll('#ratingItems .qitem');
        const conf = items[1] ? items[1].querySelectorAll('.likert button') : []; if (conf[1]) conf[1].click(); })()`);
    }
    // ウェルカム画面 (入力前の説明。クラウド配布 4 枚 [2026-09-06 に注意事項を追加] / kiosk 2 枚) を読み進めて intro へ
    async function passWelcome() {
      for (let i = 0; i < 8; i++) {
        const s = await cdp.eval("window.__pilot.activeScreen()");
        if (s !== "welcome") return;
        await cdp.eval("(() => { for (const b of document.querySelectorAll('#wcAgree .chk:not(.sel)')) b.click(); })()");   // 4/4 の同意チェック (2026-09-29)
        await tap("wcNext"); await sleep(180);
      }
    }
    // 事後アンケート 拡充分 (POST_ITEMS。2026-09-06): 表示中なら各項目の最初の選択肢をタップ。戻り値=タップした項目数
    async function fillPost() {
      return await cdp.eval(`(() => { const blk = document.getElementById('postBlock');
        if (!blk || blk.style.display === 'none') return 0;
        let n = 0;
        for (const s of blk.querySelectorAll('.seg, .post-multiple')) { const b = s.querySelector('button'); if (b) { b.click(); n++; } }
        return n; })()`);
    }
    async function fillSurvey() {
      await passWelcome();
      await cdp.eval(`(() => { const set = (id, v) => { const el = document.getElementById(id);
        el.value = v; el.dispatchEvent(new Event('input')); };
        set('pid', 'tester'); set('age', '23'); set('devModel', 'iPhone 14'); })()`);
      await tapSel('#sexSeg button[data-val="female"]');
      await tapSel('#handSeg button[data-val="right"]');
    }

    // ===== 1 ブロックを完走させて payload を返す =====
    async function runSession(label, url, expectBlock, ratingsOn) {
      console.log(`\n--- ${label} (${url}) ---`);
      tutorialStates = null; tutSeenCount = 0;   // チュートリアル採取状態をセッションごとにリセット
      await cdp.send("Page.navigate", { url });
      for (let i = 0; i < 50; i++) {
        if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break;
        await sleep(200);
      }
      check(`[${label}] ページ読込 + debug フック`, await cdp.eval("typeof window.__pilot === 'object'"));
      check(`[${label}] ブロック判定`, (await cdp.eval("window.__pilot.block()")) === expectBlock,
        `block=${await cdp.eval("window.__pilot.block()")}`);
      check(`[${label}] 評定 ON/OFF`, (await cdp.eval("window.__pilot.ratingsOn()")) === ratingsOn,
        `ratings=${await cdp.eval("window.__pilot.ratingsOn()")}`);

      await fillSurvey();
      check(`[${label}] 事前必須が揃うと開始ボタン有効化`,
        !(await cdp.eval("document.getElementById('goPractice').disabled")));
      check(`[${label}] 練習スキップ導線なし (goMain 削除)`,
        await cdp.eval("document.getElementById('goMain') === null"));

      await tap("goPractice");
      await sleep(300);
      // 練習の行動ゲート: anchor では 無効試行1回 → 不正解1回 (streak リセット) → 正解3連続 を演じる。
      // value は正誤を問わないゲート (有効2連続) なので左右交互のままで通る (各練習後に評定リハーサル)。
      let dragCount = 0, postSeen = false, practiceDrags = 0, abortInjected = false;
      let practiceCoachSeen = false, mainCoachHidden = null, stemBlocks = null;
      let surveyFreeInit = null, surveyFreeShown = null;   // 自由記述の条件表示 (初期非表示→その他で出現)
      let postFilled = null, postGateBefore = null, postHintBefore = null;   // 拡充分: タップ数 / 埋める前は完了できない (必須) / 未回答の統合案内
      for (let guard = 0; guard < 450; guard++) {   // combo(②③統合)は本番36+練習+評定で反復が多い
        const screen = await cdp.eval("window.__pilot.activeScreen()");
        const storageError = await cdp.eval("document.getElementById('storageProblem') && !document.getElementById('storageProblem').hidden ? document.getElementById('storageProblemText').textContent : null");
        if (storageError) throw new Error(`[${label}] storage error: ${storageError}`);
        if (screen === "done") break;
        if (screen === "postq") {
          postSeen = true;
          if (postGateBefore === null) {   // 1 項目 1 画面 (2026-09-26): 何も答えていない初期状態 = 1 / N・持ち方のページ・次へ無効・完了不可
            postGateBefore = await cdp.eval("document.getElementById('postSubmit').disabled");
            postHintBefore = await cdp.eval("document.getElementById('postStep').textContent + '|' + document.getElementById('postNext').disabled + '|' + (document.querySelector('#postq .postpage.on') || {dataset:{}}).dataset.page");
          }
          if (ratingsOn && surveyFreeInit === null)   // 初期: その他未チェックなら自由記述欄は非表示
            surveyFreeInit = await cdp.eval(`document.getElementById('surveyFreeField').style.display === 'none'`);
          await tapSel('#gripSeg button[data-val="right_thumb"]');
          await sleep(60);
          if (ratingsOn) {   // 事後アンケート (②③): 使いにくさ複数選択(その他含む) / 操作しやすさ / 自由記述(その他選択時のみ)
            await tapSel('#surveyProblems button[data-val="rating_burden"]');
            await tapSel('#surveyProblems button[data-val="other"]');   // その他 → 下に自由記述欄が出て必須
            await tapSel('#surveyProblems button[data-val="none2"]');
            await sleep(40);
            if (surveyFreeShown === null)
              surveyFreeShown = await cdp.eval(`document.getElementById('surveyFreeField').style.display !== 'none'`);
            await tapSel('#surveyEaseSeg button[data-val="ok"]');
            await cdp.eval(`(() => { const el = document.getElementById('surveyFree');
              el.value = 'その他テスト記述'; el.dispatchEvent(new Event('input')); })()`);
            await sleep(60);
          }
          if (postFilled === null) {   // 拡充分 (2026-09-06): 埋める前は完了ボタン無効 → 全項目タップで有効 (非表示ページのボタンも click() で答えられる)
            postFilled = await fillPost();
            await sleep(60);
          }
          await tap("postSubmit");
          await sleep(250);
        } else if (screen === "rating") {
          await fillRatings();
          await sleep(60);
          await tap("ratingSubmit");
          await sleep(120);
        } else if (screen === "reading") {
          await tap("readDone");   // 読速ベースライン (§6-6 項13): はじめる → 読み終えた ×3
          await sleep(450);        // 連打ガード (表示後 400ms 未満は無視) を跨ぐ間隔でタップ
        } else if (screen === "break") {
          await sleep(80);         // 滞在時間 dwellMs が正になるよう最低限待つ
          await tap("breakContinue");   // 途中休憩 (breakEvery=20。2026-09-27)
          await sleep(120);
        } else if (screen === "blockintro") {
          await tap("blockintroGo");   // ②③統合: 次パートの説明 → 続けるで練習へ
          await sleep(300);
        } else if (screen === "notice") {
          await tap("noticeGo");       // 早出し/停止の案内画面 (2026-09-09)。検証のドラッグは読まずに出るので早出しの案内が出る
          await sleep(200);
        } else if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
          const inPractice = (await cdp.eval("window.__pilot.phase()")) === "practice";
          // チュートリアルパネルの表示: 練習中=あり / 本番=なし (それぞれ最初の試行で1回サンプリング)
          if (inPractice && !practiceCoachSeen)
            practiceCoachSeen = await cdp.eval("window.__pilot.coachVisible()");
          if (!inPractice && mainCoachHidden === null)
            mainCoachHidden = !(await cdp.eval("window.__pilot.coachVisible()"));
          if (!inPractice && stemBlocks === null)   // 文節ブロック改行 (.nb) の描画確認 (2026-07-22)
            stemBlocks = await cdp.eval("document.querySelectorAll('#stem .nb').length");
          if (inPractice && expectBlock === "anchor" && !abortInjected) {
            await abortDrag();                      // 記録は増えない (同一刺激を再呈示)
            abortInjected = true;
            await sleep(300);
            continue;
          }
          let side = dragCount % 2 === 0 ? "left" : "right";
          if (inPractice && expectBlock === "anchor") {
            const correct = await cdp.eval("window.__pilot.correctSide()");
            side = practiceDrags === 0 ? (correct === "left" ? "right" : "left") : correct;
          }
          const before = await cdp.eval("window.__pilot.recordCount()");
          await dragStartToChoice(side);
          dragCount++;
          if (inPractice) practiceDrags++;
          for (let w = 0; w < 25; w++) {   // 記録反映 or 画面遷移を待つ
            const c = await cdp.eval("window.__pilot.recordCount()");
            const s = await cdp.eval("window.__pilot.activeScreen()");
            if (c > before || s !== "task") break;
            await sleep(80);
          }
        } else { await sleep(150); }
      }
      check(`[${label}] 事後アンケート画面を経由`, postSeen);
      check(`[${label}] 自由記述はその他選択時のみ表示 (初期=非表示 → その他で出現)`,
        !ratingsOn || (surveyFreeInit === true && surveyFreeShown === true),
        `init_hidden=${surveyFreeInit} / shown_on_other=${surveyFreeShown}`);
      check(`[${label}] チュートリアル表示 (練習=あり / 本番=なし)`,
        practiceCoachSeen === true && mainCoachHidden === true,
        `practice=${practiceCoachSeen} / mainHidden=${mainCoachHidden}`);
      if (expectBlock !== "anchor")   // 文字2択の設問ステムは文節ブロック (.nb) 描画 (anchor はステムなし)。
        // 短い設問文 (「どちらが欲しいですか？」等) は文節1個=ブロック1個が正しいので >=1 で機構の存在を確認
        check(`[${label}] 設問ステムを文節ブロック (.nb) で描画`,
          stemBlocks != null && stemBlocks >= 1, `blocks=${stemBlocks}`);
      check(`[${label}] セッション完走 (done 到達)`,
        (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      const pdev = await cdp.eval("window.__pilot.buildPayload().device");
      check(`[${label}] 事後アンケート (1 項目 1 画面。2026-09-26): 評定ブロック=27項目（追加OFFは26）・最初は 1 / 19 の持ち方ページで次へ無効・埋めるまで完了不可 / anchor=拡充分なし (1 / 1)`,
        ratingsOn ? (postFilled === (pdev.collectionPlan.instructedEnabled ? 27 : 26) && postGateBefore === true && postHintBefore === "1 / 19|true|grip")
                  : (postFilled === 0 && postHintBefore === "1 / 1|true|grip"),
        `filled=${postFilled} gateBefore=${postGateBefore} hint=${postHintBefore}`);
      check(`[${label}] device.post 記録 (評定ブロックの全キーが回答済み・postMs>0 / anchor=null)`,
        ratingsOn ? (!!pdev.post && Object.keys(pdev.post).length === pdev.collectionPlan.postKeys.length && Object.values(pdev.post).every((v) => Array.isArray(v) ? v.length > 0 : v != null) && pdev.postMs > 0)
                  : (pdev.post === null),
        ratingsOn ? `keys=${pdev.post ? Object.keys(pdev.post).length : null} postMs=${pdev.postMs}` : `post=${pdev.post}`);
      return await cdp.eval("window.__pilot.buildPayload()");
    }

    if (process.argv.includes("--tutorial-smoke")) { await tutorialSmoke(); await tutorialStopSmoke(); console.log(failures === 0 ? "Tutorial smoke checks passed" : `${failures} checks failed`); cdp.close(); process.exitCode = failures ? 1 : 0; return; }
    await ratingProgressSmoke();
    if (process.argv.includes("--rating-progress")) { console.log(failures === 0 ? "Rating progress checks passed" : `${failures} checks failed`); cdp.close(); process.exitCode = failures ? 1 : 0; return; }

    // 本番の振り返りは直前の問題と同じ完了率を示す。評定の移動・見直し・再開では進めない。
    async function ratingProgressSmoke() {
      const url = BASE + "?block=moral&debug=1&upload=0&mic=0&devguard=0&readgate=0&minread=0&read=0&welcome=0&tut=0&rtut=0&practice=0&attn=0&instr=0&nmain=5";
      await cdp.eval("if (window.__pilot) window.__pilot.resetStoredForTest()").catch(() => {});
      await cdp.send("Page.navigate", { url }); await sleep(300);
      await waitPilot(); await fillSurvey(); await tap("goPractice"); await sleep(300);
      const state = () => cdp.eval(`(() => {
        const bar = document.getElementById('ratingProgress'), fill = document.getElementById('ratingProgressFill');
        return { screen: __pilot.activeScreen(), page: __pilot.ratPage(), shown: !!bar.getClientRects().length && getComputedStyle(bar).display !== 'none',
          task: document.getElementById('progressFill').style.width, rating: fill.style.width, trial: __pilot.trialIndex(), count: __pilot.recordCount() };
      })()`);
      check("[rating-progress] 本番の第1問は従来どおり完了率0%", await cdp.eval("document.getElementById('progress').classList.contains('on')&&document.getElementById('progressFill').style.width==='0%'"));
      await sleep(3000); await dragStartToChoice("left"); await sleep(250);
      const hesitation = await state();
      check("[rating-progress] 迷いは直前の問題と同じ割合・同じ完了数", hesitation.screen === "rating" && hesitation.shown && hesitation.page === 0 && hesitation.task === "0%" && hesitation.rating === hesitation.task && hesitation.trial === 0, JSON.stringify(hesitation));
      await tapSel("#qitem-hesitation .likert button:nth-child(2)"); await tap("ratingNext"); await sleep(80);
      const confidence = await state();
      check("[rating-progress] 自信へ移っても完了率・試行数を進めない", confidence.shown && confidence.page === 1 && confidence.rating === hesitation.rating && confidence.trial === hesitation.trial && confidence.count === hesitation.count, JSON.stringify(confidence));
      await tap("ratingBack"); await sleep(80); const back = await state();
      check("[rating-progress] 戻るでも同じ完了率と回答を保持", back.shown && back.page === 0 && back.rating === hesitation.rating && await cdp.eval("document.querySelector('#qitem-hesitation .likert button:nth-child(2)').classList.contains('sel')"), JSON.stringify(back));
      await tap("ratingHelp"); await sleep(150);
      check("[rating-progress] 振り返りの説明を見直している間はバーを隠す", !(await state()).shown && await cdp.eval("__pilot.helpState().rating.review"));
      await tap("ratingTutClose"); await sleep(150); const closed = await state();
      check("[rating-progress] 説明を閉じると同じ割合・完了数へ復帰", closed.shown && closed.page === 0 && closed.rating === hesitation.rating && closed.trial === hesitation.trial && closed.count === hesitation.count, JSON.stringify(closed));
      await tap("ratingNext"); await tapSel("#qitem-confidence .likert button:nth-child(2)"); await tap("ratingSubmit"); await sleep(400);
      if (await cdp.eval("__pilot.activeScreen()==='notice'")) { await tap("noticeGo"); await sleep(150); }
      check("[rating-progress] 振り返り確定後の次問で初めて完了率を1/5へ進める", await cdp.eval("__pilot.activeScreen()==='task'&&__pilot.trialIndex()===1&&document.getElementById('progressFill').style.width==='20%'"));
      await sleep(3000); await dragStartToChoice("right"); await sleep(250); const second = await state();
      check("[rating-progress] 次の振り返りも同じ分母・20%を表示", second.shown && second.rating === "20%" && second.rating === second.task && second.trial === 1, JSON.stringify(second));
      await tapSel("#qitem-hesitation .likert button:nth-child(3)"); await tap("ratingNext"); await sleep(80);
      await tapSel("#qitem-confidence .likert button:nth-child(4)");
      await cdp.eval("__pilot.recoveryCheckpoint()"); await cdp.send("Page.reload"); await sleep(400); await waitPilot();
      check("[rating-progress] 未確定の自信から再読込すると再開画面を提示", await cdp.eval("__pilot.activeScreen()==='resume'"));
      await tap("resumeGo"); await sleep(300); const resumed = await state();
      check("[rating-progress] 再開後も自信のページ・20%・完了数を保持", resumed.shown && resumed.page === 1 && resumed.rating === "20%" && resumed.trial === 1 && resumed.count === second.count, JSON.stringify(resumed));
      check("[rating-progress] 再開で迷いと自信の回答値を変えない", await cdp.eval("document.querySelector('#qitem-hesitation .likert button:nth-child(3)').classList.contains('sel')&&document.querySelector('#qitem-confidence .likert button:nth-child(4)').classList.contains('sel')"));
      for (const [w, h] of [[375, 700], [402, 759], [440, 811], [820, 1180], [375, 548]]) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await sleep(350);
        const geometry = await cdp.eval(`(() => { const p=document.getElementById('ratingProgress'), f=document.getElementById('ratingProgressFill'), b=p.getBoundingClientRect(), h=document.getElementById('ratingHelp').getBoundingClientRect();
          return { left:b.left, right:b.right, top:b.top, bottom:b.bottom, helpBottom:h.bottom, width:b.width, expected:innerWidth*.56, target:Math.max(innerHeight*.05+2,h.bottom+2),
            ratio:f.getBoundingClientRect().width/b.width, color:getComputedStyle(f).backgroundColor, vh:innerHeight }; })()`);
        check(`[rating-progress/${w}x${h}] 色と幅を共用し上部ヘルプに重ならず20%を表示`, geometry.left >= 0 && geometry.right <= w + 1 && geometry.top >= geometry.helpBottom + 1 && geometry.bottom <= geometry.vh && Math.abs(geometry.width - geometry.expected) < 2 && Math.abs(geometry.ratio - .2) < .02 && /18, 133, 90/.test(geometry.color), JSON.stringify(geometry));
      }
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 800, deviceScaleFactor: 2, mobile: true });
      await cdp.eval("__pilot.resetStoredForTest()");
      await cdp.send("Page.navigate", { url: BASE + "?block=moral&debug=1&upload=0&mic=0&devguard=0&go=rating" }); await sleep(300); await waitPilot();
      check("[rating-progress] 例題と練習の通常振り返りにはバーを出さない", !(await state()).shown && await cdp.eval("__pilot.phase()==='practice'"));
      await cdp.send("Page.navigate", { url: BASE + "?block=moral&debug=1&upload=0&mic=0&devguard=0&go=rtut" }); await sleep(300); await waitPilot();
      check("[rating-progress] 初回の振り返りの説明にもバーを出さない", !(await state()).shown && await cdp.eval("__pilot.ratTut()"));
      await cdp.eval("__pilot.resetStoredForTest()");
    }

    // ============================================================
    //  ① anchor ブロック (評定OFF。Stage 1 回帰)
    // ============================================================
    {
      const payload = await runSession("anchor", ANCHOR_URL, "anchor", false);
      const dev = payload.device || {};
      check("[anchor] device.block 記録", dev.block === "anchor", `block=${dev.block}`);
      check("[anchor] 事前アンケート記録",
        dev.participantId === "tester" && dev.age === 23 && dev.deviceModel === "iPhone 14" &&
        dev.sex === "female" && dev.handedness === "right");
      check("[anchor] 事後アンケート記録 (grip)", dev.grip === "right_thumb", `grip=${dev.grip}`);
      check("[anchor] 使いにくさアンケートなし (survey=null / 評定ブロックのみ)",
        dev.survey == null, `survey=${JSON.stringify(dev.survey)}`);
      check("[anchor] 匿名 client UUID 記録",
        typeof dev.clientId === "string" && dev.clientId.length >= 8);
      const main = payload.trials.filter((t) => t.phase === "main");
      const prac = payload.trials.filter((t) => t.phase === "practice");
      // 2026-09-05: 練習は「キュー完走 (practiceTrials 問) かつ ゲート達成」で終了する仕様
      check("[anchor] 記録試行数 (練習=practiceTrials 6問完走 / 本番12)",
        prac.length === 6 && main.length === 12,
        `total=${payload.trials.length} / practice=${prac.length} / main=${main.length}`);
      check("[anchor] 行動ゲート: 不正解で streak リセット後、正解3連続で解錠 (以降も練習は完走)",
        prac.length >= 4 && prac[0].correct === false && prac.slice(1, 4).every((t) => t.correct === true));
      check("[anchor] 無効試行のコーチング経路 (練習1試行目に aborts=1)",
        prac.length > 0 && prac[0].aborts === 1, `aborts=${prac[0] && prac[0].aborts}`);
      const ps = dev.practiceSummary || {};
      check("[anchor] practiceSummary 記録 (gate 3・正誤あり・練習6・abort1)",
        ps.gateStreak === 3 && ps.gateCorrect === true && ps.trials === 6 &&
        ps.aborts === 1 && ps.skipped === false,
        JSON.stringify(ps));
      check("[anchor] stimulusType=numeric-size", main.every((t) => t.stimulusType === "numeric-size"));
      check("[anchor] congruency メタ", main.every((t) => t.congruency && t.pairLabel));
      check("[anchor] 全 main にイベント列", main.every((t) => t.events.length >= 3));
      check("[anchor] 全 main に geom", main.every((t) => t.geom && t.geom.A && t.geom.B));
      check("[anchor] dispHz 記録", main.every((t) => t.dispHz == null || t.dispHz > 0));
      check("[anchor] choiceSide/correct 記録", main.every((t) => t.choiceSide != null && t.correct != null));
      check("[anchor] 評定なし (ratings 未入力)",
        main.every((t) => !t.ratings || t.ratings.confidence == null));
      check("[anchor] mic=0: device.mic.mode=off・noise=null",
        dev.mic && dev.mic.mode === "off" && main.every((t) => t.noise === null),
        JSON.stringify(dev.mic));
    }

    // (② value ブロックの単体セッションは 2026-09-10 に削除: ②は 2026-07-29 に廃止。`?block=value` の残置コードは検証しない)

    // ============================================================
    //  ③ moral ブロック (道徳ジレンマ・評定ON。Stage 2)
    // ============================================================
    {
      // ③only 本番構成: moral 49問 + 弱DQS4 (埋め込み。2026-09-26 に 2→4) + 末尾 attn2 (infreq+IMC)。attn は評定ブロックを含むため既定ON (2026-08-23)。
      const payload = await runSession("moral", MORAL_URL, "moral", true);
      const dev = payload.device || {};
      check("[moral] device.block 記録 (③only=moral 単体)", dev.block === "moral", `block=${dev.block}`);
      check("[moral] seq 記録 (moral のみ。確認 2 問は本番の末尾に含める。2026-09-30)",
        Array.isArray(dev.seq) && dev.seq.join(",") === "moral", `seq=${(dev.seq || []).join(",")}`);
      const main = payload.trials.filter((t) => t.phase === "main");
      const prac = payload.trials.filter((t) => t.phase === "practice");
      const mReal = main.filter((t) => t.block === "moral" && !t.isCheck);   // 本番49 (isCheck 除く)
      const mDqs = main.filter((t) => t.block === "moral" && t.isCheck === "dqs");
      const aMain = main.filter((t) => t.isCheck === "infreq" || t.isCheck === "imc");   // 本番の最後の 2 問 (2026-09-30)
      check("[moral] 本番試行数 = 49 (練習5 / 弱DQS4 / 末尾attn2 は別)",
        prac.length === 5 && mReal.length === 49,
        `total=${payload.trials.length} / practice=${prac.length} / moralReal=${mReal.length} / dqs=${mDqs.length} / attn=${aMain.length}`);
      check("[moral] 練習にも評定リハーサル記録 (2項目)",
        prac.length > 0 && prac.every((t) => t.ratings &&
          [t.ratings.confidence, t.ratings.hesitation].every((r) => r && r.value >= 1 && r.value <= 5)));
      check("[moral] 振り返りの説明 完遂 (completed+4枚・例題後)",
        dev.ratingTutorial && dev.ratingTutorial.completed === true && dev.ratingTutorial.pages === 4 &&
        dev.ratingTutorial.changed === true,
        JSON.stringify(dev.ratingTutorial));
      check("[moral] 振り返り導入1/4は回答・質問なし → 迷い2/4は選択するまで進めない",
        tutorialStates && tutorialStates.p0 && /1 \/ 4/.test(tutorialStates.p0.step || "") && tutorialStates.p0.page === 0 && tutorialStates.p0.nextEnabled === true &&
        tutorialStates.p0.noAnswer && tutorialStates.p0.noQuestion && tutorialStates.p0.rowCueOff === true && tutorialStates.p0.afterPage === 0 && /2 \/ 4/.test(tutorialStates.p0.afterStep || "") && tutorialStates.p0.nextDisabledAfter === true,
        JSON.stringify(tutorialStates && tutorialStates.p0));
      check("[moral] 評定チュートリアルは5択を強調し、戻っても値を保持する。説明は例題後の1回のみ",
        tutorialStates && tutorialStates.p2 && tutorialStates.p2.confShown === true &&
        tutorialStates.p2.spotOn === false &&
        tutorialStates.p2Sel && tutorialStates.p2Sel.submitEnabled === true && tutSeenCount === 1,
        `seen=${tutSeenCount} / p2=${JSON.stringify(tutorialStates && tutorialStates.p2)}`);
      check("[moral] 振り返り4/4は採用した全文 → 練習導入は番号なし・次へで既存5問へ",
        tutorialStates && tutorialStates.p3 && /4 \/ 4/.test(tutorialStates.p3.step) && tutorialStates.p3.title === "1問ずつ考え直す" &&
        tutorialStates.p3.copy === "感じ方は問題によって変わります。前の問題の選択に引きずられず、その問題で感じたものに近いものをその都度選んでください。" && tutorialStates.p3.button === "練習問題へ" && tutorialStates.p3.noQuestion &&
        tutorialStates.practiceIntro && tutorialStates.practiceIntro.text === "ここから5問、練習問題に回答します。" &&
        !tutorialStates.practiceIntro.numbered && tutorialStates.practiceIntro.button === "次へ",
        JSON.stringify({ finish: tutorialStates && tutorialStates.p3, intro: tutorialStates && tutorialStates.practiceIntro }));
      check("[moral] stimulusType=text-choice", mReal.every((t) => t.stimulusType === "text-choice"));
      check("[moral] 文字2択ラベル", mReal.every((t) => t.leftLabel && t.rightLabel));
      check("[moral] 場面文ステム", mReal.every((t) => typeof t.stem === "string" && t.stem.length > 0));
      check("[moral] 7類型そろう (sacrifice/honesty/loyalty/care/promise/autonomy/privacy)",
        new Set(mReal.map((t) => t.moralType)).size === 7,
        `types=${[...new Set(mReal.map((t) => t.moralType))].join(",")}`);
      check("[moral] 各類型が明確1・中間2・拮抗4 (計7問)",
        ["sacrifice","honesty","loyalty","care","promise","autonomy","privacy"].every((mt) => {
          const g = mReal.filter((t) => t.moralType === mt);
          return g.filter((t) => t.conflictLevel === "clear").length === 1 &&
                 g.filter((t) => t.conflictLevel === "mid").length === 2 &&
                 g.filter((t) => t.conflictLevel === "conflict").length === 4;
        }),
        `counts=${["sacrifice","honesty","loyalty","care","promise","autonomy","privacy"].map((mt)=>mt+":"+mReal.filter((t)=>t.moralType===mt).length).join(" ")}`);
      check("[moral] 葛藤3水準そろう (clear7/mid14/conflict28)",
        mReal.filter((t) => t.conflictLevel === "clear").length === 7 &&
        mReal.filter((t) => t.conflictLevel === "mid").length === 14 &&
        mReal.filter((t) => t.conflictLevel === "conflict").length === 28,
        `levels=${["clear","mid","conflict"].map((lv)=>lv+":"+mReal.filter((t)=>t.conflictLevel===lv).length).join(" ")}`);
      check("[moral] 構造タグ記録 (weight/escape/split, 全 本番)",
        mReal.every((t) => t.tags && t.tags.weight && t.tags.escape && t.tags.split));
      check("[moral] itemId 一意 (49問)",
        new Set(mReal.map((t) => t.itemId)).size === 49);
      check("[moral] 明確のみ betterSide 定義 / 中・拮抗は null",
        mReal.filter((t) => t.conflictLevel === "clear").every((t) => t.betterSide === "left" || t.betterSide === "right") &&
        mReal.filter((t) => t.conflictLevel !== "clear").every((t) => t.betterSide == null));
      check("[moral] 左右CB: 明確の betterSide が左右両方",
        new Set(mReal.filter((t) => t.conflictLevel === "clear").map((t) => t.betterSide)).size === 2);
      check("[moral] 規範整合 correct (明確 true/false, 中・拮抗 null)",
        mReal.filter((t) => t.conflictLevel === "clear").every((t) => typeof t.correct === "boolean") &&
        mReal.filter((t) => t.conflictLevel !== "clear").every((t) => t.correct === null));
      check("[moral] 全 本番に2項目評定 (1–5)・difficulty なし (2026-07-15 改訂)",
        mReal.every((t) => t.ratings && t.ratings.difficulty === undefined && [t.ratings.confidence, t.ratings.hesitation]
          .every((r) => r && r.value >= 1 && r.value <= 5)));
      check("[moral] 評定の所要時間 ratingSubmitMs 記録",
        mReal.every((t) => typeof t.ratingSubmitMs === "number" && t.ratingSubmitMs >= 0));
      check("[moral] ⑤弱DQS4問 (指示側 左右 2:2・10/23/31/42 問目) + 本番の最後の 2 問 = infreq+IMC (振り返りあり・index 54/55。2026-09-30)",
        mDqs.length === 4 && mDqs.filter((t) => t.checkAnswerSide === "left").length === 2 &&
        mDqs.map((t) => t.index).every((ix, k) => { const p0 = Math.floor((mReal.length + 4) * (k + 1) / 5) - 1; return ix === (p0 % 20 === 0 ? p0 + 2 : p0) + 1; }) &&   // 49 問 → 10・23・31・42 問目 (21 は休憩直後なので 23)
        aMain.length === 2 && new Set(aMain.map((t) => t.isCheck)).size === 2 &&
        aMain.map((t) => t.index).sort().join(",") === "54,55" && aMain.every((t) => t.ratings && t.ratings.confidence && t.ratings.confidence.value >= 1),
        `dqs=${mDqs.length} attn=[${aMain.map((t)=>t.isCheck).join(",")}]`);
      check("[moral] 弱DQS直後の本試行に post_check フラグ",
        main.some((t) => t.post_check === true));
      check("[moral] ⑤ check 試行に correct (注意して回答できたか) が記録・デブリーフィング表示 (欺瞞の種明かし)",
        [...mDqs, ...aMain].every((t) => typeof t.correct === "boolean") &&
        (await cdp.eval(`document.getElementById('debrief').style.display !== 'none'`)));
      check("[moral] 事後アンケート記録 (survey)",
        dev.survey && Array.isArray(dev.survey.problems) && dev.survey.ease === "ok",
        JSON.stringify(dev.survey));
      check("[moral] 全 本番にイベント列 + geom",
        mReal.every((t) => t.events.length >= 3 && t.geom && t.geom.A && t.geom.B));
      check("[moral] 読速ベースライン記録 (③落選場面4本+charsPerSec。§6-6 項13・2026-09-09)",
        dev.readingBaseline && Array.isArray(dev.readingBaseline.trials) &&
        dev.readingBaseline.trials.length === 4 &&
        dev.readingBaseline.trials.every((t) => t.chars > 0 && t.ms > 0) &&
        dev.readingBaseline.charsPerSec > 0,
        JSON.stringify(dev.readingBaseline));
      check("[moral] 開始手続きの記録 (全本番に preStartMs>=0・startPressT=revealT・reveal イベント・rt_ms・lateStart・stopsAfterInit。device.startMode='press'。2026-09-26)",
        dev.startMode === "press" && mReal.every((t) => typeof t.preStartMs === "number" && t.preStartMs >= 0 && typeof t.startPressT === "number" &&
          t.revealT === t.startPressT && t.events.some((e) => e.type === "reveal") && typeof t.rt_ms === "number" && t.rt_ms >= 0 && typeof t.lateStart === "boolean" &&
          t.stopsAfterInit && typeof t.stopsAfterInit.maxMs === "number" && typeof t.stopFlag === "boolean"),
        JSON.stringify(mReal[0] && { pre: mReal[0].preStartMs, reveal: mReal[0].revealT, rt: mReal[0].rt_ms, stops: mReal[0].stopsAfterInit }));
      {   // 教示誘導ブロック (careless GT 候補 A。2026-09-09 §6-6 項19): ⑤の後に 10 問・評定なし・本番で答えた項目の再提示
        const ins = payload.trials.filter((t) => t.phase === "instructed");
        const lastMainIdx = payload.trials.map((t) => t.phase).lastIndexOf("main"), firstInsIdx = payload.trials.findIndex((t) => t.phase === "instructed");
        const mainIds = new Set(mReal.map((t) => t.itemId));
        check("[post_resume] 再開しない完走では本番・追加とも全回答false", [...mReal, ...ins].every(t => t.post_resume === false));
        check("[moral] 教示誘導ブロック: 10 問・isInstructed・評定 null・⑤ (attn) の後・本番の項目を再提示・device.instructed",
          ins.length === 10 && ins.every((t) => t.isInstructed === true && t.ratings && t.ratings.hesitation == null && t.ratings.confidence == null && mainIds.has(t.itemId)) &&
          firstInsIdx > lastMainIdx && dev.instructed && dev.instructed.n === 10 && dev.instructed.itemIds.length === 10 && /読まずに/.test(dev.instructed.text),
          JSON.stringify({ n: ins.length, first: firstInsIdx, lastMain: lastMainIdx, dev: dev.instructed && dev.instructed.n }));
        const lv = ins.reduce((m, t) => (m[t.conflictLevel] = (m[t.conflictLevel] || 0) + 1, m), {});
        check("[moral] 教示誘導ブロックの水準 (明確1・中間3・拮抗6。2026-09-26 後刻)", lv.clear === 1 && lv.mid === 3 && lv.conflict === 6, JSON.stringify(lv));
      }
      check("[moral] 休憩ログ (breakEvery=20 → 20/40 の2回・末尾は残セグメント<20で省略・dwellMs 記録。2026-09-27)",
        Array.isArray(dev.breaks) && dev.breaks.length === 2 &&
        dev.breaks.every((b) => b.block === "moral" && b.dwellMs >= 0) &&
        dev.breaks.map((b) => b.atTrial).join(",") === "20,40",
        JSON.stringify(dev.breaks));
    }

    // (②③統合 combo セッションは 2026-09-10 に削除: 本番構成は③のみ。⑤注意チェックの検証は③セッションで行う)

    // ============================================================
    //  環境音モニタリング (?mic=mock。§6-6 項10: 事前チェック→試行記録→評定送信後ゲート→切断再取得)
    // ============================================================
    {
      console.log("\n--- mic (mock) ---");
      // micchk/micquiet/micover はテスト用に短縮 (実運用の既定値は index.html 側で事前固定)
      const url = BASE + "?devguard=0&minread=0&readgate=0&block=moral&reps=1&nmain=8&attn=0&instr=0&rtut=0&read=0&debug=1&upload=0&mic=mock&micchk=400&micquiet=300&micover=200&tut=0";   // read=0: ③は読速画面があるので省く   // 2026-09-10: ③ 8 問に短縮 (旧 value 24 問)
      await cdp.send("Page.navigate", { url });
      for (let i = 0; i < 50; i++) {
        if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break;
        await sleep(200);
      }
      check("[mic] mic モード = mock", (await cdp.eval("window.__pilot.micMode()")) === "mock");
      await fillSurvey();
      await tap("goPractice");
      await sleep(250);
      check("[mic] 開始で環境音チェック画面 (micgate) へ",
        (await cdp.eval("window.__pilot.activeScreen()")) === "micgate");
      // 騒音環境で計測 → 進行ブロック (再計測ループ)
      await cdp.eval("window.__pilot.setMicLevel(-20)");
      await tap("micgateStart");
      await sleep(1000);   // micchk=400 + tick 余裕
      check("[mic] 騒音時は通過不可 (再計測ボタンのみ)",
        (await cdp.eval("document.getElementById('micgateGo').style.display")) === "none" &&
        (await cdp.eval("document.getElementById('micgateStart').style.display")) !== "none");
      // 静音にして再計測 → 通過
      await cdp.eval("window.__pilot.setMicLevel(-60)");
      await tap("micgateStart");
      await sleep(1000);
      check("[mic] 静音で通過 (進むボタン出現・ambientDb 記録)",
        (await cdp.eval("document.getElementById('micgateGo').style.display")) !== "none" &&
        (await cdp.eval("window.__pilot.micState().ambientDb")) === -60);
      await tap("micgateGo");
      await sleep(300);
      check("[mic] チェック通過後に練習開始", (await cdp.eval("window.__pilot.activeScreen()")) === "task");

      // 本番1試行目を騒音下で実施 → 評定送信後に noisegate (持続静音で解錠)。
      // ゲート通過後の試行で切断 (dropMic) → その試行の評定送信後に micgate 再取得。
      let noisySet = false, dropInjected = false, reacqSeen = false;
      let gateSeen = false, gateBlockedWhileLoud = null, gateOpenAfterQuiet = null;
      let dragCount = 0;
      for (let guard = 0; guard < 450; guard++) {
        const screen = await cdp.eval("window.__pilot.activeScreen()");
        if (screen === "done") break;
        if (screen === "noisegate") {
          if (!gateSeen) {
            gateSeen = true;
            await sleep(400);   // 騒音のまま: 解錠されないことを確認
            gateBlockedWhileLoud = (await cdp.eval("document.getElementById('noisegateGo').style.display")) === "none";
            await cdp.eval("window.__pilot.setMicLevel(-60)");   // 静音化 → micquiet=300 の持続後に解錠
            for (let w = 0; w < 20; w++) {
              if ((await cdp.eval("document.getElementById('noisegateGo').style.display")) !== "none") break;
              await sleep(150);
            }
            gateOpenAfterQuiet = (await cdp.eval("document.getElementById('noisegateGo').style.display")) !== "none";
          }
          await tap("noisegateGo");
          await sleep(200);
        } else if (screen === "micgate") {
          reacqSeen = true;   // 切断後の再取得画面 (mock は即再取得成功)
          await tap("micgateStart");
          await sleep(300);
        } else if (screen === "blockintro") {
          await tap("blockintroGo");   // 練習クリア画面 → 本番へ (自己ペース遷移)
          await sleep(300);
        } else if (screen === "notice") {
          await tap("noticeGo");       // 早出し/停止の案内画面 (2026-09-09)
          await sleep(200);
        } else if (screen === "rating") {
          await fillRatings();
          await sleep(60);
          await tap("ratingSubmit");
          await sleep(150);
        } else if (screen === "postq") {
          await tapSel('#gripSeg button[data-val="right_thumb"]');
          await sleep(60);
          await tapSel('#surveyProblems button[data-val="none1"]');
          await tapSel('#surveyProblems button[data-val="none2"]');
          await tapSel('#surveyProblems button[data-val="none3"]');
          await tapSel('#surveyEaseSeg button[data-val="ok"]');
          await fillPost();
          await sleep(60);
          await tap("postSubmit");
          await sleep(250);
        } else if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
          const inMain = (await cdp.eval("window.__pilot.phase()")) === "main";
          if (inMain && !noisySet) {          // 本番1試行目: 騒音下で実施
            noisySet = true;
            await cdp.eval("window.__pilot.setMicLevel(-15)");
          } else if (inMain && gateSeen && !dropInjected) {   // ゲート通過後の試行で切断を注入
            dropInjected = true;
            await cdp.eval("window.__pilot.dropMic()");
          }
          await dragStartToChoice(dragCount % 2 === 0 ? "left" : "right");
          dragCount++;
          await sleep(150);
        } else { await sleep(150); }
      }
      check("[mic] セッション完走 (done 到達)",
        (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      check("[mic] 評定送信後ノイズゲート (騒音中ブロック → 持続静音で解錠)",
        gateSeen && gateBlockedWhileLoud === true && gateOpenAfterQuiet === true,
        `seen=${gateSeen} blocked=${gateBlockedWhileLoud} open=${gateOpenAfterQuiet}`);
      check("[mic] 切断 → 試行境界で再取得画面を経由", dropInjected && reacqSeen);
      const payload = await cdp.eval("window.__pilot.buildPayload()");
      const dev = payload.device || {};
      check("[mic] device.mic 記録 (mode/threshold/ambientDb/ambientRetries/drops)",
        dev.mic && dev.mic.mode === "mock" && dev.mic.threshold === -35 &&
        dev.mic.ambientDb === -60 && dev.mic.ambientRetries === 1 && dev.mic.drops === 1,
        JSON.stringify(dev.mic));
      const main = payload.trials.filter((t) => t.phase === "main");
      check("[mic] 全 main に noise 要約 (切断中の試行のみ n=0 可)",
        main.every((t) => t.noise && typeof t.noise.overMs === "number") &&
        main.filter((t) => t.noise.n > 0).length >= main.length - 1,
        `n0=${main.filter((t) => t.noise && t.noise.n === 0).length}`);
      const noisy = main.filter((t) => t.noise && t.noise.overMs >= 200);
      check("[mic] 騒音試行に overMs + noisePause {durationMs, retries} 記録",
        noisy.length >= 1 && noisy.some((t) => t.noisePause && t.noisePause.durationMs > 0 &&
          typeof t.noisePause.retries === "number"),
        `noisy=${noisy.length}`);
    }

    // ============================================================
    //  チェックポイント復旧 / 横向きガード (直前 = 環境音セッションの後始末で検証)
    // ============================================================
    check("完了時にチェックポイント保持 (未回収)", await cdp.eval("window.__pilot.hasBackup()"));
    const completedCode = await cdp.eval("window.__pilot.buildPayload().device.completionCode");
    await cdp.send("Page.reload");
    await sleep(800);
    check("完了後のリロードで同じ完了コードを復元",
      await cdp.eval("window.__pilot.activeScreen()==='done'") && await cdp.eval("window.__pilot.buildPayload().device.completionCode") === completedCode);
    await cdp.eval("window.__pilot.resetStoredForTest()");
    await cdp.send("Page.navigate", { url: MORAL_URL }); await sleep(300);
    check("検証用データの消去後は新規回答の画面", await cdp.eval("!window.__pilot.hasBackup()"));

    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 800, height: 400, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: "landscapePrimary", angle: 90 } });
    await sleep(400);
    check("landscape でガード表示",
      await cdp.eval("document.getElementById('rotateGuard').classList.contains('show')"));
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 400, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    check("portrait 復帰でガード消滅",
      !(await cdp.eval("document.getElementById('rotateGuard').classList.contains('show')")));
    // 文字サイズ・ページ拡大のガード (2026-09-12 夜): 100% では出ない → 画面幅 375 のまま CSS px 幅を 300 に (= 125% 拡大) で出る → 戻すと消える
    const z0 = await cdp.eval("window.__pilot.measureZoom()");
    check("[zoom] 100% ではガードが出ない (pageZoom≈1・textZoom≈1)", !(await cdp.eval("window.__pilot.zoomGuard()")) && Math.abs(z0.pageZoom - 1) <= 0.03 && Math.abs(z0.textZoom - 1) <= 0.03, JSON.stringify(z0));
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 300, height: 640, deviceScaleFactor: 2, mobile: true, screenWidth: 375, screenHeight: 800 });
    await sleep(400);
    const z1 = await cdp.eval("window.__pilot.measureZoom()");
    check("[zoom] ページ拡大 125% 相当 (screen 375 / innerWidth 300) でガードが出る", (await cdp.eval("window.__pilot.zoomGuard()")) && Math.abs(z1.pageZoom - 1.25) < 0.02, JSON.stringify(z1));
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(400);
    check("[zoom] 100% に戻すとガードが消える", !(await cdp.eval("window.__pilot.zoomGuard()")));

    // ===== 説明の途中で「終了」(2026-09-12): 確認画面では説明を隠す・「続ける」で同じページに戻る・「終了する」で説明が畳まれる・取り消しで最初から =====
    async function tutorialStopSmoke() {
      console.log("\n--- tutorial + stop (説明の途中で終了) ---");
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=0&reps=1&stop=1&rtut=0" });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await fillSurvey();
      await tap("goPractice"); await sleep(300);
      for (let g = 0; g < 20; g++) { const s = await cdp.eval("window.__pilot.activeScreen()"); if (s === "task") break; if (s === "reading") { await tap("readDone"); await sleep(450); } else await sleep(150); }
      await sleep(450);
      const popVis = () => cdp.eval("getComputedStyle(document.getElementById('tutPop')).display !== 'none'");
      const stepTxt = () => cdp.eval("(document.getElementById('tutPopStep') || {}).textContent");
      const s0 = await cdp.eval("window.__pilot.activeScreen()"), v0 = await popVis();
      await tap("stopBtn"); await sleep(250);
      const s1 = await cdp.eval("window.__pilot.activeScreen()"), v1 = await popVis();
      check("[tut/stop] 画面の見方で「終了」→ 確認画面では説明ボックスが隠れる", s0 === "task" && v0 === true && s1 === "stopconfirm" && v1 === false, JSON.stringify({ s0, v0, s1, v1 }));
      await tap("stopBack"); await sleep(250);
      const s2 = await cdp.eval("window.__pilot.activeScreen()"), v2 = await popVis(), st2 = await stepTxt();
      check("[tut/stop] 「続ける」で同じ説明ページに戻る (説明ボックスが再表示)", s2 === "task" && v2 === true && await cdp.eval("window.__pilot.helpState().drag.stepId==='layout-intro'"), JSON.stringify({ s2, v2, st2 }));
      await tap("stopBtn"); await sleep(250); await tap("stopGo"); await sleep(300);
      const s3 = await cdp.eval("window.__pilot.activeScreen()"), v3 = await popVis();
      check("[tut/stop] 「終了する」で説明が畳まれて最後の質問画面へ (説明ボックスが残らない)", s3 === "postq" && v3 === false, JSON.stringify({ s3, v3 }));
      const back = await cdp.eval("document.getElementById('postBack').style.display !== 'none'");
      await tap("postBack"); await sleep(700);
      const s4 = await cdp.eval("window.__pilot.activeScreen()"), v4 = await popVis(), st4 = await stepTxt();
      check("[tut/stop] 取り消しで説明の最初から再開", back === true && s4 === "task" && v4 === true && await cdp.eval("window.__pilot.helpState().drag.stepId==='layout-intro'"), JSON.stringify({ back, s4, v4, st4 }));
    }
    // ===== ドラッグ導入チュートリアル (§6-6 項14) の smoke: tut ON で ①②③ → 練習への引き渡しを検証 =====
    async function tutorialSmoke() {
      console.log("\n--- tutorial smoke (drag intro ①②③) ---");
      await cdp.send("Emulation.setDeviceMetricsOverride", {width:375,height:700,screenWidth:375,screenHeight:812,deviceScaleFactor:1,mobile:true});
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=0&reps=1" });   // tut は既定ON
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await fillSurvey();
      await tap("goPractice"); await sleep(300);
      for (let g = 0; g < 20; g++) {   // 読速ベースラインを通過して task (チュートリアル) へ
        const s = await cdp.eval("window.__pilot.activeScreen()");
        if (s === "task") break;
        if (s === "reading") { await tap("readDone"); await sleep(450); } else await sleep(150);
      }
      await sleep(450);   // スポットライトの .on 適用 (rAF+350ms) を待つ
      check("[tut] 画面の見方の導入は説明だけ・初回は閉じられない", await cdp.eval("window.__pilot.helpState().drag.stepId==='layout-intro'&&getComputedStyle(start).visibility==='hidden'&&document.getElementById('tutClose').classList.contains('hidden')"));
      for (let guard=0;guard<32;guard++) {
        const st=await cdp.eval("window.__pilot.helpState().drag");if(st.index<0)break;
        const key=st.stepId;
        if(key==='layout-stem')check('[tut] 問題文の説明はスタート・選択肢を隠す',await cdp.eval("['start','choiceA','choiceB'].every(id=>getComputedStyle(document.getElementById(id)).visibility==='hidden')"));
        if(key==='layout-start')check('[tut] スタートの役割と選択肢の出現を説明',await cdp.eval("document.getElementById('tutPopTxt').textContent.includes('指を置くと、選択肢が現れます')"));
        if(key==='motor-route')check('[tut] 全体の見本と道すじの自由を先に見せる',await cdp.eval("document.getElementById('tutExtra').textContent.includes('道すじは自由')&&document.getElementById('tutDemo').getClientRects().length>0"));
        if(key==='motor-range')check('[tut] 枠内で離す場所は拡大図で示す',await cdp.eval("document.getElementById('tutRangeTarget').getClientRects().length>0&&document.getElementById('tutPopTxt').textContent.includes('枠内ならどこでも')"));
        if(key==='motor') {
          check('[tut] 純操作は成功前に次へ進めない',await cdp.eval("document.getElementById('tutPopNext').disabled"));
          const ps=await cdp.eval("['start','tutSingleTarget'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})");
          await touch('touchStart',[ps[0]]);for(let i=1;i<=20;i++){await touch('touchMove',[{x:ps[0].x+(ps[1].x-ps[0].x)*i/20,y:ps[0].y+(ps[1].y-ps[0].y)*i/20}]);await sleep(14);}await touch('touchEnd',[]);await sleep(400);
          check('[tut] 自分で運ぶ成功を保持し、実回答の記録にはしない',await cdp.eval("window.__pilot.helpState().drag.handsDone&&!document.getElementById('tutPopNext').disabled&&window.__pilot.recordCount()===0"));
        }
        if(key==='rule-check'){
          const i=st.quiz.index,answer=await cdp.eval('PILOT_GUIDED_TUTORIAL.checks['+i+'].correctIndex');
          await tapSel('#tutQuiz button[data-answer-index="'+((answer+1)%3)+'"]');
          check('[tut] 復習'+(i+1)+'は誤答のまま進めない',await cdp.eval("document.getElementById('tutPopNext').disabled"));
          await tapSel('#tutQuiz button[data-answer-index="'+answer+'"]');
          check('[tut] 復習'+(i+1)+'の正答と履歴を保持',await cdp.eval('window.__pilot.helpState().drag.quiz.passed['+i+']&&!document.getElementById("tutPopNext").disabled'));
        }
        await tap('tutPopNext');await sleep(400);
      }
      check('[tut] 操作と7問の復習完了後に番号なしの例題導入',await cdp.eval("window.__pilot.activeScreen()==='guidedintro'&&window.__pilot.buildPayload().device.guidedTutorial.completed"));
      await tap('guidedIntroGo');await sleep(550);
      const intro=await cdp.eval("({screen:window.__pilot.activeScreen(),phase:window.__pilot.phase(),counter:counter.textContent,banner:document.getElementById('phaseBanner').textContent})");
      check('[tut] 例題導入から元の例題1問へ接続',intro.screen==='task'&&intro.phase==='practice'&&intro.counter===''&&intro.banner==='では、1問やってみましょう',JSON.stringify(intro));
      await sleep(2500);
      const coachState = () => cdp.eval(`(() => { const c = document.getElementById('coach'); const r = c.getBoundingClientRect();
        return { cls: c.className, text: (c.textContent || '').slice(0, 24), top: Math.round(r.top), bottom: Math.round(r.bottom),
          choiceVis: getComputedStyle(document.getElementById('choiceA')).visibility,
          choiceBottom: Math.round(document.getElementById('choiceA').getBoundingClientRect().bottom),
          startTop: Math.round(document.getElementById('start').getBoundingClientRect().top) }; })()`);
      const c1 = await coachState();
      check("[practice] (チュートリアル試行) START 案内が選択肢と START の間に出ている", /pos-gap/.test(c1.cls) && /スタート/.test(c1.text), JSON.stringify(c1));
      const g0 = await cdp.eval(`(() => { const r = document.getElementById('start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await touch("touchStart", [{ x: g0.x, y: g0.y }]); await sleep(120);
      const c2 = await coachState();
      check("[practice] START を押した時点で START 案内は消える", c2.cls === "" && c2.text === "", JSON.stringify(c2));
      for (let i = 1; i <= 8; i++) { await touch("touchMove", [{ x: g0.x, y: g0.y - i * 30 }]); await sleep(14); }   // START を出て箱の外で離す
      await touch("touchEnd", []); await sleep(250);
      const c3 = await coachState();
      check("[practice] 選択肢の外で離す → 「選択肢のボックスの中で…」が選択肢と START の間に出て、選択肢の枠は消えない",
        /pos-gap/.test(c3.cls) && /選択肢のボックスの中で/.test(c3.text) && c3.top >= c3.choiceBottom - 2 && c3.bottom <= c3.startTop + 2 && c3.choiceVis === "visible", JSON.stringify(c3));
      await touch("touchStart", [{ x: g0.x, y: g0.y }]); await sleep(80);
      const c4 = await coachState();
      check("[practice] 案内は START を押している間は残る", /pos-gap/.test(c4.cls), JSON.stringify(c4));
      for (let i = 1; i <= 4; i++) { await touch("touchMove", [{ x: g0.x, y: g0.y - i * 30 }]); await sleep(14); }
      const c5 = await coachState();
      check("[practice] START を出た時点で案内が消える", c5.cls === "" && c5.text === "", JSON.stringify(c5));
      await touch("touchEnd", []); await sleep(300);
      // 例の試行を運び終える → 評定チュートリアル (2ページ) → 確定 → 最初の練習で帯と「練習 1 / 5」
      await dragStartToChoice("right"); await sleep(600);
      const rt = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), step: (document.getElementById('tutStepLabel') || {}).textContent,
        stem: (document.getElementById('stem').textContent || '').slice(0, 14) }))()`);
      check("[tut] 例題を操作すると振り返りの説明へ (1/4 = 導入)", rt.screen === "rating" && /1 \/ 4/.test(rt.step || ""), JSON.stringify(rt));
      const hesB = "document.querySelectorAll('#ratingItems .qitem')[0].querySelectorAll('.likert button')";    // 1 項目 1 画面: 迷い → 次へ → 自信 (2026-09-08)
      const confB = "document.querySelectorAll('#ratingItems .qitem')[1].querySelectorAll('.likert button')";
      await sleep(350);
      await tap("ratingNext"); await sleep(400);                                  // 導入 → 迷いのページ (2026-09-12 後刻)
      await cdp.eval(`(() => { ${hesB}[3].click(); })()`); await sleep(150);    // 1つ目=迷い
      await tap("ratingNext"); await sleep(400);
      await cdp.eval(`(() => { ${confB}[1].click(); })()`); await sleep(150);   // 2つ目=自信
      await tap("ratingSubmit"); await sleep(700);
      await tap("ratingSubmit"); await sleep(400);   // 4/4 → 番号なしの練習導入
      await tap("ratingSubmit"); await sleep(400);   // 練習導入 → 既存5問
      const p1 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), phase: document.getElementById('phaseLabel').textContent,
        counter: document.getElementById('counter').textContent, head: document.getElementById('ratingHead').textContent,
        banner: (() => { const b = document.getElementById('phaseBanner'); return b && !b.classList.contains('hidden') ? b.textContent : ''; })(),
        tutorialRec: window.__pilot.buildPayload().trials.filter((t) => t.phase === 'tutorial').length,
        practiceRec: window.__pilot.buildPayload().trials.filter((t) => t.phase === 'practice').length }))()`);
      check("[tut] 評定チュートリアル完了 → 最初の練習 (上部=「練習」+「1 / 5」・帯・例の試行は phase=tutorial で1件・練習にはまだ0件)",
        p1.screen === "task" && p1.phase === "練習" && p1.counter === "1 / 5" && /ここから練習です（5問）/.test(p1.banner) &&
        p1.tutorialRec === 1 && p1.practiceRec === 0, JSON.stringify(p1));
      const bpos = await cdp.eval(`(() => { const b = document.getElementById('phaseBanner').getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), oneLine: b.height < 60,
          choiceBottom: Math.round(document.getElementById('choiceA').getBoundingClientRect().bottom),
          startTop: Math.round(document.getElementById('start').getBoundingClientRect().top) }; })()`);
      check("[tut] 練習の帯は1行で、選択肢と START の間に出る", bpos.oneLine && bpos.top >= bpos.choiceBottom && bpos.bottom <= bpos.startTop, JSON.stringify(bpos));
      const tl = await cdp.eval("window.__pilot.buildPayload().device.tutorialLog");
      check("[tut] 説明ページの滞在時間を記録 (ドラッグ導入14段階と復習・振り返り4枚と練習導入・ms>0。2026-09-12 夜)",
        Array.isArray(tl) && tl.filter((e) => e.kind === "drag" && e.step && e.ms > 0).length >= 14 && tl.filter((e) => e.kind === "rating" && e.page && !e.event).length === 5 &&
        tl.every((e) => e.event || e.ms > 0), JSON.stringify(tl));
      const c6 = await coachState();
      check("[practice] 練習1問目は最初は案内なし", c6.cls === "" && c6.text === "", JSON.stringify(c6));
      await sleep(8400);
      const c7 = await coachState();
      check("[practice] 練習で無操作8秒たつと「読み終えたら、下の START を…」が選択肢と START の間に出る (2026-09-09)", /pos-gap/.test(c7.cls) && /スタート/.test(c7.text), JSON.stringify(c7));
      // ---- 開始手続き (§6-6 項19。2026-09-26 押下で出現): 押下で選択肢が出る → 3 秒以内に動き出す (超えたら評定送信後に案内) → 動き出した後の停止は記録のみ ----
      const stemVis0 = await cdp.eval("getComputedStyle(document.getElementById('stem')).visibility");
      check("[dyn] 問題文は START を押す前から見えている", stemVis0 === "visible", `stem=${stemVis0}`);
      const gd = await cdp.eval(`(() => { const r = document.getElementById('start').getBoundingClientRect(), b = document.getElementById('choiceB').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, bx: b.left + b.width / 2, by: b.top + b.height / 2 }; })()`);
      const stemVis1 = await cdp.eval("getComputedStyle(document.getElementById('numA')).visibility");
      check("[dyn] 押す前は選択肢の中身が出ていない", stemVis1 === "hidden", `numA=${stemVis1}`);
      await sleep(2500);   // 場面文を読む時間 (preStartMs > 1000 を検証。早出し判定 [文字数÷25字/秒] にも掛からない長さ)
      await touch("touchStart", [{ x: gd.x, y: gd.y }]); await sleep(150);
      const d1 = await cdp.eval(`(() => ({ a: getComputedStyle(document.getElementById('numA')).visibility, armed: document.getElementById('start').classList.contains('armed'),
        coach: document.getElementById('coach').className }))()`);
      check("[dyn] START に指を置いた瞬間に選択肢が出る (START は押下表示・START 案内は消える)", d1.a === "visible" && d1.armed === true && d1.coach === "", JSON.stringify(d1));
      await touch("touchMove", [{ x: gd.x, y: gd.y - 3 }]); await sleep(40);   // 枠内の小さなずれは動き出しではない
      await sleep(3200);   // 出現後 3.3 秒動かない → lateStart (締切 3 秒)
      await touch("touchMove", [{ x: gd.x, y: gd.y - gd.h / 2 - 12 }]); await sleep(60);   // 枠から出る = 動き出し
      const sy = gd.y - gd.h / 2 - 12;
      for (let i = 1; i <= 6; i++) { await touch("touchMove", [{ x: gd.x + (gd.bx - gd.x) * i / 12, y: sy + (gd.by - sy) * i / 12 }]); await sleep(14); }
      await sleep(3300);   // 途中で 3.3 秒止まる → stopFlag (記録のみ・案内なし)
      for (let i = 7; i <= 12; i++) { await touch("touchMove", [{ x: gd.x + (gd.bx - gd.x) * i / 12, y: sy + (gd.by - sy) * i / 12 }]); await sleep(14); }
      await touch("touchEnd", []); await sleep(500);
      const d4 = await cdp.eval(`(() => { const p = window.__pilot.buildPayload(); const t = p.trials[p.trials.length - 1];
        return { screen: window.__pilot.activeScreen(), preStart: t.preStartMs, press: typeof t.startPressT, reveal: t.revealT === t.startPressT && t.revealXY && typeof t.revealXY.x === 'number',
          revealEv: t.events.filter((e) => e.type === 'reveal').length, stops: t.stopsAfterInit, flag: t.stopFlag, rt: t.rt_ms, rtOld: t.rt_proxy_ms, late: t.lateStart, mt: t.mt_proxy_ms,
          ans: (document.getElementById('ratingAnswer').textContent || ''), label: t.rightLabel, side: t.choiceSide }; })()`);
      check("[dyn] 記録: preStartMs>1000・startPressT=revealT/revealXY・reveal イベント1件・rt_ms>=3000 (=rt_proxy_ms)・lateStart=true・stopsAfterInit (maxMs>=3000)・stopFlag=true",
        d4.screen === "rating" && d4.preStart > 1000 && d4.press === "number" && d4.reveal === true && d4.revealEv === 1 &&
        d4.rt >= 3000 && d4.rt === d4.rtOld && d4.late === true && d4.stops && d4.stops.n >= 1 && d4.stops.maxMs >= 3000 && d4.flag === true && d4.mt > 3200, JSON.stringify(d4));
      check("[dyn] 評定画面に「あなたの回答: <選んだ行為>」", d4.side === "right" && d4.ans === "あなたの回答: " + d4.label, JSON.stringify({ ans: d4.ans, label: d4.label }));
      await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(400);
      const d5 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), rules: [...document.querySelectorAll('#practiceCheckItems input')].map(e=>e.dataset.rule), disabled: document.getElementById('practiceCheckGo').disabled }))()`);
      check("[dyn] 練習の3秒超は振り返り後・次問の前に該当ルールだけの必須チェックを提示",
        d5.screen === "practicecheck" && JSON.stringify(d5.rules) === '["late"]' && d5.disabled, JSON.stringify(d5));
      await sleep(700); await cdp.eval("document.querySelector('#practiceCheckItems input').click()"); await tap("practiceCheckGo"); await sleep(300);
      const d6 = await cdp.eval(`(() => { const p = window.__pilot.buildPayload(); const n = p.device.practiceChecks; return { screen: window.__pilot.activeScreen(), stopNotices: p.device.stopNotices.length,
        msg: document.getElementById('taskMsg').textContent, notices: n.length, kind: n.length ? n[n.length - 1].kind : null, ms: n.length ? n[n.length - 1].ms : null, stem: getComputedStyle(document.getElementById('stem')).visibility }; })()`);
      check("[dyn] チェック後は次問へ進み、確認の滞在を1件記録する。本番用の注意を重ねない",
        d6.screen === "task" && d6.msg === "" && d6.stem === "visible" && d6.notices === 1 && d6.stopNotices === 0 && d6.ms >= 600, JSON.stringify(d6));
      const pb = await cdp.eval(`(() => { const p = document.getElementById('progress'), f = document.getElementById('progressFill');
        const parts = (document.getElementById('counter').textContent || '').split('/'); const n = parseInt(parts[0], 10) || 0, N = parseInt(parts[1], 10) || 0;
        return { on: getComputedStyle(p).display !== 'none', ratio: p.clientWidth ? f.clientWidth / p.clientWidth : -1, expect: N ? (n - 1) / N : -1,
          green: getComputedStyle(f).backgroundColor, below: p.getBoundingClientRect().top >= document.getElementById('topbar').getBoundingClientRect().bottom - 1 }; })()`);
      check("[practice] 練習中は進捗バーを出さない (2026-09-15)", pb.on === false, JSON.stringify(pb));
      await touch("touchStart", [{ x: gd.x, y: gd.y }]); await sleep(80);
      await touch("touchMove", [{ x: gd.x, y: gd.y - gd.h / 2 - 12 }]); await sleep(40);
      for (let i = 1; i <= 12; i++) { await touch("touchMove", [{ x: gd.x + (gd.bx - gd.x) * i / 12, y: sy + (gd.by - sy) * i / 12 }]); await sleep(14); }
      await touch("touchEnd", []); await sleep(400);
      const d7 = await cdp.eval(`(() => { const p = window.__pilot.buildPayload(); const t = p.trials[p.trials.length - 1]; return { notice: t.stopNotice, flag: t.stopFlag, late: t.lateStart, rt: t.rt_ms, stops: t.stopsAfterInit }; })()`);
      check("[dyn] 練習確認の直後に本番の注意フラグを付けず、すぐ動けばlateStart=false・止まらなければstopFlag=false", !d7.notice && d7.late === false && d7.rt < 3000 && d7.flag === false, JSON.stringify(d7));
      await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(300);
    }
    await tutorialSmoke();
    await tutorialStopSmoke();


    // ===== 対面セッション (§6-6 項15) の smoke =====
    // 8分枠・途中終了が前提の運用: 「どこで終わってもそこまでのデータが通常の完了経路で送信される」ことと、
    // クラウド配布 URL の既定挙動が変わっていないこと (中断ボタンが出ない) を確認する。
    const IP_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=0&tut=0&attn=0&rtut=0&reps=1&stop=1" +
      "&pid=E01&age=72&model=iPhone%2013&sex=female&hand=right&intro=0&cohort=elderly-inperson&strat=1";
    let ipClientId = null;   // 共用端末で参加者ごとに変わること (pid 指定時) の確認用
    async function runInPerson(label, url, stopAfter) {
      console.log(`\n--- ${label} (${url}) ---`);
      await cdp.send("Page.navigate", { url });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await passWelcome();
      const pre = await cdp.eval(`(() => ({
        hidden: document.getElementById('pid').closest('.field').style.display === 'none' &&
                document.getElementById('age').closest('.field').style.display === 'none' &&
                document.getElementById('sexSeg').closest('.field').style.display === 'none',
        enabled: !document.getElementById('goPractice').disabled }))()`);
      check(`[${label}] 事前アンケートを URL プリセット (欄を隠して入力なしで開始可)`,
        pre.hidden && pre.enabled, JSON.stringify(pre));
      await tap("goPractice"); await sleep(300);
      let cancelled = false, stopped = false, drag = 0;
      let stopVisibleOnTask = null, stopHiddenOnConfirm = null, postOptional = null, backDone = null, backState = null, progressOnMain = null;
      for (let guard = 0; guard < 400; guard++) {
        const screen = await cdp.eval("window.__pilot.activeScreen()");
        if (screen === "done") break;
        if (screen === "stopconfirm") {
          if (stopHiddenOnConfirm === null)   // 確認画面では中断ボタン自体を消す (二重タップ防止)
            stopHiddenOnConfirm = !(await cdp.eval("window.__pilot.stopVisible()"));
          if (!cancelled) { cancelled = true; await tap("stopBack"); await sleep(300); }   // 誤タップからの復帰
          else { stopped = true; await tap("stopGo"); await sleep(300); }
          continue;
        }
        if (screen === "postq") {
          if (postOptional === null)   // 途中終了はアンケート未回答でも完了できる (中断の自由を妨げない)
            postOptional = !(await cdp.eval("document.getElementById('postSubmit').disabled"));
          if (stopAfter != null && backDone === null) {   // 「ここで終了する」まで押した後の取り消し → 課題に戻る (2026-09-07)
            backDone = await cdp.eval("document.getElementById('postBack').style.display !== 'none'");
            await tap("postBack"); await sleep(300);
            backState = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), partial: window.__pilot.buildPayload().device.partial,
              endedBy: window.__pilot.buildPayload().device.endedBy }))()`);
            stopped = false;   // もう一度、境界で「終了」を押す (2回目は確定)
            continue;
          }
          await tapSel('#gripSeg button[data-val="right_thumb"]'); await sleep(60);
          await tap("postSubmit"); await sleep(250);
          continue;
        }
        if (screen === "rating") { await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(120); continue; }
        if (screen === "reading") { await tap("readDone"); await sleep(450); continue; }
        if (screen === "break") { await sleep(80); await tap("breakContinue"); await sleep(120); continue; }
        if (screen === "blockintro") { await tap("blockintroGo"); await sleep(300); continue; }
        if (screen === "notice") { await tap("noticeGo"); await sleep(200); continue; }
        if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
          const isMain = (await cdp.eval("window.__pilot.phase()")) === "main";
          if (isMain && stopVisibleOnTask === null)
            stopVisibleOnTask = await cdp.eval("window.__pilot.stopVisible()");
          if (isMain && progressOnMain === null)   // 本番の進捗バー (2026-09-15)
            progressOnMain = await cdp.eval(`(() => { const p = document.getElementById('progress'), f = document.getElementById('progressFill');
              const parts = (document.getElementById('counter').textContent || '').split('/'); const n = parseInt(parts[0], 10) || 0, N = parseInt(parts[1], 10) || 0;
              return { on: getComputedStyle(p).display !== 'none', ratio: p.clientWidth ? f.clientWidth / p.clientWidth : -1, expect: N ? (n - 1) / N : -1,
                green: getComputedStyle(f).backgroundColor, below: p.getBoundingClientRect().top >= document.getElementById('topbar').getBoundingClientRect().bottom - 1 }; })()`);
          if (isMain && stopAfter != null && !stopped &&
              (await cdp.eval("window.__pilot.trialIndex()")) >= stopAfter) {
            await tap("stopBtn"); await sleep(300); continue;
          }
          const before = await cdp.eval("window.__pilot.recordCount()");
          await dragStartToChoice(drag++ % 2 === 0 ? "left" : "right");
          for (let w = 0; w < 25; w++) {
            const c = await cdp.eval("window.__pilot.recordCount()");
            const s = await cdp.eval("window.__pilot.activeScreen()");
            if (c > before || s !== "task") break;
            await sleep(80);
          }
          continue;
        }
        await sleep(150);
      }
      check(`[${label}] 本番の進捗バー (「本番 n / N」の下・済んだ割合・「次へ」と同じ緑。2026-09-15)`,
        progressOnMain && progressOnMain.on && progressOnMain.below && Math.abs(progressOnMain.ratio - progressOnMain.expect) < 0.03 && /18, 133, 90/.test(progressOnMain.green), JSON.stringify(progressOnMain));
      check(`[${label}] 本番中は中断ボタンが出る / 確認画面では消える`,
        stopVisibleOnTask === true && (stopAfter == null || stopHiddenOnConfirm === true),
        `task=${stopVisibleOnTask} confirm_hidden=${stopHiddenOnConfirm}`);
      if (stopAfter != null)
        check(`[${label}] 「続ける」で誤タップから復帰した`, cancelled === true);
      check(`[${label}] 途中終了は事後アンケートを必須にしない`, postOptional === true);
      if (stopAfter != null)
        check(`[${label}] 「課題に戻る（終了を取り消す）」で最後の質問画面から課題へ戻れる (partial 解除)`,
          backDone === true && backState && backState.screen === "task" && backState.partial === false && backState.endedBy === null, JSON.stringify(backState));
      check(`[${label}] done 到達 (途中終了でも通常の完了・送信経路)`,
        (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      return await cdp.eval("window.__pilot.buildPayload()");
    }

    {   // (1) 中断ボタンで 14 問目に終了
      const p = await runInPerson("inperson stop", IP_URL, 14);
      const d = p.device;
      const mains = p.trials.filter((t) => t.phase === "main" && !t.isCheck);
      check("[inperson stop] partial / endedBy=operator / cohort 記録",
        d.partial === true && d.endedBy === "operator" && d.cohort === "elderly-inperson",
        `partial=${d.partial} endedBy=${d.endedBy} cohort=${d.cohort}`);
      check("[inperson stop] 事前アンケートがプリセット値で記録",
        d.participantId === "E01" && d.age === 72 && d.deviceModel === "iPhone 13" &&
        d.sex === "female" && d.handedness === "right",
        `${d.participantId}/${d.age}/${d.deviceModel}/${d.sex}/${d.handedness}`);
      check("[inperson stop] 完了分だけ記録 (mainCompleted < mainPlanned=49)",
        d.mainCompleted === mains.length && d.mainCompleted >= 14 && d.mainCompleted < 49 &&
        d.mainPlanned === 49 && d.mainMs > 0,
        `completed=${d.mainCompleted}/${d.mainPlanned} ms=${d.mainMs}`);
      check("[inperson stop] 事後アンケート拡充分は対面 (stop) では出ない (post=null)", d.post === null, `post=${JSON.stringify(d.post)}`);
      check("[inperson stop] 中断確認の滞在と終了の取り消しを記録 (stopPauses: 課題に戻る1回 + 取り消し1回)",
        Array.isArray(d.stopPauses) && d.stopPauses.length === 2 && d.stopPauses.every((p) => p.durationMs >= 0) && d.stopPauses.some((p) => p.screen === "postq"),
        JSON.stringify(d.stopPauses));
      const lv = {};
      for (const t of mains) lv[t.conflictLevel] = (lv[t.conflictLevel] || 0) + 1;
      check("[inperson stop] ?strat=1: 打ち切っても水準構成が偏らない (明確/中間/拮抗が全て出る)",
        (lv.clear || 0) >= 1 && (lv.mid || 0) >= 2 && (lv.conflict || 0) >= 4 &&
        (lv.conflict || 0) <= Math.ceil(mains.length * 0.75), JSON.stringify(lv));
      ipClientId = d.clientId;
    }

    {   // (2) 時間上限 (?maxmin) で自動終了 — 0.05分=3秒。試行の途中では切らない
      const p = await runInPerson("inperson timebox", IP_URL + "&maxmin=0.05", null);
      const d = p.device;
      const mains = p.trials.filter((t) => t.phase === "main" && !t.isCheck);
      check("[inperson timebox] partial / endedBy=timebox",
        d.partial === true && d.endedBy === "timebox", `partial=${d.partial} endedBy=${d.endedBy}`);
      check("[inperson timebox] 本番を1問以上完了してから境界で終了",
        d.mainCompleted >= 1 && d.mainCompleted === mains.length && d.mainCompleted < 49,
        `completed=${d.mainCompleted}`);
      check("[inperson] 共用端末で参加者ごとに clientId が変わる (pid 指定時は永続化しない)",
        typeof d.clientId === "string" && d.clientId.length > 0 && d.clientId !== ipClientId,
        `${String(ipClientId).slice(0, 8)}… vs ${String(d.clientId).slice(0, 8)}…`);
      check("[inperson timebox] 最後の試行は完全な記録 (途中で切っていない)",
        mains.length > 0 && mains[mains.length - 1].events && mains[mains.length - 1].events.length > 0 &&
        mains[mains.length - 1].ratings && mains[mains.length - 1].ratings.hesitation != null);
    }

    // ===== kiosk (対面・複数人・実験者不在の連続実施。§6-6 項16) =====
    // 実施者が URL を編集できない・ネットに不慣れでも回せることが要件なので、
    // 「自動採番 / タップだけの事前入力 / つぎの人へ」と、**送信できなかったときの保全**を検証する。
    let kioskObs = null;
    async function runKiosk(label, url) {
      console.log(`\n--- ${label} (${url}) ---`);
      await cdp.send("Page.navigate", { url });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      const wcCount = await cdp.eval(`(document.getElementById('wcStep').textContent || '').split('/')[1]`);
      await passWelcome();
      kioskObs = { micQuickMs: null, micFirst: false };
      if ((await cdp.eval("window.__pilot.activeScreen()")) === "micgate") {   // 対面はマイクの許可が入力画面より先 (2026-09-15)
        await cdp.eval("window.__pilot.setMicLevel(-55)");   // 会場の音量 (mock) を先に決めておく (ambientDb の検証値)
        const t0 = Date.now(); await tap("micgateStart");
        for (let w = 0; w < 30; w++) { if ((await cdp.eval("window.__pilot.activeScreen()")) !== "micgate") break; await sleep(100); }
        kioskObs.micQuickMs = Date.now() - t0; kioskObs.micFirst = (await cdp.eval("window.__pilot.activeScreen()")) === "intro";
      }
      const st = await cdp.eval(`(() => ({
        pid: document.getElementById('pid').value,
        pidHidden: document.getElementById('pid').closest('.field').style.display === 'none',
        ageHidden: document.getElementById('age').closest('.field').style.display === 'none',
        modelHidden: document.getElementById('devModel').closest('.field').style.display === 'none',
        bandShown: document.getElementById('ageBandField').style.display !== 'none',
        beforeBand: document.getElementById('goPractice').disabled }))()`);
      check(`[${label}] ウェルカムは対面用の2枚`, String(wcCount).trim() === "2", `pages=${String(wcCount).trim()}`);
      check(`[${label}] 参加者IDを自動採番し、入力欄は隠れる (年代タップだけ残す)`,
        /^E\d{2,}$/.test(st.pid) && st.pidHidden && st.ageHidden && st.modelHidden && st.bandShown,
        JSON.stringify(st));
      check(`[${label}] 年代を選ぶまで開始できない`, st.beforeBand === true);
      await tapSel('#ageBandSeg button[data-val="70s"]'); await sleep(80);
      check(`[${label}] 年代タップで開始可能`, !(await cdp.eval("document.getElementById('goPractice').disabled")));
      await tap("goPractice"); await sleep(300);
      let drag = 0;
      if (!kioskObs) kioskObs = { micQuickMs: null, micFirst: false };
      for (let guard = 0; guard < 400; guard++) {
        const screen = await cdp.eval("window.__pilot.activeScreen()");
        if (screen === "done") break;
        if (screen === "micgate") {   // 対面: 許可ボタンだけで先へ (5 秒の計測待ちなし。計測は裏で)
          await cdp.eval("window.__pilot.setMicLevel(-55)");
          const t0 = Date.now(); await tap("micgateStart");
          for (let w = 0; w < 30; w++) { if ((await cdp.eval("window.__pilot.activeScreen()")) !== "micgate") break; await sleep(100); }
          kioskObs.micQuickMs = Date.now() - t0; continue;
        }
        if (screen === "postq") {
          await tapSel('#gripSeg button[data-val="right_thumb"]'); await sleep(60);
          await tap("postSubmit"); await sleep(250); continue;
        }
        if (screen === "rating") { await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(120); continue; }
        if (screen === "reading") { await tap("readDone"); await sleep(450); continue; }
        if (screen === "break") { await sleep(80); await tap("breakContinue"); await sleep(120); continue; }
        if (screen === "blockintro") { await tap("blockintroGo"); await sleep(300); continue; }
        if (screen === "notice") { await tap("noticeGo"); await sleep(200); continue; }
        if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
          const before = await cdp.eval("window.__pilot.recordCount()");
          await dragStartToChoice(drag++ % 2 === 0 ? "left" : "right");
          for (let w = 0; w < 25; w++) {
            const c = await cdp.eval("window.__pilot.recordCount()");
            const s = await cdp.eval("window.__pilot.activeScreen()");
            if (c > before || s !== "task") break;
            await sleep(80);
          }
          continue;
        }
        await sleep(150);
      }
      check(`[${label}] done 到達`, (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      return await cdp.eval("window.__pilot.buildPayload()");
    }

    {   // (4) kiosk 本体 + 未送信キュー (送信先が死んでいる場合)
      const K_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&kiosk=1&debug=1&mic=0&tut=0&rtut=0&reps=1&maxmin=0.05" +
        "&pidauto=E&model=iPhone%2013&sex=female&hand=right&cohort=elderly-inperson";
      const okUrl = new URL("/__ok.json", BASE).href;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(okUrl).hostname)) throw new Error("kiosk fixture requires localhost");
      const receivedSessions = [];
      // 静的ファイルの配信元が別スナップショットでも動く、同一originのPOST模擬応答。
      // 本番の収集先には送らず、実際に送った本文のsessionIdを受領応答へ返す。
      cdp.onRequestPaused = async ({ requestId, request }) => {
        if (request.url !== okUrl || request.method !== "POST") throw new Error("unexpected kiosk fixture request");
        let sent = JSON.parse(request.postData);
        if (sent.encoding === "gzip-base64-v1") sent = JSON.parse(require("node:zlib").gunzipSync(Buffer.from(sent.data, "base64")).toString("utf8"));
        if (!sent.device || typeof sent.device.sessionId !== "string" || !Array.isArray(sent.trials)) throw new Error("invalid kiosk fixture payload");
        receivedSessions.push(sent.device.sessionId);
        await cdp.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }],
          body: Buffer.from(JSON.stringify({ ok: true, file: "validate fixture", sessionId: sent.device.sessionId })).toString("base64") });
      };
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: okUrl, requestStage: "Request" }] });
      try {
        const p = await runKiosk("kiosk offline", K_URL + "&uploadurl=/__dead.json");
        const d = p.device;
        check("[kiosk] 注意チェック・完了コードを省く (対面の短時間セッション)",
          d.seq.indexOf("attn") === -1 && p.trials.every((t) => !t.isCheck) &&
          !(await cdp.eval("document.getElementById('ccodeBox').style.display !== 'none'")),
          `seq=${d.seq}`);
        check("[kiosk] 事後アンケート拡充分は kiosk では出ない (post=null)", d.post === null, `post=${JSON.stringify(d.post)}`);
        check("[kiosk] device に kiosk/cohort/ageBand を記録 (age は数値でなく年代)",
          d.kiosk === true && d.cohort === "elderly-inperson" && d.ageBand === "70s" && d.age == null,
          `kiosk=${d.kiosk} cohort=${d.cohort} band=${d.ageBand} age=${d.age}`);
        // 完了 → すぐ送らず端末内に保留 (未送信キュー1件) → 「送信して次の人へ」で送信 (送信先が 404 なので残る)
        let queued = 0;
        for (let i = 0; i < 40; i++) {
          queued = await cdp.eval("window.__pilot.outboxCount()");
          if (queued > 0) break;
          await sleep(500);
        }
        const ui = await cdp.eval(`(() => ({
          status: document.getElementById('uploadStatus').textContent,
          next: document.getElementById('nextParticipant').style.display !== 'none',
          nextLabel: document.getElementById('nextParticipant').textContent,
          discard: document.getElementById('discardRow').style.display !== 'none',
          bar: document.getElementById('outboxBar').classList.contains('on') }))()`);
        check("[kiosk] 完了時は送信せず端末に保留する (未送信キュー1件)", queued === 1, `queued=${queued}`);
        check("[kiosk] 参加者向けの表示は「端末に保留・送信して次の人へ」", /端末に保留/.test(ui.status), ui.status);
        check("[kiosk] 「送信して次の人へ」と「保存せずに最初から」が出る", ui.next === true && ui.nextLabel === "送信して次の人へ" && ui.discard === true, JSON.stringify(ui));
        check("[kiosk] done 画面に未送信バーが出る", ui.bar === true);
        check("[kiosk] マイクは許可だけで先へ進む (計測待ちなし)", kioskObs.micQuickMs === null || kioskObs.micQuickMs < 1500, `micQuickMs=${kioskObs.micQuickMs} (mic=0 のため null 可)`);
        // 「送信して次の人へ」: 送信先が死んでいるので残ったまま次の人へ (最初の画面に戻る)
        await tap("nextParticipant");
        for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
        await sleep(600);
        check("[kiosk] 「送信して次の人へ」→ 送れなくても最初の画面へ (データは端末に残る)",
          (await cdp.eval("window.__pilot.activeScreen()")) === "welcome" && (await cdp.eval("window.__pilot.outboxCount()")) === 1);

        // (5) 生きた送信先で開き直す → 起動時に自動で再送されてキューが空になる
        await cdp.send("Page.navigate", { url: K_URL + "&uploadurl=/__ok.json" });
        for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
        let left = 1;
        for (let i = 0; i < 40; i++) {
          left = await cdp.eval("window.__pilot.outboxCount()");
          if (left === 0) break;
          await sleep(500);
        }
        check("[kiosk] 次に開いたとき未送信ぶんが自動送信される (キューが空になる)", left === 0, `left=${left}`);
        check("[kiosk] ローカルPOST模擬応答が同じセッションを受領 (本番へ送信しない)",
          receivedSessions.length === 1 && receivedSessions[0] === d.sessionId && await cdp.eval("window.__pilot.uploadUrl()") === okUrl);
        check("[kiosk] 未送信バーは0件なら出ない",
          !(await cdp.eval("document.getElementById('outboxBar').classList.contains('on')")));
        await cdp.eval("window.__pilot.outboxClear()");

        // (6) マイク許可だけで先へ (mic=mock) + 裏で会場の音量を記録 / 「保存せずに最初から」で消える
        const KM_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&kiosk=1&welcome=0&debug=1&upload=0&mic=mock&micchk=400&tut=0&rtut=0&reps=1&maxmin=0.05" +
          "&pidauto=E&model=iPhone%2017&sex=female&hand=right&cohort=elderly-inperson";
        const pk = await runKiosk("kiosk mic+discard", KM_URL);
        check("[kiosk/mic] 許可ボタンだけで 1.5 秒以内に先へ進む", kioskObs.micQuickMs !== null && kioskObs.micQuickMs < 1500, `micQuickMs=${kioskObs.micQuickMs}`);
        check("[kiosk/mic] マイクの許可 → 入力画面の順 (研究者が許可して入力画面で渡す。2026-09-15)", kioskObs.micFirst === true, JSON.stringify(kioskObs));
        check("[kiosk/mic] 会場の音量は裏で計測して記録 (ambientDb)・読速はなし (welcome=0 で入力画面から)",
          pk.device.mic && pk.device.mic.ambientDb === -55 && pk.device.readingBaseline === null, `ambient=${pk.device.mic && pk.device.mic.ambientDb} rb=${JSON.stringify(pk.device.readingBaseline)}`);
        const held = await cdp.eval("window.__pilot.outboxCount()");
        await tap("discardAsk"); await sleep(100);
        const dc = await cdp.eval("document.getElementById('discardConfirm').style.display !== 'none'");
        await tap("discardYes");
        for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
        await sleep(600);
        const afterDiscard = await cdp.eval(`({screen:window.__pilot.activeScreen(), queued:window.__pilot.outboxCount(), discardedStillExists:window.__pilot.storedSessions().some(e=>e.id===${JSON.stringify(pk.device.sessionId)})})`);
        check("[kiosk/discard] 「保存せずに最初から」→ 確認 → 消して最初の画面へ (キューが空)",
          held === 1 && dc === true && ["intro", "micgate"].includes(afterDiscard.screen) && afterDiscard.queued === 0 &&
          !afterDiscard.discardedStillExists, JSON.stringify({held,confirm:dc,...afterDiscard})); // 他セッションの保存は残したまま、この回答だけを破棄する。
      } finally {
        await cdp.send("Fetch.disable");
        cdp.onRequestPaused = null;
      }
    }

    {   // (3) クラウド配布 URL (既定) では中断ボタンが出ない = 回帰
      await cdp.send("Page.navigate", { url: MORAL_URL });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await fillSurvey();
      await tap("goPractice"); await sleep(300);
      for (let g = 0; g < 25; g++) {
        const s = await cdp.eval("window.__pilot.activeScreen()");
        if (s === "task") break;
        if (s === "reading") { await tap("readDone"); await sleep(450); } else await sleep(150);
      }
      const st = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(),
        on: document.getElementById('stopBtn').classList.contains('on'),
        shown: document.getElementById('stopBtn').offsetParent !== null }))()`);
      check("[配布既定] 中断ボタンは出ない (?stop=1 のときだけ)",
        st.screen === "task" && st.on === false && st.shown === false, JSON.stringify(st));
    }

    // ===== 中断からの再開 (§6-6 項17。2026-09-06) =====
    // iOS のタブ破棄・誤更新で本番の途中から最初に戻される事故への対策。同じ URL を開き直す = Page.navigate。
    async function waitPilot() {
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined' && window.__pilot.storeReady()").catch(() => false)) return; await sleep(200); }
      throw new Error("app initialization failed: " + await cdp.eval("document.getElementById('storageProblemText')?.textContent || document.body.textContent.slice(0,150)"));
    }
    // 本番 n 問が完了するまで進める (welcome/intro は通過済みの前提。micgate は mock 静音で通す)
    async function driveMain(n, drag) {
      let done = 0;
      for (let guard = 0; guard < 600; guard++) {
        const screen = await cdp.eval("window.__pilot.activeScreen()");
        if (screen === "done") return { done, drag, screen };
        if (screen === "micgate") {
          await cdp.eval("window.__pilot.setMicLevel(-60)");
          await tap("micgateStart"); await sleep(900);
          if ((await cdp.eval("document.getElementById('micgateGo').style.display")) !== "none") { await tap("micgateGo"); await sleep(300); }
          continue;
        }
        if (screen === "rating") {
          await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(120);
          done = await cdp.eval("window.__pilot.buildPayload().trials.filter((t) => t.phase === 'main').length");
          if (n != null && done >= n) return { done, drag, screen: await cdp.eval("window.__pilot.activeScreen()") };
          continue;
        }
        if (screen === "reading") { await tap("readDone"); await sleep(450); continue; }
        if (screen === "break") { await sleep(80); await tap("breakContinue"); await sleep(120); continue; }
        if (screen === "blockintro") { await tap("blockintroGo"); await sleep(300); continue; }
        if (screen === "notice") { await tap("noticeGo"); await sleep(200); continue; }
        if (screen === "postq") {
          await tapSel('#gripSeg button[data-val="right_thumb"]'); await sleep(60);
          await tapSel('#surveyProblems button[data-val="none1"]'); await tapSel('#surveyProblems button[data-val="none2"]'); await tapSel('#surveyProblems button[data-val="none3"]'); await tapSel('#surveyEaseSeg button[data-val="ok"]');
          await fillPost(); await sleep(60);
          await tap("postSubmit"); await sleep(250); continue;
        }
        if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
          const before = await cdp.eval("window.__pilot.recordCount()");
          await dragStartToChoice(drag++ % 2 === 0 ? "left" : "right");
          for (let w = 0; w < 25; w++) {
            const c = await cdp.eval("window.__pilot.recordCount()");
            const s = await cdp.eval("window.__pilot.activeScreen()");
            if (c > before || s !== "task") break;
            await sleep(80);
          }
          continue;
        }
        await sleep(120);
      }
      return { done, drag, screen: await cdp.eval("window.__pilot.activeScreen()") };
    }
    {
      const NM = 12;   // 2026-09-10: 再開の検証は本番を 12 問に短縮 (?nmain。49 問の完走を 3 回繰り返していた)
      const R_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=0&tut=0&rtut=0&attn=0&instr=0&reps=1&nmain=" + NM;
      console.log(`\n--- resume (${R_URL}) ---`);
      await cdp.eval("window.__pilot.resetStoredForTest()"); // 前テストの練習チェックポイントと独立した新規参加を検証する。
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      check("[resume] 初回は再開画面を出さない (welcome から)", (await cdp.eval("window.__pilot.activeScreen()")) === "welcome" &&
        (await cdp.eval("window.__pilot.resumeOffered()")) === false);
      const wc = await cdp.eval(`(document.getElementById('wcStep').textContent || '').split('/')[1]`);
      check("[resume] クラウド配布のウェルカムは7枚 (時間と順番を分割・同意チェック2ページ)", String(wc).trim() === "7", `pages=${String(wc).trim()}`);
      await fillSurvey(); await tap("goPractice"); await sleep(300);
      let r = await driveMain(3, 0);
      check("[resume] 本番3問を完了 (中断前)", r.done === 3, `main=${r.done}`);
      const before = await cdp.eval(`(() => { const p = window.__pilot.buildPayload(); const m = p.trials.filter((t) => t.phase === 'main');
        return { ids: m.map((t) => t.itemId), pid: p.device.participantId, rb: p.device.readingBaseline && p.device.readingBaseline.charsPerSec,
          prac: p.trials.filter((t) => t.phase === 'practice').length }; })()`);
      // 本番中に再読込 (iOS のタブ破棄・誤更新に相当) → 同じ URL
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      const s1 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), offered: window.__pilot.resumeOffered(),
        info: document.getElementById('resumeInfo').textContent }))()`);
      check("[resume] 本番途中で再読込 → 「続きから再開」画面 (3 / N 問まで)", s1.screen === "resume" && s1.offered === true && new RegExp("3 \\/ " + NM).test(s1.info), JSON.stringify(s1));
      await tap("resumeGo"); await sleep(300);
      const s2 = await cdp.eval(`(() => { const p = window.__pilot.buildPayload(); return { screen: window.__pilot.activeScreen(), phase: window.__pilot.phase(),
        counter: document.getElementById('counter').textContent, rec: window.__pilot.recordCount(), resumes: p.device.resumes,
        pid: p.device.participantId, rb: p.device.readingBaseline && p.device.readingBaseline.charsPerSec, prac: p.trials.filter((t) => t.phase === 'practice').length }; })()`);
      check("[resume] mic=0 では環境音チェックなしで本番4問目へ (カウンタ 4 / N・記録復元)",
        s2.screen === "task" && s2.phase === "main" && s2.counter === "4 / " + NM && s2.rec === 3 + before.prac, JSON.stringify(s2));
      check("[resume] device.resumes に {afterTrial:3, gapMs} を1件記録・事前アンケート/読速/練習記録を保持",
        Array.isArray(s2.resumes) && s2.resumes.length === 1 && s2.resumes[0].afterTrial === 3 && s2.resumes[0].gapMs >= 0 &&
        s2.pid === before.pid && s2.rb === before.rb && s2.prac === before.prac, JSON.stringify(s2.resumes));
      r = await driveMain(null, r.drag);
      check("[resume] 続きから完走 (done 到達)", r.screen === "done", `screen=${r.screen}`);
      const p = await cdp.eval("window.__pilot.buildPayload()");
      const mains = p.trials.filter((t) => t.phase === "main");
      const ids = mains.map((t) => t.itemId);
      check("[resume] 本番 N 問・itemId 非重複・再開前の3問を保持", mains.length === NM && new Set(ids).size === NM &&
        JSON.stringify(ids.slice(0, 3)) === JSON.stringify(before.ids), `n=${mains.length} uniq=${new Set(ids).size}`);
      check("[resume] 再開直後の本試行 (4問目) だけ post_resume=true", mains.filter((t) => t.post_resume).length === 1 && mains[3].post_resume === true,
        `flagged=${mains.map((t, i) => t.post_resume ? i : null).filter((x) => x != null)}`);
      check("[resume] 完走扱い (partial=false・endedBy=complete・完了コード発行・mainCompleted=N)",
        p.device.partial === false && p.device.endedBy === "complete" && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(p.device.completionCode || "") &&
        p.device.mainCompleted === NM, `partial=${p.device.partial} endedBy=${p.device.endedBy} code=${p.device.completionCode}`);
      // 完了後 (未回収でチェックポイントが残る) に再読込しても再開画面は出ない (キューが空) → 従来の復旧 UI
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      check("[resume] 完走後の再読込で完了画面へ戻る", (await cdp.eval("window.__pilot.activeScreen()")) === "done" &&
        (await cdp.eval("window.__pilot.resumeOffered()")) === false);
      check("[resume] 再読込でも同じ完了コードを保持", await cdp.eval("window.__pilot.buildPayload().device.completionCode") === p.device.completionCode);
      await cdp.eval("window.__pilot.resetStoredForTest()");

      // アンケート段階からの再開 (2026-09-06): 本番を全部終えてアンケートの途中で再読込 → 再開 → アンケートから (マイク不要) → 完走
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      await fillSurvey(); await tap("goPractice"); await sleep(300);
      r = await driveMain(null, 0);   // postq で止まらず done まで行く → その手前で止めたいので postq に着いたら抜ける
      // driveMain は postq を自動で埋めて完了するため、ここでは別ルート: 本番 49 問を終えた直後の postq で再読込する
      check("[resume/survey] (前提) 完走できる", r.screen === "done");
      await cdp.eval("window.__pilot.resetStoredForTest()");
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      await fillSurvey(); await tap("goPractice"); await sleep(300);
      {   // postq に着いたら止める簡易ドライバ
        let drag = 0;
        for (let guard = 0; guard < 600; guard++) {
          const screen = await cdp.eval("window.__pilot.activeScreen()");
          if (screen === "postq") break;
          if (screen === "rating") { await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(120); continue; }
          if (screen === "reading") { await tap("readDone"); await sleep(450); continue; }
          if (screen === "break") { await sleep(80); await tap("breakContinue"); await sleep(120); continue; }
          if (screen === "blockintro") { await tap("blockintroGo"); await sleep(300); continue; }
        if (screen === "notice") { await tap("noticeGo"); await sleep(200); continue; }
          if (screen === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) {
            const before = await cdp.eval("window.__pilot.recordCount()");
            await dragStartToChoice(drag++ % 2 === 0 ? "left" : "right");
            for (let w = 0; w < 25; w++) { const c = await cdp.eval("window.__pilot.recordCount()"); const s2 = await cdp.eval("window.__pilot.activeScreen()"); if (c > before || s2 !== "task") break; await sleep(80); }
            continue;
          }
          await sleep(120);
        }
      }
      check("[resume/survey] 本番を終えてアンケート画面に到達", (await cdp.eval("window.__pilot.activeScreen()")) === "postq");
      await tapSel('#gripSeg button[data-val="right_thumb"]'); await sleep(60);   // 途中まで答えて再読込
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      const sv = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), info: document.getElementById('resumeInfo').textContent,
        how: document.getElementById('resumeHow').textContent }))()`);
      check("[resume/survey] アンケート途中の再読込 → 再開画面 (問題はすべて終えた旨・アンケートから続く旨)",
        sv.screen === "resume" && /アンケート/.test(sv.info) && /中断したところ/.test(sv.how), JSON.stringify(sv));
      await tap("resumeGo"); await sleep(300);
      const sv2 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), main: window.__pilot.buildPayload().trials.filter((t) => t.phase === 'main').length,
        resumes: window.__pilot.buildPayload().device.resumes.length }))()`);
      check("[resume/survey] マイクの確認なしでアンケートへ (本番 49 問の記録を保持・再開を記録)", sv2.screen === "postq" && sv2.main === NM && sv2.resumes === 1, JSON.stringify(sv2));
      r = await driveMain(null, 0);
      const svp = await cdp.eval("window.__pilot.buildPayload()");
      check("[resume/survey] アンケートを終えて完走扱い (post 26 キー（追加OFF）・completed・partial=false)",
        r.screen === "done" && svp.device.post && Object.keys(svp.device.post).length === 26 && svp.device.partial === false && svp.device.endedBy === "complete",
        `screen=${r.screen} keys=${svp.device.post ? Object.keys(svp.device.post).length : null}`);
      // 完了画面まで到達したセッションは再開対象外 (resume を外して保存)
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      check("[resume/survey] 完了後の再読込は完了コードへ戻る", (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      await cdp.eval("window.__pilot.resetStoredForTest()");

      // オンラインは再開だけを提示。期限超/別URLでも保存回答を捨てて新規開始しない。
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      await fillSurvey(); await tap("goPractice"); await sleep(300);
      r = await driveMain(1, 0);
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      check("[resume] 1問後の再読込でも再開画面", (await cdp.eval("window.__pilot.activeScreen()")) === "resume");
      check("[resume] 最初からの導線がなくチェックポイントを保持",
        await cdp.eval("!document.getElementById('resumeRestart') && window.__pilot.hasBackup()"));
      await tap("resumeGo"); await sleep(200);

      // 3時間超は再開不能案内。welcomeや入力画面へ戻して新規参加させない。
      await cdp.eval("window.__pilot.backdateBackup(4 * 3600 * 1000)");
      await cdp.send("Page.navigate", { url: R_URL }); await waitPilot();
      check("[resume] 中断から3時間超は再開不能案内とデータ保持", await cdp.eval("window.__pilot.activeScreen()==='resume' && document.getElementById('resumeGo').hidden && !document.getElementById('resumeGo').getClientRects().length && window.__pilot.hasBackup()"));
      // 別の構成 (URL クエリが違う) では再開しない
      await cdp.send("Page.navigate", { url: R_URL + "&order=vm" }); await waitPilot();
      check("[resume] URL クエリが違う構成は元リンクへ案内しデータ保持", await cdp.eval("window.__pilot.activeScreen()==='resume' && document.getElementById('resumeGo').hidden && !document.getElementById('resumeGo').getClientRects().length && document.getElementById('resumeInfo').textContent.includes('異なるリンク') && window.__pilot.hasBackup()"));
      await cdp.eval("window.__pilot.resetStoredForTest()"); await sleep(150);

      // mic=mock: 再開時に環境音チェック (マイク再取得) を通ってから続き。進むボタンは「続きにすすむ」
      const M_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=mock&micchk=300&micquiet=200&tut=0&rtut=0&attn=0&instr=0&reps=1&nmain=" + NM;
      await cdp.send("Page.navigate", { url: M_URL }); await waitPilot();
      await fillSurvey(); await tap("goPractice"); await sleep(300);
      r = await driveMain(1, 0);
      check("[resume/mic] 本番1問完了 (mock)", r.done === 1, `main=${r.done}`);
      await cdp.send("Page.navigate", { url: M_URL }); await waitPilot();
      check("[resume/mic] 再開画面", (await cdp.eval("window.__pilot.activeScreen()")) === "resume");
      await tap("resumeGo"); await sleep(250);
      const g1 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), title: document.getElementById('micgateTitle').textContent,
        acquired: window.__pilot.micState().acquired }))()`);
      check("[resume/mic] 再開 → まず環境音チェック (マイク未取得の状態から再取得)", g1.screen === "micgate" && /実施環境/.test(g1.title) && g1.acquired === false, JSON.stringify(g1));
      await cdp.eval("window.__pilot.setMicLevel(-60)");
      await tap("micgateStart"); await sleep(900);
      const g2 = await cdp.eval(`(() => ({ go: document.getElementById('micgateGo').style.display !== 'none',
        label: document.getElementById('micgateGo').textContent, acquired: window.__pilot.micState().acquired }))()`);
      check("[resume/mic] 静音で通過 → 進むボタンは「続きにすすむ」", g2.go && g2.label === "続きにすすむ" && g2.acquired === true, JSON.stringify(g2));
      await tap("micgateGo"); await sleep(300);
      const g3 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), phase: window.__pilot.phase(),
        counter: document.getElementById('counter').textContent }))()`);
      check("[resume/mic] 続きの本番2問目へ", g3.screen === "task" && g3.phase === "main" && g3.counter === "2 / " + NM, JSON.stringify(g3));
      // ミュート (iOS バックグラウンド等) を模擬 → 次の試行境界で再取得画面 → 再取得で続行。noise.mutedMs / device.mic.muteCount を記録
      await cdp.eval("window.__pilot.muteMic(true)");
      const n0 = await cdp.eval("window.__pilot.noiseSamples()");
      await sleep(600);   // 計測ティック (125ms) 4回分以上
      const n1 = await cdp.eval("window.__pilot.noiseSamples()");
      check("[resume/mic] ミュート中はサンプルを取らない (無音として集計しない)", n1 === n0, `n0=${n0} n1=${n1}`);
      let reacq = false;
      for (let guard = 0; guard < 60 && !reacq; guard++) {
        const s = await cdp.eval("window.__pilot.activeScreen()");
        if (s === "micgate") { reacq = true; break; }
        if (s === "rating") { await fillRatings(); await sleep(60); await tap("ratingSubmit"); await sleep(200); continue; }
        if (s === "notice") { await tap("noticeGo"); await sleep(200); continue; }
        if (s === "task" && !(await cdp.eval("window.__pilot.uiLocked()"))) { await dragStartToChoice("left"); await sleep(200); continue; }
        await sleep(100);
      }
      const g4 = await cdp.eval("document.getElementById('micgateTitle').textContent");
      check("[resume/mic] ミュートが続くと試行境界で再取得画面", reacq && /切断/.test(g4), `reacq=${reacq} title=${g4}`);
      await tap("micgateStart"); await sleep(300);
      if ((await cdp.eval("window.__pilot.activeScreen()")) === "notice") { await tap("noticeGo"); await sleep(200); }   // 前問の早出し/停止の案内が先に出る (2026-09-09)
      const g5 = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), mic: window.__pilot.micState() }))()`);
      check("[resume/mic] 再取得で本番に戻る (acquired・lost 解除。案内画面があればその後)",
        g5.screen === "task" && g5.mic.acquired === true && g5.mic.lost === false, JSON.stringify(g5));
      await cdp.eval("window.__pilot.outboxClear()");

      // kiosk (共用端末): 再開は出さず、前の人の途中データを未送信キューへ退避して次の人は最初から
      // ⚠️ upload=0 必須: 退避したデータが起動時の自動再送で本番 GAS に飛ばないように (検証はキューに残ることだけ見る)
      const KR_URL = BASE + "?devguard=0&minread=0&readgate=0&block=moral&kiosk=1&debug=1&upload=0&mic=0&tut=0&rtut=0&reps=1&pidauto=E&model=iPhone%2013&sex=female&hand=right&cohort=elderly-inperson";
      await cdp.send("Page.navigate", { url: KR_URL }); await waitPilot();
      await cdp.eval("window.__pilot.outboxClear()");
      await passWelcome(); await tapSel('#ageBandSeg button[data-val="70s"]'); await sleep(80);
      await tap("goPractice"); await sleep(300);
      r = await driveMain(2, 0);
      check("[resume/kiosk] 本番2問完了", r.done === 2, `main=${r.done}`);
      const kpid = await cdp.eval("window.__pilot.buildPayload().device.participantId");
      await cdp.send("Page.navigate", { url: KR_URL }); await waitPilot();
      const k = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), offered: window.__pilot.resumeOffered(),
        outbox: window.__pilot.outboxCount(), backup: window.__pilot.hasBackup(),
        q: (() => { const e=window.__pilot.storedSessions().find(e=>e.state==='queued'); return e && e.payload.device; })() }))()`);
      check("[resume/kiosk] 再読込しても再開画面は出さない (次の人は最初から)", k.screen === "welcome" && k.offered === false, JSON.stringify({ screen: k.screen, offered: k.offered }));
      check("[resume/kiosk] 前の人の途中データを partial/endedBy=reload で未送信キューへ退避 (チェックポイントは消す)",
        k.outbox === 1 && k.backup === false && k.q && k.q.partial === true && k.q.endedBy === "reload" && k.q.mainCompleted === 2 && k.q.participantId === kpid,
        JSON.stringify(k.q && { partial: k.q.partial, endedBy: k.q.endedBy, mainCompleted: k.q.mainCompleted, pid: k.q.participantId }));
      await cdp.eval("window.__pilot.outboxClear()");
    }

    // ===== 確認モード ?go= (開発専用。2026-09-06): 該当画面へ直行・送信は無効・印が出る =====
    {
      console.log("\n--- go (確認モード) ---");
      const goTo = async (g, extra) => { await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&go=" + g + "&debug=1" + (extra || "") }); await waitPilot(); await sleep(500); };
      await goTo("post");
      const gp = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), block: window.__pilot.block(), upload: window.__pilot.uploadUrl(),
        post: document.getElementById('postBlock').style.display !== 'none', badge: !!document.getElementById('goBadge') }))()`);
      check("[go] go=post → 最後のアンケート (block 既定 moral・拡充分あり・送信無効・印)", gp.screen === "postq" && gp.block === "moral" && gp.upload === null && gp.post && gp.badge, JSON.stringify(gp));
      // 1 項目 1 画面 (2026-09-26): 持ち方を答えると次へが有効 → 2 / 22 (fatigue_pre・導入文・スクロール不要) → 戻るで 1 / 22 (回答は保持)
      await tapSel('#gripSeg button[data-val="right_thumb"]'); await sleep(80);
      const g1 = await cdp.eval(`(() => ({ step: document.getElementById('postStep').textContent, next: document.getElementById('postNext').disabled, submit: document.getElementById('postSubmit').style.display, prev: document.getElementById('postPrev').style.display }))()`);
      await tap("postNext"); await sleep(150);
      const g2 = await cdp.eval(`(() => { const pad = document.querySelector('#postq .pad'); return { step: document.getElementById('postStep').textContent, page: document.querySelector('#postq .postpage.on').dataset.page,
        next: document.getElementById('postNext').disabled, lead: document.getElementById('postLead').style.display, noScroll: pad.scrollHeight <= pad.clientHeight + 1, onPages: document.querySelectorAll('#postq .postpage.on').length }; })()`);
      await tap("postPrev"); await sleep(150);
      const g3 = await cdp.eval(`(() => ({ step: document.getElementById('postStep').textContent, page: document.querySelector('#postq .postpage.on').dataset.page, next: document.getElementById('postNext').disabled,
        kept: document.querySelector('#gripSeg button.sel') && document.querySelector('#gripSeg button.sel').dataset.val }))()`);
      check("[go] 最後のアンケートはページ送り (19 ページ): 持ち方を答えると次へ有効 (戻るは隠す) → 2 / 19 fatigue_pre (3 問・導入文は持ち方のページに統合・1 ページだけ表示・スクロール不要・次へ無効) → 戻るで 1 / 19 (回答保持)",
        g1.step === "1 / 19" && g1.next === false && g1.submit === "none" && g1.prev === "none" &&
        g2.step === "2 / 19" && g2.page === "fatigue_pre" && g2.next === true && g2.lead === "none" && g2.noScroll === true && g2.onPages === 1 &&
        g3.step === "1 / 19" && g3.page === "grip" && g3.next === false && g3.kept === "right_thumb",
        JSON.stringify({ g1, g2, g3 }));
      // 最後のページ (操作のしやすさ) では「次へ」が消えて「完了する」が出る (全部答えるまで無効)
      await cdp.eval(`(() => { for (let i = 0; i < 25; i++) { const b = document.getElementById('postNext'); if (b.style.display === 'none') break;
        const pg = document.querySelector('#postq .postpage.on'); if (b.disabled) for (const s of pg.querySelectorAll('.seg, .checks')) { const f = [...s.querySelectorAll('button')].find((b) => b.offsetParent !== null); if (f) f.click(); } b.click(); } })()`);
      await sleep(200);
      const g4 = await cdp.eval(`(() => ({ step: document.getElementById('postStep').textContent, page: document.querySelector('#postq .postpage.on').dataset.page, next: document.getElementById('postNext').style.display,
        submit: document.getElementById('postSubmit').style.display, submitOff: document.getElementById('postSubmit').disabled }))()`);
      check("[go] 最後のページ (任意の自由記述) で「次へ」が消えて「完了する」が出る (必須が全部答えてあれば有効)", g4.step === "19 / 19" && g4.page === "comment" && g4.next === "none" && g4.submit === "" && g4.submitOff === false, JSON.stringify(g4));
      await goTo("rtut");
      const gr = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), step: (document.getElementById('tutStepLabel') || {}).textContent }))()`);
      check("[go] go=rtut → 振り返りの説明 1/4", gr.screen === "rating" && /1 \/ 4/.test(gr.step || ""), JSON.stringify(gr));
      await goTo("rating");
      const gg = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), tut: !!(document.getElementById('ratPop') && document.getElementById('ratPop').classList.contains('on')) }))()`);
      check("[go] go=rating → 通常の評定画面 (説明なし)", gg.screen === "rating" && gg.tut === false, JSON.stringify(gg));
      await goTo("tut");
      const gt = await cdp.eval(`(() => ({ screen: window.__pilot.activeScreen(), pop: !!(document.getElementById('tutPop') && document.getElementById('tutPop').classList.contains('on')) }))()`);
      check("[go] go=tut → 操作説明 1/6 から", gt.screen === "task" && gt.pop, JSON.stringify(gt));
      await goTo("micgate", "&mic=mock");
      check("[go] go=micgate → 環境音チェック", (await cdp.eval("window.__pilot.activeScreen()")) === "micgate");
      await goTo("done");
      check("[go] go=done → 完了画面", (await cdp.eval("window.__pilot.activeScreen()")) === "done");
      // ?welcome=0: 説明画面を飛ばして入力画面から (研究者が同席する対面用。2026-09-07)
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&block=moral&kiosk=1&welcome=0&debug=1&upload=0&mic=0&tut=0&rtut=0" }); await waitPilot(); await sleep(300);
      check("[welcome=0] 入力画面から始まる", (await cdp.eval("window.__pilot.activeScreen()")) === "intro");
      // ?study= を device.study に記録 (保存先サブフォルダのキー。2026-09-07)
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&block=moral&study=pilot3-test&debug=1&upload=0&mic=0" }); await waitPilot();
      check("[study] ?study= を device.study に記録", (await cdp.eval("window.__pilot.buildPayload().device.study")) === "pilot3-test");
    }

    // ===== 入力画面 (intro) が1画面に収まる = スクロール不要か (SE 相当の小画面で実測。2026-09-05) =====
    async function introFitsSmallScreen() {
      console.log("\n--- intro fit (iPhone SE 相当 375x667) ---");
      await cdp.eval("window.__pilot.resetStoredForTest()"); // 新規参加画面の寸法。前の再開テストの復旧欄を持ち込まない。
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&block=moral&debug=1&upload=0&mic=0&tut=0" });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await passWelcome(); await sleep(250);
      const fit = await cdp.eval(`(() => { const p = document.querySelector('#intro .pad');
        return { screen: window.__pilot.activeScreen(), scrollH: p.scrollHeight, clientH: p.clientHeight,
          overflow: p.scrollHeight - p.clientHeight }; })()`);
      check("[intro] 入力画面が1画面に収まる (SE 375x667 でスクロール不要)",
        fit.screen === "intro" && fit.overflow <= 0, JSON.stringify(fit));
      // 振り返り4枚＋単独の練習導入と5段評定が、375×548でスクロールなしに収まる。
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 548, deviceScaleFactor: 2, mobile: true });
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&go=rtut&debug=1&mic=0" });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await sleep(500);
      const qfit = () => cdp.eval(`(() => { const q = document.querySelector('#rating .qwrap'); const b = document.getElementById('ratBtnRow').getBoundingClientRect();
        return { step: (document.getElementById('tutStepLabel') || {}).textContent, overflow: q.scrollHeight - q.clientHeight, btnBottom: Math.round(b.bottom), vh: innerHeight }; })()`);
      const f0 = await qfit();
      await tap("ratingNext"); await sleep(450); const f1 = await qfit();
      await tapSel("#qitem-hesitation .likert button:nth-child(3)"); await sleep(100); await tap("ratingNext"); await sleep(450); const f2 = await qfit();
      const popOk = await cdp.eval(`(() => { const p = document.getElementById('ratPop').getBoundingClientRect(), t = document.getElementById('qitem-confidence').getBoundingClientRect(),
        a = document.getElementById('ratingAnswer'), at = a && !a.hidden ? a.getBoundingClientRect().top : t.top; return p.bottom <= Math.min(t.top, at) + 4 && p.top >= 0; })()`);   // 「あなたの回答」にも被らない (2026-09-13)
      await tapSel("#qitem-confidence .likert button:nth-child(3)"); await tap("ratingSubmit"); await sleep(200); const finishFit = await qfit();
      await tap("ratingSubmit"); await sleep(200); const practiceIntroFit = await qfit();
      check("[rtut/SE] 振り返り4枚＋練習導入が375×548でスクロール不要 (説明・5段・次への重複なし)",
        [f0, f1, f2, finishFit, practiceIntroFit].every(f => f.overflow <= 0 && f.btnBottom <= f.vh) && popOk,
        JSON.stringify({ f0, f1, f2, finishFit, practiceIntroFit, popOk }));
      await cdp.send("Page.navigate", { url: BASE + "?devguard=0&minread=0&readgate=0&go=rating&debug=1&mic=0" });
      for (let i = 0; i < 50; i++) { if (await cdp.eval("typeof window.__pilot !== 'undefined'").catch(() => false)) break; await sleep(200); }
      await sleep(400);
      const f3 = await qfit();
      check("[rating/SE] 本番の評定画面が 375×548 でスクロール不要", f3.overflow <= 0 && f3.btnBottom <= f3.vh, JSON.stringify(f3));
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 800, deviceScaleFactor: 2, mobile: true });
    }
    await introFitsSmallScreen();

    await require("./validate-accessibility.js")(cdp, check, BASE);
    await require("./validate-recovery.js")(cdp, check, BASE);

    cdp.close();
  } finally {
    if (harnessBrowser) await harnessBrowser.close();
    if (chrome) chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(failures === 0 ? "\n🎉 全チェック通過" : `\n⚠️ ${failures} 件失敗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("validate.js 異常終了:", e); process.exit(1); });
