# 学会用デモの確認

採用仕様は [experiment-design §6-7](../../../../research/sources/experiment-design.md#conference-demo-20261030)、利用URLと公開状態は [アプリREADME](../../README.md#conference-demo)。通常の研究画面を飛ばす開発用の `go` と区別する専用モード。

## 動作確認

`test-conference-demo.cjs` がChromeで実際のタッチ入力・マウス入力を送り、3問を2周する。小画面375×548、iPhone相当402×759、Android相当360×740、PC1280×900を使う。iPhone/Androidの実機試験ではない。

- 最初から第1問が表示され、3問後には軌跡・時間・評定を表示する。
- 選択肢の外で離した場合は同じ問題をやり直す。
- 迷いと自信の選択値・座標イベント・時間が結果に対応する。
- 「もう一度試す」で再実施でき、評定途中・完了後のリロードは第1問に戻る。
- `Storage`・`IndexedDB`・`fetch`・`XMLHttpRequest`・`sendBeacon`・`Worker`・マイク取得を監視する。既存研究記録を模した保存値は変わらない。
- 他用途のURLパラメータを併用しても、保存・送信・マイク取得を起動しない。

実行結果と配布ソースのハッシュは [results.json](results.json)、代表画面は [一覧](index.html)。検証は合成操作だけを使用する。

最終版の専用検証は103チェック・20画像で通過。通常アプリの画面・評定内容・既存CSS・同意・保存送信資産の不変性は `test-refactor-contract.cjs` の10チェック、起動境界は `test-bootstrap.cjs` の53チェック、計測境界は `test-trial-recorder.cjs` で通過した。

既存の全体回帰 `validate.js` は最後まで実行し、旧文言を期待するO14/確認画面の4チェックが不一致となった。現行文言は変更前HEADと同一であることを確認し、`validate-o14-feedback.js`・`validate-review-ui.js` の期待値各1箇所だけを修正した。修正後は `validate.js --o14-feedback` と `validate.js --review-ui` が全件通過した。全体を一括した再実行は行っていない。

## 残る確認

公開配信とのファイル一致を確認中。iPhone Safari・Android Chromeの実機で、画面の収まり・指の操作・結果の縦スクロールを確認する。個人Notionへの同期は未実施。
