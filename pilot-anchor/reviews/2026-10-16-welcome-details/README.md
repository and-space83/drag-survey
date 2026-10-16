# 「はじめに」の表示と本番の注意（ui24）

ui24の履歴。現在の「はじめに」7枚への分割・復習ボタン・読む速さの配置は[ui25](../2026-10-16-reading-and-review/index.html)を参照。

本番反映済み。[全27ファイルの公開照合](publication.json)、[回帰確認の範囲](regression.json)、[比較サイトの操作検査](review-ui-results.json)を参照する。実機Safariは未確認。

[比較ページ](index.html)で「はじめに」6枚と本番の注意3種類を375×700・402×759・440×841の3サイズ、変更前ui23・変更後ui24で比較する。

共通タイトルとページ番号を説明BOX左上、丸ぽちを右下へ移動し、氏名とデータの取り扱いは元の3段落へ戻す。本番の注意は、前問の観測事実を画面タイトル直下・ルールカードの前に置き、文字を大きくする。BOX中心・ナビ・確認条件・保存処理と、観測事実の文章・注意の発生条件・種類別上限は維持する。

`results.json`は実アプリの表示・進行・記録・保存復帰の検査。撮影・同意の送信試験は架空のデータとlocalhostの模擬受け口のみを使用し、iPhone Safari実機の検証とは区別する。

`before/capture.json`はui23の既存撮影と全27配布資産が一致することを確認した比較基準。`build-review.cjs`は前後の配布資産・最新QA・前画像のハッシュ・参照画像を照合し、不一致なら停止する。変更前は再撮影しない。

再生成は`BEFORE_ROOT`にui23配布一式、`AFTER_ROOT`にui24配布一式を指定し、`node build-review.cjs`を実行する。既定のローカル固定コピーは`_work/intro-cards-after`と`_work/welcome-details-after`。

最新の全画面は [画面一覧](../../screen-gallery/index.html)、全説明の固定確認先は [説明レビュー](../2026-10-12-session-explanations/index.html)。
