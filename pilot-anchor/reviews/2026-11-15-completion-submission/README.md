# 完了コードの提出案内（ui31）

**状態: ローカル実装・検証済み。公開リポジトリのローカル作業コピーへ反映し、配布30ファイルの一致を確認済み。pushと公開配信との照合は未実施で、本人へ公開反映を確認中。**

[変更前後の3サイズ比較](index.html) ／ [コピー成功・失敗の4サイズ確認](copy/index.html)

## 変更

- 完了画面を「完了コードをコピーし、参加依頼で指定された方法で提出してください。」へ変更し、メール送信ボタンとメールリンクの生成を削除した。
- `appVersion`・`INSTRUCTION_VERSION` と `js/app.js` のキャッシュ識別子を `2026-11-15-ui31` に更新した。
- 氏名・電子同意・コードの生成/受領/復元・保存形式・標準の参加URLは変更していない。既存の `CONFIG.contactEmail` の値は保存形式の互換性のため残すが、完了画面では参照しない。

提出先は募集文で案内する。研究設計・募集条件の正本は [アプリREADME](../../README.md) から参照する。

## 確認範囲と再実行

すべてローカルの合成回答。実参加者のデータを使わず、本番へのデータ送信はしていない。Chromeのタッチ・画面寸法エミュレーションであり、Safari実機の確認ではない。

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:UI_FEEDBACK_CASES='copy'
$env:OUTPUT_DIR='C:/Users/watal/Documents/projects/paper-translations/tools/pilot-anchor/reviews/2026-11-15-completion-submission/copy'
node tools/pilot-anchor/test-ui-feedback.cjs
Remove-Item Env:UI_FEEDBACK_CASES,Env:OUTPUT_DIR
node tools/pilot-anchor/reviews/2026-11-15-completion-submission/capture-participant.cjs
node tools/pilot-anchor/test-delivery.cjs
node tools/pilot-anchor/test-recovery-storage.cjs
node tools/pilot-anchor/test-staged-delivery.cjs
node tools/pilot-anchor/test-session-store.cjs
```

- コピー検証: 18確認を通過。mini 375×700、iPhone 17相当 402×759、Pro Max相当 440×841、参考iPad 820×1180。共通文・メール操作の削除・コピー内容・成功/失敗通知の収まりを確認。クリップボードは模擬。
- 通常表示: `capture-participant.cjs` は `debug` を付けず、同意→本番1問→事後アンケート→A/B受領→コピー→同一URL再訪を合成実行する。3サイズで前後各22確認を通過。送信前のコード非表示、受領後の表示、補助保存ボタン非表示、コピー内容、再訪後の同コード表示と再送なしを確認した。既定のcollector宛要求はブラウザ内で捕捉して応答し、ネットワークへ流さない。前後の撮影条件・ソースSHA-256・検証結果は [変更前](before/source.json) と [変更後](after/source.json) に記録する。短縮設定は撮影専用で配布しない。
- 既存回帰: 送信5シナリオ、復元34検査、A→Bの段階送信7検査、保存・受領18検査を通過。コード固定、再送、受領後の同コード復元を確認した。
- 固定確認ページ: `node tools/pilot-anchor/refresh-explanation-review.cjs` により [同じURL](../2026-10-12-session-explanations/index.html) を更新。504枚・レイアウト2025確認、ソース/画像ハッシュ・各サイズ・リンク・本文の照合を通過。変更前の固定画像は保持した。
- 3サイズ一覧: `screen-gallery/capture-flow.cjs`、`capture-branches.cjs`、`build.cjs`、`verify.cjs` を順に実行し、254画面・762枚と閲覧83確認を通過。版とソースハッシュを一致させるため全体を再撮影した。生成時刻・合成コード・アニメーションの撮影時点による差分を含む。既存の全体撮影は検証用の `debug=1` を使うため、完了画面の参加者向け通常表示はこの比較ページを参照する。
- 旧 `screen-map` は2026-10-09fの画像・撮影記録を保持し、現行確認ページへのリンクをREADME・テンプレート・既存HTMLに追加した。古いソース記録を現在の版として再生成していない。

初回のコピー検証はlocalhostへのブラウザ接続が環境で拒否されたため、既存の `fulfill-local.cjs` でローカル資材を直接応答する方式に合わせた。送信/復元の既存VMテストは未宣言だった `explanationTelemetry` を `null` で補い、BFCacheイベントの抽出を対象の2ハンドラへ限定した。これらはテスト側の追随で、アプリ動作や既存assertionは変更していない。

## 残る確認

公開後に配信版・キャッシュ識別子を照合し、iPhone Safari実機で完了コードのコピーと参加依頼の提出先への貼り付けを確認する。再表示は既存の端末内保存条件・同一ブラウザ/同一URL・保持時間に依存し、無期限の復元を保証しない。
