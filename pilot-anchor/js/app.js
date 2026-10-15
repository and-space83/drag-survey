(function () {
  "use strict";
  if (window.pilotAssetLoadFailed || !window.PILOT_BANK || !window.createSessionStore || !window.PilotConsent || !window.PilotCodec || !window.pako || !window.PilotDurable || !window.createStagedDelivery ||
      typeof window.PilotTrialRecorder?.create !== "function" || typeof window.PilotRuntimeGuards?.create !== "function" || typeof window.PilotRuntimeGuards?.installTouchGuards !== "function" ||
      ["createEngine", "createView", "createDemo", "createTimeDemo", "createCardMotion"].some(name => typeof window.PILOT_GUIDED_TUTORIAL?.[name] !== "function")) {
    const body = document.getElementById("wcBody");
    body.innerHTML = '<h1>読み込みが完了していません</h1><p>通信を確認して、もう一度読み込んでください。</p>';
    const next = document.getElementById("wcNext");
    next.textContent = "再読み込み"; next.disabled = false;
    next.onclick = () => location.reload();
    return;
  }

  // ===== 設定 (パイロット中の動作確認はここを調整) =====
  // ブロックに依存しない共通設定。試行数・評定ON/OFF 等のブロック固有既定値は BLOCKS 側 (後方) に置く。
  const CONFIG = {
    block: "anchor",         // 実行ブロック ("anchor" | "value")。?block= で上書き
    minPoints: 3,            // dispatched 点数の下限。下回ったら無効試行として再呈示
    contactEmail: "c237702@ed.nagoya-cu.ac.jp",   // 完了コードの送り先 (大学のメール。空なら「メールで送る」を出さない。2026-09-30)
    uploadUrl: "https://script.google.com/macros/s/AKfycbxbnJbVZJQXkB4_Sn0amRW2kHXydOMWVzf-jT8IH2TlPafZR43rfRVrROguE0r8O1oY/exec",
                              // GAS Web アプリ (gas-collector.gs / DEPLOY.md)。完了時に text/plain で JSON を
                              //   自動 POST (GAS は preflight 非対応のため application/json は不可)。
                              //   null ならダウンロード/共有のみ。
    // 以下はブロック選択後に BLOCKS[block] から流し込む (?reps= 等のクエリで更に上書き)
    repsPerCell: null, practiceTrials: null, breakEvery: null, ratings: null,
  };
  const BACKUP_KEY = "pilotAnchorBackup_v1"; // 旧版からの移行元
  const legacyStorage = {
    get length() { return localStorage.length; }, key: (i) => localStorage.key(i),
    getItem: (k) => PilotCodec.decodeStorage(localStorage.getItem(k)), setItem: (k, v) => localStorage.setItem(k, PilotCodec.encodeStorage(v)),
    removeItem: (k) => localStorage.removeItem(k),
  };
  let sessionStore = createSessionStore(legacyStorage, { locks: navigator.locks }), durable = null, staged = null;
  const tabOwner = newSessionId();
  let storeReady = false, recoveryBooted = false, finishedPayload = null, recoveryId = null, suspendedRevision = null;
  let consentTiming = null, consentBusy = false;
  function newSessionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  const CLIENT_ID_KEY = "pilotAnchorClientId_v1"; // 重複参加の事後検出用 匿名 first-party マーカー
  const RESUME_WINDOW_MS = 3 * 60 * 60 * 1000;    // 中断から3時間以内。超過時のオンライン参加は保存を残して終了案内。
  // URL クエリで上書き可 (例: ?block=value で価値・選好ブロック / ?reps=2&practice=0&break=0&ratings=0 で短縮テスト。
  //   ?rotate=0 で横向きガード無効 / ?upload=0 で自動送信無効 / ?debug=1 で検証フック+CSV+常時ボタン)
  // 環境音モニタ (§6-6 項10): ?mic=0 で無効 (開発・headless)・?mic=mock は検証用。?micth=/-micchk=/micquiet=/micover=
  //   は閾値・計測時間・持続静音時間・ゲート発火下限の上書き (実機較正用) — 配布 URL には付けない (既定値=事前固定値)。
  //   ?miccal=1 = 較正モード (開発専用): 現在の dBFS を micgate と課題中 topbar に数値表示 (閾値決定の実測用)。
  // 練習は必須 (2026-07-07: UI からのスキップ導線は廃止。チュートリアル+行動ゲート付き)。
  //   ?practice=0 は練習ごとスキップする開発用の抜け道 — 配布 URL には絶対に付けない。
  const debugMode = new URLSearchParams(location.search).get("debug") === "1";
  // ドラッグ導入チュートリアル (§6-6 項14)。既定ON・?tut=0 で無効 (headless/validate・開発用)
  const DRAG_TUT_ON = new URLSearchParams(location.search).get("tut") !== "0";

  // ===== 対面セッション用オプション (2026-09-04。高齢者への対面実施 = 1人8分・途中終了が前提。§6-6 項15) =====
  // 既定はすべて OFF = クラウドソーシング配布 URL の挙動は不変 (中断ボタンなし・時間上限なし・マイクの
  // 進行ブロックあり・完全ランダム順)。対面用 URL でだけクエリを足して有効化する。
  const QS = new URLSearchParams(location.search);
  // ?kiosk=1 = 対面・複数人・実験者不在の連続実施モード (2026-09-05)。下の対面オプションをまとめて既定 ON に
  // する (個別クエリでの上書きは可)。URL を編集できない人が同じ URL を毎回開くだけで回せる状態を作るのが目的:
  //   中断ボタン / 環境音の非ブロック / 層別順 / 事前入力の省略 / 年代タップ / 参加者IDの自動採番 /
  //   つぎの人へボタン / 注意チェック・完了コードの省略 / 対面向けウェルカム文言。
  const KIOSK = QS.get("kiosk") === "1";
  // 確認モード ?go= (開発専用。2026-09-06): 該当画面だけを実機で確認する。**配布 URL には付けない**。
  //   tut (操作説明→例の1問→評定の説明→練習) / rtut (評定の説明だけ) / rating (評定画面) / post (最後のアンケート) / notice (遅い初動の案内) /
  //   instructed (追加10問の説明→10問) / done (完了画面) / break (休憩) / micgate (環境音チェック)。事前アンケートはダミー・読速は省略・マイクは micgate 以外
  //   省略・送信は常に無効・block 未指定なら moral。右下に「確認モード」の印を出す (配布と取り違えない)
  const GO = (QS.get("go") || "").replace(/[^a-z]/g, "") || null;
  const WELCOME_OFF = QS.get("welcome") === "0";   // 説明画面 (ウェルカム) を飛ばして入力画面から (研究者が同席して口頭で説明する対面用。2026-09-07)
  const on1 = (k) => QS.get(k) === "1" || (KIOSK && QS.get(k) == null);   // 既定OFF・kiosk で ON
  const off0 = (k) => !(QS.get(k) === "0" || (KIOSK && QS.get(k) == null));  // 既定ON・kiosk で OFF
  const STOP_ON = on1("stop");                   // 中断ボタン: いつでも終了 → そこまでのデータを送信
  const MIC_FIRST = QS.get("micfirst") != null ? QS.get("micfirst") === "1" : KIOSK;   // マイクの許可を入力画面より先に (対面: 研究者が許可して入力画面で渡す。2026-09-15)
  const MAX_MIN = (function () { const v = parseFloat(QS.get("maxmin")); return isFinite(v) && v > 0 ? v : null; })();
                                                 // 本番の時間上限 (分)。超えたら次の試行境界で自動終了 (試行の途中では切らない)
  const MICGATE_ON = off0("micgate");            // OFF = 環境音は計測・記録するが進行は止めない (対面は会場を変えられないため)
  const STRAT_ON = on1("strat");                 // 葛藤水準を均等に散らす出題順 (途中で切れても水準構成が偏らない)
  const RTUT_ON = QS.get("rtut") !== "0";        // 評定チュートリアル (2026-09-08 から 2 ページ)。対面で口頭説明するなら 0
  // 説明・評定・アンケート画面の文字倍率 (§6-6 項18。2026-09-08)。iPad (短辺 ≥ 700px) では自動で 1.6、?fs=1.3 のように上書き可。
  // 課題画面 (#task) には掛けない (vmin で拡大済み・軌跡の CSS px 幾何を変えない)。CSS の --ui-scale で参照
  const UI_SCALE = (function () { const v = parseFloat(QS.get("fs")); if (isFinite(v) && v >= 0.8 && v <= 2.5) return v;
    return Math.min(window.innerWidth, window.innerHeight) >= 700 ? 1.6 : 1; })();
  document.documentElement.style.setProperty("--ui-scale", String(UI_SCALE));
  const COHORT = (QS.get("cohort") || "").slice(0, 40);   // 標本タグ (例 elderly-inperson)。解析で母集団をプールしない目印
  const STUDY = (QS.get("study") || "").replace(/[^\w-]/g, "").slice(0, 40);   // 実験名 (例 pilot3)。GAS が Drive の保存先サブフォルダに使う (study || cohort。2026-09-07)
  const AGEBAND_ON = QS.get("ageband") != null ? QS.get("ageband") !== "0" : KIOSK;
                                                 // 年齢を数値入力でなく年代タップで取る (高齢者にキーボードを出さない)。
                                                 // ?ageband=70s のように値を渡すと初期選択も入る
  const PID_AUTO = QS.get("pidauto") != null ? (QS.get("pidauto") || "P") : (KIOSK ? "P" : null);
                                                 // 参加者IDの自動採番 (端末内カウンタ)。?pidauto=E → E01, E02, …
  // 課題画面に経過時間・直前1問の所要秒 (時間配分の実測用)。**明示指定のときだけ** ON にする:
  // 参加者から見える位置に時計を出すと時間圧がかかり、主予測ターゲット (迷い) を汚しうるため、
  // 自分でリハーサルする実機確認では付け、本番セッションでは付けない (所要時間はデータから出せる)
  const HUD_ON = QS.get("hud") === "1";
  // 開発専用 (2026-09-10): 本番の問題数を先頭 N 問に絞る (validate.js の再開・環境音セッションの短縮用)。**配布 URL には付けない**
  const NMAIN = (function () { const v = parseInt(QS.get("nmain"), 10); return isFinite(v) && v > 0 ? v : null; })();
  const HIDE_INTRO_FILLED = QS.get("intro") === "0" || KIOSK;   // 埋まった入力欄を隠す
  const STOPPABLE = { task: 1, rating: 1, break: 1, blockintro: 1, reading: 1, notice: 1, practicecheck: 1, guidedintro: 1 };   // 中断ボタンを出す画面

  // 場面文・説明文の改行制御 (2026-07-22 ブロック方式へ改訂): 文字列中の "|" は文節の区切り。
  // 表示時は文節ごとに inline-block (.nb) へ包み、ブロックの途中では折り返さない (改行はブロック単位)。
  // 旧 ZWSP 方式 (keep-all + U+200B) は英数字・記号まわりで変な位置の改行が残ったため置換 (実機報告 2026-07-22)。
  // 記録 (trialMeta) は stemRecord で "|"・旧ヒント "~" を除去 = 過去データと同形・不変。
  const escapeHtml = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nb = (s) => (s || "").split("|").map((seg) => `<span class="nb">${seg}</span>`).join("");   // \u8457\u8005HTML\u7528 (<b> \u7b49\u3092\u542b\u3080\u8aac\u660e\u6587)
  const nbText = (s) => (s || "").split("|").map((seg) => `<span class="nb">${escapeHtml(seg.replace(/~/g, ""))}</span>`).join("");   // \u30d7\u30ec\u30fc\u30f3\u6587\u7528
  const stemHtml = (s) => `<div class="nbwrap">${nbText(s)}</div>`;   // #stem (flex) \u7528: block \u30e9\u30c3\u30d1\u3067 flex item \u5316\u3092\u9632\u3050
  const stemRecord = (s) => (s || "").replace(/[|~]/g, "");

  // ===== 注意チェック (⑤ careless ラベル。experiment-design §6-5。combo 既定ON、?attn=0/1 で切替) =====
  // 弱DQS: ②③の 1/3・2/3 に埋め込む instructed-choice (指示側CB・中立ラベル・埋め込み先ブロックの評定を継承)。
  //   DQS 直後の本試行は post_check フラグ (警戒モードの汚染を感度分析で除外可能に。§6-2)。
  // 末尾ミニブロック (attn): infrequency + 強IMC (欺瞞・評定OFF・末尾隔離)。強IMC は done でデブリーフィング。
  // careless ラベル = 各 check の失敗数 (二値化は analysis-plan で事前固定)。isCheck 試行は主解析から除外。
  const ATTN = {
    infreq: { stem: "私はこれまで一度も|スマートフォンを|使ったことがない", yes: "はい", no: "いいえ" }, // スマホ回答中=「いいえ」が一意
    imc: { stem: "（よく読んでお答えください）|ここまで読んだ方は、|質問の内容にかかわらず|「いいえ」を選んでください。|あなたは今、|集中して回答していますか？", yes: "はい", no: "いいえ" }, // 注意して読めば「いいえ」
  };
  // 弱DQS (instructed choice): 指示された「側」へドラッグできたか。中立ラベル、答えは位置(指示側)。
  function makeDqsCell(instructedSide) {
    return {
      isCheck: "dqs",
      stem: `確認のため、|ここでは|【${instructedSide === "left" ? "左" : "右"}】~の選択肢を|選んでください`,
      leftLabel: "りんご", rightLabel: "みかん", checkAnswerSide: instructedSide,
    };
  }
  // infrequency / 強IMC: 注意して読めば「いいえ」。はい/いいえの左右はCB。
  function makeCheckCell(type) {
    const c = ATTN[type];
    const noLeft = Math.random() < 0.5;
    return {
      isCheck: type, stem: c.stem,
      leftLabel: noLeft ? c.no : c.yes, rightLabel: noLeft ? c.yes : c.no,
      checkAnswerSide: noLeft ? "left" : "right",   // 正答(=注意して読んだ側) = 「いいえ」の側
    };
  }
  function checkMeta(cell) {
    return { isCheck: cell.isCheck, checkAnswerSide: cell.checkAnswerSide,
      leftLabel: cell.leftLabel, rightLabel: cell.rightLabel, stem: stemRecord(cell.stem) };
  }

  // ===== ブロック定義 =====
  // 共通エンジン (Pointer Events 記録・回収・評定UI・復旧) はブロック非依存。ここがブロックごとの差分:
  //   刺激タイプ / 試行生成 (左右CB込み) / 描画 / 設問ステム / 試行メタ / 評定ON-OFF / 規範判定。
  // 各メソッドは呼び出し時に numA/numB/stemEl/shuffle/CONFIG を参照する (定義時には評価されない)。
  const BLOCKS = {
    // ① アンカー: 数値サイズ一致性 (Stage 1。評定OFF。experiment-design §1 / decisions-log)
    anchor: {
      id: "anchor", stimulusType: "numeric-size", title: "数値サイズ一致性課題",
      ratings: false,        // GT 不要設計のため評定なし (decisions-log「アンカーで評定を取らない」)
      breakEvery: 0,         // 84×~3秒≈4分で休憩不要 (長尺ブロック用に実装は残す)
      repsPerCell: 7,        // 12セル (congruency2×pair3×largerSide2) ×7 = 84 本番試行
      practiceTrials: 6,     // 練習バッチ数 (正誤フィードバックあり、phase:'practice'、解析除外。ゲート未達なら追加補充)
      practiceFeedback: "correct",
      gateStreak: 3,         // 行動ゲート: 有効ドラッグ+正解を3連続で本番解錠 (2026-07-07。無効/不正解でリセット)
      gateCorrect: true,     // ゲート成功条件に正誤を含める (客観正解がある課題)
      coachDrag: 'そのまま|<b>指を離さずに</b>、|光っている|<b>数が大きい方</b>の|選択肢のボックスまで運び、|選択肢のボックスの<b>中で</b>|<b>指を離します</b>',
      pairs: [[1, 2], [2, 8], [8, 9]], // [小,大]。距離: 1v2/8v9 が距離1 (8v9 が最難), 2v8 が最易
      introHtml:
        '<h1>数値サイズ一致性課題 (パイロット)</h1>' +
        '<p>スタートボタンに指を置くと、上に2つの数字の選択肢が出ます。<b>指を離さずに、数が大きい方の選択肢のボックスへドラッグ</b>して、そこで指を離してください。</p>' +
        '<ul><li>数字の<b>見た目の大きさ</b>ではなく、<b>数の大きさ</b>で選びます。</li>' +
        '<li>できるだけ自然に、素早く動かしてください。</li>' +
        '<li>急ぐ必要はありません。自分のペースで進められます。</li>' +
        '<li>操作のやり方は、最初の<b>練習</b>で画面の案内にそって覚えられます。</li></ul>',
      csvHead: "congruency,pairLabel,largerSide,correctSide",
      csvRow: (r) => `${r.congruency},${r.pairLabel},${r.largerSide},${r.correctSide}`,
      makeCell(pair, congruent, largerSide) {
        const [sVal, lVal] = pair;       // 小, 大
        const largerBig = congruent;     // congruent → 数の大きい方を物理的に大きく描画
        const left = largerSide === "left"
          ? { val: lVal, big: largerBig } : { val: sVal, big: !largerBig };
        const right = largerSide === "left"
          ? { val: sVal, big: !largerBig } : { val: lVal, big: largerBig };
        return {
          pair, pairLabel: `${sVal}v${lVal}`, numDistance: lVal - sVal,
          congruent, congruency: congruent ? "congruent" : "incongruent",
          leftVal: left.val, rightVal: right.val, leftBig: left.big, rightBig: right.big,
          largerSide, correctSide: largerSide,
        };
      },
      buildMain() {
        const cells = [];
        for (const pair of this.pairs)
          for (const cong of [true, false])
            for (const side of ["left", "right"])
              for (let r = 0; r < CONFIG.repsPerCell; r++)
                cells.push(this.makeCell(pair, cong, side));
        return shuffle(cells);
      },
      buildPractice(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const pair = this.pairs[Math.floor(Math.random() * this.pairs.length)];
          out.push(this.makeCell(pair, Math.random() < 0.5, Math.random() < 0.5 ? "left" : "right"));
        }
        return out;
      },
      renderStimulus(cell) {
        numA.textContent = cell.leftVal; numB.textContent = cell.rightVal;
        numA.className = "num " + (cell.leftBig ? "big" : "small");
        numB.className = "num " + (cell.rightBig ? "big" : "small");
        stemEl.textContent = "";          // 数値ブロックは設問ステムなし (intro で説明済み)
      },
      trialMeta(cell) {
        return {
          pair: cell.pair, pairLabel: cell.pairLabel, numDistance: cell.numDistance,
          congruent: cell.congruent, congruency: cell.congruency,
          leftVal: cell.leftVal, rightVal: cell.rightVal, leftBig: cell.leftBig, rightBig: cell.rightBig,
          largerSide: cell.largerSide, correctSide: cell.correctSide,
        };
      },
      decideOutcome(cell, choiceSide) { return choiceSide === cell.correctSide; },
      summaryExtra(main) { return `正答: ${main.filter((r) => r.correct).length}`; },
    },

    // ② 価値・選好: 文字2択 (Stage 2。評定ON。experiment-design §6-3)
    value: {
      id: "value", stimulusType: "text-choice", title: "価値・選好の2択課題",
      ratings: true, breakEvery: 0,
      repsPerCell: 1,        // 24項目セット (価値差3×ドメイン4×各2) × reps。既定1 = 本番24試行 (各項目1回・項目間で左右CB)。§6-3
      practiceTrials: 5,     // 練習5問 (2026-09-04: チュートリアル後に説明なしで自由に試す。§6-2)
      practiceFeedback: "neutral",  // 主観選択なので正誤フィードバックはしない
      gateStreak: 2,         // 行動ゲート: 有効ドラッグ2連続で本番解錠 (2026-07-07。主観課題なので正誤は問わない)
      gateCorrect: false,
      coachDrag: '選択肢を見たら|そのまま<b>指を離さずに</b>、|考えながら|<b>あなたが選ぶ方</b>まで運び、|選択肢のボックスの<b>中で</b>|<b>指を離します</b>',
      introHtml:
        '<h1>価値・選好の2択課題 (パイロット)</h1>' +
        '<p>スタートボタンに指を置くと、上に2つの選択肢が出ます。<b>指を離さずに、あなたが選ぶ方の選択肢のボックスへドラッグ</b>して、そこで指を離してください。</p>' +
        '<ul><li><b>正解・不正解はありません。</b>あなたの素直な選び方で構いません。</li>' +
        '<li>選んだあとに、「迷い」と「自信」の2つを5段階でふりかえります。答え方は練習で説明します。</li>' +
        '<li>できるだけ自然に操作してください。</li>' +
        '<li>急ぐ必要はありません。自分のペースで進められます。</li>' +
        '<li>操作のやり方は、最初の<b>練習</b>で画面の案内にそって覚えられます。</li></ul>',
      transitionHtml:
        '<h1>パートが変わります</h1>' +
        '<p>ここからは<b>別のタイプの質問</b>になります。操作と、答えたあとの「ふりかえり」はこれまでと同じです。</p>',
      csvHead: "domain,valueLevel,conflictType,betterSide,evDiff",
      csvRow: (r) => `${r.domain},${r.valueLevel},${r.conflictType},${r.betterSide},${r.evDiff}`,
      // 設問ステム (ドメイン別)
      stems: {
        goods: "どちらが欲しいですか？",
        lottery: "どちらのくじを選びますか？",
        food: "どちらかを食べるなら、どちらにしますか？",
        values: "どちらをより大切にしたいですか？",
      },
      // 項目バンク (bank.js に分離 2026-09-06。設計正本は §6-3 表)。各 = 1セル。id 省略時の itemId は makeCell が生成
      bank: PILOT_BANK.value.bank,
      practiceBank: PILOT_BANK.value.practiceBank,   // 練習2問 (bank.js)
      makeCell(item, aSide) {
        // aSide: item.a を左右どちらに置くか (= 規範優位側の左右CB)
        const leftIsA = aSide === "left";
        const left = leftIsA ? item.a : item.b;
        const right = leftIsA ? item.b : item.a;
        let betterSide = null;
        if (item.better === "a") betterSide = leftIsA ? "left" : "right";
        else if (item.better === "b") betterSide = leftIsA ? "right" : "left";
        const evLeft = left.ev != null ? left.ev : null;
        const evRight = right.ev != null ? right.ev : null;
        const evDiff = (evLeft != null && evRight != null) ? Math.abs(evLeft - evRight) : null;
        return {
          domain: item.domain, valueLevel: item.level || null,
          conflictType: item.conflictType || null,
          itemId: item.id || (item.level ? `${item.domain}-${item.level}` : item.domain),
          stem: item.stem || this.stems[item.domain] || "どちらを選びますか？",
          leftLabel: left.label, rightLabel: right.label,
          leftItemId: leftIsA ? "a" : "b", rightItemId: leftIsA ? "b" : "a",
          betterSide, evLeft, evRight, evDiff,
        };
      },
      buildMain() {
        // 左右CB は「各項目1回・項目間で均等」(= set-level CB)。同一設問を2回出さない (2026-06-23 ユーザー要望)。
        //   価値水準ごとに a 側を半々 (24項目では各水準 4 左/4 右) に振り分け、side×水準を均衡 (G2 の水準対比に side が交絡しないように)。
        //   反復は「24項目セットを repsPerCell 回」。既定 reps=1 → 本番 24 試行。本実験で reps を増やせば
        //   各項目が複数回・両側に出て within-item CB も回復する。
        const cells = [];
        for (let r = 0; r < CONFIG.repsPerCell; r++) {
          const byLevel = {};
          for (const item of this.bank) (byLevel[item.level] = byLevel[item.level] || []).push(item);
          for (const level of Object.keys(byLevel)) {
            const items = shuffle(byLevel[level].slice());   // 水準内をシャッフルしてから 2 左/2 右
            items.forEach((item, i) => cells.push(this.makeCell(item, i % 2 === 0 ? "left" : "right")));
          }
        }
        return shuffle(cells);
      },
      buildPractice(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const item = this.practiceBank[i % this.practiceBank.length];
          out.push(this.makeCell(item, Math.random() < 0.5 ? "left" : "right"));
        }
        return out;
      },
      renderStimulus(cell) {
        numA.textContent = cell.leftLabel; numB.textContent = cell.rightLabel;
        numA.className = "txt"; numB.className = "txt";
        stemEl.innerHTML = stemHtml(cell.stem);   // 文節ブロック改行 (2026-07-22)
      },
      trialMeta(cell) {
        return {
          domain: cell.domain, valueLevel: cell.valueLevel, conflictType: cell.conflictType,
          itemId: cell.itemId, leftLabel: cell.leftLabel, rightLabel: cell.rightLabel,
          leftItemId: cell.leftItemId, rightItemId: cell.rightItemId,
          betterSide: cell.betterSide, evLeft: cell.evLeft, evRight: cell.evRight, evDiff: cell.evDiff,
          stem: stemRecord(cell.stem),
        };
      },
      // 規範整合 (高価値/高EV 側を選んだか)。拮抗で規範なし (betterSide=null) は null
      decideOutcome(cell, choiceSide) {
        return cell.betterSide == null ? null : (choiceSide === cell.betterSide);
      },
      summaryExtra(main) {
        const rated = main.filter((r) => r.ratings && r.ratings.confidence != null).length;
        return `評定完了: ${rated} / ${main.length}`;
      },
    },

    // ③ 道徳ジレンマ: 文字2択 (Stage 2。評定ON。experiment-design §6-5。②と同型・text-choice エンジン流用)
    moral: {
      id: "moral", stimulusType: "text-choice", title: "道徳的な判断の2択課題",
      ratings: true, practiceRefill: false,   // 練習は 5 問で打ち切り、ゲート未達でも本番へ (未達は practiceSummary.gateCorrect=false に残る。2026-09-27)
      breakEvery: 20,   // 53問 (49+DQS4) の負担対策: 20問ごとに休憩 = 20・40 の 2 回 (2026-09-27。旧 16)。滞在時間を device.breaks に記録。§6-5
      repsPerCell: 1,        // 49項目 (7類型×[明確1・中間2・拮抗4]) × reps。既定1 = 本番49試行 (各項目1回・水準内で左右CB)。§6-5 確定表
      practiceTrials: 5,     // 練習5問 (2026-09-04: チュートリアル後に説明なしで自由に試す。§6-2)
      practiceFeedback: "neutral",  // 主観判断なので正誤フィードバックはしない
      gateStreak: 2,         // 行動ゲート: 有効ドラッグ2連続で本番解錠 (主観課題なので正誤は問わない)
      gateCorrect: false,
      coachDrag: '選択肢を見たら|そのまま<b>指を離さずに</b>、|考えながら|<b>あなたが選ぶ方</b>まで運び、|選択肢のボックスの<b>中で</b>|<b>指を離します</b>',
      introHtml:
        '<h1>道徳的な判断の2択課題 (パイロット)</h1>' +
        '<p>問題文を最後まで読み、書かれている状況が分かったらスタートボタンに指を置いてください。答えを決め終えている必要はありません。指を置くと2つの選択肢が出ます。<b>指を離さずに、あなたが選ぶ方の選択肢のボックスへドラッグ</b>して、そこで指を離してください。</p>' +
        '<ul><li><b>正解・不正解はありません。</b>あなたの素直な判断で構いません。</li>' +
        '<li>気持ちが揺れる場面が含まれます。答えたくないと感じたら、いつでも中断してかまいません。</li>' +
        '<li>選んだあとに、「自信」と「迷い」の2つを5段階でふりかえります。答え方は練習で説明します。</li>' +
        '<li>急ぐ必要はありません。自分のペースで進められます。</li>' +
        '<li>操作のやり方は、最初の<b>練習</b>で画面の案内にそって覚えられます。</li></ul>',
      transitionHtml:
        '<h1>パートが変わります</h1>' +
        '<p>ここからは<b>別のタイプの質問</b>になります。操作と、答えたあとの「ふりかえり」はこれまでと同じです。</p>' +
        '<ul><li>気持ちが揺れる場面が含まれます。答えたくないと感じたら、いつでも中断してかまいません。</li></ul>',
      csvHead: "moralType,conflictLevel,betterSide,tagWeight,tagEscape,tagSplit",
      csvRow: (r) => `${r.moralType},${r.conflictLevel},${r.betterSide},${(r.tags&&r.tags.weight)||""},${(r.tags&&r.tags.escape)||""},${(r.tags&&r.tags.split)||""}`,
      defaultStem: "あなたならどうしますか？",
      // 項目バンク (bank.js に分離 2026-09-06。設計正本は §6-5「③49問バンク確定表」)。各 = 1セル。id 省略時の itemId は makeCell が生成
      bank: PILOT_BANK.moral.bank,
      practiceBank: PILOT_BANK.moral.practiceBank,   // 新規参加の練習5問 (bank.js)。再開時は開始済み定義を使う
      makeCell(item, aSide) {
        const leftIsA = aSide === "left";
        const left = leftIsA ? item.a : item.b;
        const right = leftIsA ? item.b : item.a;
        let betterSide = null;
        if (item.better === "a") betterSide = leftIsA ? "left" : "right";
        else if (item.better === "b") betterSide = leftIsA ? "right" : "left";
        return {
          moralType: item.mtype, conflictLevel: item.level || null,
          itemId: item.id || (item.level ? `${item.mtype}-${item.level}` : item.mtype),
          stem: item.stem || this.defaultStem,
          leftLabel: left.label, rightLabel: right.label,
          leftItemId: leftIsA ? "a" : "b", rightItemId: leftIsA ? "b" : "a",
          betterSide, tags: item.tags || null,
        };
      },
      buildMain() {
        // 左右CB: 各項目1回・水準内で a 側を半々 (各水準8項目=4左/4右、side×水準を均衡)。§6-5・②と同型
        const cells = [];
        for (let r = 0; r < CONFIG.repsPerCell; r++) {
          const byLevel = {};
          for (const item of this.bank) (byLevel[item.level] = byLevel[item.level] || []).push(item);
          for (const level of Object.keys(byLevel)) {
            const items = shuffle(byLevel[level].slice());
            items.forEach((item, i) => cells.push(this.makeCell(item, i % 2 === 0 ? "left" : "right")));
          }
        }
        // ?strat=1 (対面・時間上限つき) は水準を均等に散らす。既定は従来どおり完全ランダム
        return STRAT_ON ? spreadShuffle(cells, (c) => c.conflictLevel) : shuffle(cells);
      },
      buildPractice(n) {
        const out = [];
        const items = moralPracticeDefinition().practiceBank;
        for (let i = 0; i < n; i++) {
          const item = items[i % items.length];
          out.push(this.makeCell(item, Math.random() < 0.5 ? "left" : "right"));
        }
        return out;
      },
      renderStimulus(cell) {
        numA.textContent = cell.leftLabel; numB.textContent = cell.rightLabel;
        numA.className = "txt"; numB.className = "txt";
        stemEl.innerHTML = stemHtml(cell.stem);   // 文節ブロック改行 (2026-07-22)
      },
      trialMeta(cell) {
        return {
          moralType: cell.moralType, conflictLevel: cell.conflictLevel,
          itemId: cell.itemId, leftLabel: cell.leftLabel, rightLabel: cell.rightLabel,
          leftItemId: cell.leftItemId, rightItemId: cell.rightItemId,
          betterSide: cell.betterSide, tags: cell.tags, stem: stemRecord(cell.stem),
        };
      },
      // 規範整合 (明確のみ規範優位側を選んだか)。中/拮抗は規範なし (betterSide=null) → null
      decideOutcome(cell, choiceSide) {
        return cell.betterSide == null ? null : (choiceSide === cell.betterSide);
      },
      summaryExtra(main) {
        const rated = main.filter((r) => r.ratings && r.ratings.confidence != null).length;
        return `評定完了: ${rated} / ${main.length}`;
      },
    },

    // ⑤ 末尾の注意チェック: infrequency + 強IMC (欺瞞)。評定OFF・練習なし・末尾隔離 (§6-5)。cell は isCheck 付き=エンジンが汎用描画/判定
    attn: {
      id: "attn", stimulusType: "text-choice", title: "確認の質問",
      ratings: false, breakEvery: 0, repsPerCell: 1, practiceTrials: 0,
      gateStreak: 0, gateCorrect: false, coachDrag: "",
      introHtml:   // 「確認」と言わない (注意チェックの予告になる)。「最後」でもない (この後に追加 10 問とアンケート)。2026-09-30
        '<h1>続けて、短い質問が2問あります</h1>' +
        '<p>答え方はこれまでと同じです（スタートボタンに指を置き、選ぶほうの選択肢のボックスへ運びます）。この2問には振り返りはありません。</p>',
      csvHead: "isCheck,checkAnswerSide",
      csvRow: (r) => `${r.isCheck},${r.checkAnswerSide}`,
      buildMain() { return shuffle([makeCheckCell("infreq"), makeCheckCell("imc")]); },
      buildPractice() { return []; },   // 練習なし (startPractice が空キューで startMain へ)
      renderStimulus(cell) {            // 実際は isCheck 分岐 (renderCheck) が使われるが安全側で用意
        numA.textContent = cell.leftLabel; numB.textContent = cell.rightLabel;
        numA.className = "txt"; numB.className = "txt"; stemEl.innerHTML = stemHtml(cell.stem);   // 文節ブロック改行 (2026-07-22)
      },
      trialMeta(cell) { return checkMeta(cell); },
      decideOutcome(cell, choiceSide) { return choiceSide === cell.checkAnswerSide; },
      summaryExtra() { return "確認の質問"; },
    },
  };

  // ===== ブロック列 (単体 or ②③統合) の確定 =====
  // ?block=combo で②③を1セッション統合 (ブロック順は ?order=vm|mv、既定はランダム=被験者間CB。§6-2 (A)ブロック設計)。
  // 単体 (?block=value 等) は従来どおり1ブロック。統合では loadBlock でブロックを切り替える。
  const SEQ = (function buildSeq() {
    const q = new URLSearchParams(location.search);
    const want = q.get("block") || (GO ? "moral" : null);   // 確認モードは既定で moral (評定・アンケートを持つ構成)
    if (want === "combo") {
      const order = q.get("order");
      const mv = order === "mv" ? true : order === "vm" ? false : (Math.random() < 0.5);
      return mv ? ["moral", "value"] : ["value", "moral"];   // ②③ の提示順 (被験者間CB)
    }
    return [(want && BLOCKS[want]) ? want : "anchor"];
  })();
  // ⑤注意チェック: 評定ブロックを含むセッションで既定ON (combo=②③統合 / moral 単体=③only 本番構成、2026-08-23)。
  //   末尾に attn ブロック (infrequency+強IMC) を足し、弱DQS は startMain で評定ブロックに埋め込む。?attn=0 で明示OFF。
  const ATTN_ON = (function () {
    const q = new URLSearchParams(location.search);
    if (q.get("attn") != null) return q.get("attn") !== "0";
    if (KIOSK) return false;   // 対面の短時間セッションでは careless 検出が目的でない (実験者が同席・試行数も足りない)
    return SEQ.some((id) => BLOCKS[id] && BLOCKS[id].ratings);   // 評定を取るブロック (value/moral) を含めば ON
  })();
  // 2026-09-30: infrequency + 強 IMC は別ブロックにせず、本番の最後の 2 問として出す (導入画面なし・振り返りあり = 見た目は本番と同じ)。
  // 解析では isCheck で除外する (block は moral のまま)。末尾に置く理由 (欺瞞への気づきが後続の本試行を汚さない) は不変
  const REAL_BLOCKS = SEQ.filter((b) => b !== "attn");   // device.block/combo 判定は attn を除いた実ブロックで
  const UNIFIED = REAL_BLOCKS.length > 1;   // 統合セッション: 練習を冒頭に統合しブロック別練習は廃止 (2026-07-15、§6-2)
  const HAS_RATING_BLOCK = REAL_BLOCKS.some((id) => BLOCKS[id] && BLOCKS[id].ratings);  // 事後アンケートは「評定ブロックを含むセッション」で出す (最後が attn でも出す)
  // 事後アンケート拡充分 (§6-6 項8、2026-09-06): 評定ブロックを含む**クラウド配布**のみ。対面 (kiosk / 中断ボタンあり) は
  // 時間枠が短く実施者も不在なので、操作の質問 (grip + UI/負担) だけに留める (ユーザー方針 2026-09-06)
  const POST_ON = HAS_RATING_BLOCK && !KIOSK && !STOP_ON;
  // 教示誘導ブロック (careless GT 候補 A。decisions-log 2026-09-09・§6-6 項19): ⑤末尾ブロックの後・事後アンケートの前に 10 問 (2026-09-26。旧 8。水準比 1:3:6)。
  // クラウド配布 (評定ブロックあり・kiosk/stop でない) のみ。?instr=0 で無効 (開発用)
  const INSTR_ON = (function () { const v = QS.get("instr"); if (v != null) return v !== "0"; return HAS_RATING_BLOCK && !KIOSK && !STOP_ON; })();
  const INSTR_N = 10;
  const INSTR_TEXT = "ここからの 10 問は、これまでとは逆に、問題文も選択肢も読まずに、適当に指を運んでください。どちらの選択肢でも構いません。";   // 2026-09-30 夜 ユーザー文言: 「読まなくてよい」を明確に。「思いついたほう」は見て理解する含みがあるので使わない。「ランダムに」は判断を要するので使わない   // 2026-09-30 文言改訂 (「ランダムに」は言わない = 意図的なランダム化は別の行動)
  let instructedDone = false, pendingInstructedStart = false, instrIndex = 0;
  // 開始手続き (§6-6 項19。2026-09-26 改訂 = 押下で出現): 場面文を読む → スタートに指を置いた瞬間に選択肢が出る →
  // 出現後 LATE_START_MS 以内に動き出す (超えた試行は評定送信後に案内)。動き出した後の停止は記録するだけで案内しない
  // (止まる人は止まり、迷いながら動かす人は動かす = 自然なデータを取る。旧 2026-09-09〜25 の「枠から出た瞬間に出現・3 秒停止で案内」は廃止)
  const STOP_MIN_MS = 500, STOP_NOTICE_MS = 3000, STOP_EPS_PX = 6;   // 停止 = 6px 以内に 500ms 以上。stopFlag = 動き出し後の最長停止 ≥ 3 秒 (記録のみ・感度分析用)
  const LATE_START_MS = 3000;   // 初動の締切: 出現 (押下) から動き出しまでがこれを超えたら「遅い初動」= 評定送信後に案内 (暫定 3 秒。本実験配布時に固定)
  const STOP_NOTICE_MAX = 5;   // 案内は種類ごとに1セッション5回まで。6回目以降も試行の記録は残す
  // 早出し: 問題文表示〜スタート押下が「文字数 ÷ EARLY_CPS」より短い試行。読了の有無は断定しない (品質共変量。除外基準ではない)。
  // 両方の時間条件を満たした場合は1画面にまとめる。種類ごとの上限は独立に適用する。
  const EARLY_CPS = 25;
  const READGATE_ON = QS.get("readgate") !== "0";   // 練習の読了ゲート (2026-09-13)。validate/開発用に無効化可
  const START_CRITERION_HTML = "<b>問題文を読み状況が分かったら、答えを決める前に</b>スタートボタンに指を置いてください。";
  const HELP_INTRO_HTML = "<b>問題文を読み状況が分かったら、答えを決める前に</b>スタートボタンに指を置きます。すると選択肢が出るので、指を離さずに選ぶほうの選択肢のボックスまで運びます。この操作をくり返します。";
  const EARLY_NOTICE_TEXT = "前の問題では、問題文の表示から短い時間でスタートボタンに指が置かれました。" + START_CRITERION_HTML.replace(/<[^>]*>/g, "");
  const MOVEMENT_REASON_HTML = "答えを選んでいる間の指の動きを調べるため、<b>答えが決まるのを待たずに指を動かし始めてください。</b><br>迷っているときも、<b>ゆっくりでよいので、指を動かしながら考えてください。</b>";
  const RELEASE_AREA_HTML = "<b>ボックスの内側なら、文字の上でなくても、どこで指を離しても選べます。</b>";
  const MAIN_MOVEMENT_HTML = "スタートボタンに指を置いたら、<b>3秒以内に、指をスタートボタンの外へ動かしてください。</b><br><b>3秒は回答の制限時間ではないので、自分のペースで焦らず回答してください。</b><br>" + MOVEMENT_REASON_HTML;
  const LATE_NOTICE_TEXT = "前の問題では、スタートボタンに指を置いてから3秒以上、指がスタートボタンの外へ出ていませんでした。" + MAIN_MOVEMENT_HTML.replace(/<[^>]*>/g, "");
  const NOTICE_MAX = { early: 5, late: 5 };   // 案内の上限 (種類ごと・1セッション)。2026-10-09採用: 遅い初動も5回まで
  const STOP_NOTICE_TEXT = LATE_NOTICE_TEXT;   // 旧名 (validate.js の互換用)
  const NOTICE_TEXTS = { early: EARLY_NOTICE_TEXT, late: LATE_NOTICE_TEXT };
  // 表示用 (伝えたい行動を太字に。textContent は上の平文と一致)
  const noticeRule = (title, body) => '<h2 class="notice-rule-title">' + title + '</h2><p class="notice-rule-body">' + body + '</p>';
  const NOTICE_HTML = { early: '<p class="notice-observation">前の問題では、<b class="why">問題文の表示から短い時間で</b>スタートボタンに指が置かれました。</p>' + noticeRule("スタートのタイミング", START_CRITERION_HTML),
                        late: '<p class="notice-observation">前の問題では、スタートボタンに指を置いてから<b class="why">3秒以上、指がスタートボタンの外へ出ていませんでした</b>。</p>' + noticeRule("指を動かし始めるタイミング", MAIN_MOVEMENT_HTML) };
  NOTICE_HTML.early_late = '<p class="notice-observation">前の問題では、<b class="why">問題文の表示から短い時間でスタートボタンに指が置かれ</b>、<b class="why">その後3秒以上、指がスタートボタンの外へ出ていませんでした</b>。</p>' +
    noticeRule("スタートのタイミング", START_CRITERION_HTML) + noticeRule("指を動かし始めるタイミング", MAIN_MOVEMENT_HTML);
  for (const kind of ["early", "late"]) NOTICE_TEXTS[kind] = NOTICE_HTML[kind].replace(/<[^>]*>/g, "");
  NOTICE_TEXTS.early_late = NOTICE_HTML.early_late.replace(/<[^>]*>/g, "");
  const noticeKinds = (kind) => kind === "early_late" ? ["early", "late"] : kind === "early" || kind === "late" ? [kind] : [];
  function eligibleNotice(kind) {
    const eligible = noticeKinds(kind).filter((k) => {
      const shown = device.stopNotices.filter((n) => noticeKinds(n.kind).includes(k)).length;
      if (shown < NOTICE_MAX[k]) return true;
      device.stopNoticesSuppressed++; // 上限に達して非表示にした理由の数（両方なら2）。
      return false;
    });
    return eligible.length === 2 ? "early_late" : eligible[0] || null;
  }
  let pendingNotice = null, stopNoticeShown = false, stemShownT = 0;
  let seqIndex = 0;
  let pendingMainStart = false;   // 練習クリア画面 (blockintro 流用) から「続ける」で本番へ (2026-07-15 自己ペース化)
  let BLOCK;   // 現在のブロック (統合では切替で再代入)
  function loadBlock(id) {
    BLOCK = BLOCKS[id];
    CONFIG.block = id;
    const q = new URLSearchParams(location.search);
    const num = (k, d) => { const v = q.get(k); const n = v == null ? NaN : parseInt(v, 10); return isNaN(n) ? d : n; };
    CONFIG.repsPerCell = num("reps", BLOCK.repsPerCell);
    CONFIG.practiceTrials = num("practice", BLOCK.practiceTrials);
    CONFIG.breakEvery = num("break", BLOCK.breakEvery);
    CONFIG.ratings = q.get("ratings") != null ? q.get("ratings") !== "0" : BLOCK.ratings;
    document.body.classList.remove("block-anchor", "block-value", "block-moral");
    document.body.classList.add("block-" + id);
  }
  // 送信先の差し替えは localhost の検証だけに限定する。
  {
    const q = new URLSearchParams(location.search), u = q.get("uploadurl");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (local && q.get("debug") === "1" && u && /^\/(?!\/)[\w./-]*$/.test(u)) {
      const target = new URL(u, location.href);
      if (target.origin === location.origin) CONFIG.uploadUrl = target.href;
    }
  }
  if (new URLSearchParams(location.search).get("upload") === "0") CONFIG.uploadUrl = null;
  if (GO) CONFIG.uploadUrl = null;
  loadBlock(SEQ[0]);

  // 評定 2 項目 (experiment-design.md §3-1。2026-07-15 改訂: 難しさ削除・迷い主軸・文言プロセス係留)。
  // 表示順は迷い→自信 (2026-09-06 反転、decisions-log): 主ターゲットの迷いを先に答えさせ、質問順序効果 (2つ目は1つ目に
  // 引きずられる) と過程の記憶の減衰から守る。チュートリアルの教授順も同じ。変数名は英語で統一
  // 2026-09-08: 全点に言葉 (数字併記)。中央は「どちらともいえない」にしない (量の尺度に逃げ場を作らない)。
  // 文言の正本 = experiment-design §3-1 / 決定 = decisions-log 2026-09-08
  const ITEMS = [
    { key: "hesitation", q: "答えを決めるまでに、どれくらい迷いましたか",
      labels: ["まったく迷わなかった", "あまり迷わなかった", "少し迷った", "迷った", "とても迷った"] },
    { key: "confidence", q: "いま選んだ答えに、どれくらい自信がありますか",
      labels: ["まったく自信がない", "あまり自信がない", "少し自信がある", "自信がある", "とても自信がある"] },
  ];
  // 評定チュートリアル v2 (2026-07-22 改訂+同日実機FB反映、練習1問目の評定画面。§6-2)。
  // 旧 Step1-3 (ヘッダに長文一括) をページ分割: 「次へ」ボタン/実操作で1ページずつ進み、
  // 説明は枠付きボックス (tutBox) +ステップ表示「説明 n/N」で常に評定の上の同じ位置に置く。
  // ページ2 = 5段階の中立な使い方説明 (具体例は回答分布を誘導するため出さない。2026-07-22 ユーザー決定)。
  // 実機FB (2026-07-22) の反映:
  //   - 「次へ」はボックス内でなく確定ボタンと同じ位置 (進む操作の場所を1箇所に固定)
  //   - 迷いページは当初の「自信を覆い隠す」方式をやめ全ページ同一レイアウト (自信は減光・迷いを強調) =
  //     迷いの評定位置がページでずれない
  //   - 旧「変更練習」ページ (自信を別の値へ変更させる) は削除し、最終ページで「決定して次へを押すまで
  //     何度でも変更できる」を明示的に説明する方式へ (変更の実施有無は tutChanged で観察記録)
  // 2026-09-08 (§6-6 項18): 1 項目 1 画面に合わせて 2 ページ。段の意味はボタンの言葉が担うので説明しない。
  // 残す役割 = 「別々の質問」「過程と結果の違い」「問題ごとにふりかえる」「2 画面の流れ」。具体例は出さない (2026-07-22)。
  // act: hes=迷いを選んで「次へ」 / conf=自信を選んで「次へ」(確定)
  const TUT_PAGES = [
    { act: "intro", title: "感じたことを振り返る", op: '読んだら「次へ」',
      text: '回答のあと、毎回「迷い」と「自信」を5段階で振り返ります。2つは別々の質問です。正解はありません。感じたままを選んでください。' },
    { act: "hes", title: "答えを決めるまでの迷い", focus: "hesitation", op: 'いちばん近いものを1つ押して「次へ」',
      text: '1つ目は「迷い」。答えを決めるまでに、どれくらい迷ったかを選びます。' },
    { act: "conf", title: "選んだ答えへの自信", focus: "confidence", op: 'いちばん近いものを1つ押して「次へ」',
      text: 'いま選んだ答えへの自信の強さを選びます。' },
    { act: "finish", title: "1問ずつ考え直す", op: '読んだら「練習問題へ」',
      text: '感じ方は問題によって変わります。前の問題の選択に引きずられず、その問題で感じたものに近いものをその都度選んでください。' },
  ];

  const $ = (id) => document.getElementById(id);
  const screens = { welcome: $("welcome"), intro: $("intro"), consent: $("consent"), "consent-save": $("consent-save"), task: $("task"), rating: $("rating"),
    break: $("break"), blockintro: $("blockintro"), postq: $("postq"), done: $("done"),
    micgate: $("micgate"), noisegate: $("noisegate"), reading: $("reading"),
    stopconfirm: $("stopconfirm"), resume: $("resume"), notice: $("notice"), practicecheck: $("practicecheck"), guidedintro: $("guidedintro") };
  // 通常画面のページ送りを読み上げ・キーボードでも追えるようにする。
  // 課題と読速の計測画面には焦点を移さず、表示時刻・操作対象を変えない。
  function focusScreenHeading(name) {
    if (name === "task" || name === "reading") return;
    const sc = screens[name];
    if (!sc || !sc.classList.contains("active")) return;
    const selector = name === "postq" ? ".postpage.on h2, .postpage.on label, .postpage.on #gripQuestion" :
      name === "rating" ? ".qitem:not([hidden]) .qi-text" : "h1, h2";
    const target = sc.querySelector(selector);
    if (!target || !target.getClientRects().length || getComputedStyle(target).visibility === "hidden") return;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
  function show(name) {
    if (name !== "task") clearDragFeedback();
    if (name !== "task") { hideBanner(); clearIdleCoach(); if (coachDismissTimer || coachEl.classList.contains("ok")) coachHide(); }
    if (consentTiming && !sessionFinished) consentTiming.change(document.hidden ? "background" : name);
    for (const k in screens) screens[k].classList.toggle("active", k === name);
    document.body.classList.toggle("stop-open", name === "stopconfirm");   // 確認画面の間は body 直下の説明 (tutPop/ratPop/tutHint/帯) を隠す (2026-09-12)
    if (typeof checkZoom === "function") checkZoom();   // 画面が切り替わるたびに文字サイズ・拡大を再確認 (2026-09-12 夜)
    if (STOP_ON) $("stopBtn").classList.toggle("on", !!STOPPABLE[name]);   // 中断ボタンは課題系の画面だけに出す
    if (typeof outboxRender === "function") outboxRender();   // 未送信バーは welcome/intro/done でだけ出す
    if (name !== "postq") focusScreenHeading(name);   // postq は postGoto のページ確定後
  }

  // 表示の .sel と支援技術へ渡す状態を常に同じにする（復元時にも利用）。
  function syncChoiceState(c) {
    if (!c) return;
    const buttons = [...c.querySelectorAll("button")];
    const single = c.getAttribute("role") === "radiogroup";
    const tabStop = buttons.find((b) => b.classList.contains("sel")) || buttons[0];
    for (const b of buttons) {
      b.setAttribute("aria-checked", String(b.classList.contains("sel")));
      b.tabIndex = single && b !== tabStop ? -1 : 0;
    }
  }
  function initChoiceGroup(c, multiple) {
    c.setAttribute("role", multiple ? "group" : "radiogroup");
    if (!c.hasAttribute("aria-labelledby")) {
      const field = c.closest(".field"), label = field && field.querySelector("label");
      if (label) { if (!label.id) label.id = c.id + "-label"; c.setAttribute("aria-labelledby", label.id); }
    }
    for (const b of c.querySelectorAll("button")) b.setAttribute("role", multiple ? "checkbox" : "radio");
    syncChoiceState(c);
    if (!multiple) c.addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const buttons = [...c.querySelectorAll("button")].filter((b) => !b.disabled && b.getClientRects().length);
      const at = buttons.indexOf(e.target);
      if (at < 0) return;
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 :
        (at + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next].focus({ preventScroll: true }); buttons[next].click();
    });
  }

  // セグメント選択 (性別・利き手・事後質問)。クリックで data-val を onPick に渡す。
  function wireSeg(containerId, onPick) {
    const c = $(containerId);
    initChoiceGroup(c, false);
    for (const b of c.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        for (const o of c.children) o.classList.toggle("sel", o === b);
        syncChoiceState(c);
        onPick(b.dataset.val);
      }, { passive: true });
    }
  }
  // 複数選択チェック。data-part がある場合は、そのページ内だけ「該当なし」と排他にする。
  function wireChecks(containerId, onChange) {
    const c = $(containerId);
    initChoiceGroup(c, true);
    for (const b of c.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const peers = [...c.querySelectorAll("button")].filter(o => o.dataset.part === b.dataset.part);
        if (b.dataset.none === "1") {
          const willSel = !b.classList.contains("sel");
          for (const o of peers) o.classList.toggle("sel", o === b && willSel);
        } else {                                  // 問題: トグル + 中立を外す
          b.classList.toggle("sel");
          for (const o of peers) if (o.dataset.none === "1") o.classList.remove("sel");
        }
        syncChoiceState(c);
        onChange([...c.querySelectorAll("button.sel")].map((o) => o.dataset.val));
      }, { passive: true });
    }
  }

  // ===== 端末情報・リフレッシュレート推定 =====
  const device = {
    sessionId: newSessionId(),
    ua: navigator.userAgent,
    screenW: window.innerWidth,
    screenH: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    fontPx: (() => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || null; } catch (_) { return null; } })(),   // 実効の基準文字サイズ px (OS/ブラウザの文字サイズ設定の検出用。2026-09-12)
    vvScale: (window.visualViewport && window.visualViewport.scale) || 1,   // ピンチ/ページ拡大の倍率 (2026-09-12)
    refreshHz: null,
    participantId: "",        // 入力された氏名（対面の自動採番時は実施用ID）
    clientId: getOrCreateClientId(),  // 匿名 first-party マーカー (重複参加の事後検出用。消去/別ブラウザで変わる)
    deviceModel: "",          // 自己申告の機種名 (iOS は UA でモデル判別不可のため必須)
    // 事前アンケート (特性=安定属性。聞いても今回の操作は変わらないので事前で可。必須)
    age: null, sex: null, handedness: null,
    // 事後アンケート (状態=今回の操作。事前に聞くと意識して自然な使い方が崩れるため課題後に回顧で取得)
    //   grip = 持ち方+操作した指を1問に統合 (right_thumb/left_thumb/both_thumbs/cradle/on_table)。
    //   操作手の左右は解析側で grip から導出 (right_thumb→右, left_thumb→左, both_thumbs→両, cradle/on_table→不明)
    grip: null,
    // 事後アンケート UI/負担 (②③=評定ブロックのみ)。使いにくかった点[複数選択]/操作しやすさ/自由記述(その他選択時のみ表示・必須)。
    //   時間ゲートを廃し離脱率で判定する G4 の「負担の主観版」裏付け + UI/チュートリアル改善材料 (pilot2-design-notes)。
    survey: null,
    post: null,               // 事後アンケート拡充分。POST_ITEMSの24項目（ui8で本番の開始基準・3秒の理解を追加）。評定ブロックを含むクラウド配布のみ、未回答はnull
    postPresentedKeys: [], postQuestionMeta: {}, // 実表示項目と質問版・範囲・提示定義
    surveyProblemDefinition: null, // 困りごとの文言とページ所属の固定情報。閲覧・理解の記録ではない
    postMs: null,             // 事後アンケート画面の滞在時間 (表示〜完了。負担の指標)
    mic: null,   // 環境音モニタの実測記録 {mode, threshold, …, ambientDb, ambientRetries, drops} (finishSession で確定。§6-6 項10)
    wakeLock: null,        // Screen Wake Lock の取得可否 (§6-6 項11。iOS 16.4+ / 非対応端末は false)
    completionCode: null,  // 実施確認用の完了コード (§6-6 項12。finishSession で発行しデータにも記録)
    readingBaseline: null, // 読速ベースライン {trials:[{chars,ms}], charsPerSec} (§6-6 項13。moral 含むセッションのみ)
    block: REAL_BLOCKS.length > 1 ? "combo" : REAL_BLOCKS[0],  // "anchor"|"value"|"moral"|"combo"(②③統合)。attn 除く実ブロックで判定。統合では per-trial の block で振り分け
    seq: SEQ.slice(),         // ブロック提示順 (被験者間CB の割付記録。単体は1要素)
    config: CONFIG,
    practiceSummary: null,    // 行動ゲートの達成記録 (startMain で設定。§6-2。統合では最後のブロック分=単体互換)
    practiceEarlyPress: 0,    // 練習で固定読了時間より早い押下を受け付けなかった回数
    practiceSummaryByBlock: {}, // ブロック別の達成記録 (統合セッション用)
    breaks: [],               // 休憩の滞在時間ログ {block, atTrial, dwellMs} (breakEvery>0 のブロック。負担の行動指標。2026-08-23)
    ageBand: null,            // 年代タップ (?ageband=1 / kiosk) で取った場合の年代。数値 age は null のまま
    // 対面セッション (§6-6 項15)。クラウド配布では cohort=null・partial=false・endedBy="complete" になる
    kiosk: KIOSK,             // 連続実施モードで取ったデータか (教示・注意チェックの構成が違う)
    cohort: COHORT || null,   // 標本タグ (elderly-inperson 等)。異なる母集団を解析でプールしないための目印
    study: STUDY || null,     // 実験名 (?study=。GAS の保存先サブフォルダ = study || cohort。実験ごとにデータを混ぜないため。2026-09-07)
    partial: false,           // 本番を最後まで通していない (中断ボタン / 時間上限で終了) か
    endedBy: null,            // "complete" | "operator" (中断ボタン) | "timebox" (時間上限)
    endedPhase: null,         // 終了時のフェーズ ("practice" | "main")
    mainCompleted: null,      // 実際に完了した本番試行数 (統合は全ブロック合計)
    mainPlanned: null,        // 計画していた本番試行数 (終了時点のブロック)
    mainMs: null,             // 本番開始〜終了の実時間 (ms)
    stopPauses: [],           // 中断確認画面に入って戻った記録 {screen, durationMs} (該当試行の時間指標の汚染検出用)
    resumes: [],              // 中断→再開の記録 {at, afterTrial, gapMs} (§6-6 項17。再読込/タブ破棄の後に同じ URL で続きから再開)
    tutorialLog: [],          // チュートリアルの各説明ページの滞在 ms とやり直し {kind:'drag'|'rating', step|page, ms} / {kind, event:'replay'|'again'|'back'} (2026-09-07)
    instructionExposure: [], // 現行の教示が実際に表示された履歴。開始時のappVersionとは別に、旧版からの再開・見直しを区別する
    uiScale: UI_SCALE,        // 説明・評定・アンケート画面の文字倍率 (§6-6 項18)
    startMode: "press",       // 開始手続き (§6-6 項19): 'press' = 場面文先出し・押下で選択肢・初動締切 3 秒 (2026-09-26)。'dynamic' = 枠から出たら出現 (2026-09-09〜25)。無し = 静的 (それ以前)
    instructed: null,         // 教示誘導ブロック {n, itemIds, text} (careless GT 候補 A。§6-6 項19)
    stopNotices: [],          // 停止の案内画面の表示記録 {afterTrial, kind, ms} (§6-6 項19)
    stopNoticesSuppressed: 0, // 上限（種類ごと5回）で非表示にした理由数。両方の抑止なら2
    pageZoom: 1, textZoom: 1, zoomGuardShown: 0,   // 文字サイズ・ページ拡大 (screen.width/innerWidth・文字だけの拡大比) とガードの表示回数 (2026-09-12 夜)
    practiceChecks: [], noticeReviews: [], noticeAcknowledgements: [], // 旧別画面見直しと新注意内確認を分ける。読了・理解や除外の判定には用いない
    appVersion: "2026-10-16-ui21",  // 実演の倍率・待機と復習・振り返りの表示調整。開始時の版は再開でも保持する
    moralPracticeDefinition: null, // 最初の操作説明・練習開始時に固定する刺激の版と全文。表示・理解の証跡ではない
    welcomeAgree: null,       // はじめに 5/6・6/6 の同意チェック {items, pages, ms}
    devGuard: null,           // 機種ガード {on,minH,w,h,shown,isIPhone,isIPad,ipadLink,platformOk,sizeOk}
    exportedAt: null,
  };
  $("devline").textContent = `${device.screenW}×${device.screenH} @${device.dpr}x`;

  // appVersionは開始時の版を維持するため、教示の表示版は実行中のコードから記録する。
  // 未記録の旧画面を推測で埋めず、表示イベントを読了・理解とみなさない。
  const INSTRUCTION_VERSION = "2026-10-16-ui21";
  function moralPracticeDefinition(legacy = false) {
    if (!device.moralPracticeDefinition) {
      const source = PILOT_BANK.moral;
      device.moralPracticeDefinition = JSON.parse(JSON.stringify({
        version: legacy ? source.legacyPracticeVersion : source.practiceVersion,
        example: legacy ? source.legacyExample : source.example,
        practiceBank: legacy ? source.legacyPracticeBank : source.practiceBank,
      }));
    }
    return device.moralPracticeDefinition;
  }
  function tutorialExample(block = BLOCK) {
    // 旧value/anchor経路の例題はそのまま。道徳の例題は再開で保持した定義から取る。
    return block.id === "moral" ? moralPracticeDefinition().example : PILOT_BANK.moral.legacyExample;
  }
  function makeTutorialCell(block = BLOCK) {
    const tc = block.makeCell(tutorialExample(block), "left");
    tc.isTutorial = true;
    return tc;
  }
  function restoreMoralPracticeDefinition(b, r) {
    device.moralPracticeDefinition = b.device.moralPracticeDefinition ? JSON.parse(JSON.stringify(b.device.moralPracticeDefinition)) : null;
    // UI17以前は定義を保存していない。操作説明・練習へ入ったセッションだけ旧定義を保持する。
    // 保存済みqueue/currentCell/trialsは原文のまま復元し、新しい刺激へ置き換えない。
    if (!device.moralPracticeDefinition && r.seq.includes("moral") &&
        (r.mainStarted || r.stage === "dragTutorial" || r.preMain?.dragDone || b.trials.some(t => ["tutorial", "practice"].includes(t.phase)))) {
      moralPracticeDefinition(true);
    }
  }
  function logInstructionExposure(screen, detail = {}) {
    device.instructionExposure.push({ version: INSTRUCTION_VERSION, at: new Date().toISOString(),
      screen, ...detail, phase, block: CONFIG.block, afterTrial: trialIndex });
  }

  // 匿名 first-party マーカー: 重複参加を事後 (解析時) に検出するための消去可能な目印。
  // localStorage に残る間は不変 → 同端末・同ブラウザの再参加は同一 ID。消去/別ブラウザ/別端末/
  // iOS ITP で変わるため「弱い手がかり」。固有ハードウェア ID ではなく個人を特定しない。
  // 参加者IDの自動採番 (端末内カウンタ)。採番はページ読込時 = 同じ番号が2人に付くことがない (安全側)
  const PID_SEQ_KEY = "pilotAnchorPidSeq_v1";
  function nextParticipantId(prefix) {
    let n;
    try {
      n = (parseInt(localStorage.getItem(PID_SEQ_KEY), 10) || 0) + 1;
      localStorage.setItem(PID_SEQ_KEY, String(n));
    } catch (_) { n = Math.floor(Math.random() * 900) + 100; }   // 保存できない環境は乱数で衝突回避
    return String(prefix).replace(/[^\w-]/g, "").slice(0, 8) + String(n).padStart(2, "0");
  }
  function getOrCreateClientId() {
    const gen = () => (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "cid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    // 対面で1台を複数の参加者が使う運用 (URL で pid を渡す) では端末マーカーを共有しない。
    // clientId は「同一人物の重複参加」の事後検出用なので、共用端末では別人が同一人物に見えてしまう
    if (QS.get("pid") || PID_AUTO) return gen();
    try {
      let id = localStorage.getItem(CLIENT_ID_KEY);
      if (!id) { id = gen(); localStorage.setItem(CLIENT_ID_KEY, id); }
      return id;
    } catch (_) {
      return "tmp-" + gen();  // プライベートモード等で保存不可 → セッション限りの一時 ID
    }
  }

  (function estimateRefresh() {
    const deltas = []; let last = null, count = 0;
    function tick(ts) {
      if (last !== null) deltas.push(ts - last);
      last = ts; count++;
      if (count < 100) requestAnimationFrame(tick);
      else {
        deltas.sort((a, b) => a - b);
        device.refreshHz = +(1000 / deltas[deltas.length >> 1]).toFixed(0);
      }
    }
    requestAnimationFrame(tick);
  })();

  // ===== 環境音モニタリング (2026-07-21、experiment-design §6-6 項10 / decisions-log) =====
  // 環境音モニタは **既定 OFF** (2026-09-26 廃止決定、decisions-log 同日): iOS は一度「許可しない」を押すと設定アプリを
  // 変えるまで再プロンプトが出ず遠隔で復旧できない + AGC でレベル差が潰れ (2026-07-22 電車内が静か判定) 測度として信用しにくい。
  // 実施環境は画面離脱 (vis) と最後のアンケートの自己報告で見る。実装は残し ?mic=1 (実物) / ?mic=mock (検証) で有効化できる。
  // 有効時の取得は音量レベル (RMS dBFS) のみで音声波形はその場で捨てる (保存も送信もしない)。
  const MIC = (function () {
    const q = new URLSearchParams(location.search);
    const p = (k, d) => { const v = q.get(k); const n = v == null ? NaN : parseFloat(v); return isNaN(n) ? d : n; };
    const m = (GO === "micgate" && q.get("mic") == null) ? "1" : q.get("mic");   // 確認モード go=micgate は実物のマイクで見る
    return {
      mode: m === "mock" ? "mock" : (m === "1" || m === "real") ? "real" : "off",
      cal: q.get("miccal") === "1",  // 較正モード (開発専用): 現在レベルを数値表示して閾値決定の実測に使う
      threshold: p("micth", -35),    // dBFS 閾値 (超過=騒音)。⚠️ 暫定 — 2026-07-22 実機で「電車内が静か判定」= 緩すぎ疑い。?micth=/?miccal= で較正中
      checkMs: p("micchk", 5000),    // 事前チェックの計測時間
      quietMs: p("micquiet", 2000),  // ノイズゲート解除に要する連続静音時間 (瞬間値でなく持続判定)
      gateMinOverMs: p("micover", 500), // 試行内の累積超過がこれ未満 (咳など瞬間音) はゲートを出さない (記録は残る)
      tickMs: 125,                   // レベル計測周期 ~8Hz (60Hz 軌道記録に負荷をかけない)
      stream: null, ctx: null, analyser: null, buf: null, fbuf: null,
      acquired: false, lost: false, drops: 0, mockDb: -60,
      muted: false, mutedAt: 0, muteCount: 0, mutedMs: 0,   // トラックのミュート (iOS はバックグラウンド/着信で ended でなく mute になる)
      ambientDb: null, ambientRetries: 0,
    };
  })();
  let noiseAcc = null, visAcc = null;   // 試行窓 (呈示〜評定送信) のアキュムレータ。presentStimulus でリセット
  function resetMonitors() {
    noiseAcc = { n: 0, sum: 0, max: -Infinity, overMs: 0, mutedMs: 0 };
    visAcc = { count: 0, totalMs: 0 };
  }
  function restoreMonitors(saved) {
    resetMonitors();
    if (!saved) return;
    if (saved.noise) Object.assign(noiseAcc, saved.noise);
    if (!noiseAcc.n) noiseAcc.max = -Infinity;
    if (saved.vis) Object.assign(visAcc, saved.vis);
    hiddenAt = null;
  }
  resetMonitors();
  function stampMonitors(t) {   // 試行レコードに環境音・画面離脱の要約を刻む (評定ONの試行は submitRating で評定込み窓に上書き)
    t.noise = MIC.mode === "off" ? null : {
      n: noiseAcc.n,
      meanDb: noiseAcc.n ? +(noiseAcc.sum / noiseAcc.n).toFixed(1) : null,
      maxDb: noiseAcc.n ? +noiseAcc.max.toFixed(1) : null,
      overMs: noiseAcc.overMs,
      mutedMs: Math.round(noiseAcc.mutedMs || 0),   // 計測できなかった時間 (ミュート中はサンプルを取らない)
    };
    t.vis = { count: visAcc.count, totalMs: +visAcc.totalMs.toFixed(0) };
  }

  // ---- 集中監視: 画面離脱 (visibilitychange) の試行ごと記録 (§6-6 項11。許可不要) ----
  // アプリ切替・通知タップ・画面ロックによる離脱を検出。「ながら実施」の可視化 + 環境音 (音)・
  // devicemotion (揺れ) と合わせた実施環境の三方向の裏取り。復帰時は AudioContext / Wake Lock も回復する
  let hiddenAt = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (hiddenAt != null) { visAcc.count++; visAcc.totalMs += performance.now() - hiddenAt; hiddenAt = null; }
    if (MIC.ctx && MIC.ctx.state === "suspended") MIC.ctx.resume();   // iOS は非表示で AudioContext が止まる
    requestWakeLock();   // Wake Lock は非表示で自動解放されるため再取得
  });

  // ---- Screen Wake Lock: 課題中の自動消灯を抑止 (§6-6 項11。評定で手が止まる→ロック→マイク切断、の予防) ----
  function requestWakeLock() {
    if (!navigator.wakeLock || !navigator.wakeLock.request) { device.wakeLock = false; return; }
    navigator.wakeLock.request("screen")
      .then(() => { device.wakeLock = true; })
      .catch(() => { if (device.wakeLock !== true) device.wakeLock = false; });
  }
  function currentDb() {   // 現在の音量レベル (dBFS)。未取得/切断中/ミュート中は null
    if (MIC.muted) return null;   // ミュート中 (iOS のバックグラウンド等) は無音として集計しない
    if (MIC.mode === "mock") return MIC.acquired ? MIC.mockDb : null;
    if (!MIC.acquired || !MIC.analyser) return null;
    let rms = 0;
    if (MIC.fbuf) {
      MIC.analyser.getFloatTimeDomainData(MIC.fbuf);
      for (let i = 0; i < MIC.fbuf.length; i++) rms += MIC.fbuf[i] * MIC.fbuf[i];
      rms = Math.sqrt(rms / MIC.fbuf.length);
    } else {   // 旧 Safari fallback (byte 0–255 → -1..1)
      MIC.analyser.getByteTimeDomainData(MIC.buf);
      for (let i = 0; i < MIC.buf.length; i++) { const v = (MIC.buf[i] - 128) / 128; rms += v * v; }
      rms = Math.sqrt(rms / MIC.buf.length);
    }
    return rms > 0 ? Math.max(-100, +(20 * Math.log10(rms)).toFixed(1)) : -100;
  }
  function acquireMic() {
    if (MIC.mode === "mock") { MIC.acquired = true; MIC.lost = false; MIC.muted = false; return Promise.resolve(); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return Promise.reject(new Error("unsupported"));
    // AGC/ノイズ抑制/エコキャンをオフ = 環境音レベルを歪めない (iOS は部分対応・ベストエフォート)
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
    }).then((stream) => {
      MIC.stream = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!MIC.ctx) MIC.ctx = new AC();
      if (MIC.ctx.state === "suspended") MIC.ctx.resume();
      MIC.analyser = MIC.ctx.createAnalyser();
      MIC.analyser.fftSize = 2048;
      MIC.ctx.createMediaStreamSource(stream).connect(MIC.analyser);   // 解析のみ・出力へ未接続 (音は鳴らない)
      MIC.fbuf = typeof MIC.analyser.getFloatTimeDomainData === "function" ? new Float32Array(2048) : null;
      MIC.buf = MIC.fbuf ? null : new Uint8Array(2048);
      MIC.acquired = true; MIC.lost = false; MIC.muted = false;
      const track = stream.getAudioTracks()[0];   // 切断 (着信・画面ロック・許可剥奪) の検知
      if (track) track.addEventListener("ended", micLost);
      if (track) {   // ミュート (iOS はバックグラウンド/着信でトラックを止める。ended ではない): 無音として集計せず記録し、試行境界で再取得判定に使う
        track.addEventListener("mute", () => { if (!MIC.muted) { MIC.muted = true; MIC.mutedAt = performance.now(); MIC.muteCount++; } });
        track.addEventListener("unmute", () => {
          if (MIC.muted) { const d = performance.now() - MIC.mutedAt; MIC.mutedMs += d; if (noiseAcc) noiseAcc.mutedMs += d; }
          MIC.muted = false;
        });
      }
    });
  }
  function micLost() {   // 切断: ドラッグ中なら無効試行に。以降は次の試行境界 (micCheckpoint) で再取得を要求
    if (!MIC.acquired) return;
    MIC.acquired = false; MIC.lost = true; MIC.drops++;
    if (recording) { recording = false; activePointerId = null; retryTrial("マイクが切断されました", null, "microphone_disconnected"); }
  }

  // ---- micgate 画面 (precheck=開始前の環境音チェック / reacquire=切断後の再取得) ----
  let micGateMode = null, micGateNext = null, ambientRun = null;
  function showMicGate(mode, next) {
    micGateMode = mode; micGateNext = next || null; ambientRun = null;
    $("micgateTitle").textContent = mode === "precheck" ? "実施環境の確認" : "マイクが切断されました";
    $("micgateBody").innerHTML = mode !== "precheck"
      ? '<p>マイクの接続が切れました (着信・画面ロックなどで起こることがあります)。</p>' +
        '<p>続けるには、下のボタンからマイクをもう一度許可してください。</p>'
      : MICGATE_ON
      ? '<p>この調査は、<b>静かな環境で集中して</b>行っていただく必要があります。</p>' +
        '<p>開始前に、マイクで<b>周囲の音の大きさ</b>を確認します。下のボタンを押して、マイクの利用を<b>許可</b>してください。</p>' +
        '<p class="opt-note">マイクで測定するのは<b>音量レベルのみ</b>です。会話などの音声の内容は記録・送信されません。マイクを許可いただけない場合、この調査には参加できません。</p>'
      // 対面 (?micgate=0): 会場は参加者が変えられないので「静かな場所へ移動」を求めない。計測・記録はする
      : '<p>はじめに、マイクの利用を<b>許可</b>してください。</p>' +
        '<p class="opt-note">周囲の音の<b>大きさだけ</b>を記録します。会話などの音声の内容は記録・送信されません。音の大きさで先に進めなくなることはありません。</p>';
    $("micgateStatus").textContent = "";
    $("micgateStart").textContent = mode === "precheck" ? (MICGATE_ON ? "マイクを許可して計測する" : "マイクを許可する") : "マイクを再取得する";
    $("micgateGo").textContent = (mode === "precheck" && next) ? (next === showIntroScreen ? "入力にすすむ" : "続きにすすむ") : "練習にすすむ";   // 再開 (§6-6 項17) は練習でなく本番の続きへ / 対面はマイク → 入力
    $("micgateStart").style.display = "";
    $("micgateGo").style.display = "none";
    show("micgate");
    $("micgate").querySelector(".pad").scrollTop = 0;
  }
  function micGateStart() {
    $("micgateStatus").textContent = "マイクを準備しています…";
    acquireMic().then(() => {
      if (micGateMode === "reacquire") {   // 再取得: 中断点へ復帰 (micCheckpoint を再評価)
        const f = micGateNext; micGateMode = null; micGateNext = null;
        if (f) f();
        return;
      }
      ambientRun = { until: performance.now() + MIC.checkMs, sum: 0, n: 0 };   // 事前チェック計測開始
      $("micgateStart").style.display = "none";
      if (!MICGATE_ON) {   // 対面 (kiosk / ?micgate=0): 計測を待たせず先へ。会場の音量は裏で計測して ambientDb に残す (2026-09-07)
        const f = micGateNext || enterSession; micGateMode = null; micGateNext = null; f();
      }
    }).catch(() => {
      $("micgateStatus").innerHTML =
        "⚠️ マイクを利用できませんでした。参加にはマイクの許可が必要です。<br>" +
        "ブラウザや端末の設定でこのサイトのマイクを許可してから、もう一度お試しください。";
    });
  }
  function ambientDone(meanDb) {
    MIC.ambientDb = +meanDb.toFixed(1);
    if (!MICGATE_ON) {   // 対面: 判定で止めず、実験者が会場のレベルを控えられるよう実測値を出す
      $("micgateStatus").textContent = `✅ 計測しました (${MIC.ambientDb} dB)。このまま始められます。`;
      $("micgateGo").style.display = "";
      return;
    }
    if (meanDb <= MIC.threshold) {
      $("micgateStatus").textContent = "✅ 静かな環境です。このまま始められます。";
      $("micgateGo").style.display = "";
    } else {   // 騒音: 進行ブロック + 再計測ループ
      MIC.ambientRetries++;
      $("micgateStatus").innerHTML =
        "⚠️ 周囲の音が大きいようです。<br><b>テレビ・音楽・会話のない静かな場所</b>に移動して、もう一度計測してください。";
      $("micgateStart").textContent = "もう一度計測する";
      $("micgateStart").style.display = "";
      if (MIC.cal) $("micgateGo").style.display = "";   // 較正モード (?miccal=1) は判定に関係なく先へ進めて課題中も計測できる
    }
  }

  // ---- noisegate 画面 (試行間の騒音アラート。評定「送信後」限定 = 迷い評定 (主予測ターゲット) を汚染しない) ----
  let noiseGate = null;   // {enteredAt, quietSince, retries, trialRec, next}
  function micCheckpoint(next) {   // 本番の試行境界で呼ぶ: 切断→再取得 / 直前試行が騒音→ゲート / 通常→次へ
    if (MIC.mode === "off") { next(); return; }
    if (!MICGATE_ON) { next(); return; }   // 対面 (?micgate=0): 計測・記録は続けるが進行は止めない (切断も再取得を求めない)
    if (MIC.lost) { showMicGate("reacquire", () => micCheckpoint(next)); return; }
    if (MIC.muted && performance.now() - MIC.mutedAt > 1500) {   // 1.5 秒を超えるミュート (別アプリがマイクを保持等) は切断と同じ扱い。復帰直後の一瞬は通す
      MIC.lost = true; showMicGate("reacquire", () => micCheckpoint(next)); return;
    }
    const last = records[records.length - 1];
    if (last && last.noise && last.noise.overMs >= MIC.gateMinOverMs) { showNoiseGate(last, next); return; }
    next();
  }
  function showNoiseGate(trialRec, next) {
    noiseGate = { enteredAt: performance.now(), quietSince: null, retries: 0, trialRec, next };
    $("noisegateGo").style.display = "none";
    $("noisegateStatus").textContent = "";
    $("noisegateHint").style.display = "none";
    show("noisegate");
    $("noisegate").querySelector(".pad").scrollTop = 0;
  }

  // ---- レベル計測ティック (~8Hz): 試行窓の集計 + micgate/noisegate の UI 状態機械 ----
  function updateMeters(db) {
    for (const id of ["micgateMeter", "noisegateMeter"]) {
      const el = $(id);
      if (!el || !el.offsetParent) continue;   // 非表示画面はスキップ
      el.firstElementChild.style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + "%";
      el.classList.toggle("loud", db > MIC.threshold);
    }
  }
  const calStats = { n: 0, sum: 0, max: -Infinity, min: Infinity };   // 較正モードの累積統計
  setInterval(() => {
    const db = currentDb();
    if (db == null) return;
    noiseAcc.n++; noiseAcc.sum += db;
    if (db > noiseAcc.max) noiseAcc.max = db;
    if (db > MIC.threshold) noiseAcc.overMs += MIC.tickMs;
    updateMeters(db);
    if (MIC.cal) {   // 較正モード (?miccal=1): 現在レベルを数値表示 (課題中は topbar・micgate では status 行)
      calStats.n++; calStats.sum += db;
      if (db > calStats.max) calStats.max = db;
      if (db < calStats.min) calStats.min = db;
      const el = $("calDb");
      el.style.display = "";
      el.textContent = `${db.toFixed(1)} dB`;
      if (screens.micgate.classList.contains("active") && !ambientRun)
        $("micgateStatus").textContent =
          `現在 ${db.toFixed(1)} dB / 平均 ${(calStats.sum / calStats.n).toFixed(1)} / ` +
          `最小 ${calStats.min.toFixed(1)} / 最大 ${calStats.max.toFixed(1)} / 閾値 ${MIC.threshold}`;
    }
    if (ambientRun) {   // 事前チェックの計測中
      ambientRun.n++; ambientRun.sum += db;
      const remain = ambientRun.until - performance.now();
      $("micgateStatus").textContent = `周囲の音を計測しています… ${Math.max(1, Math.ceil(remain / 1000))}`;
      if (remain <= 0) { const mean = ambientRun.sum / Math.max(1, ambientRun.n); ambientRun = null; ambientDone(mean); }
    }
    if (noiseGate && screens.noisegate.classList.contains("active")) {   // ゲート解除は持続静音 (quietMs 連続) で判定
      const now = performance.now();
      if (db > MIC.threshold) {
        if (noiseGate.quietSince != null) noiseGate.retries++;   // 静音からの再騒音 = リトライとして記録
        noiseGate.quietSince = null;
        $("noisegateStatus").textContent = "…まだ周囲の音が大きいようです";
        $("noisegateGo").style.display = "none";
      } else if (noiseGate.quietSince == null) {
        noiseGate.quietSince = now;
        $("noisegateStatus").textContent = "静かなことを確認しています…";
      } else if (now - noiseGate.quietSince >= MIC.quietMs) {
        $("noisegateStatus").textContent = "✅ 静かになりました";
        $("noisegateGo").style.display = "";
      }
      if (now - noiseGate.enteredAt > 60000) $("noisegateHint").style.display = "";   // 長期化時の逃げ道案内
    }
  }, MIC.tickMs);

  // ===== 読速ベースライン (2026-07-22 決定、experiment-design §6-6 項13 / decisions-log) =====
  // 道徳ジレンマの場面文は 40–70 字で試行により長さが違い、RT proxy に読解時間が混入する。
  // 中立短文3本 (約30/45/60字 = 場面文の字数域をカバー) を「読み終えたらタップ」で計測して
  // 参加者ごとの読速 (字/秒) を実測し、解析での読解時間の分離 (実測値 or RT〜文字数回帰の較正) に使う。
  // moral を含むセッションで既定ON (?read=0 で無効・?read=1 で強制ON)。位置 = micgate 通過後・練習の前。
  const READ_SENTENCES = PILOT_BANK.readingSentences;   // ③落選場面 4 本 (2026-09-09。旧: 中立短文 3 本)。文言は bank.js
  const READING_ON = (function () {
    if (GO) return false;   // 確認モードは読速ベースラインを省略
    const v = new URLSearchParams(location.search).get("read");
    if (v != null) return v !== "0";
    if (KIOSK) return false;   // 対面 (kiosk) は主分析に入れないので読速を省き、限られた時間を問題に回す (2026-09-07。?read=1 で強制ON)
    return REAL_BLOCKS.includes("moral");
  })();
  let readIdx = -1, readShownAt = 0, readResumed = false;
  function showReading(restored) {
    readIdx = restored ? restored.index : -1;
    readResumed = !!restored && readIdx >= 0;
    if (!restored || !device.readingBaseline) device.readingBaseline = { trials: [], charsPerSec: null };
    if (readResumed) device.readingBaseline.resumed = true;
    $("readCounter").textContent = "";
    $("readText").style.display = "none";
    $("readIntro").style.display = "";
    $("readDone").textContent = "はじめる";
    show("reading");
    $("reading").querySelector(".pad").scrollTop = 0;
    if (readIdx >= 0) renderReading(restored.elapsedMs);
    else logInstructionExposure("reading");
    resumeStage = "reading"; saveBackup();
  }
  function renderReading(elapsedMs = 0) {
    $("readIntro").style.display = "none";
    $("readCounter").textContent = `${readIdx + 1} / ${READ_SENTENCES.length}`;
    $("readText").innerHTML = nbText(READ_SENTENCES[readIdx]);
    $("readText").style.display = "";
    $("readDone").textContent = "読み終えた";
    readShownAt = performance.now() - elapsedMs;
  }
  function readAdvance() {
    // 連打ガード (レビューWF 2026-07-22): iOS はダブルタップが2連 click で届き、readDone は3文の間
    // 同一位置に出続けるため、2発目が次の文を ms≈100 で記録して charsPerSec を汚染する。表示後 400ms 未満は無視
    // (400ms は最短文30字の現実的な読了時間 ~1.5s より十分短く、正当なタップを弾かない)
    if (readIdx >= 0 && performance.now() - readShownAt < 400) return;
    if (readIdx >= 0) {   // 直前の文の計測を記録 (表示〜タップ)
      const chars = READ_SENTENCES[readIdx].replace(/\|/g, "").length;
      device.readingBaseline.trials.push({ chars, ms: +(performance.now() - readShownAt).toFixed(0), ...(readResumed ? { resumed: true } : {}) });
    }
    readIdx++;
    if (readIdx >= READ_SENTENCES.length) {   // 完了: 読速を集計して練習へ
      const t = device.readingBaseline.trials;
      const totalChars = t.reduce((s, r) => s + r.chars, 0);
      const totalMs = t.reduce((s, r) => s + r.ms, 0);
      device.readingBaseline.charsPerSec = totalMs > 0 ? +(totalChars / (totalMs / 1000)).toFixed(2) : null;
      startPractice();
      return;
    }
    readResumed = false;
    renderReading();   // 教示の読み時間を1問目に混ぜない
    resumeStage = "reading"; saveBackup();
  }
  function showIntroScreen() { show("intro"); $("intro").querySelector(".pad").scrollTop = 0; }
  function gotoIntro() {   // 入力画面へ。対面 (MIC_FIRST) はその前にマイクの許可 (2026-09-15: 研究者が許可を済ませて入力画面で渡す)
    if (MIC_FIRST && MIC.mode !== "off" && !MIC.acquired) { showMicGate("precheck", showIntroScreen); return; }
    showIntroScreen();
  }
  function enterSession() {   // intro/micgate 通過後の入口: 読速ベースライン → 練習 (§6-6 項13。対面は読速なしで操作説明へ直行)
    if (READING_ON && !(device.readingBaseline && device.readingBaseline.charsPerSec != null)) { showReading(); return; }
    startPractice();
  }

  // ===== canvas (DPR 対応) =====
  const surface = $("surface");
  const canvas = $("trace");
  const ctx = canvas.getContext("2d");
  function sizeCanvas() {
    const r = surface.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function clearCanvas() {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
    clearDragFeedback();
  }
  // 現在の接触位置だけを表示する。計測するeventsやgeomには触れない。
  function clearDragFeedback() {
    $("dragPosition").hidden = true;
    $("choiceA").classList.remove("drag-inside"); $("choiceB").classList.remove("drag-inside");
  }
  function showDragFeedback(x, y) {
    const r = surface.getBoundingClientRect(), point = $("dragPosition");
    point.hidden = false; point.style.left = (x - r.left) + "px"; point.style.top = (y - r.top) + "px";
    for (const choice of [choiceA, choiceB]) choice.classList.toggle("drag-inside", inRect(rectOf(choice), x, y));
  }
  window.addEventListener("resize", sizeCanvas);

  // ===== 試行生成 (Fisher-Yates。各ブロックの buildMain/buildPractice から使う) =====
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // 層別に均等に散らす出題順 (?strat=1。§6-6 項15)。完全ランダムだと途中終了時に水準構成が偏る
  // (例: 49問中12問で打ち切ると拮抗ばかり/明確ゼロになりうる)。各層を等間隔に置き、層内はシャッフル+
  // 微小ジッタで並べる = どこで切っても層比 (③なら明確1:中間2:拮抗4) が近似的に保たれる
  function spreadShuffle(cells, keyOf) {
    const byKey = {};
    for (const c of cells) { const k = keyOf(c); (byKey[k] = byKey[k] || []).push(c); }
    const out = [];
    for (const k of Object.keys(byKey)) {
      const arr = shuffle(byKey[k].slice());
      const step = 1 / arr.length;
      arr.forEach((c, i) => out.push({ c, pos: (i + 0.5) * step + (Math.random() - 0.5) * step * 0.5 }));
    }
    out.sort((a, b) => a.pos - b.pos);
    return out.map((x) => x.c);
  }

  // ===== セッション状態 =====
  let queue = [];        // 残り試行 (各要素は cell)
  let phase = "practice"; // 'practice' | 'main'
  let trialIndex = 0;     // 完了済み本番試行カウンタ
  let totalMain = 0;
  let breakShownAt = null, breakAtTrial = 0;  // 休憩画面の表示時刻・地点 (滞在時間記録用。2026-08-23)
  let mainStartedAt = null;   // 本番開始時刻 (?maxmin の時間上限判定・device.mainMs 用。2026-09-04)
  let mainElapsedAtEnd = null; // 最後の本番の評定まで。追加問題・事後質問は含めない
  function getMainElapsedMs() {
    return mainElapsedAtEnd != null ? mainElapsedAtEnd : (mainStartedAt == null ? null : Math.max(0, Math.round(performance.now() - mainStartedAt)));
  }
  function freezeMainClock() { if (mainElapsedAtEnd == null) mainElapsedAtEnd = getMainElapsedMs(); }
  let resumeStage = "next", replayResumeState = null, checkpointTimer = null;
  function scheduleCheckpoint() {
    clearTimeout(checkpointTimer);
    checkpointTimer = setTimeout(() => { checkpointTimer = null; saveBackup(); }, 150);
  }
  let trialShownAt = null, lastTrialMs = null;   // 直前1問の所要 (呈示〜次の問題へ)。HUD 表示・所要時間の実測用
  let streak = 0;         // 練習の連続成功数 (行動ゲート §6-2。無効試行/不正解でリセット)
  let trial = null;       // 現在試行の記録オブジェクト
  let cell = null;        // 現在の cell
  const records = [];     // 完了試行の記録 (本番のみ最終的にエクスポート対象に含める。練習も保持)
  const invalidAttempts = []; // 同じ問題のやり直し。回答数・評定・解析用trialsとは分離する。
  function publicTrial(r) {
    const { _sRect, _stRect, ...rest } = r; return rest;
  }
  function invalidAttempt(r, reason, endT) {
    return { ...publicTrial(r), status: "invalid", invalidReason: reason,
      attemptEndT: endT, lastEventT: r.events.length ? r.events[r.events.length - 1].t : null,
      nDispatched: r.events.filter(p => p.type === "dispatched").length,
      nCoalesced: r.events.filter(p => p.type === "coalesced").length };
  }
  function restoreInvalidAttempts(p) {
    invalidAttempts.length = 0;
    if (Array.isArray(p.invalidAttempts)) invalidAttempts.push(...p.invalidAttempts);
  }

  // ドラッグ記録用
  let recording = false;
  let uiLocked = false;   // フィードバック/遷移の待ち時間中はスタート無効 (古い cell での誤記録防止)
  let activePointerId = null;
  let leftStart = false;  //スタートを出たか (initiation 検出)
  let aborts = 0;         // 現在試行での無効リトライ回数

  const startBtn = $("start");
  const numA = $("numA"), numB = $("numB");
  const stemEl = $("stem");
  const choiceA = $("choiceA"), choiceB = $("choiceB");
  const trialRecorder = window.PilotTrialRecorder.create({ STOP_MIN_MS, STOP_NOTICE_MS, STOP_EPS_PX, LATE_START_MS, EARLY_CPS });

  function rectOf(el) { return el.getBoundingClientRect(); }
  function inRect(r, x, y) { return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

  // ===== チュートリアル (練習中のみ) =====
  // URL 配布 = 無監督実施のため、ルールは冒頭テキストではなく練習中の段階的コーチングで教える (2026-07-07)。
  // v2 (同日、実機フィードバック反映): 説明はスタート上の小さな taskMsg でなく専用パネル #coach に
  //   大きく表示。押下前はボックスを隠して「まずスタート」に集中させ (pos-top、指で隠れない上部)、
  //   押下後はボックスを発光させ「そこへ運ぶ」を示す (pos-mid) — 2段階提示。
  // 注意: 経路の形 (「まっすぐ」等) は絶対に示唆しない — 曲率が従属変数のため、教えるのは
  //   「押さえたまま → 運ぶ → ボックスの中で離す」という操作の仕組みだけ (experiment-design §6-2)。
  const coachEl = $("coach");
  function setCoach(stage) {   // 'start':スタート強調+ボックス非表示 / 'drag': ボックス発光 / null: 解除
    startBtn.classList.toggle("coach-pulse", stage === "start");
    choiceA.classList.toggle("coach-glow", stage === "drag");
    choiceB.classList.toggle("coach-glow", stage === "drag");
    // ステップ1 はボックス自体を隠して注意をスタートに集中 (練習のみ。visibility なので rect は保持)
    const boxVis = stage === "start" ? "hidden" : "visible";
    choiceA.style.visibility = boxVis;
    choiceB.style.visibility = boxVis;
  }
  let coachDismissTimer = null;
  function clearCoachDismiss() { clearTimeout(coachDismissTimer); coachDismissTimer = null; }
  function coachMsg(html, pos, kind, ng, autoHideMs = 0) {   // pos: 'top' (押下前・エラー) | 'mid' (ドラッグ中・フィードバック) | 'gap' (選択肢とスタートの間)。kind='start' =スタート案内 (押下で消す)
    clearCoachDismiss();   // 前の案内のタイマーで、新しい案内を消さない。
    hideBanner();   // 新しい案内を出す時点で、段階切替の帯とその後続案内は役目を終える。
    coachEl.className = (pos === "mid" ? "pos-mid" : (pos === "gap" ? "pos-gap" : "pos-top")) + (ng ? " " + (ng === true ? "ng" : ng) : "");   // "ng"=赤・箱なし / "ok"=緑・箱あり (操作の練習の合図と同じ)   // ng = 操作の練習の合図と同じ見た目 (赤・箱なし。2026-09-15)
    coachEl.dataset.kind = kind || "";
    coachEl.innerHTML = html;
    coachEl.style.top = "";
    if (pos === "gap") {   // 選択肢の下端とスタートの上端の中間 (問題文にもスタートにも被らない)
      const cb = choiceA.getBoundingClientRect().bottom, st = startBtn.getBoundingClientRect().top, tr = $("task").getBoundingClientRect();
      coachEl.style.top = Math.max(0, (cb + st) / 2 - tr.top - coachEl.offsetHeight / 2) + "px";
    }
    if (autoHideMs > 0) coachDismissTimer = setTimeout(coachHide, autoHideMs);
  }
  function coachHide() { clearCoachDismiss(); coachEl.className = ""; coachEl.innerHTML = ""; coachEl.style.top = ""; coachEl.dataset.kind = ""; }
  // 練習 (チュートリアル後): 一定時間スタートに触れられないときだけ「まずは下のスタートを…」を出す (2026-09-06)
  let idleTimer = null;
  let tutCoachTimer = null;   // チュートリアル試行のスタート案内 (帯の後 0.5 秒) のタイマー
  function armIdleCoach() {
    clearIdleCoach();
    if (!(phase === "practice" && dragTutState.done)) return;
    // 動的スタートでは場面文を読んでから押すので、無操作の猶予を 8 秒に (旧 4 秒)。位置は問題文に被らない gap (2026-09-09)
    idleTimer = setTimeout(() => { if (screens.task.classList.contains("active") && !dragTutState.active && !recording && !uiLocked && phase === "practice") { coachMsg("問題文を読み、状況が分かったら<br>スタートボタンに指を置いて<br>そのまま離さずに運びます", "gap", "start", "ok"); } }, 8000);   // 例の 1 問と同じ文言・見た目 (2026-09-15)
  }
  function clearIdleCoach() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

  // ===== 注意チェック (⑤) の汎用描画 + 弱DQS の埋め込み =====
  function renderCheck(cell) {   // isCheck 付き cell (弱DQS/infreq/IMC) を text-choice として描画
    numA.textContent = cell.leftLabel; numB.textContent = cell.rightLabel;
    numA.className = "txt"; numB.className = "txt"; stemEl.innerHTML = stemHtml(cell.stem);   // 文節ブロック改行 (2026-07-22)
  }
  function insertDqs(q) {   // 本番キューの 1/5・2/5・3/5・4/5 に弱DQS 4 問を挿入 (指示側は左右 2:2 をシャッフル)。DQS直後を post_check に
    // 2026-09-26: 2 問 (1/3・2/3) → 4 問。自然発生の不注意者の人単位ラベルを 4 項目で作るため (decisions-log 同日)。
    // 挿入後の総数 N = n+4 の k/5 の位置 (49 問なら N=53 → 10・21・31・42 問目)。休憩 20 問ごとの直後 (21) は 23 へずらす → 10・23・31・42
    const n = q.length;
    if (n < 5) return q;
    const cs = shuffle([makeDqsCell("left"), makeDqsCell("left"), makeDqsCell("right"), makeDqsCell("right")]);
    for (let k = 1; k <= 4; k++) {
      let pos = Math.floor((n + 4) * k / 5) - 1;   // 0-based
      if (CONFIG.breakEvery > 0 && pos % CONFIG.breakEvery === 0) pos += 2;   // 休憩の直後 (21 問目など) には置かない → 2 つ後ろへ (2026-09-27)
      q.splice(pos, 0, cs[k - 1]);   // 前から挿入 (各位置は前の挿入より後ろなのでずれない)
    }
    for (let i = 1; i < q.length; i++) if (q[i - 1].isCheck === "dqs") q[i].postCheck = true;
    return q;
  }

  // ===== 試行の呈示 =====
  function nextTrial() {
    if (queue.length === 0) {
      if (phase === "practice") {
        // 練習終了はゲート達成 (showPracticeFeedback) が決める。キューが尽きたら補充してループ
        queue = BLOCK.buildPractice(Math.max(CONFIG.practiceTrials, BLOCK.gateStreak));
        if (UNIFIED) for (const c of queue) c._pblock = CONFIG.block;   // 補充は現在タイプで継続
      } else if (phase === "instructed") {
        instructedDone = true; showPostQuestions(); return;   // 教示誘導ブロック終了 → 事後アンケート
      } else {
        advanceBlockOrFinish(); return;   // 本番終了 → 次ブロック (統合) or 教示誘導ブロック or 事後アンケート
      }
    }
    // 時間上限 (?maxmin。対面 8 分枠)。試行の途中では切らず、次の試行に入る手前で終了する
    if (phase === "main" && MAX_MIN != null && mainStartedAt != null &&
        performance.now() - mainStartedAt >= MAX_MIN * 60000) { endEarly("timebox"); return; }
    cell = queue.shift();
    trial = null;
    aborts = 0;
    practiceRuleFlags = [];
    // 休憩: breakEvery の倍数地点。ただし休憩後に始まるセグメント (この cell + 残り = queue.length+1) が
    //   breakEvery の半分未満なら省く = 末尾に細切れの塊 (数問だけ) を作らない (2026-08-23、DQS 混在込みで判定。
    //   2026-09-27: 20 問ごと・53 問で 40 問目の後 (残り 13) も休憩するよう「未満」の基準を breakEvery → breakEvery/2 に)。
    if (phase === "main" && CONFIG.breakEvery > 0 && trialIndex > 0 &&
        trialIndex % CONFIG.breakEvery === 0 && (queue.length + 1) >= CONFIG.breakEvery / 2) {
      showBreak(); return;   // cell は確保済み。続けるボタンで presentStimulus
    }
    presentStimulus();
  }
  function showBreak() {
    $("breakInfo").textContent = `${trialIndex} / ${totalMain} 問が終わりました。`;
    breakShownAt = performance.now();
    breakAtTrial = trialIndex;
    show("break");
    resumeStage = "break"; saveBackup();
  }

  // ===== 途中終了 (対面セッション。?stop=1 / ?maxmin=N。§6-6 項15) =====
  // 中断ボタン → 確認 → 事後アンケート → 通常の完了・送信経路 (finishSession)。
  // 「保存はされるが送られない」状態を作らないことが要点 = 対面では毎回ここを通る前提の設計。
  let stopReturn = null;   // {screen, at} 確認画面に入る前の画面と時刻
  function showStopConfirm() {
    if (!STOP_ON || recording || stopReturn) return;   // ドラッグ中は無視 (多点タッチでの誤爆防止)
    const cur = (document.querySelector(".screen.active") || {}).id;
    if (!STOPPABLE[cur]) return;
    stopReturn = { screen: cur, at: performance.now() };
    show("stopconfirm");
  }
  function cancelStop() {   // 誤タップからの復帰
    if (!stopReturn) return;
    const r = stopReturn; stopReturn = null;
    const pause = { screen: r.screen, durationMs: +(performance.now() - r.at).toFixed(0) };
    device.stopPauses.push(pause);
    if (r.screen === "task" && dragTutState.active) { show("task"); return; }   // 画面の見方・操作の練習の途中: 説明をそのまま再表示 (2026-09-12。旧: presentStimulus で説明が壊れて戻れなかった)
    if (r.screen === "task") { presentStimulus(); return; }   // 同じ試行を出し直す (RT に確認画面の滞在を混ぜない)
    if (r.screen === "rating" && trial) trial.stopPause = pause;   // 評定時間は汚染するので該当試行に印を残す
    show(r.screen);
  }
  let endedFrom = null;   // 中断ボタンで終了したときに居た画面 {screen, at} (「課題に戻る」で戻る先。2026-09-07)
  let discarding = false;  // 「はじめから」で消去中 (beforeunload の確認を出さない)
  async function restartFresh() {   // 回答を消して最初の画面へ (2026-09-12)。バックアップを消してから再読込
    if (!KIOSK && !STOP_ON) return;   // 研究者用の対面操作に限定。オンライン参加の回答を消して再出題しない。
    // (kiosk は起動時にバックアップを partial として未送信キューへ退避するので、消さずに再読込すると捨てたはずの回答が残る)
    discarding = true;
    if (dragTutState.active) DragTut.abort();
    if (!clearBackup()) { discarding = false; return; }
    try { await sessionStore.flush(); } catch (err) { discarding = false; storageProblem(err); return; }
    location.reload();
  }
  function endEarly(reason) {   // reason: "operator" (中断ボタン) | "timebox" (時間上限)
    endedFrom = reason === "operator" && stopReturn ? { screen: stopReturn.screen, at: performance.now() } : null;
    if (endedFrom) endedFrom.resume = JSON.parse(JSON.stringify(resumeState()));
    stopReturn = null;
    recording = false; activePointerId = null; uiLocked = true;
    setCoach(null); coachHide();
    // 説明の途中で終了 (2026-09-12): 説明を畳む (畳まないと最後の質問画面の上に残る)。取り消しで戻るときは説明の最初から
    if (dragTutState.active) {
      const reviewing = !!replayResumeState;
      DragTut.abort(); replayResumeState = null;
      if (reviewing) dragTutState.done = true;
      if (endedFrom) endedFrom.screen = reviewing ? endedFrom.resume.stage : "tutorial";
    }
    if (ratingReview) closeRatingReview();
    else if (tutActive()) { tutIdx = -1; tutRender(); if (endedFrom) endedFrom.screen = "ratingTut"; }
    device.partial = true;
    device.endedBy = reason;
    device.endedPhase = phase;
    freezeMainClock();
    showPostQuestions();
  }

  // ===== ブロック遷移 (②③統合セッション。§6-2 (A)ブロック設計) =====
  function advanceBlockOrFinish() {
    if (seqIndex >= SEQ.length - 1) freezeMainClock();
    if (seqIndex < SEQ.length - 1) {
      seqIndex++;
      loadBlock(SEQ[seqIndex]);   // 次ブロックへ切替 (body クラス・CONFIG.ratings/reps を差し替え)
      showBlockIntro();           // 次パートの説明 → 続けるボタンで startPractice
    } else if (INSTR_ON && !instructedDone && records.some((r) => r.phase === "main" && !r.isCheck && r.block === "moral")) {
      showInstructedIntro();      // 教示誘導ブロック (careless GT 候補 A。⑤の後・アンケートの前。§6-6 項19)
    } else {
      showPostQuestions();        // 全ブロック終了 → 事後アンケートは1回だけ
    }
  }
  // ===== 教示誘導ブロック (2026-09-09 決定。decisions-log / experiment-design §6-6 項19) =====
  // 本番で答えた③の項目から水準 1:3:6 (≈1:2:4) で 10 問を再提示し、「読まずに速く」の教示で不注意回答を模す。評定なし。
  function showInstructedIntro() {
    pendingInstructedStart = true;
    $("blockintroBody").innerHTML =
      '<h1>追加の 10 問<br><span class="instructed-subtitle">（やり方が変わります）</span></h1>' +
      '<p class="instruction-key"><b>問題文も選択肢も、読まずに進めてください。</b><br>内容を考えて答えを選ばず、<b>適当に指を運んでください。</b>どちらの選択肢でも構いません。</p>' +
      '<p>この10問は、指示どおり読まずに答える問題なので、<b>謝礼には影響しません。</b></p>' +
      '<p>操作はこれまでと同じです。振り返りはありません。このあと最後に実施後のアンケートがあります。</p>';   // ui13: 読まずに運ぶ指示と、操作・振り返り・最後の質問の順を短く示す
    show("blockintro");
    $("blockintro").querySelector(".pad").scrollTop = 0;
    logInstructionExposure("instructedIntro");
    resumeStage = "instructedIntro"; saveBackup();
  }
  function startInstructed() {
    if (CONFIG.block !== "moral") loadBlock("moral");
    const done = records.filter((r) => r.phase === "main" && !r.isCheck && r.block === "moral" && r.itemId);
    const byLevel = { clear: [], mid: [], conflict: [] };
    for (const r of done) if (byLevel[r.conflictLevel]) byLevel[r.conflictLevel].push(r.itemId);
    const want = { clear: 1, mid: 3, conflict: 6 };
    let ids = [];
    for (const lv of Object.keys(want)) ids = ids.concat(shuffle(byLevel[lv].slice()).slice(0, want[lv]));
    if (ids.length < INSTR_N) {   // 不足は残りから補充 (途中終了・短縮構成)
      const rest = shuffle(done.map((r) => r.itemId).filter((id) => !ids.includes(id)));
      ids = ids.concat(rest.slice(0, INSTR_N - ids.length));
    }
    const byId = {};
    for (const item of BLOCK.bank) byId[item.id || (item.level ? `${item.mtype}-${item.level}` : item.mtype)] = item;
    queue = shuffle(ids.filter((id) => byId[id]).map((id) => BLOCK.makeCell(byId[id], Math.random() < 0.5 ? "left" : "right")));
    device.instructed = { n: queue.length, itemIds: queue.map((c) => c.itemId), text: INSTR_TEXT };
    phase = "instructed"; instrIndex = 0;
    setCoach(null); coachHide();
    sizeCanvas();
    nextTrial();
  }
  function showBlockIntro() {
    $("blockintroBody").innerHTML =
      `<p class="opt-note">パート ${seqIndex + 1} / ${SEQ.length}</p>` +
      ((UNIFIED && BLOCK.transitionHtml) ? BLOCK.transitionHtml : BLOCK.introHtml);
    show("blockintro");
    $("blockintro").querySelector(".pad").scrollTop = 0;
    resumeStage = "blockintro"; saveBackup();
  }

  // 段階の切り替えを1回だけ短く知らせる帯 (チュートリアル完了→練習)。触れず・記録に入らない
  let pendingBanner = null, bannerTimer = null, bannerToken = 0;
  function hideBanner() {
    bannerToken++;   // 予約済みの配置・後続表示も古い帯から引き継がない。
    clearTimeout(bannerTimer); bannerTimer = null;
    clearTimeout(tutCoachTimer); tutCoachTimer = null;
    const el = $("phaseBanner"); if (el) el.classList.add("hidden");
  }
  function showBanner(text, onHidden) {   // onHidden: 帯が消えた直後に呼ぶ (帯の後に案内を出す順序制御用)
    hideBanner();
    clearIdleCoach();
    if (coachEl.classList.contains("ok")) coachHide();
    const token = bannerToken;
    let el = $("phaseBanner");
    if (!el) { el = document.createElement("div"); el.id = "phaseBanner"; el.className = "phase-banner hidden"; document.body.appendChild(el); }
    el.textContent = text; el.classList.remove("hidden");
    // 選択肢の下端とスタートの上端の中間 (問題文にもスタートにも被らない)。呼び出し時点では課題画面が
    // まだ表示切替前のことがある (評定→課題) ので、描画後に座標を読む
    const placeIt = () => { if (token !== bannerToken) return true; const cb = choiceA.getBoundingClientRect().bottom, st = startBtn.getBoundingClientRect().top;
      if (st > cb) el.style.top = ((cb + st) / 2) + "px"; else el.style.top = ""; return st > cb; };
    if (!placeIt()) requestAnimationFrame(() => { if (!placeIt()) setTimeout(placeIt, 60); });
    bannerTimer = setTimeout(() => { if (token !== bannerToken) return; hideBanner(); if (onHidden) onHidden(); }, 2200);
  }
  // 停止の案内画面 (§6-6 項19): 表示〜「次へ」の滞在を device.stopNotices に記録し、直後の試行に stopNotice=true を付ける
  let noticeShownAt = null, noticeKind = null;
  function showStopNotice(kind) {
    $("notice").dataset.kind = kind;
    noticeKind = kind; $("noticeText").innerHTML = NOTICE_HTML[kind] || NOTICE_HTML.late;   // 文言は内部定数のみ
    noticeShownAt = performance.now();
    show("notice");
    logInstructionExposure("notice", { kind });
    $("notice").querySelector(".pad").scrollTop = 0; $("noticeText").scrollTop = 0;
    resumeStage = "notice"; saveBackup();
  }
  $("noticeGo").addEventListener("click", () => {
    if (noticeShownAt == null) return;
    const confirmation = { afterTrial: phase === "main" ? trialIndex : null, kind: noticeKind, ms: +(performance.now() - noticeShownAt).toFixed(0) };
    device.stopNotices.push(confirmation);
    device.noticeAcknowledgements.push({ ...confirmation, version: INSTRUCTION_VERSION, phase, at: new Date().toISOString() });
    noticeShownAt = null; stopNoticeShown = noticeKind; noticeKind = null;
    presentStimulus();   // ここから場面文の表示 = 次の試行の stimulusOnsetT
  }, { passive: true });
  function presentStimulus(restored) {
    hideBanner();
    // 練習中はコーチング表示 (ステップ1: ボックスを隠し、上部の大きな説明でスタートへ誘導)。
    // 本番は一切出さない
    // 前問の停止の案内 (動的スタート): 評定送信後・次の場面文を出す前に案内だけの画面を挟む
    // (次の問題の画面に出すと案内を読む時間が次問の読解時間 preStartMs に混ざる。2026-09-09 ユーザー指摘)。教示誘導ブロックでは出さない
    if (pendingNotice && phase !== "instructed") {
      const k = eligibleNotice(pendingNotice); pendingNotice = null;
      if (k) { showStopNotice(k); return; }
    }
    pendingNotice = null;
    $("taskMsg").textContent = "";
    if (cell.isTutorial) {   // チュートリアル試行 = 実演から「自分で操作する」段階へ。帯で切り替えを告知し、練習の帯は次に回す
      // 帯「では、1問やってみましょう」が消えて 0.5 秒後にスタート案内を出す (同時に出すと上から読んで帯を読み飛ばす。2026-09-06 実機FB)
      const myCell = cell;
      if (tutCoachTimer) { clearTimeout(tutCoachTimer); tutCoachTimer = null; }
      showBanner("では、1問やってみましょう", () => {   // この1問だけ (直後に評定チュートリアル) なので「ここからは」と言わない
        tutCoachTimer = setTimeout(() => {
          tutCoachTimer = null;
          if (cell !== myCell || !screens.task.classList.contains("active") || dragTutState.active || phase !== "practice" || recording || uiLocked || trial) return;   // もう押している/進んだなら出さない
          coachMsg("問題文を読み、状況が分かったら<br>スタートボタンに指を置いて<br>そのまま離さずに運びます", "gap", "start", "ok");   // 操作の練習の合図と同じ見た目 (緑・箱あり)。2026-09-15: 旧「まずは下のスタートを…実演ではなく自分で操作します」   // 問題文は最初から出ているので上部には置かない (2026-09-09)
        }, 500);
      });
      pendingBanner = `ここから練習です（${CONFIG.practiceTrials}問）`;
    } else if (pendingBanner) { showBanner(pendingBanner); pendingBanner = null; }
    if (phase === "main" && trialShownAt != null) lastTrialMs = performance.now() - trialShownAt;   // 前問の所要を確定
    trialShownAt = performance.now();
    resetMonitors();   // 環境音の試行窓を開始 (呈示〜評定送信。無効リトライ中は継続 = 同一試行の環境として合算)
    if (phase === "practice" && cell._pblock && cell._pblock !== CONFIG.block) loadBlock(cell._pblock);  // 統合練習: セルのタイプへ切替
    // 練習中の説明: ドラッグ導入チュートリアルを終えていれば出さない (2026-09-04 練習は説明なしで自由に。§6-2)
    if (phase === "practice" && !dragTutState.done) {
      coachMsg(nb('まずは下の<b>スタート</b>を|指で<b>押さえたまま</b>にします'), "gap");
      setCoach("start");
    } else if (phase === "practice" && cell.isTutorial) {
      // チュートリアル試行: 帯の間は案内を出さず、帯が消えて 0.5 秒後にスタート案内 (上の showBanner のコールバック)。スタート押下で消える
      setCoach(null); coachHide();
    } else if (phase === "practice") {
      coachHide(); setCoach(null); armIdleCoach();   // 説明は出さない。触れないまま4秒たったときだけスタート案内
    } else {
      coachHide();
      setCoach(null);
    }
    // 刺激内容はブロック別に描画 (注意チェックは汎用描画)。開始手続き (2026-09-26 押下で出現): 場面文は最初から見せ、
    // 選択肢はスタートに指を置いた瞬間に出す (pointerdown 側)。stimulus onset = 場面文の表示時刻
    if (cell.isCheck) renderCheck(cell); else BLOCK.renderStimulus(cell);
    numA.style.visibility = "hidden";
    numB.style.visibility = "hidden";
    stemEl.style.visibility = stemEl.textContent ? "visible" : "hidden";
    stemShownT = performance.now() - (restored && restored.stemElapsedMs || 0);
    if (restored && restored.monitors) restoreMonitors(restored.monitors);
    startBtn.classList.remove("armed");
    startBtn.textContent = "スタート";
    $("phaseLabel").textContent = cell.isTutorial ? "" : (phase === "practice" ? "練習" : (phase === "instructed" ? "追加" : "本番"));   // 例の 1 問は段階名なし (2026-09-15 ユーザー指示。旧「おためし」)   // おためし = 例の 1 問 (2026-09-12。旧「チュートリアル」)
    // 「↻ 操作方法」= 分からなくなったらチュートリアルを見直せる (練習・本番・追加。注意チェックの問題では出さない)
    // 練習だけでなく本番・追加でも「操作方法」を見直せる (2026-09-29 ユーザー要望)。押せるのはスタートに指を置く前だけ (押下後は hidden にしないが recording 中は無視)
    $("tutAgain").classList.toggle("hidden", !((phase === "practice" || phase === "main" || phase === "instructed") && dragTutState.done && DRAG_TUT_ON && !cell.isCheck));
    $("counter").textContent = counterText(); updateProgress();
    recording = false;
    uiLocked = false;
    activePointerId = null;
    leftStart = false;
    trial = null;
    show("task");
    sizeCanvas();   // #task 表示後に測ってから canvas を確定 (非表示中は rect=0)
    clearCanvas();
    resumeStage = "task"; saveBackup();
  }

  function revealStimulus() {
    numA.style.visibility = "visible";
    numB.style.visibility = "visible";
    if (stemEl.textContent) stemEl.style.visibility = "visible";  // 設問ステム (文字2択のみ内容あり)
    startBtn.classList.add("armed");
    startBtn.textContent = "スタート";
  }

  // ===== Pointer Events 記録 =====
  surface.addEventListener("pointerdown", (e) => {
    if (dragTutState.active) return;              // ドラッグ導入チュートリアル表示中は本課題の操作/コーチを出さない (phase 初期値=practice のため)
    if (recording || uiLocked) return;           // 進行中 (マルチタッチ二本目) / 遷移待ち中は無視
    clearIdleCoach();
    if (tutCoachTimer) { clearTimeout(tutCoachTimer); tutCoachTimer = null; }   // 押したら帯後の案内は出さない
    if (!inRect(rectOf(startBtn), e.clientX, e.clientY)) {
      //スタート以外を押した: 練習・本番とも同じ案内を同じ場所 (選択肢とスタートの間) に (2026-09-15: 旧・本番はスタート上の小さな taskMsg で iPad では読めなかった)
      coachMsg("スタートボタンに指を置いて<br>そのまま離さずに運びます", "gap", "start", true);   // 操作の練習 2/3・3/3 の合図と同じ文言・赤・箱なし (2026-09-15)
      return;
    }
    e.preventDefault();
    // 練習の読了ゲート: 固定読了時間 (文字数 ÷ EARLY_CPS) より早いスタート押下は受け付けず、「読んでから」の案内を出す。実際の読了の有無は測定していない。
    // 本番では止めない (早出しは earlyStart フラグ+評定後の案内)。おためしの 1 問は対象外。?readgate=0 で無効 (validate 用)
    if (READGATE_ON && phase === "practice" && !cell.isTutorial && cell.stem) {
      const minMs = (stemRecord(cell.stem).length / EARLY_CPS) * 1000;
      if (e.timeStamp - stemShownT < minMs) {
        device.practiceEarlyPress++;
        markPracticeRule("early");
        coachMsg(nb('問題文を読み、<b>状況が分かったら</b>|スタートボタンに指を置いてください'), "gap", "start", false, 4000);
        return;
      }
    }
    hideBanner();   // スタートの操作を受け付けたら、段階切替の帯を残さない。
    $("taskMsg").textContent = "";   // 停止の案内・注意は押下で消す
    activePointerId = e.pointerId;
    try { surface.setPointerCapture(e.pointerId); } catch (_) {}
    recording = true;
    leftStart = false;

    const sRect = surface.getBoundingClientRect();
    const stRect = rectOf(startBtn), aRect = rectOf(choiceA), bRect = rectOf(choiceB);
    trial = trialRecorder.begin({ e, phase, trialIndex, instrIndex, recordsLength: records.length, aborts, cell,
      block: CONFIG.block, stimulusType: BLOCK.stimulusType, meta: cell.isCheck ? checkMeta(cell) : BLOCK.trialMeta(cell),
      resumePending, stemShownT, stopNoticeShown, sRect, stRect, aRect, bRect,
      timeOrigin: performance.timeOrigin, dpr: window.devicePixelRatio || 1 });
    pushEvent(e, "down");
    trial.events.push({ seq: trial.events.length, t: e.timeStamp, x: trial.revealXY.x, y: trial.revealXY.y, type: "reveal" });
    revealStimulus();   // 押下で選択肢を出す (2026-09-26。旧: 枠から出た瞬間)。指を置いた瞬間に画面が反応する = 何をすればよいか分かる
    // 練習中はステップ2: ボックスを出現+発光させ「離さず運んで中で離す」(文言はブロック別。経路の形は指示しない)
    if (phase === "practice" && !dragTutState.done) { coachMsg(nb(BLOCK.coachDrag), "mid"); setCoach("drag"); }
    // チュートリアル後の練習: 上部の案内 (スタート誘導) は問題文に被るのでスタートを押した時点で消す。
    // 「選択肢のボックスの中で…」(選択肢とスタートの間) はスタートを出た時点で消す (pointermove 側)
    else if (coachEl.classList.contains("pos-top") || coachEl.dataset.kind === "start") coachHide();   // 本番も同じ (2026-09-15)
    clearCanvas();
    showDragFeedback(e.clientX, e.clientY);
  }, { passive: false });

  surface.addEventListener("pointermove", (e) => {
    if (!recording || e.pointerId !== activePointerId) return;
    e.preventDefault();
    // Android Chrome 等: フレーム間に統合された生サンプル (iOS は非対応 = なし)
    if (typeof e.getCoalescedEvents === "function") {
      for (const c of e.getCoalescedEvents()) pushEvent(c, "coalesced");
    }
    pushEvent(e, "dispatched");
    // 枠から出た最初の dispatched イベント = 動き出し (initiation)。選択肢は押下で出ている (2026-09-26)。境界のちらつき防止に 4px の遊び
    const sr = trial._stRect;
    if (!leftStart && trialRecorder.hasLeftStart(sr, e)) {
      leftStart = true;
      trial.initiationT = e.timeStamp;
      // 練習: 動き出したらコーチパネルをフェードし、軌跡の帯を空ける (教示は押下中に読み終えている)。
      // チュートリアル後は完全に消す (「選択肢のボックスの中で…」はスタートを出た時点で役目を終える)
      if (phase === "practice" && !dragTutState.done) coachEl.classList.add("dim"); else coachHide();   // 本番のやり直し案内もスタートを出た時点で消す (2026-09-15)
    }
    showDragFeedback(e.clientX, e.clientY);
  }, { passive: false });

  function pushEvent(e, type) { trialRecorder.pushEvent(trial, e, type); }

  surface.addEventListener("pointerup", (e) => {
    if (!recording || e.pointerId !== activePointerId) return;
    e.preventDefault();
    pushEvent(e, "up");
    recording = false;
    clearDragFeedback();
    finalizeDrag(e);
  }, { passive: false });

  surface.addEventListener("pointercancel", (e) => {
    if (!recording || e.pointerId !== activePointerId) return;
    pushEvent(e, "cancel");
    recording = false;
    clearDragFeedback();
    retryTrial("中断されました", null, "pointer_cancel", e.timeStamp);
  }, { passive: false });

  function retryTrial(msg, coachHtml, reason = "interrupted", endT = performance.now()) {
    clearDragFeedback();
    if (["outside_choice", "insufficient_points"].includes(reason)) markPracticeRule("release");
    if (trial && !records.includes(trial)) invalidAttempts.push(invalidAttempt(trial, reason, endT));
    aborts++;
    if (phase === "practice") {
      // 練習中: 無効試行は連続成功をリセットし、原因別のコーチングを出して同一刺激からやり直し
      // (ステップ1 状態に戻す = ボックスを隠してスタートへ再誘導)
      streak = 0;
      $("counter").textContent = counterText();
      // 誤操作のリカバリは説明なし方針でも残す (詰まりの解消)。チュートリアル後は短い注意のみ
      if (dragTutState.done) {   // チュートリアル後: 選択肢の枠は消さない (消えるとバグに見える)。案内は選択肢とスタートの間 (操作の練習の失敗時と同じ見た目。2026-09-15)
        coachMsg((msg || "やり直し").replace(/\|/g, "") + "<br>スタートボタンからもう一度", "gap", null, true);
        setCoach(null);
      } else {
        coachMsg(coachHtml || ((msg || "やり直し") + '<span class="sub">スタートボタンからもう一度</span>'), "top");
        setCoach("start");
      }
      // 問題文は出したまま (動的スタート: 場面文は最初から見えている。再読は不要)
    } else {
      coachMsg((msg || "やり直し").replace(/\|/g, "") + "<br>スタートボタンからもう一度", "gap", null, true);   // 本番も操作の練習の失敗時と同じ文言・赤・箱なし (2026-09-15。旧:スタート上の taskMsg)
      setCoach(null);
    }
    // 同一刺激を再呈示 (デザインのバランス維持)。少し待って再表示
    numA.style.visibility = "hidden";
    numB.style.visibility = "hidden";
    startBtn.classList.remove("armed");
    startBtn.textContent = "スタート";
    recording = false; activePointerId = null; leftStart = false; trial = null;
    saveBackup(); // やり直しが成功する前でも、失敗した軌跡を端末へ残す。
  }

  function finalizeDrag(e) {
    const disp = trial.events.filter((p) => p.type === "dispatched");
    // 終点がどちらのボックスにあるか (viewport 座標で判定)
    let choiceSide = null;
    if (inRect(rectOf(choiceA), e.clientX, e.clientY)) choiceSide = "left";
    else if (inRect(rectOf(choiceB), e.clientX, e.clientY)) choiceSide = "right";

    if (choiceSide === null || disp.length < CONFIG.minPoints) {
      // 練習中は失敗原因を切り分けてコーチング (スタートから動かず離した=タップ / 途中で離した / 速すぎ)
      const coach = !leftStart
        ? nb('押すだけでは|<b>選べません</b>') + '<span class="sub">' + nb('スタートボタンに指をつけたまま、|選択肢のボックスまで|すべらせて動かします') + '</span>'
        : (choiceSide === null
          ? nb('指が<b>途中で離れました</b>') + '<span class="sub">' + nb('選択肢のボックスの中まで|指をつけたまま動かし、|中で離します') + '</span>'
          : nb('指を離すのが|<b>早すぎました</b>') + '<span class="sub">' + nb('選択肢のボックスの中まで|運んでから離します') + '</span>');
      retryTrial(choiceSide === null ? "選択肢のボックスの中で|指を離してください" : "指を離すのが|早すぎました", coach,
        choiceSide === null ? "outside_choice" : "insufficient_points", e.timeStamp);
      return;
    }

    // タイミング (正式な RT/MT は peak-velocity 5% 基準で後処理)。押下で出現 (2026-09-26):
    //   rt = 出現 (=押下) 〜枠から出る = 古典的な反応時間 (選択肢を見てから動き出すまで) / mt_proxy = 動き出し〜離す / total = 押下〜離す。読解+熟考は preStartMs。
    //   rt_proxy_ms は旧名 (2026-09-09〜25 は「押さえ時間」の意味) で、同じ値を互換のため残す
    trialRecorder.complete(trial, { disp, aborts, stemChars: cell.stem ? stemRecord(cell.stem).length : 0 });

    trial.choiceSide = choiceSide;
    stopNoticeShown = false;   // 無効な操作では消費せず、次の有効回答に残す
    trial.correct = cell.isCheck ? (choiceSide === cell.checkAnswerSide)  // 注意チェック: 指示どおり選べたか (=注意して回答)
                                 : BLOCK.decideOutcome(cell, choiceSide); // anchor: 正誤 / value/moral: 規範整合 (拮抗は null)

    stampMonitors(trial);   // 環境音要約 (評定ONの試行は submitRating で評定込み窓に上書き)
    pendingNotice = trial.earlyStart && trial.lateStart ? "early_late" : trial.earlyStart ? "early" : trial.lateStart ? "late" : null;   // 案内 (評定の後・次の場面文の前の独立画面。§6-6 項19)。動き出した後の停止は案内しない (2026-09-26)
    if (phase === "practice") {
      records.push(trial);
      showPracticeFeedback();
    } else if (phase === "instructed") {   // 追加問題も残りキューと完了数を保存する
      records.push(trial);
      resumePending = false;   // 無効なやり直しでは消費せず、再開後最初の有効回答だけに付ける
      instrIndex++;
      resumeStage = "next"; saveBackup();
      $("counter").textContent = counterText();
      nextTrial();
    } else {
      records.push(trial);
      resumePending = false;   // 再開直後の1試行だけ post_resume (§6-6 項17)
      if (CONFIG.ratings) {
        beginRating();
      } else {
        trialIndex++;
        if (!queue.length && seqIndex >= SEQ.length - 1) freezeMainClock();
        resumeStage = "next"; saveBackup();
        micCheckpoint(nextTrial);   // 評定OFFブロックの試行境界 (切断→再取得 / 騒音→ゲート。§6-6 項10)
      }
    }
  }

  // 練習の終了条件 (2026-09-05): 練習キューを使い切り (= practiceTrials 問を完了) かつ行動ゲート達成。
  // ゲート未達なら nextTrial がキューを補充するので「5問やって、操作も理解できたら本番」になる
  function practiceDone() { return queue.length === 0 && (streak >= BLOCK.gateStreak || BLOCK.practiceRefill === false); }   // practiceRefill=false のブロックは 5 問で終える (2026-09-27)
  // 練習カウンタ表示: 「n / 5」(段階名 phaseLabel と重ねない。この試行を含む残数から算出。ゲート未達で補充されたら総数も増える)
  function practiceCounter() {
    const total = Math.max(CONFIG.practiceTrials, queue.length + 1);
    return `${total - queue.length} / ${total}`;
  }
  function updateProgress() {   // 本番 (と末尾の追加 10 問) の進捗バー: 済んだ試行の割合 (2026-09-15)
    const on = !dragTutState.active && !(cell && cell.isTutorial) && (phase === "main" || phase === "instructed");
    $("progress").classList.toggle("on", on);
    $("ratingProgress").classList.toggle("on", on && !tutActive() && !ratingReview);
    if (on) { const done = phase === "main" ? trialIndex : instrIndex, total = phase === "main" ? totalMain : INSTR_N;
      const width = (total > 0 ? Math.max(0, Math.min(100, done / total * 100)) : 0) + "%";
      $("progressFill").style.width = width; $("ratingProgressFill").style.width = width; }
  }
  function counterText() {   // チュートリアル試行は番号なし / 練習=n / 5 / 本番=n / N
    if (cell && cell.isTutorial) return "";
    if (phase === "instructed") return `${instrIndex + 1} / ${INSTR_N}`;
    return phase === "practice" ? practiceCounter() : `${trialIndex + 1} / ${totalMain}`;
  }
  function showPracticeFeedback() {
    uiLocked = true;   // フィードバック表示中のスタート再押下を無効化
    setCoach(null);
    // 行動ゲート更新: 有効ドラッグ (+客観課題は正解) で連続成功+1、不正解でリセット (無効試行は retryTrial 側)
    const pass = BLOCK.gateCorrect ? trial.correct === true : true;
    if (!cell.isTutorial) streak = pass ? streak + 1 : 0;   // チュートリアル試行はゲートに数えない
    let head;
    if (BLOCK.practiceFeedback === "correct") {
      head = trial.correct
        ? '<span class="feedback ok">○ 正解！</span>'
        : '<span class="feedback ng">× ちがいます</span><span class="sub">' + nb('<b>数の大きい方</b>の|選択肢を選びます') + '</span>';
    } else {
      // 主観選択 (価値・選好) は正誤がないので中立フィードバックのみ
      head = '<span class="feedback ok">○ 記録しました</span>';
    }
    $("counter").textContent = counterText();
    numA.style.visibility = "hidden";
    numB.style.visibility = "hidden";
    stemEl.style.visibility = "hidden";
    // 評定ON のブロック (②) は練習でも評定を提示 (リハーサル。記録は phase:'practice' で解析除外)。
    // 本番と同じく「指を離した直後に評定画面」のケイデンスに揃え、フィードバックパネルは挟まない
    // (練習だけ 1100ms の間を置くと本番第1試行で学習が崩れる。レビューWF指摘 2026-07-07)。
    // ゲート判定は評定送信後 (submitRating 側)。
    if (CONFIG.ratings) { coachHide(); beginRating(); return; }
    // 評定OFF: フィードバックを提示してから判定 (練習キュー完走+ゲート達成で本番へ。
    // 未達ならキューは nextTrial が補充)。不正解時はコーチングを読む時間を長めに取る
    const left = queue.length;
    const next = left > 0 ? `<span class="sub">練習はあと${left}問です</span>` : "";
    coachMsg(head + next, "mid");
    resumeStage = "practiceNext"; saveBackup();
    setTimeout(completePracticeTrial, pass ? 1100 : 1800);
  }

  let practiceRuleFlags = [], practiceCheckState = null, practiceCheckShownAt = null;
  const PRACTICE_RULES = {
    early: { title: "問題文を読んでからスタート", html: START_CRITERION_HTML },
    late: { title: "3秒以内に指をスタートボタンの外へ動かす", html: MAIN_MOVEMENT_HTML },
    release: { title: "指を離さずに運ぶ", html: "スタートボタンを押したら<b>指を離さず</b>選択肢のボックスまで運び、<b>ボックスの中で離してください。</b><br>ボックスの内側ならどこで指を離しても大丈夫です。" },
  };
  function markPracticeRule(key) {
    if (phase === "practice" && BLOCK.id === "moral" && cell && !cell.isTutorial && !practiceRuleFlags.includes(key)) { practiceRuleFlags.push(key); scheduleCheckpoint(); }
  }
  function completePracticeTrial() {
    if (phase === "practice" && BLOCK.id === "moral" && trial && trial.phase !== "tutorial") {
      if (READGATE_ON && trial.earlyStart) markPracticeRule("early");
      if (trial.lateStart) markPracticeRule("late");
      if (practiceRuleFlags.length) {
        pendingNotice = null; // この問題は練習専用の確認で扱い、本番用の注意と重複させない。
        showPracticeCheck({ keys: ["early", "late", "release"].filter(k => practiceRuleFlags.includes(k)), checked: [], recordIndex: records.indexOf(trial), elapsedMs: 0 });
        return;
      }
    }
    practiceDone() ? endPractice() : nextTrial();
  }
  function showPracticeCheck(state) {
    practiceCheckState = state;
    practiceCheckShownAt = performance.now() - (state.elapsedMs || 0);
    uiLocked = true; coachHide(); setCoach(null);
    $("practiceCheckItems").replaceChildren();
    for (const key of state.keys) {
      const rule = PRACTICE_RULES[key], label = document.createElement("label");
      label.className = "rule-check";
      const input = document.createElement("input"); input.type = "checkbox"; input.dataset.rule = key; input.checked = state.checked.includes(key);
      const text = document.createElement("span"); text.innerHTML = '<b class="rule-title">' + rule.title + '</b><span>' + rule.html + '</span>';
      label.append(input, text); $("practiceCheckItems").appendChild(label);
      input.addEventListener("change", () => {
        state.checked = [...$("practiceCheckItems").querySelectorAll("input:checked")].map(e => e.dataset.rule);
        $("practiceCheckGo").disabled = !state.keys.every(k => state.checked.includes(k)); saveBackup();
      });
    }
    $("practiceCheckGo").disabled = !state.keys.every(k => state.checked.includes(k));
    show("practicecheck"); $("practicecheck").querySelector(".pad").scrollTop = 0;
    logInstructionExposure("practiceCheck", { rules: state.keys.slice() });
    resumeStage = "practiceCheck"; saveBackup();
  }
  $("practiceCheckGo").addEventListener("click", () => {
    const state = practiceCheckState;
    if (!state || !state.keys.every(k => state.checked.includes(k))) return;
    device.practiceChecks.push({ version: INSTRUCTION_VERSION, recordIndex: state.recordIndex, rules: state.keys.slice(), at: new Date().toISOString(), ms: Math.round(performance.now() - practiceCheckShownAt) });
    practiceCheckState = null; practiceCheckShownAt = null; practiceRuleFlags = [];
    resumeStage = "practiceNext"; saveBackup();
    practiceDone() ? endPractice() : nextTrial();
  });

  // ===== 評定 (2項目を1画面に提示。2026-07-15 2項目化+チュートリアル) =====
  let ratingOnset = 0;
  function beginRating(restored) {
    ratingOnset = performance.now() - (restored && restored.elapsedMs || 0);
    // 練習中は評定リハーサル (2026-07-07 v2): 本番と同じ画面を使い、位置づけだけヘッダで明示。
    // ヘッダは2行以内に抑える (SE の実効 viewport で送信ボタンが fold 下に落ちないため)
    if (phase === "practice" && RTUT_ON && !ratingTutorialDone) {
      // 評定チュートリアル v2 (2026-07-22): 説明はヘッダでなく tutBox (対象評定の直上) に出す
      // 旧3枚のindex 0/1/2は同じページへ戻す。新3=締め、4=番号なしの練習導入。
      const savedIndex = restored && restored.tutorial && restored.tutorial.index;
      tutIdx = Number.isInteger(savedIndex) ? Math.max(0, Math.min(4, savedIndex)) : 0;
      tutIntroDone = restored && restored.tutorial ? !!restored.tutorial.introDone : false;
      ratingSeenPages.clear();
      for (const page of restored && restored.tutorial && restored.tutorial.seen || []) ratingSeenPages.add(page);
      $("ratingHead").className = "practice";
      $("ratingHead").textContent = "";
    } else if (phase === "practice") {
      $("ratingHead").className = "practice";
      $("ratingHead").textContent = "";   // 2026-09-06: 練習でも見出しは出さない (チュートリアルで説明済み)
    } else {
      $("ratingHead").className = "";
      $("ratingHead").textContent = "回答について教えてください";
    }
    // あなたの回答 (2026-09-09): 自信の質問 (「いま選んだ答えに」) の指示対象を画面に残す
    const ans = trial.choiceSide === "left" ? trial.leftLabel : (trial.choiceSide === "right" ? trial.rightLabel : null);
    $("ratingAnswer").hidden = !ans;
    if (ans) { $("ratingAnswer").innerHTML = ""; const l = document.createElement("span"); l.textContent = "あなたの回答: "; const b = document.createElement("b"); b.textContent = ans; $("ratingAnswer").append(l, b); }
    const host = $("ratingItems");
    host.innerHTML = "";
    for (const item of ITEMS) {
      const wrap = document.createElement("div");
      wrap.className = "qitem";
      wrap.id = "qitem-" + item.key;
      const q = document.createElement("div");
      q.className = "qi-text"; q.id = "rating-label-" + item.key; q.textContent = item.q;
      const lk = document.createElement("div");
      lk.className = "likert"; lk.setAttribute("aria-labelledby", q.id);
      for (let v = 1; v <= 5; v++) {   // 縦 5 行・数字+言葉 (2026-09-08)
        const b = document.createElement("button");
        b.type = "button"; b.dataset.val = String(v);
        const num = document.createElement("b"); num.textContent = v;
        const lab = document.createElement("span"); lab.textContent = item.labels[v - 1];
        b.append(num, lab);
        b.addEventListener("click", () => selectRating(item.key, v, lk, b), { passive: true });
        lk.appendChild(b);
      }
      initChoiceGroup(lk, false);
      wrap.append(q, lk);
      host.appendChild(wrap);
    }
    if (!restored) { trial.ratings = { confidence: null, hesitation: null }; trial.ratingBacks = 0; }
    else for (const item of ITEMS) {
      const group = $("qitem-" + item.key).querySelector(".likert");
      for (const b of group.children) b.classList.toggle("sel", !!trial.ratings[item.key] && Number(b.dataset.val) === trial.ratings[item.key].value);
      syncChoiceState(group);
    }
    ratShowPage(restored ? restored.page : 0, tutActive() ? tutIdx : undefined);
    if (restored) ratPageAt = performance.now() - (restored.pageElapsedMs || 0);
    show("rating");
    resumeStage = "rating"; saveBackup();
  }
  // 1 項目 1 画面 (2026-09-08 §6-6 項18): ratPage 0=迷い / 1=自信。項目の rt_ms はその画面が出てからの時間
  let ratPage = 0, ratPageAt = 0;
  function ratShowPage(p, explanationIndex) {
    ratPage = p; ratPageAt = performance.now();
    for (let i = 0; i < ITEMS.length; i++) { const el = $("qitem-" + ITEMS[i].key); if (el) el.hidden = i !== p; }
    $("ratingBack").style.display = p === 1 ? "" : "none";
    $("ratBtnRow").classList.toggle("with-back", p === 1);   // 戻るがある行は広げる (2026-09-15)
    $("ratingNext").style.display = p === 0 ? "" : "none";
    $("ratingSubmit").style.display = p === 1 ? "" : "none";
    $("ratingNext").disabled = trial.ratings[ITEMS[0].key] == null;
    $("ratingSubmit").disabled = trial.ratings[ITEMS[1].key] == null;
    $("ratingNext").classList.remove("cue"); $("ratingSubmit").classList.remove("cue");
    if (tutActive()) { tutIdx = explanationIndex == null ? (p === 0 ? (tutIntroDone ? 1 : 0) : 2) : explanationIndex; tutRender(); }
    else { $("ratingTutPrev").hidden = true; $("ratingHelp").classList.remove("hidden"); }
    updateProgress();
    $("rating").querySelector(".qwrap").scrollTop = 0;
    focusScreenHeading("rating");
    if (resumeStage === "rating") scheduleCheckpoint();
  }
  $("ratingNext").addEventListener("click", () => {
    if (ratPage !== 0) return;
    if (ratingReview) { showRatingExplanationPage(tutIdx + 1); return; }
    if (tutActive() && TUT_PAGES[tutIdx].act === "intro") {   // 導入ページ → 迷いのページ (評定画面は 0 のまま。2026-09-12 後刻)
      if (ratTooEarly($("ratingNext"))) return;
      tutIntroDone = true; showRatingExplanationPage(1); return;
    }
    if (trial.ratings[ITEMS[0].key] == null) return;
    if (tutActive() && ratTooEarly($("ratingNext"))) return;   // 読み終わる前の「次へ」 (2026-09-12)
    ratShowPage(1);
  }, { passive: true });
  $("ratingBack").addEventListener("click", () => {   // 自信の画面 → 迷いの画面 (選択は保持)
    if (ratPage !== 1) return;
    trial.ratingBacks = (trial.ratingBacks || 0) + 1;
    if (tutActive()) device.tutorialLog.push({ kind: "rating", event: "back" });
    ratShowPage(0);
  }, { passive: true });
  // 評定チュートリアルの状態 (例題に回答した後のみ)。
  // tutChanged = チュートリアル中に評定を変更したか (旧・変更練習の行動ゲートに代わる観察記録)
  let ratingTutorialDone = false, tutIdx = -1, tutChanged = false, tutRenderedAt = 0;
  let ratingReview = null;   // 見直し前の評定ページ・経過時間。回答値は trial に保ち、説明中は変更しない
  const ratingSeenPages = new Set();
  let tutIntroDone = false;   // 0=導入、1=迷い、2=自信、3=締め、4=番号なしの練習導入。
  const RATING_PRACTICE_INTRO = { act: "practiceIntro", title: "練習問題", text: "ここから5問、練習問題に回答します。", op: '読んだら「次へ」' };
  const ratingTutorialPage = () => TUT_PAGES[tutIdx] || (tutIdx === TUT_PAGES.length ? RATING_PRACTICE_INTRO : null);
  const tutActive = () => tutIdx >= 0;
  function showRatingExplanationPage(index) {
    if (index < 0 || index > TUT_PAGES.length || (ratingReview && index >= TUT_PAGES.length)) return;
    tutIdx = index; tutIntroDone = index > 0;
    ratShowPage(index >= 2 ? 1 : 0, index);
    if (resumeStage === "rating") saveBackup();
  }
  function closeRatingReview() {
    if (!ratingReview) return;
    const retained = ratingReview;
    device.tutorialLog.push({ kind: "rating", event: "close", page: tutIdx + 1 });
    tutIdx = -1; tutRender(); ratingReview = null; replayResumeState = null;
    document.body.classList.remove("tut-review");
    $("rating").classList.remove("rating-review");
    for (const b of $("ratingItems").querySelectorAll("button")) b.disabled = false;
    ratShowPage(retained.page);
    ratingOnset = performance.now() - retained.elapsedMs;
    ratPageAt = performance.now() - retained.pageElapsedMs;
    saveBackup();
  }
  $("ratingHelp").addEventListener("click", () => {
    if (tutActive() || !trial || resumeStage !== "rating") return;
    replayResumeState = JSON.parse(JSON.stringify(resumeState()));
    ratingReview = { ...replayResumeState.rating };
    device.tutorialLog.push({ kind: "rating", event: "again", phase, trial: phase === "main" ? trialIndex + 1 : null, ratingPage: ratPage + 1 });
    $("rating").classList.add("rating-review"); document.body.classList.add("tut-review");
    for (const b of $("ratingItems").querySelectorAll("button")) b.disabled = true;
    showRatingExplanationPage(0);
    saveBackup();
  }, { passive: true });
  $("ratingTutClose").addEventListener("click", closeRatingReview, { passive: true });
  $("ratingTutPrev").addEventListener("click", () => {
    if (!tutActive() || tutIdx <= 0) return;
    device.tutorialLog.push({ kind: "rating", event: "back", page: tutIdx + 1 });
    if (!ratingReview && tutIdx === 2) trial.ratingBacks = (trial.ratingBacks || 0) + 1;
    showRatingExplanationPage(tutIdx - 1);
  }, { passive: true });
  // 説明カード→あなたの回答→1項目の5択→ナビの順。通常評定と保存・尺度を共用する。
  let ratSpot = null, ratPop = null, ratCueTimer = null, ratFlashTimer = null;
  let ratLockUntil = 0;   // 最小読了時間 (2026-09-12): これより早い「次へ」/確定は受け付けず注意
  const FLASH_MS = 1200;  // ボタンの注意の表示時間 (2026-09-14: 2.5 → 1.2 秒。表示中の連打では延長せず、ロックが切れる瞬間には必ず「次へ」に戻す)
  // 進むボタン自体に短い注意を出す (ドラッグ導入の btnFlash と同じ: 緑のまま文言を変えて揺らす。2026-09-14: 浮遊する赤い文字 (ratNudge) は廃止)
  function ratBtnLabel(btn) {
    if (tutActive()) {
      const p = ratingTutorialPage();
      if (ratingReview && p.act === "finish") return "回答に戻る";
      if (!ratingReview && p.act === "finish") return "練習問題へ";
      return "次へ";
    }
    return btn.id === "ratingSubmit" ? "決定して次へ" : "次へ";
  }
  function ratFlashClear() {
    if (ratFlashTimer) { clearTimeout(ratFlashTimer); ratFlashTimer = null; }
    for (const id of ["ratingNext", "ratingSubmit"]) { const b = $(id); if (b.classList.contains("warn")) { b.classList.remove("warn"); b.textContent = ratBtnLabel(b); b.style.height = b.dataset.ratHeight || ""; delete b.dataset.ratHeight; } }
  }
  function ratBtnFlash(text, btn, maxUntil) {   // maxUntil: これより後には残さない (早押しの注意はロックが切れたら消す)
    btn = btn || (ratPage === 0 ? $("ratingNext") : $("ratingSubmit"));
    if (ratFlashTimer && btn.classList.contains("warn") && btn.textContent === text) return;   // 表示中の連打では延長しない
    ratFlashClear();
    const now = performance.now(); let end = now + FLASH_MS; if (maxUntil) end = Math.min(end, maxUntil);
    btn.dataset.ratHeight = btn.style.height;
    btn.style.height = btn.getBoundingClientRect().height + "px";
    btn.textContent = text; btn.classList.add("warn");
    ratFlashTimer = setTimeout(() => { ratFlashTimer = null; btn.classList.remove("warn"); btn.textContent = ratBtnLabel(btn); btn.style.height = btn.dataset.ratHeight || ""; delete btn.dataset.ratHeight; }, Math.max(150, end - now));
  }
  function ratTooEarly(btn) {
    if (performance.now() >= ratLockUntil) return false;
    device.tutorialLog.push({ kind: "rating", page: tutIdx + 1, event: "early" });
    ratBtnFlash("読んでから押してください", btn, ratLockUntil);
    return true;
  }
  // 説明中に「次へ」以外の場所を押した人への案内 (ドラッグ導入の strayTap と同じ。2026-09-14)。評定ボタン・「戻る」・押せる「次へ」は本来の操作なので除く。
  // 押せない (未選択の) 「次へ」は pointer-events:none (app.css) にして親で受ける → 「上から1つ選んでください」
  $("rating").addEventListener("pointerdown", (e) => {
    if (!tutActive()) return;
    const t = e.target;
    if ((!ratingReview && t.closest(".likert button")) || t.closest("#ratingBack") || t.closest("#ratingTutPrev") || t.closest("#ratingTutClose") || t.closest("#stopBtn")) return;
    const goBtn = ratPage === 0 ? $("ratingNext") : $("ratingSubmit");
    if (t.closest("#" + goBtn.id) && !goBtn.disabled) return;   // 押せる「次へ」: click 側 (早押し判定) に任せる
    const p = ratingTutorialPage();
    const unselected = !ratingReview && ["hes", "conf"].includes(p.act) && trial.ratings[ITEMS[ratPage].key] == null;
    device.tutorialLog.push({ kind: "rating", page: tutIdx + 1, event: "stray" });
    ratBtnFlash(unselected ? "1つ選んでください" : "このボタンで進みます", goBtn);
    if (!unselected) goBtn.classList.add("cue");
  }, { passive: true });
  // 説明文の長さからボタンを強調する合図の時刻を見積もる（固定待機時間とは別）。
  // ボタンの合図は読速ベースラインがあればその0.45倍（下限3字/秒）、なければ5字/秒で見積もる。
  // 最小読了時間は説明表示から設ける固定の待機時間で、実際に読み終えたかの判定ではない。
  // これより早い「次へ」は進めずに案内を出す。?minread=0で無効 (validate/開発用)
  const MINREAD_ON = QS.get("minread") !== "0";
  function minReadMs(text) {
    if (!MINREAD_ON) return 0;
    const chars = String(text || "").replace(/<[^>]*>/g, "").replace(/\|/g, "").length;
    return Math.round(0.8 * Math.max(1200, Math.min(7000, Math.round((chars / 22) * 1000) + 500)));   // 2026-09-14: 実機で長く感じたので 0.8 倍 (実効 27.5 字/秒 + 0.4 s、0.96–5.6 s)
  }
  function readCueDelay(text) {
    const chars = String(text || "").replace(/<[^>]*>/g, "").replace(/\|/g, "").length;
    const base = (device.readingBaseline && device.readingBaseline.charsPerSec) || null;
    const cps = base ? Math.max(3, base * 0.45) : 5;   // 遅い読み手基準 (2026-09-04: 光るのが早すぎたので緩めた)
    return Math.max(3500, Math.min(11000, Math.round((chars / cps) * 1000) + 1200));
  }
  function ensureRatSpot() {
    if (ratSpot) return;
    ratSpot = document.createElement("div"); ratSpot.id = "ratSpot"; ratSpot.className = "tut-spot hidden";
    document.body.appendChild(ratSpot);
    ratPop = document.createElement("div"); ratPop.id = "ratPop"; ratPop.className = "tut-pop hidden";
    ratPop.innerHTML = '<div class="s" id="tutStepLabel"></div><h1 id="ratTutTitle"></h1><div class="t" id="ratTutText"></div>' +
      '<div class="rat-card-meta"><div class="g hidden" id="ratPopOp"></div><div class="dots" id="ratPopDots"></div></div>';
    $("rating").querySelector(".qwrap").prepend(ratPop);
    // ボタン行 [↻ もう一度] [戻る] [次へ/確定] は HTML に静的に置いてある (2026-09-08)。ここでは「もう一度」だけ結線
    $("ratReplay").addEventListener("click", () => {   // 説明だけを最初から。選んだ評定は保持する。
      device.tutorialLog.push({ kind: "rating", event: "replay" });
      showRatingExplanationPage(0);   // 回答値は消さず、説明だけを最初から見直す。
    }, { passive: true });
  }
  function placeRatingTutorial() {
    if (!tutActive() || !ratPop || !screens.rating.classList.contains("active")) return;
    const p = ratingTutorialPage();
    ratPop.classList.add("on");
    ratPop.style.top = ""; ratPop.style.left = ""; ratPop.style.marginTop = "0px";
    const wrap = $("rating").querySelector(".qwrap"), row = $("ratBtnRow");
    if (ratingReview || ["intro", "finish", "practiceIntro"].includes(p.act)) {
      row.style.bottom = "auto";
      row.style.top = Math.max(12, innerHeight * .88 - Math.min(innerWidth, innerHeight) * .08 - row.getBoundingClientRect().height / 2) + "px";
    } else { row.style.bottom = ""; row.style.top = ""; }
    const buttons = row.getBoundingClientRect();
    const top = ratingReview ? $("ratingTutClose").getBoundingClientRect().bottom + 8 : parseFloat(getComputedStyle(wrap).paddingTop);
    if (ratingReview || !["hes", "conf"].includes(p.act)) {
      const natural = ratPop.getBoundingClientRect().top;
      ratPop.style.marginTop = Math.max(0, top + (buttons.top - 20 - top - ratPop.offsetHeight) / 2 - natural) + "px";
    } else {
      const natural = ratPop.getBoundingClientRect().top, total = buttons.bottom - natural;
      ratPop.style.marginTop = Math.max(0, top - natural, (innerHeight - 20 - top - total) / 2 + top - natural) + "px";
    }
    wrap.scrollTop = 0;
  }
  window.addEventListener("resize", () => requestAnimationFrame(placeRatingTutorial), { passive: true });
  let ratPageShownAt = null, ratPageShownIdx = -1;   // 説明ページの滞在時間の記録用 (device.tutorialLog)
  function tutRender() {
    const qc = $("qitem-confidence"), qh = $("qitem-hesitation");
    if (!qc || !qh) return;
    if (ratPageShownIdx >= 0 && ratPageShownAt != null)   // 直前のページの滞在時間を記録 (ページ送り・やり直し・完遂のたび)
      device.tutorialLog.push({ kind: "rating", page: ratPageShownIdx + 1, ms: Math.round(performance.now() - ratPageShownAt) });
    ratPageShownIdx = tutActive() ? tutIdx : -1; ratPageShownAt = tutActive() ? performance.now() : null;
    ensureRatSpot();
    const oldBox = $("tutBox"); if (oldBox) oldBox.remove();
    qc.classList.remove("dim", "tfocus"); qh.classList.remove("dim", "tfocus");
    const lkC = qc.querySelector(".likert"), lkH = qh.querySelector(".likert");
    $("ratingHelp").classList.toggle("hidden", tutActive());
    $("ratingTutClose").classList.toggle("hidden", !tutActive() || !ratingReview);
    $("ratingTutPrev").hidden = !tutActive() || tutIdx === 0;
    if (!tutActive()) {   // 完遂/解除: オーバーレイを外し通常の評定画面へ復帰
      ratSpot.classList.remove("on", "strong"); ratPop.classList.remove("on");
      ratSpot.classList.add("hidden"); ratPop.classList.add("hidden");
      if (lkC) lkC.classList.remove("tut-cue"); if (lkH) lkH.classList.remove("tut-cue");
      ratFlashClear();
      $("ratReplay").classList.add("hidden");
      $("rating").classList.remove("tut-front", "rat-intro", "rat-static");
      $("ratBtnRow").style.top = ""; $("ratBtnRow").style.bottom = "";
      $("ratingBackNote").hidden = true;
      ratPop.style.marginTop = "";
      $("ratingNext").classList.remove("cue"); $("ratingSubmit").classList.remove("cue");
      if (ratCueTimer) { clearTimeout(ratCueTimer); ratCueTimer = null; }
      $("ratingSubmit").textContent = "決定して次へ";   // 本番の表記に戻す
      return;
    }
    const p = ratingTutorialPage();
    const seen = ratingSeenPages.has(tutIdx); ratingSeenPages.add(tutIdx);
    $("rating").style.removeProperty("--ratReserve");
    ratFlashClear();
    $("tutStepLabel").textContent = tutIdx < TUT_PAGES.length ? `回答の振り返り ${tutIdx + 1} / ${TUT_PAGES.length}` : "";
    $("tutStepLabel").hidden = tutIdx >= TUT_PAGES.length;
    $("ratTutTitle").textContent = p.title;
    const rdots = $("ratPopDots"); rdots.innerHTML = "";
    if (tutIdx < TUT_PAGES.length) for (let i = 0; i < TUT_PAGES.length; i++) { const d = document.createElement("i"); if (i === tutIdx) d.className = "a"; rdots.appendChild(d); }
    $("ratTutText").textContent = p.text;
    $("ratReplay").classList.add("hidden");   // 「もう一度」は出さない (「戻る」と役割が同じ。2026-09-09)
    const operation = ratingReview ? (tutIdx === TUT_PAGES.length - 1 ? "確認したら「回答に戻る」" : "確認したら「次へ」") : p.op;
    $("ratPopOp").textContent = operation || ""; $("ratPopOp").classList.toggle("hidden", !operation);
    $("ratingBack").style.display = "none";
    $("ratingTutPrev").hidden = tutIdx === 0 || (!ratingReview && ["finish", "practiceIntro"].includes(p.act));
    $("ratingTutPrev").textContent = "← 戻る";
    $("ratingBackNote").hidden = ratingReview || p.act !== "conf";
    $("ratBtnRow").classList.toggle("with-back", !$("ratingTutPrev").hidden);
    $("rating").classList.add("tut-front");   // 次へ/確定/もう一度 を暗幕より手前に
    if (ratCueTimer) { clearTimeout(ratCueTimer); ratCueTimer = null; }
    $("ratingNext").textContent = ratBtnLabel($("ratingNext"));
    $("ratingSubmit").textContent = ratBtnLabel($("ratingSubmit"));
    // 押す対象の評定行を鼓動 (まだ選んでいないときだけ。選んだら進むボタンへ合図が移る)
    const key = p.act === "conf" ? "confidence" : "hesitation", lk = $("qitem-" + key).querySelector(".likert");
    if (lkC) lkC.classList.remove("tut-cue"); if (lkH) lkH.classList.remove("tut-cue");
    const staticPage = !!ratingReview || !["hes", "conf"].includes(p.act);
    $("rating").classList.toggle("rat-intro", staticPage);
    $("rating").classList.toggle("rat-static", staticPage);
    if (ratingReview) {
      $("ratingNext").disabled = false; $("ratingSubmit").disabled = false;
    } else if (staticPage) {
      const goBtn = ratPage === 0 ? $("ratingNext") : $("ratingSubmit");
      goBtn.disabled = false;
      ratCueTimer = setTimeout(() => { if (tutActive() && ratingTutorialPage() === p) goBtn.classList.add("cue"); }, readCueDelay(p.text));
    } else {
      if (p.act === "hes") $("ratingNext").disabled = trial.ratings[key] == null;   // 導入で有効にした「次へ」を評定待ちに戻す
      if (trial.ratings[key] == null) lk.classList.add("tut-cue");
      else (p.act === "conf" ? $("ratingSubmit") : $("ratingNext")).classList.add("cue");
    }
    $("rating").querySelector(".qwrap").scrollTop = 0;
    // show後のrAFで自然な高さを測り、内容全体を収まる範囲で中央へ寄せる。
    ratSpot.classList.remove("strong", "on"); ratSpot.classList.add("hidden"); ratPop.classList.remove("hidden");
    requestAnimationFrame(placeRatingTutorial);
    tutRenderedAt = performance.now();   // 連打デバウンスの基準時刻
    ratLockUntil = (ratingReview || seen) ? 0 : tutRenderedAt + minReadMs(p.text);
  }
  function selectRating(key, value, container, btn) {
    if (ratingReview) return;
    if (tutActive() && !["hes", "conf"].includes(ratingTutorialPage().act)) return;
    if (key !== ITEMS[ratPage].key) return;   // 表示中の項目だけ受け付ける (保険。他方の項目は hidden)
    if (tutActive() && trial.ratings[key] && trial.ratings[key].value !== value) tutChanged = true;   // 変更の観察記録
    // rt_ms = この項目の画面が出てから押すまで (2026-09-08: 1 項目 1 画面)
    trial.ratings[key] = { value, rt_ms: +(performance.now() - ratPageAt).toFixed(1) };
    for (const b of container.children) b.classList.toggle("sel", b === btn);
    syncChoiceState(container);
    $("ratingNext").disabled = trial.ratings[ITEMS[0].key] == null;
    $("ratingSubmit").disabled = trial.ratings[ITEMS[1].key] == null;
    if (tutActive()) {   // 選んだら鼓動を進むボタンへ (押す場所は 1 箇所)
      container.classList.remove("tut-cue");
      (ratPage === 0 ? $("ratingNext") : $("ratingSubmit")).classList.add("cue");
    }
    scheduleCheckpoint();
  }
  function submitRating() {
    if (ratingReview) {
      if (tutIdx === TUT_PAGES.length - 1) closeRatingReview();
      else showRatingExplanationPage(tutIdx + 1);
      return;
    }
    if (tutActive() && ratingTutorialPage().act === "finish") {
      if (ratTooEarly($("ratingSubmit"))) return;
      showRatingExplanationPage(TUT_PAGES.length); return;
    }
    if (tutActive() && ratingTutorialPage().act === "practiceIntro") {
      if (ratTooEarly($("ratingSubmit"))) return;
      tutIdx = -1; ratingTutorialDone = true; tutRender();
      device.ratingTutorial = { changed: tutChanged, completed: true, pages: TUT_PAGES.length };
      completePracticeTrial(); return;
    }
    if (ITEMS.some((it) => trial.ratings[it.key] == null)) return;
    if (ratPage !== 1) return;   // 自信の画面でのみ確定 (保険)
    if (tutActive() && ratTooEarly($("ratingSubmit"))) return;   // 読み終わる前の確定 (2026-09-12)
    trial.ratingSubmitMs = +(performance.now() - ratingOnset).toFixed(1); // 2項目合計の所要時間 (負担指標)
    stampMonitors(trial);   // 評定時間も含めた試行窓で環境音要約を上書き (§6-6 項10: 評定中も計測)
    if (tutActive()) {   // 2つの回答はここで確定し、後続の説明時間は評定所要時間へ加えない。
      showRatingExplanationPage(TUT_PAGES.length - 1);
      return;
    }
    if (phase === "main") {
      trialIndex++;
      if (!queue.length && seqIndex >= SEQ.length - 1) freezeMainClock();
      resumeStage = "next"; saveBackup();
      micCheckpoint(nextTrial);   // 騒音アラートは評定「送信後」のみ (迷い評定を汚染しない位置。§6-6 項10)
    } else {
      // 練習 (評定リハーサル後): 行動ゲート判定 (streak は showPracticeFeedback で更新済み)。
      // 2026-09-05: チュートリアル後は練習キュー (practiceTrials 問) を必ず完走してから本番へ。
      // ゲート未達なら nextTrial が補充するので、実質「5問やって、かつ操作を理解できたら本番」になる
      completePracticeTrial();
    }
  }

  // ===== フェーズ遷移 =====
  function validAge() {
    const field = $("age");
    return field.value.trim() !== "" && Number.isInteger(field.valueAsNumber) && field.validity.valid;
  }
  // 事前アンケート (氏名・年齢・機種名) を取り込む。性別/利き手は wireSeg が随時 device に格納済み。
  function captureIntro() {
    device.participantId = device.consent ? device.consent.name : $("pid").value.trim();
    device.deviceModel = $("devModel").value.trim();
    device.age = validAge() ? $("age").valueAsNumber : null;
  }
  // 事前項目を全て埋めるまで開始ボタンを無効化 (必須化)。性別の「回答しない」(na) も回答済み扱い。
  function introReady() {
    const ageOk = AGEBAND_ON ? device.ageBand != null : validAge();
    return $("pid").value.trim() !== "" && ageOk &&
      $("devModel").value.trim() !== "" &&
      device.sex != null && device.handedness != null;
  }
  function refreshIntro() {
    const ready = introReady();
    $("goPractice").disabled = !ready;
    $("age").setAttribute("aria-invalid", String(!AGEBAND_ON && !validAge()));
    // どの欄が未入力かを示す (グレーのボタンだけでは分からない)。非表示の欄 (URL プリセット/kiosk) は数えない
    const shown = (id) => { const f = $(id) && $(id).closest(".field"); return f && getComputedStyle(f).display !== "none"; };
    const miss = [];
    if (shown("pid") && $("pid").value.trim() === "") miss.push("名前");
    if (AGEBAND_ON ? (shown("ageBandSeg") && device.ageBand == null) : (shown("age") && !validAge())) miss.push(AGEBAND_ON ? "年代" : "年齢");
    if (shown("devModel") && $("devModel").value.trim() === "") miss.push("機種名");
    if (shown("sexSeg") && device.sex == null) miss.push("性別");
    if (shown("handSeg") && device.handedness == null) miss.push("利き手");
    // 何も入力していない初期状態では出さない (全欄が並ぶだけでノイズ)。1つでも入力してから、残りを示す
    const shownCount = ["pid", AGEBAND_ON ? "ageBandSeg" : "age", "devModel", "sexSeg", "handSeg"].filter(shown).length;
    const flag = !(ready || miss.length === 0 || miss.length >= shownCount);
    $("introMissing").textContent = flag ? "未入力: " + miss.join("・") : "";

  }

  // ===== ドラッグ導入チュートリアル (スポットライト方式。§6-6 項14・decisions-log 2026-09-02) =====
  // 参加者が最初に出会う導入 (練習の前・初回のみ)。①スタート押下 → ②別ステージ概念デモ「運び方は自由」
  // (中央1箱・端点/膨らみ/位置を毎回大きく変える変化大) → ③本番の実2箱に経路ゼロ(ディゾルブ)を交互提示。
  // ④=既存の練習トライアルへ引き渡す。反アンカー: 実ステージに経路の形を出さない・直線を実演しない・
  // 端点顕著/中間減光・両 destination 均等。実演は pointer-events:none の装飾で実要素の geom に不干渉。
  const dragTutState = { done: false, active: false };
  const DragTut = (() => {
    const INSTRUCTED_STEPS = [
      { part: "extra", focus: "orient", act: "next", sample: true, reveal: 0, op: "確認したら「次へ」", txt: "追加の10問では、<b>問題文も選択肢も読まずに</b>、<b>適当に指を運んでください</b>。<br>どちらの選択肢でも構いません。前の答えを思い出す必要もありません。<br>この10問は、指示どおり読まずに答える問題なので、<b>謝礼には影響しません。</b>" },
      { part: "extra", focus: "orient", act: "next", sample: true, reveal: 0, op: "確認したら「問題に戻る」", txt: "操作はこれまでと同じです。<br><b>スタートボタンに指を置き、指を離さずに</b>どちらかの選択肢のボックスまで運び、<b>選択肢のボックスの中で離します</b>。<br>問題文や選択肢は読まずに進めてください。<b>振り返りの質問はありません。</b>" },
    ];
    return window.PILOT_GUIDED_TUTORIAL.createEngine({
      $, surface, startBtn, stemEl, choiceA, choiceB, numA, numB, dragTutState, screens,
      getDevice: () => device, setResumeStage: value => { resumeStage = value; },
      saveBackup, logInstructionExposure, minReadMs, readCueDelay,
      hideBanner, clearIdleCoach, coachHide, setCoach, show, sizeCanvas, clearCanvas, updateProgress,
      uiScale: UI_SCALE, query: QS, debug: !!GO, realBlocks: REAL_BLOCKS,
      moralPracticeDefinition, instructedSteps: INSTRUCTED_STEPS,
    });
  })();

  let exampleIntroRead = false, exampleIntroLock = 0, exampleIntroShownAt = 0, exampleIntroCue = null, exampleIntroFlash = null;
  function resetExampleIntroHint() {
    clearTimeout(exampleIntroFlash); exampleIntroFlash = null;
    $("guidedIntroGo").textContent = "次へ"; $("guidedIntroGo").classList.remove("flash"); $("guidedIntroGo").style.height = "";
  }
  function flashExampleIntro(text, until) {
    if (exampleIntroFlash && $("guidedIntroGo").textContent === text) return;
    resetExampleIntroHint(); const button = $("guidedIntroGo"); button.style.height = button.getBoundingClientRect().height + "px";
    button.textContent = text; void button.offsetWidth; button.classList.add("flash");
    exampleIntroFlash = setTimeout(resetExampleIntroHint, until ? Math.max(0, Math.min(1200, until - performance.now())) : 1200);
  }
  function showGuidedIntro() {
    uiLocked = true; coachHide(); setCoach(null);
    show("guidedintro");
    resetExampleIntroHint(); clearTimeout(exampleIntroCue); $("guidedIntroGo").classList.remove("cue");
    exampleIntroShownAt = performance.now();
    exampleIntroLock = exampleIntroShownAt + minReadMs($("guidedintro").querySelector(".guided-intro-card").textContent);
    exampleIntroCue = setTimeout(() => { if (screens.guidedintro.classList.contains("active")) $("guidedIntroGo").classList.add("cue"); }, readCueDelay($("guidedintro").querySelector(".guided-intro-card").textContent));
    logInstructionExposure("exampleIntro");
    resumeStage = "exampleIntro"; saveBackup();
  }
  $("guidedIntroGo").addEventListener("click", () => {
    if (performance.now() < exampleIntroLock) { flashExampleIntro("読んでから押してください", exampleIntroLock); return; }
    resetExampleIntroHint(); clearTimeout(exampleIntroCue);
    device.tutorialLog.push({ kind: "drag", event: "exampleIntro", ms: Math.round(performance.now() - exampleIntroShownAt) });
    exampleIntroRead = true; startPractice();
  });
  $("guidedintro").addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;
    flashExampleIntro("このボタンで進みます");
  }, { passive: true });
  function startPractice() {
    // ドラッグ導入チュートリアル (初回・第1ブロックのみ・?tut=0 で無効)。完了後に startPractice を再入
    if (seqIndex === 0 && DRAG_TUT_ON && !dragTutState.done) {
      DragTut.run(startPractice);   // 完了後に再入 → チュートリアル試行 (例の操作+評定チュートリアル) → 練習5問
      return;
    }
    if (seqIndex === 0 && DRAG_TUT_ON && dragTutState.done && !exampleIntroRead && !records.some(r => r.phase === "tutorial")) { showGuidedIntro(); return; }
    requestWakeLock();   // ユーザー操作起点で取得 (§6-6 項11)
    if (!device.introCompletedAt && !device.consent) captureIntro();
    phase = "practice";
    streak = 0;
    if (UNIFIED && seqIndex === 0) {
      // 統合練習 (2026-07-15、§6-2): 本番ブロック順に各ブロックから出して**合計 practiceTrials 問** (2026-09-05:
      // 各ブロック n 問=合計 2n だと多すぎるため合計で数える)。ブロック別練習は廃止 (操作・評定画面が
      // 全ブロック同一のため。切替効果はブロック順CB+解析で統制)
      queue = [];
      const total = CONFIG.practiceTrials, per = Math.ceil(total / REAL_BLOCKS.length);
      for (const id of REAL_BLOCKS) {
        const b = BLOCKS[id];
        for (const c of b.buildPractice(per)) { c._pblock = id; queue.push(c); }
      }
      queue = queue.slice(0, total);   // 合計を practiceTrials に揃える
    } else {
      queue = BLOCK.buildPractice(CONFIG.practiceTrials);
    }
    // チュートリアル試行: ドラッグ導入で見た例をそのまま1回操作し、その直後の評定で
    // 評定チュートリアルを行う。練習5問には数えない (phase:'tutorial' で記録・ゲートにも数えない)。導入が走ったときだけ
    if (seqIndex === 0 && dragTutState.done && queue.length > 0) {
      const tb = UNIFIED ? BLOCKS[REAL_BLOCKS[0]] : BLOCK;
      const tc = makeTutorialCell(tb);
      if (UNIFIED) tc._pblock = REAL_BLOCKS[0];
      queue.unshift(tc);
    }
    sizeCanvas();
    if (queue.length === 0) { startMain(); return; }  // ?practice=0 (開発用) のみ練習スキップ
    nextTrial();
  }
  function endPractice() {
    // 自己ペース遷移 (2026-07-15 高齢者配慮): 自動タイマー (旧1.8秒) でなく「続ける」ボタンで本番へ。
    // blockintro 画面を流用し、pendingMainStart で blockintroGo の遷移先を本番に切り替える
    uiLocked = true;
    setCoach(null);
    coachHide();
    pendingMainStart = true;
    $("blockintroBody").innerHTML =
      '<h1>練習完了です！</h1>' +
      '<p>ここからが<b>本番</b>です。やり方は練習と同じです。</p>' +
      '<p><b>回答を急ぐ必要はありません。</b><b>自分のペースで進めてください。</b></p>' +
      '<p>操作を忘れたときは、<b>問題画面の上にある「↻ 操作方法」</b>から説明を見直せます。</p>' +
      '<p>準備ができたら「続ける」を押してください。</p>';
    show("blockintro");
    logInstructionExposure("practiceComplete");
    $("blockintro").querySelector(".pad").scrollTop = 0;
    resumeStage = "practiceComplete"; saveBackup();
  }
  function startMain() {
    if (CONFIG.block !== SEQ[seqIndex]) loadBlock(SEQ[seqIndex]);  // 統合練習の最後が別タイプだった場合に現ブロックへ復帰
    // 同一セッションの入力・練習・同意のチェックポイントは、本番第1問の保存で更新する。
    if (!device.participantId) captureIntro();
    // 練習サマリ (行動ゲートの達成記録。理解確認の証跡 + データ品質共変量。§6-2)
    const prac = records.filter((r) => r.phase === "practice" && r.block === CONFIG.block);  // 統合では現ブロック分のみ
    const summary = {
      gateStreak: BLOCK.gateStreak, gateCorrect: BLOCK.gateCorrect,
      trials: prac.length,
      aborts: prac.reduce((s, r) => s + (r.aborts || 0), 0), // 各完了試行の trial.aborts に集約済み
      skipped: prac.length === 0,   // ?practice=0 (開発用) でのみ true
    };
    device.practiceSummary = summary;                    // 単体互換 (統合では最後のブロック分)
    device.practiceSummaryByBlock[CONFIG.block] = summary;
    phase = "main";
    trialIndex = 0;
    trialShownAt = null; lastTrialMs = null;   // 練習→本番の間隔を「前問の所要」に混ぜない (HUD)
    if (mainStartedAt == null) mainStartedAt = performance.now();   // 統合では最初のブロック開始を起点にする
    queue = BLOCK.buildMain();
    if (NMAIN && BLOCK.id !== "attn") queue = queue.slice(0, NMAIN);   // 開発専用 ?nmain=N (検証の短縮)
    if (ATTN_ON && BLOCK.ratings && BLOCK.id !== "attn") queue = insertDqs(queue);  // ②③に弱DQSを1/3・2/3で埋め込む (§6-5)
    if (ATTN_ON && BLOCK.ratings && BLOCK.id !== "attn") queue = queue.concat(shuffle([makeCheckCell("infreq"), makeCheckCell("imc")]));   // 本番の最後の 2 問 = infrequency + 強 IMC (2026-09-30。旧: 末尾の attn ブロック)
    totalMain = queue.length;
    sizeCanvas();
    nextTrial();
  }

  // ===== 事後アンケート (持ち方 grip は両ブロック / 使いにくさ survey は②③=評定ブロックのみ) =====
  const CURRENT_SURVEY_PROBLEM_DEFINITION = {
    version: "usability-v3", title: $("surveyProblemsLabel").textContent, easeQuestion: $("surveyEaseLabel").textContent,
    choices: [...$("surveyProblems").querySelectorAll("button[data-val]")].map(b => ({ value: b.dataset.val, label: b.textContent, part: +b.dataset.part }))
  };
  const LEGACY_SURVEY_PROBLEM_DEFINITION = {
    version: "usability-v1", title: "使いにくかった点・改善してほしい点",
    choices: CURRENT_SURVEY_PROBLEM_DEFINITION.choices.map(c => ({ ...c,
      label: ({ drag_hard: "ドラッグして選ぶ操作がやりにくかった", rating_burden: "振り返りの回答が多くて負担だった", trial_fatigue: "試行数が多くて疲れた・長く感じた" })[c.value] || c.label,
      part: c.value === "other" ? 2 : c.part
    })).sort((a, b) => a.part - b.part || +a.value.startsWith("none") - +b.value.startsWith("none"))
  };
  let problemParts = [1, 2, 3].map(part => CURRENT_SURVEY_PROBLEM_DEFINITION.choices.filter(c => c.part === part && !c.value.startsWith("none")).map(c => c.value));
  function bindSurveyProblemDefinition(restored) {
    // 定義のない旧版postq保存は旧3ページのまま再開する。未到達の旧セッションは初回表示時に新版を適用。
    const definition = device.surveyProblemDefinition || (restored ? LEGACY_SURVEY_PROBLEM_DEFINITION : CURRENT_SURVEY_PROBLEM_DEFINITION);
    device.surveyProblemDefinition = JSON.parse(JSON.stringify(definition));
    const buttons = new Map([...$("surveyProblems").querySelectorAll("button[data-val]")].map(b => [b.dataset.val, b]));
    $("surveyProblemsLabel").textContent = definition.title;
    $("surveyEaseLabel").textContent = definition.easeQuestion || (["usability-v1", "usability-v2"].includes(definition.version)
      ? "ドラッグで選ぶ操作はしやすかったですか" : CURRENT_SURVEY_PROBLEM_DEFINITION.easeQuestion);
    for (const choice of definition.choices) {
      const b = buttons.get(choice.value);
      if (!b || ![1, 2, 3].includes(choice.part)) continue;
      b.textContent = choice.label; b.dataset.part = String(choice.part); $("surveyProblems").appendChild(b);
    }
    problemParts = [1, 2, 3].map(part => [...$("surveyProblems").querySelectorAll(`button[data-part="${part}"]:not([data-none])`)].map(b => b.dataset.val));
    $("surveyProblemsPage").dataset.otherPart = $("surveyProblems").querySelector('[data-val="other"]').dataset.part;
  }
  const survey = { problems: [], problemPages: problemParts.map(() => null), ease: null, free: "", comment: "" };  // 未回答(null)と明示的該当なし(["none"])を区別
  function syncSurveyProblems() {
    const answered = survey.problemPages.filter(Array.isArray);
    const problems = answered.flat().filter(value => value !== "none");
    survey.problems = problems.length ? problems : answered.length === problemParts.length && answered.every(page => page.includes("none")) ? ["none"] : [];
  }
  function restoreProblemPages(saved) {
    if (Array.isArray(saved.problemPages)) {
      survey.problemPages = problemParts.map((values, i) => {
        const page = saved.problemPages[i];
        if (!Array.isArray(page)) return null;
        const choices = page.filter(value => values.includes(value));
        return choices.length ? choices : page.includes("none") ? ["none"] : null;
      });
    } else { // 旧版の全体noneは当時の2ページだけに適用。追加ページに無かった項目を否定扱いしない。
      const old = Array.isArray(saved.problems) ? saved.problems : [];
      survey.problemPages = problemParts.map((values, i) => {
        const selected = old.filter(value => values.includes(value));
        return selected.length ? selected : i < 2 && old.includes("none") ? ["none"] : null;
      });
    }
    syncSurveyProblems();
  }

  // ===== 事後アンケート 拡充分 (2026-09-06、experiment-design §6-6 項8 / decisions-log 2026-09-06) =====
  // 課題の後に24項目（ui8で本番の開始基準・3秒の理解を追加）。5段階は評定と同じ1–5ボタン（尺度を揃える。10段階スライダーは
  // 端末で精度が落ち・既定位置に引かれ・ドラッグが課題操作と紛れるため不採用)。選択式は英語スラッグで記録。
  // 表示は POST_ON (評定ブロックを含むクラウド配布) のみ。途中終了 (partial) では必須にしない。用途は品質共変量・探索
  // (analysis-plan §3.6)。項目の文言・選定理由の正本は experiment-design §6-6 項8 / decisions-log、候補の経緯は post-survey-candidates。
  const LEGACY_POST_ITEMS = {
  "time_pressure": {
    "key": "time_pressure",
    "q": "本番中、「急がなければ」と感じましたか",
    "note": "最後の追加10問は除きます",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  "irritation": {
    "key": "irritation",
    "q": "本番中、いらだちや焦りをどのくらい感じましたか",
    "note": "最後の追加10問は除きます",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  "seriousness": {
    "key": "seriousness",
    "q": "この調査に、どれくらい真剣に取り組みましたか",
    "note": "最後の追加10問は除きます",
    "scale": [
      "真剣でなかった",
      "とても真剣に"
    ]
  },
  "attention_lapse": {
    "key": "attention_lapse",
    "q": "回答中に、注意がそれたり他のことをしていた時間はありましたか",
    "note": "最後の追加10問は除きます",
    "opts": [
      [
        "none",
        "なかった"
      ],
      [
        "some",
        "少しあった"
      ],
      [
        "much",
        "かなりあった"
      ]
    ]
  },
  "data_use": {
    "key": "data_use",
    "q": "正直なところ、今回のあなたの回答は「集中して取り組んだ回答」として研究のデータに含めてよいと思いますか",
    "note": "最後の追加10問は除きます",
    "paymentNote": "この質問への回答だけを理由に、謝礼の有無が変わることはありません。",
    "opts": [
      [
        "yes",
        "はい、含めてよい"
      ],
      [
        "no",
        "いいえ、集中できていなかった"
      ]
    ],
    "v": true
  },
  "main_start_basis": {
    "key": "main_start_basis",
    "q": "本番では、主に何を目安にスタートに指を置いていましたか。最も近いものを選んでください。",
    "note": "最後の追加10問より前の本番についてお答えください",
    "v": true,
    "opts": [
      [
        "read_end",
        "問題文を読み終えること"
      ],
      [
        "situation_understood",
        "場面の内容が分かったと思うこと"
      ],
      [
        "answer_decided",
        "自分ならどうするか、考えがまとまること"
      ],
      [
        "no_basis",
        "特に目安はなかった"
      ],
      [
        "varies",
        "問題によって違い、一つに決められない"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ]
  },
  "main_three_second_meaning": {
    "key": "main_three_second_meaning",
    "q": "本番中、説明にあった「3秒以内」は、何をするまでの時間だと思っていましたか。",
    "note": "最後の追加10問より前の本番についてお答えください",
    "v": true,
    "opts": [
      [
        "start_exit",
        "スタートに指を置いてから、枠の外へ動き始めるまで"
      ],
      [
        "decide",
        "スタートに指を置いてから、答えを決めるまで"
      ],
      [
        "release",
        "スタートに指を置いてから、選んだボックスで指を離すまで"
      ],
      [
        "unsure",
        "分からなかった／覚えていない"
      ]
    ]
  }
};
  const UI12_POST_ITEMS = {
  "time_pressure": {
    "key": "time_pressure",
    "q": "本番中、「急がなければ」と感じましたか",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  "irritation": {
    "key": "irritation",
    "q": "本番中、いらだちや焦りをどのくらい感じましたか",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  "main_three_second_meaning": {
    "key": "main_three_second_meaning",
    "q": "本番で「3秒以内に指をスタートボタンの外へ動かしてください」と言われたとき、どのように進める必要があると感じていましたか。",
    "v": true,
    "opts": [
      [
        "exit_without_decision",
        "答えが未定でも、指を外へ動かせばよい"
      ],
      [
        "decide_before_exit",
        "指を外へ出す前に、答えを決める"
      ],
      [
        "finish_in_three",
        "3秒以内に回答を終える"
      ],
      [
        "hurry_after_exit",
        "出た後も、できるだけ速く動かす"
      ],
      [
        "no_attention",
        "特に意識していなかった"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ],
    "note": "当時の受け止めとして、あてはまるものをすべて選んでください。",
    "multiple": true,
    "exclusive": [
      "no_attention",
      "dont_remember"
    ]
  }
};
  const UI12_POST_VERSIONS = { time_pressure: ["main-v2", "main"], irritation: ["main-v2", "main"], main_three_second_meaning: ["perception-v2", "main"] };
  const UI13_POST_ITEMS = {
  "main_start_basis": {
    "key": "main_start_basis",
    "q": "本番では、主に何を目安にスタートに指を置いていましたか。最も近いものを選んでください。",
    "v": true,
    "opts": [
      [
        "read_end",
        "問題文を読み終えること"
      ],
      [
        "situation_understood",
        "場面の内容が分かったと思うこと"
      ],
      [
        "answer_decided",
        "自分ならどうするか、考えがまとまること"
      ],
      [
        "no_basis",
        "特に目安はなかった"
      ],
      [
        "varies",
        "問題によって違い、一つに決められない"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ]
  },
  "main_three_second_meaning": {
    "key": "main_three_second_meaning",
    "q": "本番で、3秒以内に指をスタートボタンの外へ動かす指示を、どのように理解していましたか。",
    "v": true,
    "opts": [
      [
        "exit_without_decision",
        "答えが未定でも、指を外へ動かせばよい"
      ],
      [
        "decide_before_exit",
        "指を外へ出す前に、答えを決める"
      ],
      [
        "finish_in_three",
        "3秒以内に回答を終える"
      ],
      [
        "hurry_after_exit",
        "出た後も、できるだけ速く動かす"
      ],
      [
        "no_attention",
        "特に意識していなかった"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ],
    "note": "当時の受け止めとして、あてはまるものをすべて選んでください。",
    "multiple": true,
    "exclusive": [
      "no_attention",
      "dont_remember"
    ]
  }
};
  const UI13_POST_VERSIONS = { main_start_basis: ["main-v2", "main"], main_three_second_meaning: ["perception-v3", "main"] };
  const POST_ITEMS = [
  {
    "sec": "課題の前後の状態"
  },
  {
    "key": "fatigue_pre",
    "q": "課題を始める前、どれくらい疲れていましたか",
    "scale": [
      "疲れていなかった",
      "とても疲れていた"
    ]
  },
  {
    "key": "fatigue_post",
    "q": "いま、どれくらい疲れていますか",
    "scale": [
      "疲れていない",
      "とても疲れている"
    ]
  },
  {
    "key": "sleepiness",
    "q": "いま、どれくらい眠いですか",
    "scale": [
      "目が覚めている",
      "とても眠い"
    ]
  },
  {
    "key": "sleep_hours",
    "q": "昨夜の睡眠時間はどれくらいでしたか",
    "grid2": true,
    "interval": true,
    "opts": [
      [
        "lt4",
        "4時間未満"
      ],
      [
        "4-6",
        "4時間以上6時間未満"
      ],
      [
        "6-8",
        "6時間以上8時間未満"
      ],
      [
        "ge8",
        "8時間以上"
      ]
    ]
  },
  {
    "key": "condition",
    "q": "今日の体調はどうですか",
    "scale": [
      "悪い",
      "良い"
    ]
  },
  {
    "sec": "課題の感じ方"
  },
  {
    "key": "time_pressure",
    "q": "課題中、「急がなければ」と感じましたか",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  {
    "key": "physical_load",
    "q": "課題中、指や腕はどのくらい疲れましたか",
    "scale": [
      "疲れなかった",
      "とても疲れた"
    ]
  },
  {
    "key": "irritation",
    "q": "課題中、いらだちや焦りをどのくらい感じましたか",
    "scale": [
      "まったく感じなかった",
      "強く感じた"
    ]
  },
  {
    "sec": "回答した環境"
  },
  {
    "key": "location",
    "q": "どこで回答しましたか",
    "v": true,
    "opts": [
      [
        "home",
        "自宅"
      ],
      [
        "work_school",
        "職場・学校"
      ],
      [
        "transit",
        "電車・バスなど移動中"
      ],
      [
        "outdoor",
        "屋外・店など"
      ],
      [
        "other",
        "その他"
      ]
    ]
  },
  {
    "key": "posture",
    "q": "回答中の姿勢はどれに近いですか",
    "grid2": true,
    "opts": [
      [
        "sitting",
        "座って"
      ],
      [
        "standing",
        "立って"
      ],
      [
        "lying",
        "横になって"
      ],
      [
        "walking",
        "歩きながら"
      ]
    ]
  },
  {
    "key": "others_present",
    "q": "近くに他の人はいましたか",
    "v": true,
    "opts": [
      [
        "alone",
        "一人だった"
      ],
      [
        "present_quiet",
        "いたが、話はしなかった"
      ],
      [
        "talking",
        "いて、会話もした"
      ]
    ]
  },
  {
    "key": "noise_self",
    "q": "周囲はどれくらい静かでしたか",
    "scale": [
      "とても静か",
      "とてもうるさい"
    ]
  },
  {
    "key": "interruptions",
    "q": "途中で中断（着信・呼びかけ・別のアプリ）はありましたか",
    "opts": [
      [
        "none",
        "なかった"
      ],
      [
        "once",
        "1回"
      ],
      [
        "twice_plus",
        "2回以上"
      ]
    ]
  },
  {
    "sec": "あなたについて"
  },
  {
    "key": "usage_years",
    "q": "スマートフォンを使い始めて何年くらいですか",
    "grid2": true,
    "interval": true,
    "opts": [
      [
        "lt1",
        "1年未満"
      ],
      [
        "1-3",
        "1年以上3年未満"
      ],
      [
        "3-5",
        "3年以上5年未満"
      ],
      [
        "5-10",
        "5年以上10年未満"
      ],
      [
        "ge10",
        "10年以上"
      ]
    ]
  },
  {
    "key": "usage_hours",
    "q": "1日にスマートフォンを使う時間はどれくらいですか",
    "grid2": true,
    "interval": true,
    "opts": [
      [
        "lt1",
        "1時間未満"
      ],
      [
        "1-3",
        "1時間以上3時間未満"
      ],
      [
        "3-5",
        "3時間以上5時間未満"
      ],
      [
        "ge5",
        "5時間以上"
      ]
    ]
  },
  {
    "key": "native_ja",
    "q": "日本語は母国語ですか",
    "opts": [
      [
        "yes",
        "はい"
      ],
      [
        "no",
        "いいえ"
      ]
    ]
  },
  {
    "key": "moral_familiar",
    "q": "「トロッコ問題」のような、どちらを選ぶか迷う道徳的な問題を、以前に見たり考えたりしたことがありますか",
    "opts": [
      [
        "often",
        "よくある"
      ],
      [
        "some",
        "少しある"
      ],
      [
        "never",
        "ない"
      ]
    ]
  },
  {
    "sec": "回答のふりかえり"
  },
  {
    "key": "seriousness",
    "q": "この調査に、どれくらい真剣に取り組みましたか",
    "scale": [
      "真剣でなかった",
      "とても真剣に"
    ]
  },
  {
    "key": "attention_lapse",
    "q": "回答中に、注意がそれたり他のことをしていた時間はありましたか",
    "opts": [
      [
        "none",
        "なかった"
      ],
      [
        "some",
        "少しあった"
      ],
      [
        "much",
        "かなりあった"
      ]
    ]
  },
  {
    "key": "rating_meaning",
    "q": "「自信」と「迷い」の違いは分かりやすかったですか",
    "scale": [
      "分かりにくかった",
      "分かりやすかった"
    ]
  },
  {
    "key": "discomfort",
    "q": "不快に感じた場面はありましたか",
    "opts": [
      [
        "none",
        "なかった"
      ],
      [
        "some",
        "少しあった"
      ],
      [
        "much",
        "かなりあった"
      ]
    ]
  },
  {
    "key": "data_use",
    "q": "正直なところ、今回のあなたの回答は「集中して取り組んだ回答」として研究のデータに含めてよいと思いますか",
    "paymentNote": "この質問への回答だけを理由に、謝礼の有無が変わることはありません。",
    "opts": [
      [
        "yes",
        "はい、含めてよい"
      ],
      [
        "no",
        "いいえ、集中できていなかった"
      ]
    ],
    "v": true
  },
  {
    "sec": "本番での進め方"
  },
  {
    "key": "main_start_basis",
    "q": "本番では、何を目安にスタートボタンに指を置いていましたか。",
    "v": true,
    "opts": [
      [
        "read_end",
        "問題文を読み終えること"
      ],
      [
        "situation_understood",
        "書かれている状況が分かったと思うこと"
      ],
      [
        "answer_decided",
        "自分ならどうするか、考えがまとまること"
      ],
      [
        "no_basis",
        "特に目安はなかった"
      ],
      [
        "varies",
        "問題によって目安が違った"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ],
    "note": "当時の目安として、あてはまるものをすべて選んでください。",
    "multiple": true,
    "exclusive": [
      "no_basis",
      "dont_remember"
    ]
  },
  {
    "key": "main_three_second_meaning",
    "q": "本番で、3秒以内に指をスタートボタンの外へ動かす指示を、どのように理解していましたか。",
    "v": true,
    "opts": [
      [
        "exit_without_decision",
        "答えを決める前に、指を外へ動かす"
      ],
      [
        "decide_before_exit",
        "指を外へ出す前に、答えを決める"
      ],
      [
        "finish_in_three",
        "3秒以内に回答を終える"
      ],
      [
        "hurry_after_exit",
        "出た後も、できるだけ速く動かす"
      ],
      [
        "no_attention",
        "特に意識していなかった"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ],
    "note": "当時の受け止めとして、あてはまるものをすべて選んでください。",
    "multiple": true,
    "exclusive": [
      "no_attention",
      "dont_remember"
    ]
  },
  {
    "key": "main_release_area",
    "q": "本番では、答えを選ぶとき、選択肢のボックスのどこで指を離す必要があると思っていましたか。",
    "v": true,
    "opts": [
      [
        "box_anywhere",
        "ボックスの内側なら、どこでもよい"
      ],
      [
        "text",
        "選択肢の文字の上"
      ],
      [
        "center",
        "文字の位置に関係なく、ボックスの中央付近"
      ],
      [
        "no_basis",
        "離す場所は特に意識していなかった"
      ],
      [
        "varies",
        "問題によって違った"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ]
  },
  {
    "key": "main_decision_at_move",
    "q": "本番で、選択肢が出てから指を動かし始めるとき、答えはどのくらい決まっていることが多かったですか。",
    "v": true,
    "opts": [
      [
        "decided",
        "どちらを選ぶか決まっていた"
      ],
      [
        "leaning",
        "一方に傾いていたが、決めてはいなかった"
      ],
      [
        "undecided",
        "どちらを選ぶか、まだ決まっていなかった"
      ],
      [
        "varies",
        "問題によって違い、一つに決められない"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ]
  },
  {
    "sec": "最後の追加10問について"
  },
  {
    "key": "additional_reading",
    "q": "最後の追加10問では、問題文や選択肢の内容を読んでから答えを選んでいましたか。",
    "v": true,
    "opts": [
      [
        "unread",
        "ほとんど読まずに、指を運んでいた"
      ],
      [
        "sometimes",
        "ときどき読んで、答えを選んでいた"
      ],
      [
        "mostly",
        "多くの問題で読んで、答えを選んでいた"
      ],
      [
        "dont_remember",
        "覚えていない"
      ]
    ]
  }
].filter(it => it.key !== "additional_reading" || INSTR_ON);
  const POST_KEYS = POST_ITEMS.filter((it) => it.key).map((it) => it.key);
  device.collectionPlan = { postKeys: POST_ON ? POST_KEYS.slice() : [], instructedEnabled: INSTR_ON, attentionEnabled: ATTN_ON };
  // ページ割り (2026-09-26 後刻): スクロールせずに収まる 2〜3 問ずつ。ここに挙げた項目で新しいページを始める (先頭の fatigue_pre は自動)。
  // 目安 = Safariのツールバーありでも「タイトル + 質問 + 戻る/次へ」が収まる量。選択肢が長い手順2問は1問ずつ。
  const POST_PAGE_STARTS = ["sleep_hours", "time_pressure", "location", "others_present", "usage_years", "moral_familiar", "rating_meaning", "main_start_basis", "main_three_second_meaning", "main_release_area", "main_decision_at_move", "additional_reading"]; // 操作認識の各項目は1問1ページ
  const SCOPED_POST_KEYS = ["time_pressure","irritation","seriousness","attention_lapse","data_use","native_ja","main_start_basis","main_three_second_meaning","main_release_area","main_decision_at_move","additional_reading"];
  const POST_VERSIONS = {
    time_pressure: ["task-v2", "whole_task"], irritation: ["task-v2", "whole_task"], main_start_basis: ["main-v3", "main"],
    seriousness: ["whole-task-v2", "whole_task"], attention_lapse: ["whole-task-v2", "whole_task"], data_use: ["whole-task-v2", "whole_task"],
    main_three_second_meaning: ["perception-v4", "main"], main_release_area: ["procedure-v1", "main"],
    main_decision_at_move: ["procedure-v1", "main"], additional_reading: ["additional-v1", "instructed"],
    native_ja: ["mother-country-v2", "attributes"]
  };
  const postDefinitions = {};
  const postAnswered = key => Array.isArray(post[key]) ? post[key].length > 0 : post[key] != null;
  function postItemForDisplay(source, restored) {
    const key = source.key, meta = device.postQuestionMeta[key];
    if (meta?.definition) return { ...meta.definition, key };
    if (LEGACY_POST_QUESTIONS[key] && (meta?.version === "task-v1" ||
        (!meta && restored?.answers?.[key] != null && !/ui(?:8|9|10|11)$/.test(device.appVersion)))) {
      device.postQuestionMeta[key] = { version: "task-v1", scope: "whole_task" };
      return { ...source, q: LEGACY_POST_QUESTIONS[key], note: null };
    }
    const previouslyShown = device.postPresentedKeys.includes(key) || restored?.answers?.[key] != null;
    if (key === "native_ja") {
      const initialUi = Number(device.appVersion?.match(/ui(\d+)$/)?.[1]);
      if (meta?.version === "mother-tongue-v1" || ((!meta || meta.version === "base-v1") && previouslyShown && (!Number.isFinite(initialUi) || initialUi < 17))) {
        device.postQuestionMeta[key] = { version: "mother-tongue-v1", scope: "attributes" };
        return { ...source, q: "日本語は母語ですか" };
      }
    }
    if (UI13_POST_ITEMS[key] && (meta?.version === UI13_POST_VERSIONS[key][0] ||
        (previouslyShown && (/ui13$/.test(device.appVersion) || key === "main_start_basis" && /ui12$/.test(device.appVersion))))) {
      if (!meta) { const [version, scope] = UI13_POST_VERSIONS[key]; device.postQuestionMeta[key] = { version, scope }; }
      return { ...UI13_POST_ITEMS[key] };
    }
    if (UI12_POST_ITEMS[key] && (meta?.version === UI12_POST_VERSIONS[key][0] ||
        (previouslyShown && /ui12$/.test(device.appVersion)))) {
      if (!meta) { const [version, scope] = UI12_POST_VERSIONS[key]; device.postQuestionMeta[key] = { version, scope }; }
      return { ...UI12_POST_ITEMS[key] };
    }
    if (LEGACY_POST_ITEMS[key] && (meta?.version === "main-v1" ||
        (previouslyShown && /ui(?:6|7|8|9|10|11)$/.test(device.appVersion)))) {
      if (!meta) device.postQuestionMeta[key] = ["seriousness", "attention_lapse", "data_use"].includes(key)
        ? { version: "whole-task-v1", scope: "whole_task_before_additional" }
        : { version: "main-v1", scope: "main_before_additional" };
      return { ...LEGACY_POST_ITEMS[key] };
    }
    return source;
  }
  const LEGACY_POST_QUESTIONS = { time_pressure: "課題中、「急がなければ」と感じましたか", irritation: "課題中、いらだちや焦りをどのくらい感じましたか" };
  const post = {};
  let postShownAt = null, postBuilt = false;
  function postBuild(restored) {   // POST_ITEMSからDOMを組む。旧範囲の回答があれば、その項目だけ旧文言を維持する
    if (postBuilt) return; postBuilt = true;
    const host = $("postBlock");
    let sec = "", page = null, shownSec = null;
    for (const source of POST_ITEMS) {
      const it = postItemForDisplay(source, restored);
      if (it.key) postDefinitions[it.key] = JSON.parse(JSON.stringify(it));
      if (it.sec) { sec = it.sec; continue; }   // 節の見出しは各ページの小見出し (eyebrow) に
      if (!page || POST_PAGE_STARTS.includes(it.key)) {   // スクロールしない分量で 2〜3 問ずつ 1 ページに (2026-09-26 後刻。ページ id = 先頭の項目)
        page = document.createElement("div"); page.className = "postpage"; page.id = "pp-" + it.key; page.dataset.page = it.key; page.dataset.keys = "";
        host.appendChild(page); shownSec = null;
      }
      page.dataset.keys += (page.dataset.keys ? "," : "") + it.key;
      if (sec !== shownSec) { const eb = document.createElement("p"); eb.className = "opt-note eyebrow"; eb.textContent = sec; page.appendChild(eb); shownSec = sec; }
      const f = document.createElement("div"); f.className = "field"; page.appendChild(f);
      const lab = document.createElement("label"); lab.id = "post-label-" + it.key; lab.textContent = it.q; f.appendChild(lab);
      const seg = document.createElement("div"); seg.id = "post-" + it.key;
      seg.setAttribute("aria-labelledby", lab.id);
      const noteText = [it.note && (it.multiple || INSTR_ON) ? it.note : "", it.paymentNote || ""].filter(Boolean).join("。");
      if (noteText) {
        const note = document.createElement("p"); note.id = "post-note-" + it.key; note.className = "opt-note post-scope"; note.textContent = noteText; f.appendChild(note);
        seg.setAttribute("aria-describedby", note.id);
      }
      seg.className = it.multiple ? "checks post-multiple" : "seg" + (it.scale ? " scale" : (it.v ? " seg-v" : (it.grid2 ? " grid2" : "")));
      const opts = it.scale ? [1, 2, 3, 4, 5].map((v) => [String(v), String(v)]) : it.opts;
      for (const [val, label] of opts) {
        const b = document.createElement("button"); b.type = "button"; b.dataset.val = val;
        if (it.multiple) { b.className = "chk"; if (it.exclusive?.includes(val)) b.dataset.none = "1"; }
        const bounds = it.interval && label.match(/^(.+以上)(.+未満)$/);
        if (bounds) {   // 小画面では上下限の間で折り返し、「未 / 満」のような分断を避ける
          bounds.slice(1).forEach((text, i) => {
            if (i) b.appendChild(document.createElement("wbr"));
            const span = document.createElement("span"); span.className = "interval-bound"; span.textContent = text; b.appendChild(span);
          });
        } else b.textContent = label;
        seg.appendChild(b);
      }
      f.appendChild(seg);
      if (it.scale) {
        const an = document.createElement("div"); an.className = "seg-anchors"; an.id = "post-anchors-" + it.key;
        seg.setAttribute("aria-describedby", [seg.getAttribute("aria-describedby"), an.id].filter(Boolean).join(" "));
        const lo = document.createElement("span"); lo.textContent = "1 = " + it.scale[0];
        const hi = document.createElement("span"); hi.textContent = "5 = " + it.scale[1];
        an.append(lo, hi); f.appendChild(an);
      }
      if (it.multiple) wireChecks(seg.id, values => { post[it.key] = values; postReady(); });
      else wireSeg(seg.id, (v) => { post[it.key] = it.scale ? parseInt(v, 10) : v; postReady(); });
    }
  }
  function postReset() {
    for (const k of POST_KEYS) post[k] = null;
    for (const b of $("postBlock").querySelectorAll("button.sel")) b.classList.remove("sel");
    for (const c of $("postBlock").querySelectorAll(".seg, .checks")) syncChoiceState(c);
  }
  function postMissing() { return POST_KEYS.filter((k) => !postAnswered(k)).length; }
  function showSurveyFree(show) {   // 「その他」にチェック時だけ、その下に必須の自由記述欄を出す
    const wasShown = $("surveyFreeField").style.display !== "none";
    $("surveyFreeField").style.display = show ? "" : "none";
    // 選択を外しても下書きは残す。送信時には「その他」が選ばれている場合だけ含める。
    if (show && !wasShown && $("postq").classList.contains("active"))
      $("surveyFreeField").scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  function surveyReset() {
    survey.problems = []; survey.problemPages = problemParts.map(() => null); survey.ease = null; survey.free = ""; survey.comment = ""; $("surveyComment").value = "";
    $("surveyFree").value = "";
    showSurveyFree(false);
    for (const b of $("surveyProblems").children) b.classList.remove("sel");
    for (const b of $("surveyEaseSeg").children) b.classList.remove("sel");
    syncChoiceState($("surveyProblems")); syncChoiceState($("surveyEaseSeg"));
  }
  // ---- ページ = 持ち方 → 拡充分 → 使いにくかった点 → 操作のしやすさ → 自由記述。スクロールなし・「戻る / 次へ」 ----
  let postPages = [], postPageIdx = 0;
  const otherOk = () => !survey.problems.includes("other") || survey.free.trim().length > 0;   // その他は自由記述で具体化
  function postPageList() {
    const out = [{ id: "grip", label: "持ち方", el: document.querySelector('#postq .postpage[data-page="grip"]'), ok: () => !!device.grip }];
    if (POST_ON) for (const el of $("postBlock").querySelectorAll(".postpage")) {   // 2〜3 問ずつのページ。全部答えたら次へ
      const keys = el.dataset.keys.split(",");
      out.push({ id: el.dataset.page, label: `質問 ${keys.length} 件`, el, ok: () => keys.every(postAnswered) });
    }
    if (HAS_RATING_BLOCK) {   // 各ページで問題または「このページでは該当なし」の明示回答を必須にする。
      const pp = $("surveyProblemsPage");
      for (let i = 0; i < problemParts.length; i++) out.push({
        id: i === 0 ? "problems" : "problems" + (i + 1), label: "使いにくかった点（" + (i + 1) + "）", el: pp, part: i + 1,
        ok: () => Array.isArray(survey.problemPages[i]) && survey.problemPages[i].length > 0 && (!problemParts[i].includes("other") || otherOk())
      });
      out.push({ id: "ease", label: "操作のしやすさ", el: document.querySelector('#postq .postpage[data-page="ease"]'), ok: () => !!survey.ease });
      out.push({ id: "comment", label: "自由記述", el: document.querySelector('#postq .postpage[data-page="comment"]'), ok: () => true });   // 任意 (2026-09-29)
    }
    return out;
  }
  function postGoto(i) {
    postPageIdx = Math.max(0, Math.min(i, postPages.length - 1));
    postPages.forEach((p, k) => { if (k === postPageIdx) { p.el.classList.add("on"); if (p.part) p.el.dataset.part = String(p.part); } else if (p.el !== postPages[postPageIdx].el) p.el.classList.remove("on"); });
    for (const key of (postPages[postPageIdx].el.dataset.keys || "").split(",").filter(Boolean)) {
      if (!device.postPresentedKeys.includes(key)) device.postPresentedKeys.push(key);
      if (!device.postQuestionMeta[key]) {
        const [version, scope] = POST_VERSIONS[key] || ["base-v1", "whole_task"];
        device.postQuestionMeta[key] = { version, scope };
      }
      if (!device.postQuestionMeta[key].definition) device.postQuestionMeta[key].definition = JSON.parse(JSON.stringify(postDefinitions[key]));
    }
    $("postStep").textContent = `${postPageIdx + 1} / ${postPages.length}`;
    $("postLead").style.display = "none";   // 導入文は持ち方のページに統合 (2026-09-27)
    $("postPrev").style.display = postPageIdx === 0 ? "none" : "";   // 1 ページ目は「次へ」を中央に (2026-09-29)
    $("postNav").classList.toggle("first", postPageIdx === 0);
    const last = postPageIdx === postPages.length - 1;
    $("postNext").style.display = last ? "none" : "";
    $("postSubmit").style.display = last ? "" : "none";
    postReady();
    $("postq").querySelector(".pad").scrollTop = 0;
    focusScreenHeading("postq");
  }
  function postReady() {
    const cur = postPages[postPageIdx];
    // 途中終了 (中断ボタン/時間上限) は事後アンケートを必須にしない: 中断の自由を妨げないため。
    // 答えてもらえた分は device.survey にそのまま入る (未回答は空 = 欠測として扱う)
    const ok = device.partial || postPages.every((p) => p.ok());
    $("postNext").disabled = !(device.partial || (cur && cur.ok()));   // このページを答えるまで次へ進めない
    $("postSubmit").disabled = !ok;
    // 最後のページで未回答が残っているとき (途中終了以外では戻るで飛ばした場合のみ起こりうる): 列挙してタップで移動
    const miss = postMissingList();
    $("postMissing").textContent = (!ok && postPageIdx === postPages.length - 1 && miss.length) ? "未回答: " + miss.map((m) => m.label).join("・") + "（タップで移動）" : "";
    if (resumeStage === "postq") scheduleCheckpoint();
  }
  function postMissingList() {   // 必須で未回答のページ (並び順)
    return postPages.map((p, k) => ({ ...p, idx: k })).filter((p) => !p.ok()).map((p) => ({ label: p.part && problemParts[p.part - 1].includes("other") && !otherOk() ? "「その他」の内容" : p.label, idx: p.idx }));
  }
  $("postMissing").addEventListener("click", () => {   // 最初の未回答のページへ
    const list = postMissingList();
    if (list.length) postGoto(list[0].idx);
  }, { passive: true });
  $("postPrev").addEventListener("click", () => { if (postPageIdx > 0) postGoto(postPageIdx - 1); }, { passive: true });
  $("postNext").addEventListener("click", () => { if (!$("postNext").disabled && postPageIdx < postPages.length - 1) postGoto(postPageIdx + 1); }, { passive: true });
  function showPostQuestions(restored) {
    const hasSurvey = HAS_RATING_BLOCK;
    $("surveyBlock").style.display = hasSurvey ? "" : "none";
    if (hasSurvey) bindSurveyProblemDefinition(restored);
    if (hasSurvey) surveyReset();
    $("postBack").style.display = (device.partial && device.endedBy === "operator" && endedFrom) ? "" : "none";   // 終了の取り消し
    $("postBlock").style.display = POST_ON ? "" : "none";
    if (POST_ON) { postBuild(restored); postReset(); }
    if (restored) {
      Object.assign(post, restored.answers || {});
      Object.assign(survey, restored.survey || {});
      restoreProblemPages(restored.survey || {});
      const setChoices = (container, values) => {
        for (const b of container.querySelectorAll("button[data-val]")) b.classList.toggle("sel", values.includes(b.dataset.val));
        syncChoiceState(container);
      };
      for (const k of POST_KEYS) if ($("post-" + k)) setChoices($("post-" + k), post[k] == null ? [] : (Array.isArray(post[k]) ? post[k] : [String(post[k])]));
      setChoices($("gripSeg"), device.grip ? [device.grip] : []);
      setChoices($("surveyProblems"), survey.problemPages.flatMap((page, i) => (page || []).map(value => value === "none" ? `none${i + 1}` : value)));
      setChoices($("surveyEaseSeg"), survey.ease ? [String(survey.ease)] : []);
      showSurveyFree(survey.problems.includes("other"));
      $("surveyFree").value = survey.free || ""; $("surveyComment").value = survey.comment || "";
    }
    postPages = postPageList();
    postShownAt = performance.now() - (restored && restored.elapsedMs || 0);
    show("postq");
    resumeStage = "postq";
    let returnPage = restored ? restored.page : 0;
    if (restored && restored.pageId) {
      const byId = postPages.findIndex(p => p.id === restored.pageId);
      if (byId >= 0) returnPage = byId;
    } else if (restored) {
      // pageIdのない旧保存は当時のページ列で数値を解釈する。追加質問/問題ページで戻り先をずらさない。
      const priorPages = postPages.filter(p => {
        if (["main_start_basis", "main_three_second_meaning", "main_release_area", "main_decision_at_move", "additional_reading"].includes(p.id)) return Object.prototype.hasOwnProperty.call(restored.answers || {}, p.id);
        if (p.id === "problems3") return Array.isArray(restored.survey?.problemPages) && restored.survey.problemPages.length >= problemParts.length;
        return true;
      });
      const prior = priorPages[returnPage];
      if (prior) returnPage = postPages.findIndex(p => p.id === prior.id);
    }
    postGoto(returnPage);
    saveBackup();
    beginTaskDelivery();
  }

  function beginTaskDelivery() {
    // The operator's reversible early-stop/kiosk paths keep their explicit final submission.
    if (!staged || !CONFIG.uploadUrl || GO || KIOSK || !device.consent || device.partial || !records.length) return;
    const old = sessionStore.read(device.sessionId)?.delivery?.tasks;
    if (old) device.tasksEndedAt = old.device.tasksEndedAt;
    else device.tasksEndedAt = new Date().toISOString();
    device.partial = false;
    saveBackup();
    const snapshot = old || { kind: "tasks", protocol: 3, ...PilotDurable.clone(buildPayload()) };
    staged.start(device.sessionId, snapshot).catch(storageProblem);
  }

  function finishSession() {
    if (sessionFinished) return;
    device.exportedAt = new Date().toISOString();
    if (device.consent) {
      device.endedAt = device.exportedAt;
      if (consentTiming) device.consentTiming = consentTiming.finish();
    }
    // セッションの終わり方 (§6-6 項15)。完走なら partial=false・endedBy="complete"
    device.endedBy = device.endedBy || "complete";
    device.mainCompleted = records.filter((r) => r.phase === "main").length;
    device.mainPlanned = totalMain;
    device.mainMs = getMainElapsedMs();
    device.mic = {   // 環境音モニタの実測記録 (§6-6 項10。閾値等の設定値も provenance として残す)
      mode: MIC.mode, threshold: MIC.threshold, checkMs: MIC.checkMs, quietMs: MIC.quietMs,
      gateMinOverMs: MIC.gateMinOverMs, ambientDb: MIC.ambientDb,
      ambientRetries: MIC.ambientRetries, drops: MIC.drops,
      muteCount: MIC.muteCount, mutedMs: Math.round(MIC.mutedMs),
    };
    // 完了コード (§6-6 項12): 1人1コードを発行しデータにも記録 → 募集サイトの申請コードと機械照合。
    // 全員共通コードの横流し (未実施申請) に耐性。紛らわしい文字 (0/O/1/I/L) は除外
    device.completionCode = device.completionCode || makeCompletionCode();
    sessionFinished = true;
    finishedPayload = PilotDurable.clone(buildPayload());
    saveBackup();
    showCompletion();
  }
  function showCompletion(received) {
    if (new URLSearchParams(location.search).get("ccode") !== "0" && !KIOSK) {   // 対面では申請コード不要
      $("ccode").textContent = device.completionCode;
      $("ccodeBox").style.display = "";
      if (CONFIG.contactEmail) {   // タップでメールアプリを開き、本文にコードを入れて送れる (2026-09-29)
        const m = $("ccodeMail"); m.style.display = "";
        m.href = "mailto:" + CONFIG.contactEmail + "?subject=" + encodeURIComponent("調査の完了コード") + "&body=" + encodeURIComponent("完了コード: " + device.completionCode + "\n名前: " + (device.participantId || ""));
        $("ccodeNote").textContent = "「メールで送信する」を押すか、コードをコピーして " + CONFIG.contactEmail + " へ送ってください（謝礼の手続きに使います）。";
      }
    }
    if (ATTN_ON) {   // 強IMC (欺瞞) のデブリーフィング (§6-5・IRB 申請に記載)
      $("debrief").innerHTML =
        '<p class="debrief"><b>確認の質問について</b><br>この調査には、集中して回答できているかを確かめる質問（「左を選んでください」など）が含まれていました。回答の質を確かめる一般的な方法で、あなた個人を評価するものではありません。</p>';   // 倫理申請に記載の事後説明 (IMC は欺瞞を含むため必須)。明るい背景で読める配色に (2026-09-27)
      $("debrief").style.display = "";
    }
    const main = records.filter((r) => r.phase === "main");
    const totalAborts = records.reduce((s, r) => s + (r.aborts || 0), 0);
    const hzs = main.map((r) => r.dispHz).filter((h) => h != null);
    const avgHz = hzs.length ? (hzs.reduce((a, b) => a + b, 0) / hzs.length).toFixed(1) : "–";
    // 完了画面には集中して参加できたかの記録だけを出す (2026-09-27。旧: 試行数・実効レート・リトライ数などの技術情報は撤去。debug=1 のときだけ残す)
    const visCount = main.reduce((a, r) => a + ((r.vis || {}).count || 0), 0), visMs = main.reduce((a, r) => a + ((r.vis || {}).totalMs || 0), 0);
    $("summary").innerHTML =
      `画面の切り替え・離脱: ${visCount} 回（合計 ${Math.round(visMs / 1000)} 秒）／ 中断からの再開: ${(device.resumes || []).length} 回` +
      (debugMode ? `<br>参加者: ${escapeHtml(device.participantId || "(未入力)")} (${escapeHtml(device.block)}) / 本番試行: ${main.length} / ${BLOCK.summaryExtra(main)} / 実効 ${avgHz} Hz / リトライ ${totalAborts} / 端末 ${device.screenW}×${device.screenH}@${device.dpr}x` : "");
    // 共有 (Web Share API Level 2) 対応端末なら共有ボタンを出す
    try {
      const probe = new File(["x"], "x.json", { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [probe] }))
        $("shareJson").style.display = "";
    } catch (_) {}
    // 軌道CSV は JSON に含まれる軌道点列の重複展開 (デバッグ用) → debug 時のみ表示
    if (!debugMode) $("dlCsv").style.display = "none";
    // 自動送信を使う場合、保存/共有ボタンは送信失敗が確定したときだけ出す (参加者を迷わせない)
    if (CONFIG.uploadUrl && !debugMode) $("exportRow").style.display = "none";
    if (!CONFIG.uploadUrl)
      $("doneMsg").textContent = "ご協力ありがとうございました。下のボタンでデータを保存・共有してください。";
    else if (device.partial)
      $("doneMsg").textContent = "ここまでのご回答をお送りします。ご協力ありがとうございました。";
    show("done");
    if (received) {
      sendUiEnd(true); $("uploadStatus").textContent = "✅ データは送信されました。";
      if (!finishedPayload) { $("exportRow").style.display = "none"; $("summary").hidden = true; }
    }
    else if (GO) showNextParticipant(); // 確認モードのダミー回答は、対面用でも保存・送信しない。
    else if (KIOSK || sessionStore.read(device.sessionId)?.state === "held") kioskHold();
    else if (CONFIG.uploadUrl) uploadJson();
    else showNextParticipant();   // 送信なし (デモ・検証) でも連続実施は回せるように
  }
  // 対面 (kiosk) の完了画面: 端末内に保留し、明示的な送信操作まで再読込・別URLでも保留を維持する。
  // 「保存せずに最初から」でこの人のデータを消せる。
  // (テスト・本人の取り下げ・操作ミス)。送信前に決められることが要件
  let heldId = null;
  function kioskHold() {
    heldId = outboxPush(finishedPayload || buildPayload(), true);
    if (heldId) {
      $("uploadStatus").textContent = "📥 端末に保留しています。「送信して次の人へ」を押すと送信します。";
      $("discardRow").style.display = "";
    } else {
      $("uploadStatus").textContent = "⚠️ 端末に保存できませんでした。下のボタンでデータを保存してください。";
      $("exportRow").style.display = "";
    }
    $("nextParticipant").textContent = "送信して次の人へ";
    $("nextParticipant").style.display = heldId ? "" : "none";
  }
  async function discardHeld() {   // 保留中のこの人のデータを消して最初から
    if (!clearBackup(heldId || device.sessionId)) return;
    try { await sessionStore.flush(); } catch (err) { storageProblem(err); return; }
    discarding = true;
    heldId = null; location.reload();
  }

  function makeCompletionCode() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const rnd = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
    else for (let i = 0; i < 8; i++) rnd[i] = Math.floor(Math.random() * 256);
    let out = "";
    for (let i = 0; i < 8; i++) out += chars[rnd[i] % chars.length];
    return out.slice(0, 4) + "-" + out.slice(4);
  }

  // ===== エクスポート =====
  function buildPayload() {
    if (consentTiming && !sessionFinished) device.consentTiming = consentTiming.snapshot();
    // 内部用フィールド (_sRect 等) を除去
    const trials = records.map(publicTrial);
    return { device, trials, invalidAttempts: invalidAttempts.slice() };
  }

  // ===== 中断対策チェックポイント (Worker内のIndexedDBへ。取得中のgzipは行わない) =====
  // セッションごとに1コピーを保持。保存失敗は進行を止め、手動保存と再試行を提示する。
  let sessionFinished = false;   // finishSession 到達後は resume を付けない (未回収分の手動保存は従来どおり)
  function saveBackup() {
    if (GO || !storeReady) return false;
    if (!records.length && !invalidAttempts.length && phase === "practice" && !device.partial && !sessionFinished && !device.consent && !device.introCompletedAt) return true;
    try {
      const p = finishedPayload || buildPayload();
      if (!sessionFinished) { p.interruptedAt = new Date().toISOString(); p.resume = resumeState(); }
      sessionStore.checkpoint(p, location.search);
      return true;
    } catch (err) { storageProblem(err); return false; }
  }
  function storageProblem(err) {
    let el = $("storageProblem");
    if (!el) {
      el = document.createElement("div"); el.id = "storageProblem"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "storageProblemTitle");
      el.style.cssText = "position:fixed;inset:0;z-index:20000;background:#fff;color:#222;padding:32px;overflow:auto";
      el.innerHTML = '<h1 id="storageProblemTitle" tabindex="-1">回答の保存を確認してください</h1><p id="storageProblemText"></p><button class="btn primary" id="storageRetry">保存をもう一度試す</button><button class="btn ghost" id="storageDownload">回答データを保存する</button><div id="storageLegacy"></div>';
      document.body.appendChild(el);
      $("storageDownload").onclick = () => {
        const p = finishedPayload || { ...buildPayload(), interruptedAt: new Date().toISOString(), resume: resumeState() };
        download(`pilot_${stamp()}${finishedPayload ? "" : "_interrupted"}.json`, JSON.stringify(p), "application/json");
      };
      $("storageRetry").onclick = async () => {
        try {
          if (!storeReady || (recoveryId && recoveryId !== device.sessionId)) { el.hidden = true; await initRecovery(); return; }
          if (!await sessionStore.lock(device.sessionId, tabOwner)) throw new Error("SESSION_BUSY");
          storeReady = true;
          if (durable) await durable.retry();
          if (saveBackup()) { await sessionStore.flush(); el.hidden = true; if (sessionFinished) showCompletion(); }
        } catch (e) { storageProblem(e); }
      };
    }
    $("storageProblemText").textContent = String(err && (err.code || err.message)).includes("LOCK") || String(err && err.message).includes("BUSY")
      ? "この回答を別のタブで開いている場合は、そちらを閉じてからもう一度試してください。保存機能が利用できないブラウザでは続けられません。"
      : "この端末に回答を保存できませんでした。この画面を閉じずに、回答データを保存してください。空き容量を確保した後、保存をもう一度試せます。";
    $("storageDownload").hidden = !records.length && !invalidAttempts.length && !finishedPayload && !device.consent;
    $("storageLegacy").replaceChildren();
    for (const [key, label] of [[BACKUP_KEY, "以前の途中保存を回収する"], [OUTBOX_KEY, "以前の未送信データを回収する"]]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const button = document.createElement("button"); button.className = "btn ghost"; button.textContent = label;
        button.onclick = () => download(`${key}_recovery.json`, raw, "application/json");
        $("storageLegacy").appendChild(button);
      } catch (_) {} // 保存領域そのものが使えない場合も、現在のメモリ内データは保存できる。
    }
    el.hidden = false; el.querySelector("h1").focus({ preventScroll: true });
  }

  // ===== 中断からの再開 (2026-09-06、experiment-design §6-6 項17) =====
  // iOS Safari のタブ破棄や再読込で、入力や回答をやり直させないための対策。
  // 入力完了、説明のページ移動、問題呈示、評定・アンケート操作のチェックポイントに進行状態を添え、
  // 同じ URL (クエリ一致) を 3 時間以内に開き直したら「続きから再開」を提示する。再開後は環境音チェック (マイクの
  // 再取得) を通して保存画面へ。送信の段階・受領確認は送信処理の既存方針を維持する。
  // 本番開始後はdevice.resumesと直後のpost_resume、本番前はdevice.preMainResumesへ分けて記録する。
  // 対面 kiosk (共用端末) では再開を提示せず、前の人の途中データを partial として未送信キューへ退避する (salvageBackup)。
  let resumePending = false;   // 再開直後の本試行に post_resume を立てる
  let resumeOffered = false;   // 起動時に再開画面を出したか (検証用)
  function resumeState() {
    if (replayResumeState && (dragTutState.active || ratingReview)) return JSON.parse(JSON.stringify(replayResumeState));
    const now = performance.now();
    return {
      v: 2, search: location.search, seq: SEQ.slice(), seqIndex, block: CONFIG.block,
      stage: resumeStage, phase, queue, totalMain, trialIndex, instrIndex, instructedDone,
      currentCell: ["task", "rating", "break", "notice", "practiceCheck"].includes(resumeStage) ? cell : null,
      trialRecordIndex: resumeStage === "rating" ? records.indexOf(trial) : null,
      rating: resumeStage === "rating" ? { page: ratPage, elapsedMs: now - ratingOnset, pageElapsedMs: now - ratPageAt,
        tutorial: tutActive() && !ratingReview ? { version: 2, pages: TUT_PAGES.length, index: tutIdx, introDone: tutIntroDone, seen: [...ratingSeenPages] } : null } : null,
      preMain: mainStartedAt == null ? {
        dragDone: dragTutState.done, dragSchema: dragTutState.schema || null, ratingDone: ratingTutorialDone, streak, exampleIntroRead,
        reading: resumeStage === "reading" ? { index: readIdx, elapsedMs: readIdx < 0 ? 0 : Math.max(0, now - readShownAt) } : null,
        drag: resumeStage === "dragTutorial" ? DragTut.snapshot() : null,
      } : null,
      post: resumeStage === "postq" ? { answers: { ...post }, survey: { ...survey, problems: survey.problems.slice() }, page: postPageIdx, pageId: postPages[postPageIdx] ? postPages[postPageIdx].id : null, elapsedMs: now - postShownAt } : null,
      activeAttempt: recording && trial ? publicTrial(trial) : null,
      pendingInstructedStart, pendingMainStart, pendingNotice, stopNoticeShown, noticeKind,
      practiceRuleFlags: practiceRuleFlags.slice(),
      practiceCheck: practiceCheckState ? { ...practiceCheckState, checked: practiceCheckState.checked.slice(), elapsedMs: performance.now() - practiceCheckShownAt } : null,
      noticeElapsedMs: noticeShownAt == null ? 0 : now - noticeShownAt,
      breakElapsedMs: breakShownAt == null ? 0 : now - breakShownAt, breakAtTrial,
      stemElapsedMs: resumeStage === "task" ? Math.max(0, now - stemShownT) : 0,
      aborts, monitors: { noise: { ...noiseAcc }, vis: { ...visAcc } }, tutChanged,
      mainStarted: mainStartedAt != null, mainElapsedMs: getMainElapsedMs() || 0, mainElapsedAtEnd,
    };
  }
  function normalizedResume(b) { // v1 は当時保存された範囲で復元。未送信の評定を先に戻す
    const r = b.resume;
    if (r.v === 2) {
      // 旧版は練習完了画面でも直前のratingを保存した。提出済み評定を再度提出させない。
      if (!r.mainStarted && r.pendingMainStart) return { ...r, stage: "practiceComplete" };
      return r;
    }
    const main = b.trials.filter((t) => t.phase === "main" && t.block === r.block);
    const last = main[main.length - 1];
    const pendingRating = last && ["moral", "value"].includes(last.block) && last.ratings && last.ratingSubmitMs == null;
    return { ...r, stage: pendingRating ? "rating" : "next", phase: "main",
      trialIndex: main.length - (pendingRating ? 1 : 0), instrIndex: 0, instructedDone: false,
      trialRecordIndex: pendingRating ? b.trials.indexOf(last) : null,
      rating: pendingRating ? { page: last.ratings.hesitation ? 1 : 0, elapsedMs: 0, pageElapsedMs: 0 } : null,
      mainStarted: true, mainElapsedAtEnd: null };
  }
  function canResume(b) {   // 入力完了以降。同じ構成 (URL クエリ)・中断から3時間以内。
    if (!b || !b.resume || ![1, 2].includes(b.resume.v) || b.resume.search !== location.search) return false;
    if (!b.device || typeof b.device !== "object" || b.device.partial) return false;
    if (!Array.isArray(b.trials) || !Array.isArray(b.resume.queue) || !Array.isArray(b.resume.seq)) return false;
    const r = normalizedResume(b);
    if (!r.seq.length || !BLOCKS[r.block] || r.seq.some((id) => !BLOCKS[id])) return false;
    if (!Number.isInteger(r.seqIndex) || r.seqIndex < 0 || r.seqIndex >= r.seq.length) return false;
    const beforeMain = !r.mainStarted && b.device && (b.device.introCompletedAt || b.device.consent ||
      (b.device.participantId && b.trials.some(t => t.phase === "practice" || t.phase === "tutorial")));
    if (!r.mainStarted && !beforeMain) return false;
    const stages = ["task", "rating", "break", "notice", "instructedIntro", "blockintro", "postq", "next"];
    if (beforeMain) stages.push("entry", "consent", "reading", "dragTutorial", "exampleIntro", "practiceComplete", "practiceNext", "practiceCheck");
    if (!stages.includes(r.stage)) return false;
    if (["task", "break", "notice"].includes(r.stage) && !r.currentCell) return false;
    if (r.stage === "rating" && (!b.trials[r.trialRecordIndex] || !r.rating)) return false;
    if (r.stage === "reading" && (!r.preMain || !r.preMain.reading || !Number.isInteger(r.preMain.reading.index) ||
        r.preMain.reading.index < -1 || r.preMain.reading.index >= READ_SENTENCES.length ||
        !Number.isFinite(r.preMain.reading.elapsedMs) || r.preMain.reading.elapsedMs < 0 ||
        !b.device.readingBaseline || !Array.isArray(b.device.readingBaseline.trials) ||
        b.device.readingBaseline.trials.length !== Math.max(0, r.preMain.reading.index))) return false;
    if (r.stage === "dragTutorial" && (!r.preMain || !r.preMain.drag)) return false;
    if (r.stage === "exampleIntro" && (!r.preMain || !r.preMain.dragDone)) return false;
    if (r.stage === "practiceCheck" && (!r.practiceCheck || !Array.isArray(r.practiceCheck.keys) || !r.practiceCheck.keys.length ||
        r.practiceCheck.keys.some(k => !PRACTICE_RULES[k]) || !Array.isArray(r.practiceCheck.checked) || !b.trials[r.practiceCheck.recordIndex])) return false;
    const gap = Date.now() - Date.parse(b.interruptedAt);
    return gap >= 0 && gap <= RESUME_WINDOW_MS;
  }
  function resumeAtSurvey(b) { return normalizedResume(b).stage === "postq"; }
  function showResume(b) {
    const r = normalizedResume(b);
    const where = !r.mainStarted ? ({ entry: "開始前の準備", consent: "説明・同意の確認", reading: "文章を読む練習", dragTutorial: "操作方法", practiceComplete: "練習を終えたところ", rating: "練習の振り返り" }[r.stage] || "練習")
      : r.stage === "postq" ? "最後のアンケート" : (r.stage === "rating" ? "回答のふりかえり" : (r.phase === "instructed" || r.stage === "instructedIntro" ? "追加の問題" : "本番"));
    const progress = !r.mainStarted || r.stage === "postq" ? "" : r.phase === "instructed" || r.stage === "instructedIntro"
      ? `（${r.instrIndex || 0} / ${INSTR_N} 問まで）` : `（${r.trialIndex} / ${r.totalMain} 問まで）`;
    $("resume").querySelector("h1").textContent = "前回の続きから再開できます";
    $("resumeGo").hidden = false; $("resumeGo").style.removeProperty("display");
    $("resumeInfo").textContent = `前回は${where}の途中でした${progress}。保存された回答を引き継ぎます。`;
    $("resumeHow").textContent = `「続きから再開する」を押すと、${MIC.mode !== "off" && r.stage !== "postq" ? "マイクの確認のあと、" : ""}中断したところから続きます。`;
    show("resume");
    $("resume").querySelector(".pad").scrollTop = 0;
  }
  function showRecoveryUnavailable(b) {
    resumeOffered = true;
    $("resume").querySelector("h1").textContent = "前回の参加データが残っています";
    $("resumeInfo").textContent = b.resume && b.resume.search !== location.search
      ? "前回とは異なるリンクで開かれています。参加時に使ったリンクを、同じ端末・ブラウザで開いてください。"
      : "続きから再開できる時間が過ぎたか、保存された進行状況を確認できませんでした。";
    $("resumeHow").textContent = "前回のデータは削除されていません。この画面から最初からやり直すことはできません。研究者へご連絡ください。";
    $("resumeGo").hidden = true; $("resumeGo").style.display = "none"; $("resumeGo").onclick = null;
    show("resume");
  }
  async function doResume(b) {
    // device を復元 (事前アンケート・読速・練習サマリ・評定チュートリアル・休憩ログ・ブロック順)。端末情報は同一端末・
    // 同一ブラウザでしか backup が見えないので前回値のまま。config は現プロセスの CONFIG を指し直す
    try {
      if (!await sessionStore.lock(b.device.sessionId, tabOwner)) throw new Error("SESSION_BUSY");
      const latest = sessionStore.read(b.device.sessionId);
      if (!latest || latest.state !== "active" || !canResume(latest.payload)) {
        await sessionStore.unlock(b.device.sessionId, tabOwner);
        resumeOffered = false; wcIdx = 0; wcRender();
        show(QS.get("welcome") === "0" ? "intro" : "welcome");
        await initRecovery();
        return;
      }
      b = latest.payload;
      if (device.sessionId !== b.device.sessionId) await sessionStore.unlock(device.sessionId, tabOwner);
    } catch (err) { storageProblem(err); return; }
    const r = normalizedResume(b);
    const gapMs = Math.max(0, Date.now() - Date.parse(b.interruptedAt));
    Object.assign(device, b.device);
    // 再開案内の裏で初期化された新規画面を引き継がず、保存済みの表示履歴だけを復元する。
    device.instructionExposure = Array.isArray(b.device.instructionExposure) ? b.device.instructionExposure.slice() : [];
    device.practiceChecks = Array.isArray(b.device.practiceChecks) ? b.device.practiceChecks.slice() : [];
    device.noticeReviews = Array.isArray(b.device.noticeReviews) ? b.device.noticeReviews.slice() : [];
    device.noticeAcknowledgements = Array.isArray(b.device.noticeAcknowledgements) ? b.device.noticeAcknowledgements.slice() : [];
    device.postPresentedKeys = Array.isArray(b.device.postPresentedKeys) ? b.device.postPresentedKeys.slice() : [];
    device.postQuestionMeta = b.device.postQuestionMeta && typeof b.device.postQuestionMeta === "object" ? { ...b.device.postQuestionMeta } : {};
    device.surveyProblemDefinition = b.device.surveyProblemDefinition ? JSON.parse(JSON.stringify(b.device.surveyProblemDefinition)) : null;
    restoreMoralPracticeDefinition(b, r);
    const previousPostKeys = b.device.collectionPlan?.postKeys;
    device.collectionPlan = { ...device.collectionPlan, postKeys: POST_ON ? POST_KEYS.slice() : [] };
    if (Array.isArray(previousPostKeys) && JSON.stringify(previousPostKeys) !== JSON.stringify(device.collectionPlan.postKeys) && !device.collectionPlan.originalPostKeys) device.collectionPlan.originalPostKeys = previousPostKeys.slice();
    if (device.consent) consentTiming = PilotConsent.timeline(device.consentTiming);
    device.config = CONFIG;
    // 開始後は入力フォームを再提示しない。旧版の入口でcaptureIntroが呼ばれる場合にも値を保つ。
    $("pid").value = device.participantId || ""; $("age").value = device.age == null ? "" : device.age;
    $("devModel").value = device.deviceModel || "";
    device.exportedAt = null;
    device.resumes = Array.isArray(device.resumes) ? device.resumes : [];
    records.length = 0;
    for (const t of b.trials) records.push(t);
    restoreInvalidAttempts(b);
    SEQ.length = 0; for (const id of r.seq) SEQ.push(id);   // combo のランダム順は前回のものを引き継ぐ
    REAL_BLOCKS.splice(0, REAL_BLOCKS.length, ...SEQ.filter(id => id !== "attn")); // これから組む練習も保存済みのブロック順にそろえる
    seqIndex = r.seqIndex;
    loadBlock(r.block);
    phase = r.phase || "main";
    queue = r.queue.slice(); cell = r.currentCell || null;
    totalMain = r.totalMain;
    trialIndex = r.trialIndex; instrIndex = r.instrIndex || 0; instructedDone = !!r.instructedDone;
    pendingInstructedStart = !!r.pendingInstructedStart; pendingMainStart = !!r.pendingMainStart;
    pendingNotice = r.pendingNotice || null; stopNoticeShown = r.stopNoticeShown || false;
    // 旧版は両条件でもearlyだけを保存していた。未表示の注意のみ、保持済みの観測フラグから候補を復元する。
    if (pendingNotice === "early" && ["rating", "next"].includes(r.stage) && records.at(-1)?.earlyStart && records.at(-1)?.lateStart) pendingNotice = "early_late";
    noticeKind = r.noticeKind || null; aborts = r.aborts || 0; resumeStage = r.stage;
    practiceRuleFlags = Array.isArray(r.practiceRuleFlags) ? r.practiceRuleFlags.filter(k => PRACTICE_RULES[k]) : [];
    practiceCheckState = r.practiceCheck || null;
    if (r.stage === "task" && r.activeAttempt) {
      // 再読込前のチェックポイントに残った部分軌跡。終了時刻や未取得の点は推定しない。
      invalidAttempts.push(invalidAttempt(r.activeAttempt, "reload_interrupted", null));
      aborts++;
    }
    const resumeLog = r.mainStarted ? device.resumes : (device.preMainResumes = Array.isArray(device.preMainResumes) ? device.preMainResumes : []);
    resumeLog.push({ at: new Date().toISOString(), afterTrial: trialIndex, phase, stage: r.stage, gapMs });
    mainStartedAt = r.mainStarted ? performance.now() - (r.mainElapsedMs || 0) : null;   // 本番前の再開は本番時計を開始しない
    mainElapsedAtEnd = r.mainElapsedAtEnd == null ? null : r.mainElapsedAtEnd;
    trialShownAt = null; lastTrialMs = null;
    const pre = r.preMain || {};
    ratingTutorialDone = r.mainStarted || !!pre.ratingDone || !!(device.ratingTutorial && device.ratingTutorial.completed);
    tutIdx = -1; tutChanged = !!r.tutChanged;
    dragTutState.done = r.mainStarted || !!pre.dragDone || (!r.preMain && (b.trials.length > 0 || ["task", "rating"].includes(r.stage)));
    dragTutState.schema = pre.dragSchema || null; // 旧完了を新しい教示の完了証跡にしない。
    exampleIntroRead = !!pre.exampleIntroRead || b.trials.some(t => t.phase === "tutorial") || ["task", "rating"].includes(r.stage);
    streak = pre.streak || 0;
    resumePending = !!r.mainStarted;
    uiLocked = false; recording = false; activePointerId = null;
    requestWakeLock();   // ユーザー操作 (再開ボタン) 起点
    const go = () => {
      sizeCanvas();
      if (r.stage === "reading") showReading(pre.reading);
      else if (r.stage === "dragTutorial") DragTut.run(startPractice, { restored: pre.drag });
      else if (r.stage === "exampleIntro") showGuidedIntro();
      else if (r.stage === "practiceComplete") endPractice();
      else if (r.stage === "practiceCheck") { trial = records[r.practiceCheck.recordIndex]; showPracticeCheck(r.practiceCheck); }
      else if (r.stage === "practiceNext") { practiceDone() ? endPractice() : nextTrial(); }
      else if (r.stage === "entry" || r.stage === "consent") enterSession();
      else if (r.stage === "postq") { resumePending = false; showPostQuestions(r.post); }
      else if (r.stage === "rating") {
        trial = records[r.trialRecordIndex];
        trial.ratingResumes = (trial.ratingResumes || 0) + 1;
        restoreMonitors(r.monitors); beginRating(r.rating);
      } else if (r.stage === "task") presentStimulus(r);
      else if (r.stage === "break") { showBreak(); breakShownAt -= r.breakElapsedMs || 0; breakAtTrial = r.breakAtTrial; saveBackup(); }
      else if (r.stage === "notice") { showStopNotice(r.noticeKind); noticeShownAt -= r.noticeElapsedMs || 0; saveBackup(); }
      else if (r.stage === "instructedIntro") showInstructedIntro();
      else if (r.stage === "blockintro") showBlockIntro();
      else nextTrial();
    };
    // 電子同意のローカル記録だけでは受領済み扱いにしない。保存成功確認前は測定を再開しない。
    if (!r.mainStarted && requiresConsent() && !device.consentReceivedAt) { showConsent(); return; }
    if (r.stage === "postq") { go(); return; }
    if (MIC.mode !== "off") showMicGate("precheck", go); else go();   // マイクは再取得+環境音チェックをやり直してから続きへ
  }
  function salvageBackup(b) {   // kiosk: 前の参加者の途中データ (再読込等で finishSession を通らなかった分) を未送信キューへ退避
    try {
      const p = { device: b.device, trials: b.trials, invalidAttempts: b.invalidAttempts || [], interruptedAt: b.interruptedAt };
      if (b.resume && b.resume.activeAttempt) p.invalidAttempts = [...p.invalidAttempts, invalidAttempt(b.resume.activeAttempt, "reload_interrupted", null)];
      p.device.partial = true;
      p.device.endedBy = p.device.endedBy || "reload";
      p.device.endedPhase = p.device.endedPhase || "main";
      p.device.mainCompleted = p.trials.filter((t) => t.phase === "main").length;
      p.device.exportedAt = new Date().toISOString();
      return outboxPush(p);
    } catch (err) { storageProblem(err); return null; }
  }
  function clearBackup(id = device.sessionId) {
    try { sessionStore.remove(id); } catch (err) { storageProblem(err); return false; }
    return true;
  }
  function loadBackup() {
    try {
      const own = sessionStore.read(device.sessionId);
      if (own && own.payload) return own.payload;
      const offered = recoveryId && sessionStore.read(recoveryId);
      return offered && ["active", "held"].includes(offered.state) && offered.payload || null;
    } catch (err) { storageProblem(err); return null; }
  }
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function stamp() {
    const pid = (device.participantId || "anon").replace(/[^\w-]/g, "");
    return `${pid}_${Date.now()}`;
  }
  $("dlJson").addEventListener("click", () => {
    download(`pilot_${stamp()}.json`, JSON.stringify(finishedPayload || buildPayload()), "application/json");
  });
  // Web Share API (LINE 等へ直接共有)。対応端末でのみボタン表示
  function sharePayload() {
    const file = new File([JSON.stringify(finishedPayload || buildPayload())], `pilot_${stamp()}.json`,
      { type: "application/json" });
    navigator.share({ files: [file], title: "パイロットデータ" })
      .catch(() => {});  // キャンセルは無視 (ダウンロードへ誘導済み)
  }
  $("shareJson").addEventListener("click", sharePayload);
  $("dlCsv").addEventListener("click", () => {
    // 軌道点列の展開 (デバッグ用)。試行メタ列はブロック別 (BLOCK.csvHead/csvRow)
    const rows = [`trial,phase,seq,t_ms,x,y,type,${BLOCK.csvHead},choiceSide,correct`];
    let pc = 0;
    for (const r of records) {
      const idTag = r.phase === "main" ? r.index : `p${++pc}`;
      for (const e of r.events) {
        rows.push(`${idTag},${r.phase},${e.seq},${e.t.toFixed(3)},${e.x},${e.y},${e.type},` +
          `${BLOCK.csvRow(r)},${r.choiceSide},${r.correct}`);
      }
    }
    download(`pilot_${stamp()}_events.csv`, rows.join("\n") + "\n", "text/csv");
  });
  // ===== 未送信キュー (outbox。2026-09-05) =====
  // 送信に失敗したセッションを端末に貯め、次に開いたとき / オンライン復帰時 / 「いま送る」で送り直す。
  // 実験者が同席しない対面運用 (複数日・複数会場・ネットに不慣れな実施者) では「失敗→手動保存して
  // LINE で送る」が回らず、しかも次の参加者が本番を始めると旧チェックポイントが消えてデータが失われる。
  const OUTBOX_KEY = "pilotAnchorOutbox_v1";
  function outboxLoad() {
    try { return sessionStore.all().filter((e) => ["held", "queued", "blocked"].includes(e.state)); }
    catch (err) { storageProblem(err); return []; }
  }
  function outboxPush(payload, held = false) {
    try {
      const entry = sessionStore.enqueue(payload, location.search, held);
      outboxRender(); return entry.id;
    } catch (err) { storageProblem(err); return null; }
  }
  function outboxRender() {
    const list = outboxLoad(), n = list.length;
    const bar = $("outboxBar");
    if (!bar) return;
    $("outboxCount").textContent = n;
    const scr = (document.querySelector(".screen.active") || {}).id;
    // 通常の送信・完了画面は中央で今回分の状態と保存手段を案内する。queued は正常送信中にもなるため、黄色の重複警告を出さない。
    // 過去分は消さず、自動再送と開始画面の回収導線を維持。対面の研究者用画面では従来の一覧を残す。
    bar.classList.toggle("on", n > 0 && (scr === "welcome" || scr === "intro" || (scr === "done" && (KIOSK || STOP_ON))));
    let details = $("outboxFiles");
    if (!details) { details = document.createElement("details"); details.id = "outboxFiles"; bar.appendChild(details); }
    details.replaceChildren();
    const summary = document.createElement("summary"); summary.textContent = "保存データを確認する"; details.appendChild(summary);
    for (const entry of list) {
      const row = document.createElement("div"), label = document.createElement("span"), dl = document.createElement("button");
      label.textContent = `${entry.payload.device.participantId || "回答"} — ${entry.state === "held" ? "保留中" : entry.state === "blocked" ? "研究者への確認が必要" : "送信待ち"} `;
      dl.type = "button"; dl.textContent = "データを保存";
      dl.onclick = () => download(`pilot_${entry.id}.json`, JSON.stringify(entry.payload), "application/json");
      row.append(label, dl);
      if (entry.state === "held" && KIOSK) {
        const send = document.createElement("button"); send.type = "button"; send.textContent = "この保留データを送信する";
        send.onclick = async () => {
          try {
            if (!await sessionStore.lock(entry.id, tabOwner)) throw new Error("SESSION_BUSY");
            sessionStore.release(entry.id);
            if (entry.id !== device.sessionId) await sessionStore.unlock(entry.id, tabOwner);
            outboxRender(); outboxFlush();
          } catch (err) { storageProblem(err); }
        };
        row.appendChild(send);
      }
      details.appendChild(row);
    }
  }
  async function postPayload(payload, encoded) {   // 保存済みの同じ本文を再送。成功時のみ resolve
    // GAS Web アプリは CORS preflight (OPTIONS) に応答しないため text/plain で simple request にする。
    // XMLHttpRequest の upload.onprogress は preflight を発生させる (2026-09-29 実機で失敗)。fetch を維持し、送信量の割合は表示しない
    const ctl = ("AbortController" in window) ? new AbortController() : null;
    const body = encoded ? encoded.body : durable ? (await durable.wire(payload)).body : PilotCodec.wire(JSON.stringify(payload));
    const timeout = payload.kind === "consent" ? 30000 : payload.kind === "finalize" ? 120000 :
      Math.max(180000, Math.min(900000, Math.ceil(new TextEncoder().encode(body).length * 8 / 100 + 60000)));
    const timer = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    return fetch(CONFIG.uploadUrl, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body, signal: ctl ? ctl.signal : undefined,
    }).then((res) => res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)))
      .then((j) => {
        if (!j || !j.ok) { const err = new Error((j && j.error) || "server error"); err.retryable = !j || j.retryable !== false; err.code = j && j.code; throw err; }
        if (j.sessionId && j.sessionId !== payload.device.sessionId) throw new Error("receipt session mismatch");
        if (payload.kind === "consent" && (j.protocol !== payload.protocol || j.sessionId !== payload.device.sessionId || !["consented", "tasks_received", "completed", "partial"].includes(j.state))) throw new Error("consent receipt unavailable; update collector");
        return j;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
  }
  let outboxBusy = false, uploadInFlight = false;
  async function outboxFlush(onDone) {
    if (outboxBusy || !CONFIG.uploadUrl) { if (onDone) onDone(0, outboxLoad().length); return; }
    const list = outboxLoad().filter((e) => e.state === "queued" && !(uploadInFlight && e.id === device.sessionId));
    if (list.length === 0) { if (onDone) onDone(0, 0); return; }
    outboxBusy = true;
    let sent = 0;
    try {
      for (const item of list) {
        if (!await sessionStore.lock(item.id, tabOwner)) continue;
        try {
          const current = sessionStore.read(item.id);
          if (!current || current.state !== "queued") continue;
          if (current.delivery?.tasks) { await staged.kick(item.id); if (sessionStore.read(item.id)?.state === "sent") sent++; continue; }
          await sessionStore.flush();
          const result = await postPayload(current.payload);
          sessionStore.sent(item.id, result); await sessionStore.flush(); sent++;
          if (item.id === device.sessionId && sessionFinished) showSent();
        } catch (err) {
          if (err.retryable === false) { sessionStore.blocked(item.id, err.code || "invalid_payload"); continue; }
          break;
        } finally { if (item.id !== device.sessionId && !sessionStore.read(item.id)?.delivery?.tasks) sessionStore.unlock(item.id, tabOwner); }
      }
    } catch (err) { storageProblem(err); }
    finally { outboxBusy = false; outboxRender(); if (onDone) onDone(sent, outboxLoad().length); }
  }

  // 送信中はスピナー + 「閉じない・更新しない」。結果が出るまで完了コードとお礼は隠す
  function sendUiStart(attempt) {
    $("doneTitle").textContent = "データを送信しています";
    $("sendBox").style.display = "";
    $("sendMsg").textContent = attempt > 1 ? "通信を確認しながら、送信を再試行しています。この画面のままお待ちください。" : "データを送信しています。";
    for (const id of ["doneMsg", "ccodeBox", "debrief", "summary"]) $(id).classList.add("hidden-until-sent");
  }
  function sendUiEnd(success) {
    $("doneTitle").textContent = success ? "完了しました" : "送信はまだ完了していません";
    $("sendBox").style.display = "none";
    for (const id of ["doneMsg", "ccodeBox", "debrief", "summary"]) $(id).classList.remove("hidden-until-sent");
    if (!success) $("ccodeBox").classList.add("hidden-until-sent");
  }
  async function uploadJson(attempt) {
    attempt = attempt || 1;
    const payload = finishedPayload || JSON.parse(JSON.stringify(buildPayload()));
    finishedPayload = payload;
    if (attempt === 1 && !outboxPush(payload)) { sendUiEnd(false); $("exportRow").style.display = ""; return; }
    if (sessionStore.read(device.sessionId)?.delivery?.tasks) {
      sendUiStart(1);
      try { await sessionStore.flush(); await staged.kick(device.sessionId); } catch (err) { storageProblem(err); }
      return;
    }
    // 再開URLや呼び出し元にかかわらず、送信が許可された状態だけを外部へ送る。
    // held/blocked/sent は enqueue が返しても queued へ変わらない。
    try {
      const entry = sessionStore.read(payload.device.sessionId);
      if (!entry || entry.state !== "queued") {
        uploadInFlight = false; sendUiEnd(entry?.state === "sent");
        if (entry?.state !== "sent") $("exportRow").style.display = "";
        return;
      }
    } catch (err) { uploadInFlight = false; storageProblem(err); return; }
    uploadInFlight = true;
    sendUiStart(attempt);
    $("uploadStatus").textContent = "";
    try { await sessionStore.flush(); } catch (err) { uploadInFlight = false; storageProblem(err); return; }
    postPayload(payload)
      .then(async (result) => {
        sessionStore.sent(device.sessionId, result);
        await sessionStore.flush();
        uploadInFlight = false; showSent();
        outboxFlush();   // 回線が復活したので、貯まっていた過去分もついでに送る
      })
      .catch((err) => {
        if (err.retryable !== false && attempt < 3) { setTimeout(() => uploadJson(attempt + 1), 1500 * attempt); return; }
        uploadInFlight = false; sendUiEnd(false);
        if (err.retryable === false) {
          try { sessionStore.blocked(device.sessionId, err.code || "invalid_payload"); } catch (e) { storageProblem(e); }
          $("uploadStatus").textContent = "送信先がデータを受け付けませんでした。回答は端末に保存されています。データを保存して研究者へ連絡してください。";
        } else $("uploadStatus").textContent = "送信を確認できませんでした。回答は端末に保存されています。通信が戻ると再送します。";
        $("exportRow").style.display = "";
        outboxRender();
        showNextParticipant();
      });
  }
  function showSent() {
    sendUiEnd(true);
    $("uploadStatus").textContent = "✅ データは送信されました。";
    $("doneMsg").textContent = "ご協力ありがとうございました。";
    $("outboxStatus").textContent = "";
    if (!debugMode) $("exportRow").style.display = "none";
    showNextParticipant(); outboxRender();
  }
  function deliveryState(id, update) {
    // No spinner, status message or live-region announcement while answering the survey.
    if (id !== device.sessionId || !sessionFinished) return;
    if (update.state === "sent") { showSent(); return; }
    if (update.state === "blocked") {
      sendUiEnd(false); $("exportRow").style.display = "";
      $("uploadStatus").textContent = "保存の確認が必要です。この画面を閉じずに、回答データを保存して研究者へ連絡してください。";
      return;
    }
    sendUiStart(update.attempt);
    if (["offline", "retry"].includes(update.state)) {
      $("sendMsg").textContent = update.state === "offline" ? "通信の復旧を待っています。接続が戻ると自動で再送します。この画面を開いたままお待ちください。" : "保存を確認できなかったため、間隔を空けて再送しています。この画面のままお待ちください。";
      $("exportRow").style.display = "";
    }
  }
  function showNextParticipant() {   // 連続実施: データの行き先が確定してから (送信済 or 端末保存) 次の人へ
    if (KIOSK) $("nextParticipant").style.display = "";
  }

  // 共通ガード。画面遷移の show() からの参照は関数宣言で保つ。
  var runtimeGuards;
  function checkZoom() { return runtimeGuards && runtimeGuards.checkZoom(); }
  function measureZoom() { return runtimeGuards.measureZoom(); }
  runtimeGuards = window.PilotRuntimeGuards.create({
    $, query: QS, preview: GO, kiosk: KIOSK, cohort: COHORT, study: STUDY,
    getDevice: () => device, isRecording: () => recording,
    onOrientationInterrupted: () => { recording = false; activePointerId = null; retryTrial("画面が回転しました", null, "orientation_changed"); },
  });

  // ===== 中断データの扱い (起動時に前回チェックポイントがあれば) =====
  //   kiosk (対面・共用端末): 途中データ (partial でないもの=再読込で途切れた分) を未送信キューへ退避し、次の人は最初から
  //   クラウド配布: 入力完了以降、3時間以内・同じURLなら「続きから再開」。完了済みなら完了画面へ。
  //   別構成・3時間超等: オンラインは保存を残して終了案内。対面の研究者用回収/破棄は維持する。
  async function initRecovery() {
    if (GO) { storeReady = true; recoveryBooted = true; return; }
    try {
      if (!durable) {
        durable = await PilotDurable.open(storageProblem);
        sessionStore = createSessionStore(legacyStorage, { locks: navigator.locks, backend: durable });
        staged = createStagedDelivery({ store: sessionStore, encode: p => durable.wire(p), send: postPayload, onState: deliveryState });
      }
      await sessionStore.migrateV2(tabOwner);
      const migration = await sessionStore.migrateLegacy({ owner: tabOwner, search: location.search });
      if (migration.busy) throw new Error("SESSION_BUSY");
      if (migration.retained.length) throw new Error(migration.retained[0].code || "legacy storage migration failed");
      if (!await sessionStore.lock(device.sessionId, tabOwner)) throw new Error("SESSION_BUSY");
      storeReady = true;
      for (const entry of sessionStore.all()) {
        if (entry.state === "sent" && Date.now() - Date.parse(entry.updatedAt) > RESUME_WINDOW_MS && await sessionStore.lock(entry.id, tabOwner)) {
          sessionStore.remove(entry.id); await sessionStore.unlock(entry.id, tabOwner);
        }
      }
      const entries = sessionStore.all().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      let entry = entries.find((e) => e.search === location.search &&
        (!KIOSK || e.state === "active" || e.state === "held") &&
        (e.state !== "sent" || (!KIOSK && Date.now() - Date.parse(e.updatedAt) <= RESUME_WINDOW_MS))) ||
        entries.find((e) => e.state === "active" || e.state === "held");
      if (!entry) { outboxRender(); outboxFlush(); return; }
      recoveryId = entry.id;
      let backup = entry.payload;
      async function lockRecoveryEntry() {
        if (!await sessionStore.lock(entry.id, tabOwner)) throw new Error("SESSION_BUSY");
        const latest = sessionStore.read(entry.id);
        if (!latest || (latest.revision || 0) !== (entry.revision || 0)) {
          // The list was read before acquiring ownership. Never restore a deleted or superseded snapshot.
          await sessionStore.unlock(entry.id, tabOwner);
          recoveryId = null;
          return false;
        }
        entry = latest; backup = latest.payload;
        return true;
      }
      if (entry.search === location.search && (entry.state === "sent" || (backup && backup.device.exportedAt && backup.device.completionCode))) {
        if (!await lockRecoveryEntry()) return await initRecovery();
        if (device.sessionId !== entry.id) await sessionStore.unlock(device.sessionId, tabOwner);
        Object.assign(device, backup ? backup.device : entry.receipt);
        records.length = 0; if (backup) { records.push(...backup.trials); restoreInvalidAttempts(backup); }
        sessionFinished = true; finishedPayload = backup || null;
        if (entry.state === "blocked") {
          showCompletion(true); sendUiEnd(false);
          $("uploadStatus").textContent = "送信先がデータを受け付けませんでした。回答は端末に保存されています。データを保存して研究者へ連絡してください。";
          $("exportRow").style.display = "";
        } else showCompletion(entry.state === "sent");
        return;
      }
      if (backup && KIOSK && entry.search === location.search && backup.device.kiosk && entry.state === "active" && !backup.device.partial) {
        if (!await lockRecoveryEntry()) return await initRecovery();
        if (!salvageBackup(backup)) return;
        await sessionStore.unlock(entry.id, tabOwner);
      } else if (backup && !KIOSK && entry.state === "active" && canResume(backup)) {
      resumeOffered = true;
      showResume(backup);
      $("resumeGo").onclick = () => doResume(backup);
    } else if (backup) {
      if (!KIOSK && !STOP_ON) { showRecoveryUnavailable(backup); return; }
      $("recovery").classList.add("show");
      $("recoverDl").onclick = () => {
        const pid = ((backup.device && backup.device.participantId) || "anon").replace(/[^\w-]/g, "");
        download(`pilot_${pid}_interrupted.json`, JSON.stringify(backup), "application/json");
      };
      $("recoverDrop").onclick = async () => {
        if (!KIOSK && !STOP_ON) return;
        if (!await sessionStore.lock(entry.id, tabOwner)) { storageProblem(new Error("SESSION_BUSY")); return; }
        if (!clearBackup(entry.id)) return;
        await sessionStore.flush();
        await sessionStore.unlock(entry.id, tabOwner);
        recoveryId = null;
        $("recovery").classList.remove("show");
      };
    }
      outboxRender(); outboxFlush();
    } catch (err) { storageProblem(err); }
    finally { recoveryBooted = true; }
  }

  // ===== 電子同意: 氏名確認後、測定開始前に保存する =====
  function requiresConsent() { return !KIOSK && !GO && REAL_BLOCKS.includes("moral") && (!debugMode || QS.get("consent") === "1"); }
  function consentPayload() {
    return { kind: "consent", protocol: 3, device: { sessionId: device.sessionId, participantId: device.consent.name,
      study: device.study, cohort: device.cohort, block: device.block, appVersion: device.appVersion, consent: device.consent }, trials: [] };
  }
  function consentScrollCheck() {
    if (consentBusy) return;
    const box = $("consentDocument");
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 3) {
      $("consentCheck").disabled = false;
      if (!device.consent) $("consentStatus").textContent = "内容を確認して、同意する場合はチェックを入れてください。";
    }
  }
  function showConsent() {
    const doc = device.consent || PilotConsent;
    $("consentDocument").replaceChildren();
    const add = (tag, text) => { const e = document.createElement(tag); e.textContent = text; $("consentDocument").appendChild(e); };
    add("h2", "研究課題"); add("p", doc.title);
    for (const part of doc.description) { add("h2", part.heading); add("p", part.text); }
    add("h2", "研究協力承諾書"); add("p", doc.statement);
    add("p", "説明文の版：" + doc.documentVersion);
    $("consentIdentity").textContent = "氏名：" + (device.consent ? device.consent.name : device.participantId);
    $("consentCheck").checked = !!device.consent;
    $("consentCheck").disabled = !device.consent;
    $("consentBack").hidden = !!device.consent;
    $("consentGo").disabled = !device.consent;
    $("consentGo").textContent = device.consent ? "保存を確認して実験に進む" : "同意して実験に進む";
    $("consentStatus").textContent = device.consent ? "同意日時：" + new Date(device.consent.consentedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "枠の中を最後までスクロールしてお読みください。";
    resumeStage = "consent";
    saveBackup();
    show("consent"); $("consentDocument").scrollTop = 0;
    requestAnimationFrame(consentScrollCheck);
  }
  $("consentDocument").addEventListener("scroll", consentScrollCheck, { passive: true });
  $("consentCheck").addEventListener("change", () => { $("consentGo").disabled = !$("consentCheck").checked; });
  $("consentBack").onclick = () => { if (!consentBusy && !device.consent) gotoIntro(); };
  $("consentDecline").onclick = () => {
    if (consentBusy) return;
    const end = document.createElement("div"); end.id = "consentDeclined"; end.setAttribute("role", "status");
    end.textContent = "参加は終了しました。この画面を閉じてください。";
    document.body.appendChild(end);
  };
  $("consentGo").onclick = async () => {
    if (consentBusy || !$("consentCheck").checked || $("consentCheck").disabled) return;
    if (!CONFIG.uploadUrl) { $("consentStatus").textContent = "確認用の画面です。同意は送信されません。実際の参加には研究者から案内されたリンクを使ってください。"; return; }
    if (!device.consent) { device.consent = PilotConsent.create(device.participantId); consentTiming = PilotConsent.timeline(); }
    consentBusy = true; $("consentGo").disabled = true; $("consentCheck").disabled = true;
    $("consentBack").hidden = true; $("consentDecline").disabled = true;
    $("consentStatus").textContent = "同意を保存しています。そのままお待ちください。";
    show("consent-save");
    try {
      if (!saveBackup()) throw new Error("local consent save failed");
      await sessionStore.flush();
      const receipt = await postPayload(consentPayload());
      if (receipt.state !== "consented") throw new Error("this session has already ended");
      device.consentReceivedAt = receipt.consentReceivedAt;
      if (!saveBackup()) throw new Error("local consent receipt save failed");
      await sessionStore.flush();
      if (MIC.mode !== "off" && !MIC.acquired) showMicGate("precheck"); else enterSession();
    } catch (err) {
      $("consentStatus").textContent = err.retryable === false ? "同意の保存を確認できません。研究者へ連絡してください。" : "保存を確認できませんでした。通信を確認して、もう一度押してください。同意日時は保持されています。";
      $("consentGo").textContent = "同意の保存をもう一度試す";
      show("consent");
    } finally { consentBusy = false; $("consentGo").disabled = false; $("consentCheck").disabled = false; $("consentDecline").disabled = false; }
  };
  document.addEventListener("visibilitychange", () => {
    if (!consentTiming || sessionFinished) return;
    consentTiming.change(document.hidden ? "background" : (Object.keys(screens).find(k => screens[k].classList.contains("active")) || "other"));
    if (document.hidden) saveBackup();
  });

  // ===== ウェルカム (入力の前に説明を1枚ずつ。2026-09-05) =====
  // 小さい注記を intro に並べても読まれないため、参加を決める材料 (内容・所要時間・環境と記録) を
  // 入力より前に置き、「次へ」で1枚ずつ読ませる。読み終わる頃にボタンを強調 (readCueDelay)
  // 対面 (kiosk) は係の人が横にいて時間で区切るため、所要時間と「最後まで通して」の案内が実態と食い違う。
  // 2枚に減らし「途中で終わってよい」「分からなければ声をかけて」を明示する
  const WELCOME_KIOSK = [
    { h: "ご参加ありがとうございます",
      b: '<p>短い場面を読んで、<b>2つの選択肢から あなたの考えに近いほう</b>を選んでいきます。</p>' +
         '<ul><li><b>正解・不正解はありません。</b>思ったとおりで大丈夫です。</li>' +
         '<li>選んだあとに「迷い」と「自信」を5段階でふりかえります。</li>' +
         '<li>分からないときは、<b>近くの係の者に声をかけてください。</b></li></ul>' },
    { h: "進め方", mic: true,
      b: '<p>はじめに<b>操作方法</b>と<b>練習</b>があります。</p>' +
         '<ul><li>' + (MAX_MIN != null ? '<b>時間が来たら自動で終わります。</b>' : '') + '最後まで解ききる必要はありません。</li>' +
         '<li>やめたいときは、画面右上の<b>「終了」</b>を押してください。<b>いつやめても大丈夫</b>です。</li>' +
         '<li>スマートフォンを<b>手で持って</b>操作します。</li></ul>' },
  ];
  const WELCOME_DEFAULT = [
    { h: "ご参加ありがとうございます",
      b: '<p>この調査では、<b>短い問題文</b>を読んで、<b>2つの選択肢から あなたの考えに近いほう</b>を選んでいきます。</p>' +
         '<ul><li><b>正解・不正解はありません。</b>あなたの素直な判断で構いません。</li>' +
         '<li>選んだあとに「迷い」と「自信」を5段階でふりかえります。</li></ul>' },
    { h: "所要時間と進め方",
      b: '<p>全体で <b>40分ほど</b>（35〜50分）かかります。時間に余裕があるときに始めてください。</p>' +
         '<ul><li><b>読む速さの計測</b> → <b>画面構成と操作方法の説明</b> → <b>練習</b> → <b>本番</b> → <b>実施後のアンケート</b>と進みます。説明は何度でも見直せます。</li>' +
         '<li><b>回答を急ぐ必要はありません。</b>読むことや考えることに十分な時間を使って<b>自分のペースで進めてください。</b></li>' +
         '<li>本番では <b>20問ごとに休憩</b>があります。休憩以外は、別の作業を挟まずに続けてください。</li></ul>' },
    { h: "実施する環境について",
      b: '<p><b>静かな場所</b>で、落ち着いて取り組める時に始めてください。</p>' +
         '<ul><li>スマートフォンを<b>手で持って</b>操作します（机に置いたままにしないでください）。</li>' +
         '<li>通知で中断されないよう、<b>おやすみモード</b>などにしておくと安心です。</li></ul>' },
    { h: "氏名とデータの取り扱い",
      b: '<p>氏名は、参加確認と謝礼のお支払いに関する照合に使用します。</p>' +
         '<p>研究の分析には、氏名を研究用IDに置き換えたデータを使用します。</p>' +
         '<p>研究成果に氏名を掲載することはありません。</p>' },
    // 2026-09-06: 画面切替・再読込の注意 (§6-6 項17)。画面切替の回数・時間の記録は倫理申請 (実施計画書 §3D) に記載済。
    // 報酬の承認条件 (非承認の基準) はアプリでなく募集文に書く (身内配布では報酬がないため、ここでは「有効な回答として扱えない」に留める)
    // 同意チェックは5/6・6/6。5項目を3+2の2ページに分け、全てにチェックしてから開始する。
    { h: "進めるうえでのお願い", mic: true,
      b: '<p>次の項目を確認して、<b>すべてにチェック</b>を入れてください。</p>',
      agree: [
        '<b>途中で他のアプリや別の画面に切り替えません。</b>切り替えた回数と時間は記録されます。',
        '<b>ブラウザの更新や「戻る」は使いません。</b>',
        'できるだけ中断せずに進めてください。やむを得ず中断した場合は、同じ端末・ブラウザで早めに戻ってください。時間がたつと続きから再開できないことがあります。',
      ] },
    { h: "参加の条件",
      b: '<p>次の項目を確認して、<b>すべてにチェック</b>を入れてください。</p>',
      agree: [
        'この調査は<b>1回だけ</b>参加できます。',
        '謝礼の支払条件は募集時の案内をご確認ください。',
      ] },
  ];
  const WELCOME = KIOSK ? WELCOME_KIOSK : WELCOME_DEFAULT;
  let wcIdx = 0, wcCueTimer = null;
  const wcAgreed = WELCOME.map(() => []);
  function wcRender() {
    const p = WELCOME[wcIdx];
    $("wcStep").textContent = `${wcIdx + 1} / ${WELCOME.length}`;
    $("wcBody").innerHTML = `<h1 id="wcHeading">${p.h}</h1>` + p.b +
      (p.agree ? '<div class="checks" id="wcAgree" aria-labelledby="wcHeading">' + p.agree.map((t, i) => `<button type="button" class="chk" data-val="${i}">${t}</button>`).join("") + '</div>' : "") +
      (p.mic && MIC.mode !== "off" ? '<p class="opt-note" style="margin-top:12px">※ 次の画面でマイクの許可をお願いします（測るのは周囲の<b>音量レベルだけ</b>で、会話の内容は記録しません）。</p>' : "") +
      (wcIdx === WELCOME.length - 1 ? '<p class="opt-note" style="margin-top:10px">※ 中断からの再開のために、入力した情報と回答の途中経過をこの端末に一時保存します。</p>' : "");
    if (p.agree) {   // 同意のチェック: 全部にチェックが入るまで「次へ / はじめる」は無効
      wcAgreeShownAt = performance.now();
      for (const b of $("wcAgree").querySelectorAll("button")) b.classList.toggle("sel", wcAgreed[wcIdx].includes(b.dataset.val));
      wireChecks("wcAgree", (vals) => { wcAgreed[wcIdx] = vals; $("wcNext").disabled = vals.length < p.agree.length; });
      $("wcNext").disabled = wcAgreed[wcIdx].length < p.agree.length;
    } else $("wcNext").disabled = false;
    $("wcNext").textContent = wcIdx === WELCOME.length - 1 ? "はじめる" : "次へ";
    $("wcPrev").hidden = wcIdx === 0;
    $("wcNext").classList.remove("cue");
    if (wcCueTimer) clearTimeout(wcCueTimer);
    const page = wcIdx;
    wcCueTimer = setTimeout(() => { if (wcIdx === page) $("wcNext").classList.add("cue"); }, readCueDelay(p.b));
    $("welcome").querySelector(".pad").scrollTop = 0;
    focusScreenHeading("welcome");
    if (!KIOSK && wcIdx === 1 && screens.welcome.classList.contains("active")) logInstructionExposure("welcome", { page: 2 });
  }
  let wcAgreeShownAt = null, wcAgreeMs = 0;
  function finishWelcomeDwell() {
    if (WELCOME[wcIdx].agree && wcAgreeShownAt != null) { wcAgreeMs += Math.round(performance.now() - wcAgreeShownAt); wcAgreeShownAt = null; }
  }
  $("wcPrev").addEventListener("click", () => {
    if (wcIdx <= 0) return;
    finishWelcomeDwell(); wcIdx--; wcRender();
  }, { passive: true });
  $("wcNext").addEventListener("click", () => {
    if ($("wcNext").disabled) return;
    finishWelcomeDwell();
    if (wcIdx < WELCOME.length - 1) { wcIdx++; wcRender(); return; }
    device.welcomeAgree = { items: WELCOME.reduce((n, p) => n + (p.agree ? p.agree.length : 0), 0), pages: WELCOME.filter((p) => p.agree).length, ms: wcAgreeMs };   // 同意のチェック (2026-09-29。2026-09-30 から 2 ページ合計)
    gotoIntro();
  }, { passive: true });
  wcRender();
  if (WELCOME_OFF && !resumeOffered) gotoIntro();   // ?welcome=0: 入力画面から始める (対面はその前にマイクの許可)

  // ===== 起動 =====
  // 2026-09-05: intro からブロック説明の長文 (BLOCK.introHtml ≈480字) を撤去し、入力欄だけの
  // 1画面に (スクロール解消)。全体像は welcome 1枚目、操作方法はチュートリアル (実演+ハンズオン) が
  // 担う = 同じ内容を3箇所で繰り返さない。BLOCK.introHtml は blockintro (パート切替) で引き続き使用
  $("introInstructions").innerHTML = "";   // 2026-09-06: パート数の予告も出さない (入力画面は入力だけ)
  document.title = "調査: " + (SEQ.length > 1 ? "価値・選好 と 道徳判断" : BLOCK.title);   // 2026-09-26: 本実験なので「パイロット」を外す

  // 事前アンケート (特性): 性別・利き手。選択で開始ボタンの有効/無効を再評価
  wireSeg("ageBandSeg", (v) => { device.ageBand = v; refreshIntro(); });   // 年代タップ (?ageband=1 / kiosk)
  wireSeg("sexSeg", (v) => { device.sex = v; refreshIntro(); });
  wireSeg("handSeg", (v) => { device.handedness = v; refreshIntro(); });
  // 事後アンケート (状態): 持ち方+操作を1問で
  wireSeg("gripSeg", (v) => { device.grip = v; postReady(); });
  // 事後アンケート (UI/負担。②③=評定ブロックのみ): 使いにくさ複数選択 / その他自由記述 / 操作しやすさ / 自由記述
  wireChecks("surveyProblems", (vals) => {
    survey.problemPages = problemParts.map((values, i) => {
      const selected = vals.filter(value => values.includes(value));
      return selected.length ? selected : vals.includes(`none${i + 1}`) ? ["none"] : null;
    });
    syncSurveyProblems();
    showSurveyFree(vals.includes("other"));   // その他にチェック時だけ下に必須の自由記述欄を表示
    postReady();
  });
  wireSeg("surveyEaseSeg", (v) => { survey.ease = v; postReady(); });
  $("surveyFree").addEventListener("input", () => { survey.free = $("surveyFree").value; postReady(); }, { passive: true });
  $("surveyComment").addEventListener("input", () => { survey.comment = $("surveyComment").value; scheduleCheckpoint(); }, { passive: true });
  // テキスト/数値入力でも再評価
  for (const id of ["pid", "age", "devModel"]) {
    $(id).addEventListener("input", refreshIntro, { passive: true });
  }
  // 事前アンケートのプリセット (対面: 実験者が URL に載せる。?intro=0 で「埋まった欄だけ」隠す = 高齢者に
  // ローマ字入力をさせない。埋め忘れた欄は残るので、取り違えたまま進むことはない。§6-6 項15)
  (function presetIntro() {
    const filled = {};
    const setInput = (id, v) => { if (v) { $(id).value = v; filled[id] = true; } };
    // 参加者ID: URL 指定がなければ端末内カウンタで自動採番 (?pidauto=E → E01, E02…)。
    // URL を書き換えられない実施者でも重複しないIDが振れる。リロードで番号が飛ぶことはあるが実害はない
    setInput("pid", QS.get("pid") || (PID_AUTO ? nextParticipantId(PID_AUTO) : null));
    setInput("age", QS.get("age"));
    setInput("devModel", QS.get("model"));
    const pickSeg = (segId, v) => {
      if (!v) return;
      const b = $(segId).querySelector('button[data-val="' + v + '"]');
      if (b) { b.click(); filled[segId] = true; }   // wireSeg 経由 = device への反映と選択表示を兼ねる
    };
    pickSeg("sexSeg", QS.get("sex"));
    pickSeg("handSeg", QS.get("hand"));
    pickSeg("ageBandSeg", QS.get("ageband") && QS.get("ageband") !== "1" ? QS.get("ageband") : null);
    if (AGEBAND_ON) {   // 年齢は数値入力でなく年代タップ (キーボードを出さない)
      $("ageBandField").style.display = "";
      filled.age = true;   // 数値欄は使わないので隠す対象に
    }
    if (KIOSK) {
      $("introLead").textContent = "つぎの3つをタップで選んでください。";
      $("goPractice").textContent = "はじめる";
    }
    if (HIDE_INTRO_FILLED)
      for (const id of Object.keys(filled)) {
        const f = $(id).closest(".field");
        if (f) f.style.display = "none";
      }
  })();

  // 未送信キュー: 起動時に自動再送 + オンライン復帰で再送 + 「いま送る」ボタン (2026-09-05)
  outboxRender();
  window.addEventListener("online", () => {
    if (!storeReady) return;
    if (sessionStore.read(device.sessionId)?.delivery?.tasks) staged.kick(device.sessionId).catch(storageProblem);
    outboxFlush();
  });
  $("outboxSend").addEventListener("click", () => {
    $("outboxStatus").textContent = "送信中…";
    outboxFlush((sent, left) => {
      $("outboxStatus").textContent = sent > 0
        ? `${sent}件 送信しました` + (left > 0 ? ` (残り ${left}件)` : "")
        : "送れませんでした。電波のある場所でもう一度お試しください";
    });
  }, { passive: true });
  // 連続実施 (kiosk): 同じ URL のまま最初から (URL の編集・ブラウザ操作が要らない)
  $("nextParticipant").addEventListener("click", async () => {
    if (heldId) {   // 明示的な送信操作で保留を解除する。移行前のkioskデータも同じ扱い。
      try { sessionStore.release(heldId); } catch (err) { storageProblem(err); return; }
      $("uploadStatus").textContent = "送信中…";
      outboxFlush(() => location.reload());
      return;
    }
    location.reload();
  }, { passive: true });
  $("discardAsk").addEventListener("click", () => { $("discardConfirm").style.display = ""; }, { passive: true });
  $("discardNo").addEventListener("click", () => { $("discardConfirm").style.display = "none"; }, { passive: true });
  $("discardYes").addEventListener("click", discardHeld, { passive: true });

  // HUD (?hud=1 / kiosk): 課題画面に「本番開始からの経過」と「直前1問の所要秒」。
  // 高齢者が1問にどれくらいかかるかをその場で把握する / 実機で時間配分を実測するための表示
  if (HUD_ON) setInterval(() => {
    const el = $("hud");
    if (!screens.task.classList.contains("active")) { el.style.display = "none"; return; }
    const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    let txt = mmss(performance.now());   // ページを開いてからの経過 (説明・練習・チュートリアル込み)
    if (phase === "main" && mainStartedAt != null) {
      txt += `｜本番 ${mmss(performance.now() - mainStartedAt)}`;
      if (lastTrialMs != null) txt += `｜前問 ${(lastTrialMs / 1000).toFixed(1)}s`;
    }
    el.textContent = txt;
    el.style.display = "";
  }, 500);

  // 中断ボタン (対面 ?stop=1)。誤タップは確認画面から戻れる
  if (STOP_ON) {
    $("stopBtn").addEventListener("click", showStopConfirm, { passive: true });
    $("stopBack").addEventListener("click", cancelStop, { passive: true });
    $("stopGo").addEventListener("click", () => endEarly("operator"), { passive: true });
    // はじめから (2026-09-12): 2 回押しで確定。1 回目で文言が変わり、3 秒以内に 2 回目で回答を消して最初の画面へ
    const RESTART_LABEL = $("stopRestart").textContent;
    let restartArmedAt = 0, restartTimer = null;
    $("stopRestart").addEventListener("click", () => {
      const now = performance.now();
      if (restartArmedAt && now - restartArmedAt <= 3000) { restartFresh(); return; }
      restartArmedAt = now; $("stopRestart").textContent = "もう一度押すと、回答を消して最初の画面に戻ります";
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { restartArmedAt = 0; $("stopRestart").textContent = RESTART_LABEL; }, 3000);
    }, { passive: true });
  }

  refreshIntro();   // 初期は未記入なので開始ボタンを無効化
  if (requiresConsent()) $("goPractice").textContent = "説明・同意の確認へ";

  // 開始前に環境音チェックを挟む (マイク必須。?mic=0 のみ素通し。§6-6 項10)。通過後は enterSession
  // (読速ベースライン → 練習。§6-6 項13) へ
  $("goPractice").addEventListener("click", async () => {
    if ((!storeReady || !recoveryBooted) && !GO) return;
    captureIntro();
    device.introCompletedAt = device.introCompletedAt || new Date().toISOString();
    resumeStage = "entry";
    if (!GO) {
      if (!saveBackup()) return;
      try { await sessionStore.flush(); } catch (err) { storageProblem(err); return; }
    }
    if (requiresConsent()) { showConsent(); return; }
    if (MIC.mode !== "off" && !MIC.acquired) { showMicGate("precheck"); return; }
    enterSession();
  }, { passive: true });
  $("micgateStart").addEventListener("click", micGateStart, { passive: true });
  $("micgateGo").addEventListener("click", () => {
    const f = micGateNext || enterSession;   // 通常=読速→練習 / 再開 (§6-6 項17)=本番の続き
    micGateMode = null; micGateNext = null; f();
  }, { passive: true });
  $("readDone").addEventListener("click", readAdvance, { passive: true });
  $("noisegateGo").addEventListener("click", () => {
    if (!noiseGate) return;
    noiseGate.trialRec.noisePause = {   // ゲート滞在の記録 (試行間間隔が可変になる分の証跡)
      durationMs: +(performance.now() - noiseGate.enteredAt).toFixed(0),
      retries: noiseGate.retries,
    };
    saveBackup();
    const f = noiseGate.next; noiseGate = null; f();
  }, { passive: true });
  if (MIC.mode === "off") $("micNote").style.display = "none";   // 開発時はマイク同意文言も出さない
  // 練習中に説明を見直す (ドラッグ導入チュートリアルを再生。終わると練習の同じ試行へ戻る)
  $("tutAgain").addEventListener("click", () => {
    if (recording || uiLocked || dragTutState.active) return;
    device.tutorialLog.push({ kind: "drag", event: "again", phase, trial: phase === "main" ? trialIndex + 1 : (phase === "instructed" ? instrIndex + 1 : null) });   // 説明を見直した回数 (どの段階・何問目で)
    replayResumeState = JSON.parse(JSON.stringify(resumeState()));
    const retained = replayResumeState;
    DragTut.run(() => { replayResumeState = null; presentStimulus(retained); }, { replay: true, instructed: phase === "instructed" });   // 説明の滞在だけを読解時間から除く
  }, { passive: true });
  $("ratingSubmit").addEventListener("click", submitRating, { passive: true });
  $("breakContinue").addEventListener("click", () => {
    if (breakShownAt != null) {
      device.breaks.push({ block: CONFIG.block, atTrial: breakAtTrial,
        dwellMs: +(performance.now() - breakShownAt).toFixed(0) });
      breakShownAt = null;
    }
    presentStimulus();
  }, { passive: true });
  $("blockintroGo").addEventListener("click", () => {
    if (pendingInstructedStart) { pendingInstructedStart = false; startInstructed(); return; }   // 教示誘導ブロックへ
    if (pendingMainStart) { pendingMainStart = false; startMain(); return; }  // 練習クリア→本番 (自己ペース)
    UNIFIED ? startMain() : startPractice();   // 統合: 練習は冒頭に統合済み→次パートは本番へ直行 (2026-07-15)
  }, { passive: true });
  // 終了の取り消し (対面): 「ここで終了する」まで押してしまった → 最後の質問画面から課題に戻る。終了前の画面へ戻し、
  // 課題中なら同じ問題を出し直す (RT に迷った時間を混ぜない)。戻った記録は device.stopPauses に残す (2026-09-07)
  $("postBack").addEventListener("click", () => {
    if (!endedFrom || !device.partial) return;
    const from = endedFrom; endedFrom = null;
    device.partial = false; device.endedBy = null; device.endedPhase = null;
    if (phase === "main" && mainElapsedAtEnd != null) { mainStartedAt = performance.now() - mainElapsedAtEnd; mainElapsedAtEnd = null; }
    const pause = { screen: "postq", from: from.screen, durationMs: +(performance.now() - from.at).toFixed(0) };
    device.stopPauses.push(pause);
    uiLocked = false;
    if (from.screen === "tutorial") { startPractice(); return; }               // 画面の見方・操作の練習の途中で終了していた → 説明の最初から (2026-09-12)
    if (from.screen === "ratingTut" && trial) { beginRating(from.resume && from.resume.rating); return; }
    if (from.screen === "guidedintro") { showGuidedIntro(); return; }
    if (from.screen === "task") { presentStimulus(from.resume); return; }
    if (from.screen === "rating" && trial) {
      trial.stopPause = pause;
      if (from.resume && from.resume.monitors) restoreMonitors(from.resume.monitors);
      beginRating(from.resume && from.resume.rating); return;
    }
    if (from.screen === "notice" && from.resume) {
      showStopNotice(from.resume.noticeKind); noticeShownAt -= from.resume.noticeElapsedMs || 0; saveBackup(); return;
    }
    if (from.screen === "practicecheck" && from.resume?.practiceCheck) { showPracticeCheck(from.resume.practiceCheck); return; }
    if (from.resume) resumeStage = from.resume.stage;
    show(from.screen);
    saveBackup();
  }, { passive: true });
  let copyStatusTimer = null;
  $("ccodeCopy").addEventListener("click", async () => {
    const code = device.completionCode || ""; if (!code) return;
    const status = $("ccodeCopyStatus");
    if (copyStatusTimer) clearTimeout(copyStatusTimer);
    status.textContent = "";
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(code); copied = true; }
    } catch (_) {}   // Clipboard API が使えない場合は選択してコピー
    if (!copied) {
      const r = document.createRange(); r.selectNodeContents($("ccode"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { copied = document.execCommand("copy"); } catch (_) {}
      if (copied) sel.removeAllRanges();
    }
    status.textContent = copied ? "コピーしました" : "コードを長押ししてコピーしてください";
    if (copied) copyStatusTimer = setTimeout(() => { status.textContent = ""; copyStatusTimer = null; }, 2200);
  }, { passive: true });
  $("postSubmit").addEventListener("click", () => {
    if ($("postSubmit").disabled) return;   // 未完了 (grip / 事後アンケート必須) なら無視
    if (HAS_RATING_BLOCK) {
      device.survey = { problems: survey.problems.slice(), problemPages: survey.problemPages.map(page => page ? page.slice() : null), ease: survey.ease, free: survey.problems.includes("other") ? survey.free.trim() : "", comment: survey.comment.trim() };
    }
    if (POST_ON) { device.post = {}; for (const k of POST_KEYS) device.post[k] = post[k] == null ? null : post[k]; }
    device.postMs = postShownAt != null ? +(performance.now() - postShownAt).toFixed(0) : null;
    finishSession();
  }, { passive: true });

  // 自動検証用フック (?debug=1 のときだけ露出。本番動作には影響しない)
  if (debugMode) {
    window.__pilot = {
      resetStoredForTest: async () => {
        if (!["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) return;
        discarding = true;
        for (const entry of sessionStore.all()) if (await sessionStore.lock(entry.id, tabOwner)) { sessionStore.remove(entry.id); await sessionStore.unlock(entry.id, tabOwner); }
      },
      storeReady: () => storeReady && recoveryBooted,
      storedSessions: () => sessionStore.all(),
      buildPayload,
      recordCount: () => records.length,
      activeScreen: () => (document.querySelector(".screen.active") || {}).id,
      uiLocked: () => uiLocked,
      hasBackup: () => loadBackup() != null,
      block: () => CONFIG.block,
      ratingsOn: () => CONFIG.ratings,
      ratPage: () => ratPage,          // 評定のページ (0=迷い / 1=自信。2026-09-08)
      ratTut: () => tutActive(),       // 評定チュートリアル中か (validate.js の判定用。同期値)
      helpState: () => ({ drag: DragTut.state(), rating: { index: tutIdx, review: !!ratingReview, lockRemainingMs: Math.max(0, ratLockUntil - performance.now()) } }),
      instructedOn: () => INSTR_ON,    // 教示誘導ブロックの有無 (2026-09-09)
      stopNoticeText: () => STOP_NOTICE_TEXT,
      noticeText: (k) => NOTICE_TEXTS[k],
      // 行動ゲートの検証用 (validate.js が練習で正解側を狙う/ゲート状態を確認するのに使う)
      phase: () => phase,
      streak: () => streak,
      correctSide: () => (cell && (cell.correctSide || cell.betterSide)) || null,
      coachVisible: () => coachEl.className !== "",   // チュートリアルパネルの表示状態 (本番=false を検証)
      // 環境音モニタの検証用 (?mic=mock と併用。§6-6 項10)
      micMode: () => MIC.mode,
      setMicLevel: (db) => { MIC.mockDb = db; },
      dropMic: () => micLost(),
      micState: () => ({ acquired: MIC.acquired, lost: MIC.lost, drops: MIC.drops, ambientDb: MIC.ambientDb }),
      // 対面セッションの検証用 (§6-6 項15)
      stopVisible: () => $("stopBtn").classList.contains("on"),
      zoomGuard: () => $("zoomGuard").classList.contains("show"),   // 文字サイズ・拡大のガード (validate.js)
      measureZoom: () => measureZoom(),
      trialIndex: () => trialIndex,
      outboxCount: () => outboxLoad().length,
      outboxClear: async () => { for (const e of outboxLoad()) { if (await sessionStore.lock(e.id, tabOwner)) { if (e.id === device.sessionId) discarding = true; sessionStore.remove(e.id); await sessionStore.unlock(e.id, tabOwner); } } outboxRender(); },
      // 中断からの再開 (§6-6 項17) の検証用
      resumeOffered: () => resumeOffered,
      recoveryState: () => JSON.parse(JSON.stringify(resumeState())),
      recoveryCheckpoint: () => saveBackup(),
      recoveryReady: () => storeReady,
      recoveryStartMain: () => { dragTutState.done = true; ratingTutorialDone = true; device.participantId = "synthetic-recovery"; startMain(); },
      mainElapsedMs: () => getMainElapsedMs(),
      uploadUrl: () => CONFIG.uploadUrl,
      backdateBackup: (ms) => {   // チェックポイントの中断時刻を ms だけ過去にずらす (3時間超の判定を検証)
        try { const b = loadBackup(); b.interruptedAt = new Date(Date.now() - ms).toISOString();
          sessionStore.checkpoint(b, location.search); discarding = true; } catch (_) {}
      },
      noiseSamples: () => noiseAcc.n,   // 現在の試行窓のサンプル数 (ミュート中は増えないことの検証)
      muteMic: (on) => {   // ミュート状態の模擬 (mic=mock と併用。1.5秒超のミュートとして扱わせる)
        if (on) { MIC.muted = true; MIC.mutedAt = performance.now() - 5000; MIC.muteCount++; } else { MIC.muted = false; }
      },
    };
  }

  // ===== 確認モード ?go= (開発専用): 該当画面へ直行 (2026-09-06) =====
  if (GO) {
    $("pid").value = "check"; $("age").value = "30"; $("devModel").value = "check";   // ダミーの事前アンケート
    device.sex = "na"; device.handedness = "right";
    captureIntro();
    const badge = document.createElement("div"); badge.id = "goBadge";
    badge.textContent = "確認モード（送信しません）: " + GO; document.body.appendChild(badge);
    const tutorialCell = () => makeTutorialCell(); // 例の1問 (startPractice と同じ内容)
    const ratingAt = (withTutorial) => {   // 例の1問を答えた直後の評定画面を作る
      dragTutState.done = true; ratingTutorialDone = !withTutorial; phase = "practice"; streak = 0;
      queue = BLOCK.buildPractice(CONFIG.practiceTrials);
      cell = tutorialCell();
      trial = { phase: "tutorial", block: CONFIG.block, stimulusType: BLOCK.stimulusType, ...BLOCK.trialMeta(cell),
        choiceSide: "left", correct: null, ratings: { confidence: null, hesitation: null }, events: [], aborts: 0 };
      sizeCanvas(); beginRating();
    };
    const jump = {
      tut: () => startPractice(),                       // 操作説明 → 例の1問 → 評定の説明 → 練習 (→ 本番へ続く)
      exampleintro: () => { dragTutState.done = true; showGuidedIntro(); },
      task: () => { dragTutState.done = true; ratingTutorialDone = true; phase = "main";
        queue = ATTN_ON ? insertDqs(BLOCK.buildMain()) : BLOCK.buildMain(); totalMain = queue.length; trialIndex = 0;
        mainStartedAt = performance.now(); cell = queue.shift(); sizeCanvas(); presentStimulus(); },
      rtut: () => { ratingAt(true); const step = Number(QS.get("rtstep")); if (QS.has("rtstep") && Number.isInteger(step) && step >= 0 && step <= 4) showRatingExplanationPage(step); },
      rating: () => ratingAt(false),                    // 通常の評定画面
      practicecheck: () => {
        dragTutState.done = true; ratingTutorialDone = true; phase = "practice";
        queue = BLOCK.buildPractice(CONFIG.practiceTrials); cell = queue.shift();
        trial = { phase: "practice", block: CONFIG.block, previewOnly: true, ...BLOCK.trialMeta(cell), ratings: { hesitation: { value: 3 }, confidence: { value: 3 } }, events: [] };
        records.push(trial);
        showPracticeCheck({ keys: ["early", "late", "release"], checked: [], recordIndex: records.length - 1, elapsedMs: 0 });
      },
      instructed: () => {
        if (CONFIG.block !== "moral") loadBlock("moral");
        // この確認専用入口では本番を省略する。通常の水準別選出に必要な項目情報だけを用意する。
        for (const previewCell of BLOCK.buildMain()) records.push({ phase: "main", block: "moral", previewOnly: true, ...BLOCK.trialMeta(previewCell) });
        dragTutState.done = true; ratingTutorialDone = true; phase = "main";
        showInstructedIntro();
      },
      post: () => { phase = "main"; showPostQuestions(); },   // 最後のアンケート (完了で完了画面へ)
      done: () => { phase = "main"; finishSession(); },       // 完了画面 (完了コード・保存ボタン)
      break: () => { dragTutState.done = true; ratingTutorialDone = true; phase = "main";
        queue = ATTN_ON ? insertDqs(BLOCK.buildMain()) : BLOCK.buildMain(); totalMain = queue.length; trialIndex = CONFIG.breakEvery || 20; cell = queue.shift(); sizeCanvas(); showBreak(); },   // 本番と同じ 53 問 (DQS 込み。2026-09-27)
      micgate: () => showMicGate("precheck"),           // 環境音チェック (マイクは実物)
      notice: () => { dragTutState.done = true; ratingTutorialDone = true; phase = "main";   // 案内画面 (遅い初動)。「次へ」で本番の課題画面へ (2026-09-26)
        queue = ATTN_ON ? insertDqs(BLOCK.buildMain()) : BLOCK.buildMain(); totalMain = queue.length; trialIndex = 3; cell = queue.shift(); sizeCanvas(); showStopNotice(["early", "late", "early_late"].includes(QS.get("notice")) ? QS.get("notice") : "late"); },
      sending: () => { phase = "main"; finishSession(); sendUiStart(1); $("exportRow").style.display = "none"; $("uploadStatus").textContent = ""; },   // 送信中の画面 (見た目の確認用。送信はしない。本番と同じく保存ボタンは出さない)
    };
    if (BLOCK.stimulusType !== "text-choice" && GO !== "micgate" && GO !== "done") {
      badge.textContent += " (block=moral/value で使う)";
    } else if (jump[GO]) jump[GO]();
    else badge.textContent += " (不明。tut / task / rtut / rating / instructed / post / done / break / micgate / notice / sending)";
  }

  // 本番中のうっかり更新・離脱への確認ダイアログ (PC ブラウザ向け。iOS Safari は表示しないが害はない。§6-6 項17)。
  // 完了後 (exportedAt あり) と練習中は出さない。kiosk の「つぎの人にわたす」は完了後なので出ない
  window.addEventListener("beforeunload", (e) => {
    if (discarding) return;
    const pending = storeReady && sessionStore.read(device.sessionId)?.state === "queued";
    if (!pending && (!["main", "instructed"].includes(phase) || device.exportedAt)) return;
    e.preventDefault(); e.returnValue = "";
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && !discarding && (mainStartedAt != null || device.introCompletedAt || device.consent) && !sessionFinished) saveBackup(); });
  window.addEventListener("pagehide", () => {
    if (storeReady && !discarding) saveBackup();
    try { suspendedRevision = sessionStore.read(device.sessionId)?.revision || null; } catch (_) {}
    storeReady = false;
    // Keep the Web Lock until document destruction (or bfcache resume). Releasing it
    // while the Worker still commits a checkpoint would permit a stale second writer.
  });
  window.addEventListener("pageshow", async (e) => {
    if (!e.persisted || GO) return;
    try {
      if (!await sessionStore.lock(device.sessionId, tabOwner)) throw new Error("SESSION_BUSY");
      const revision = sessionStore.read(device.sessionId)?.revision || null;
      if (revision !== suspendedRevision) { discarding = true; location.reload(); return; }
      storeReady = true;
    }
    catch (err) { storageProblem(err); }
  });
  initRecovery();

  window.PilotRuntimeGuards.installTouchGuards({ surface });
})();
