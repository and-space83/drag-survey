# 見た目以外の引き継ぎ監査

入口は [index.html](index.html)。研究データではなく、旧ui19と現行ui20の合成操作による検証記録です。静的同一性・実行検査・実機Safariを混同しません。実参加者の保存・収集先へはアクセスしません。

## 検証プログラム

Node.js / Playwright / Chromeを用います。`PLAYWRIGHT_MODULE` にこのPCで使用するPlaywrightの絶対パスを指定してください。

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/test-static-contract.cjs
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/test-data-audit.cjs
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/test-training-provenance.cjs
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/build-data-audit.cjs
```

ガードは同じ実フローのドライバーへ、TouchEventの取消・CSS・contextmenu・gesturestartの検査を追加します。格子点と表示要素の中央で実ヒット領域を取得し、画面やPointer試行を進めない合成TouchEventを使います。課題面や説明中に実CDPタッチを足すと、誘導や保持中の指を変えてしまうため除外します。非課題面の静的領域ではChromeの実ダブルタップと倍率を確認します。

```powershell
$env:AUDIT_VARIANT='before'
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/test-guard-coverage.cjs
$env:AUDIT_VARIANT='current'
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/test-guard-coverage.cjs
```

生成先は `_work/behavior-audit/guard-{before,current}/results.json`。画像は巡回ドライバーの動作確認用で、監査ページには埋め込みません。`screens`には現行の比較用別名5件を含みますが、ガード集計は実際にプローブした117状態だけです。

実タップ・入力・スクロール43項目は別に実行します。

```powershell
$env:APP_ROOT=(Resolve-Path 'tools/pilot-anchor/reviews/2026-10-15-guided-release/before').Path
$env:OUTPUT_DIR=(Join-Path (Get-Location) '_work/behavior-audit/static-before')
node tools/pilot-anchor/test-static-tap-guard.cjs
$env:APP_ROOT=(Resolve-Path 'tools/pilot-anchor').Path
$env:OUTPUT_DIR=(Join-Path (Get-Location) '_work/behavior-audit/static-current')
node tools/pilot-anchor/test-static-tap-guard.cjs
Remove-Item Env:APP_ROOT,Env:OUTPUT_DIR
node tools/pilot-anchor/reviews/2026-10-15-behavior-audit/build-audit.cjs
```

`build-audit.cjs` はこの作業用結果、データ検査、同一ソースの全体回帰889項目を照合し、失敗やソース不一致では生成を止めます。ガード詳細を `guard-*-results.json`、別の43項目を `native-*-results.json` に保存します。

確認用Siteの履歴回帰は `test-lab-history-recovery.cjs`。既存保存テスト82項目と公開照合は [lab-history.html](lab-history.html) から参照してください。Site用runtimeだけの変更で、本番14資産は変更していません。旧版のSite公開記録は `previous-lab-publication.json` に保全しています。

チェック表の再検証は既存の `test-device-checklist.cjs` を使います。`CHECKLIST_OUTPUT_DIR` をこの監査フォルダへ設定し、旧結果を上書きしません。14項目ID・版・保存キー・既存記録は維持します。`test-audit-page.cjs` はHTMLの表示・ローカルリンク・画像・集計を確認します。

この監査はSafari固有のネイティブ拡大、OSによるサンプル配送、キーボードや履歴復帰の実機確認を代替しません。今回報告されたSafariのブラウザー戻る・進むだけの経路はChromeで再現せず、別に再現した確認用メニュー経由の不具合を修正しました。
