# ルールの復習：上端固定と内容に応じたBOXの高さ

入口は [3サイズの比較](index.html)。7問それぞれの未回答・誤答・正答を3サイズで並べ、変更前後も切り替えられます。撮影は合成操作で、参加者データを使わず外部送信を遮断します。

本番への反映は保留中です。`app/` は修正済みの27配布資産をコピーし、入口に確認専用の通信・Storage隔離を加えたものです。本番のURLや永続保存領域は使用しません。通常の公開画面一覧と固定説明レビューは本番版のまま、この比較とは分けます。

全問共通のカード高と解説用の空白は予約せず、表示する内容だけで下端を決めます。従来の最大高は、同じ上端を維持して進行ボタンと重ならない位置を計算するためだけに使います。設問・選択肢の文言、正解、進行条件、状態保存・記録は変更しません。

対象は375×700、402×759、440×841。端末の画面寸法ではなく撮影用表示領域であり、Safariのバーやセーフエリアを実機再現したものではありません。iPhone Safari実機での確認は未実施です。

`results.json` に変更前後の座標・行動・記録の検査、`review-data.js` に配布ソースと画像のハッシュがあります。変更前の画像は `before/` に固定し、更新しません。現在の全画面は [参加画面の一覧](../../screen-gallery/index.html)、説明変更の固定確認先は [説明レビュー](../2026-10-12-session-explanations/index.html) を参照します。

再撮影・生成はNode.js、Playwright、Chromeを使います。配布ファイル一式を固定した場合は `APP_ROOT` にそのパスを指定します。

```powershell
$env:OUTPUT_DIR = 'C:/Users/watal/Documents/projects/paper-translations/tools/pilot-anchor/reviews/2026-10-16-quiz-box'
node tools/pilot-anchor/test-tutorial-feedback.cjs
node tools/pilot-anchor/reviews/2026-10-16-quiz-box/build-review.cjs
```

`build-review.cjs` はQA結果と撮影元が一致しない場合に停止します。変更前画像の初回取り込みに限り、`_work/quiz-box-before-qa/` に撮影済みの基準が必要です。
