# UI28の実装・検証・公開記録

2026-11-01。採用仕様の正本は研究用の非公開リポジトリで管理する。観察済みデータの改善効果を示す結果ではなく、新しい取得版の実装記録である。

実装元 `68e8294` を公開リポジトリ `66068fd` で公開し、[Pagesのデプロイ成功](https://github.com/and-space83/drag-survey/actions/runs/41303377544)を確認した。通常の公開URLで[30配布ファイルすべての一致](publication.json)を確認し、[公開URLでの操作確認](public/results.json)も通過した。iPhone Safari実機、キーボード表示中、端末からの実Drive保存原本の照合は今回未実施。

## 実画面

実機確認後の持ち方の配置補修・3秒判定の再点検は [UI28aの補修記録](../2026-11-01-ui28-followup/README.md) を参照する。以下の画像と自動検証結果は初回UI28の記録として保持する。

[持ち方・説明の画面](index.html)、[固定の説明レビュー](../2026-10-12-session-explanations/index.html)、[参加画面の一覧](../../screen-gallery/index.html)。従来の公開URLを維持する。

確認専用（送信なし）：[持ち方](https://and-space83.github.io/drag-survey/pilot-anchor/?block=moral&upload=0&go=post)、[振り返り説明](https://and-space83.github.io/drag-survey/pilot-anchor/?block=moral&upload=0&go=rtut)、[追加課題](https://and-space83.github.io/drag-survey/pilot-anchor/?block=moral&upload=0&go=instructed)。

## 実装と検証

- `test-ui28-core.cjs`：追加49問の完走・通常との同項目対応・評定なし、30字/秒の境界と100ms猶予なし、全注意チェックの読解案内抑止と遅い初動案内保持、旧10問と新49問の再開、旧版からの未表示案内の分離。[結果](core/results.json)。
- `test-ui28-layout.cjs`：14画面サイズで持ち方3状態と説明4枚、旧5択・質問定義・任意入力・再開・完了原本の保持。[147チェック・98画面](layout-results.json) と [詳細](grip-rating.md)。
- `test-explanation-telemetry.cjs` / `test-explanation-telemetry-browser.cjs`：表示/可視時間、待機中・未選択のNext、再閲覧、本文・開始前の選択肢枠タップ、移動・スクロール・長押し・有効ドラッグの除外、再開・終了後固定。[25ブラウザチェック](telemetry/results.json)、[記録形式](../../explanation-telemetry.md)。
- `test-ui28-collection.cjs`：既存GASコードをmock Driveで実行し、55+49試行・新規device項目・段階A/Bと圧縮保存の往復を確認。[保存検証](collection.json)。GAS本体・URL・保存先・プロトコルは変更していない。
- 分割資産の配布契約10件、bootstrap56件、trial-recorder、reading-policy、rating-controller13件、tutorial-controller8件、既存collector・staged-collectorも通過。配布資産は `appAssetPaths()` の30件。
- 固定の説明レビューは2,003チェック・492画面、画面一覧は253場面・759画像・83チェックが通過。3サイズで本番55問と追加49問の完走を確認し、公開版と同じソースから作成した。
- 解析側は持ち方の新旧定義、操作手、追加課題数と質問版を区別し、その他自由文と再開用下書きを仮名化出力から除外。関連148テストが通過。

実参加者のデータを公開用資産へ含めない。新規テレメトリも読了・理解・自然不注意の正解ラベル、除外や謝礼の条件には用いない。

## 適用と残る確認

2026-11-01のユーザー実機報告：振り返り説明の表示・初回待機は問題なく、同じ説明内で「前へ」に戻った既読ページの待機免除も確認できた。持ち方の「その他」はキーボード表示中に入力・一時スクロールでき、閉じると画面全体のスクロールがなくなることを確認した。一方、持ち方だけ見出し・番号・本文が上に寄る配置には修正依頼があった。追加課題の説明の2枚化・同じ49問の再提示の明示は相談中。通常問題の操作は概ね問題ないが、3秒判定の表示時点を再点検する。端末・OS・ブラウザの版は未申告であり、全端末の確認や新ログのDrive原本照合が済んだとは扱わない。

旧版で開始した追加10問は再開しても10問のまま。持ち方を旧版で既に見た場合は旧5択を保つ。開始版と実表示した教示版は別々に残す。説明ページの最低待機式は変更していない。案1の文章量が増えたため、振り返り導入1枚目の初回待機は2,691msから4,436msになる。既読ページの待機免除は保持する。

研究用の個人Notion接続はこの実行環境で利用できず、Notionへの同期は未実施。研究仕様・旧ログ監査の正本はリポジトリへ反映した。
