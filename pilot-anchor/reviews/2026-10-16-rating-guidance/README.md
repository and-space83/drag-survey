# 本番の振り返り：外タップ時の案内と進捗

`index.html` で迷い・自信の未選択/未選択の外タップ後/選択済みの外タップ後を対象3サイズ（375×700・402×759・440×841）で確認する。画像内のボタンは操作できない。実操作の確認リンクは`go=task`・`upload=0`で1問回答して振り返りへ進む。

ui26は本番URLへ反映済み。全27配布ファイルの撮影元・公開版の一致は[publication.json](publication.json)、動作・計測・ガードなどの回帰検査は[regression.json](regression.json)を参照する。iPhone Safari実機での案内の見やすさ・指の操作は未確認。

変更前はui25のgalleryから本番の通常評定2場面・6画像を退避したもの。外タップ後や選択済み状態を旧版で個別撮影した画像ではなく、各状態の比較元として通常表示を共用する。`before/capture.json` に全文・PNGハッシュ・凍結元27資産を保存している。

変更後はgalleryの本番の迷い・自信と、各ページの未選択/選択済みの案内4場面を取り込む。`test-rating-guidance-browser.cjs` の実操作検査と撮影元27資産を照合する。参加者データと本番の収集先への送信は使わない。Chromeのタッチ操作エミュレーションであり、iPhone Safari実機の確認とは区別する。

## 生成

変更前の退避はgalleryがui25の間に一度だけ`node archive-before.cjs`で実施する。旧版へ戻して撮影し直す用途以外では再実行しない。

afterのQA出力とapp sourceを固定してgalleryを更新したら、`AFTER_QA_ROOT`にQA出力ルート、`AFTER_APP_ROOT`に凍結したapp sourceルートを指定し、`node build-review.cjs`を実行する。gallery・QA・凍結・workingの27資産と画像ハッシュ・検証合格を照合して、18画像・全文・結果を取り込む。比較UIの操作検査は`review-ui-results.json`に保存する。

このページとCSS/JSは比較資料専用で、本番アプリには読み込まれない。画面見出しと質問の表現は今回変更していない。実装・自動検証・公開照合・実機確認は区別する。

比較サイトの操作検査は`PLAYWRIGHT_MODULE`と`CHROME_PATH`をこのPCの実行環境へ指定し、`node verify-review.cjs`で再現できる。`REVIEW_WORK_DIR`で比較ページのスクリーンショットと作業用結果の出力先を指定する。本番アプリは起動せず、localhostの比較資料とPNGだけを操作する。
