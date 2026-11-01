# UI28の説明・操作観測ログ

保存先は最終JSONと途中保存の `device.explanationTelemetry`、定義は `explanation-interactions-v1`。実装は `js/explanation-telemetry.js`、画面との対応は `js/app.js` の `interactionContext`。既存の `tutorialLog`、`instructionExposure`、試行、評定、待機式は保持する。表示・滞在・タップを読了、理解、未読や不注意の判定に使わない。

## 説明の訪問記録

`visits` は、はじめに各ページ、研究同意、読む速さの導入、操作説明と復習各問、例題の導入、振り返り4ページと練習導入、練習確認、本番・追加の導入、操作案内、休憩の訪問を記録する。通常の設問本文・読速測定用本文・評定回答・事後質問を説明の滞在へ混ぜない。同一ページの選択変更・描画更新では訪問を増やさず、戻る・再閲覧では別の訪問になる。

- `visit`、`screen`、`page`、`phase`、`block`、`trial`、`review`、実行中の `version`、`shownAt`。`trial` はその時点の進行文脈であり、説明を通常問題として数える番号ではない。
- `elapsedMs` は表示から最後に観測・保存した時点までの経過、`visibleMs` は当該画面が表示され文書がforegroundだった時間。backgroundの時間は前者に入り、後者には入らない。
- `initialWaitMs` はその訪問を観測し始めた時点の残り最低表示時間。読了時間の推定ではない。
- `advanceCount`、`nonInteractiveTapCount`、`status`（`open` / `closed` / `interrupted`）、`endReason`。

リロード前の開いた訪問は最後に保存された時間で `interrupted` とし、再開後は新しい訪問にする。ブラウザを閉じていた時間を表示時間へ足さない。旧版に存在しない記録を遡って作らず、再開案内の裏で初期化した新しいセッションの履歴も旧セッションへ混ぜない。

## 進む操作

`interactions` の `event:'advance'` に、ボタンID、入力種別 `source`、その訪問の `attempt`、`elapsedMs` / `visibleMs`、`remainingWaitMs`、`gateAtActivation` を記録する。未選択などでdisabledのボタンは、表示された既知の進行ボタンの領域を使って観測する。通常の活性ボタンはclickだけで記録し、同じgestureのpointerupで二重計上しない。キーボード等による活性化は `keyboard_or_programmatic` と区別する。

`outcome` は `page_changed` / `blocked` / `no_page_change`。イベント後の画面変化を照合し、`blocked` には `minimum_display`、`selection_required`、`confirmation_required`、`required_action` などの理由を付ける。観測直後にブラウザが閉じた等で結果を保存できなかった場合は `pending` が残り得る。`no_page_change` だけで拒否とは断定しない。はじめにには元々最低表示時間がなく、確認欄の未完了による制限を読書待機へ読み替えない。

## 非操作領域のタップ

説明以外も、同じ画面・問題文脈でprimary pointerのdown→upが完了し、開始位置から12px以内かつ1秒以内の場合を1gestureにつき1件記録する。scroll、pointercancel、contextmenu、複数指、12pxを超える移動、1秒を超える長押し、記録中のドラッグ、スタート・説明中の選択肢・有効な入力やリンクは除く。課題の開始前に選択肢の枠へ触れた操作は、スタート外で開始を受け付けなかった操作として含める。これは観測操作の定義で、参加者の成績・読書・不注意の閾値ではない。

- `outside_start_before_recording`：課題の開始を受け付けられる状態で、スタート以外の非操作領域に触れて離した操作。開始後の失敗操作を記録する `invalidAttempts` とは別。
- `nonInteractiveTap`：その他の本文・余白等へのタップ。「誤操作」とは断定しない。

本文、自由入力、回答値、氏名、タップ座標はこのログへ保存しない。画面ID・説明ページID、phase・問題位置、時刻・経過時間を保存する。観測のための案内やクリックの再送は行わない。

## 検証

`node tools/pilot-anchor/test-explanation-telemetry.cjs` は表示時間、foreground、通過・拒否、再描画、旧ログと旧保存の保持を確認する。`test-explanation-telemetry-browser.cjs` は実アプリをローカル資産から読み込み、Chromeの合成touchで待機、既読戻り、disabled Next、無効領域、スクロール相当の移動、キャンセル、長押し、ドラッグ、保存・再開、終了後の固定を確認する。送信は無効で、実参加者データは使わない。iPhone Safari実機の代替にはしない。
