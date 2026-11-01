# UI30：追加課題の初回待機と指示の再掲

2026-11-02承認。実行版・説明版 `2026-11-02-ui30`、共通本文 `instructed-explanation-v3`。

[送信しない確認用アプリ](https://and-space83.github.io/drag-survey/pilot-anchor/?block=moral&upload=0&go=instructed&v=20261102ui30) / [画面比較](index.html) / [固定の確認ページ](../2026-10-12-session-explanations/) / [UI29の記録](../2026-11-02-instructed-explanation/README.md)

2枚目の操作説明の直後にも、**「問題文も選択肢も読まずに、適当に指を運んでください。」**を加えた。開始時と課題中で同じ本文を使用する。

開始時の各ページを最初に見るときだけ、既存の `reading-policy.js` の `minReadMs` を本文カード全体に適用する。早押しすると進まず、ボタンに「読んでから次へ」と表示する。既表示ページに「前へ」で戻ったとき、そのページから再び次へ進んだとき、同じ説明の保存状態から再開したときには待機を繰り返さない。課題中の任意の見直しも待機なし。3秒の初動判定、通常課題・練習の読解条件は変更していない。

`device.instructedIntroVisits` に定義の版・問数・既表示ページを保存する。説明の表示履歴には再訪かどうかと最低表示時間、既存の `explanationTelemetry` には待機残時間・早押し・進行結果を記録する。表示・滞在・待機満了を読了や理解の証明とは扱わない。旧版の本文定義は履歴へ保持する。

## 検証と公開

- [専用ブラウザ検証](results.json)：88件成功。4サイズで本文・ボタンの収まり、早押しの拒否、待機満了後の進行、前へ／再訪／再開の待機なし、課題中の同じ本文と待機なしを検証。
- [回帰検証](core/results.json)：72件成功。49問の完走、旧10問版の再開、旧10問での説明の問数、残り48問からの再開、注意チェックの扱いを確認。
- 起動56件、説明コントローラー8件、配布契約10件を確認。
- 全画面の撮影・固定確認ページ・画面地図は今回の版へ更新する。Chromeのタッチ端末エミュレーションによる自動検証であり、UI30のSafari実機操作は未確認。
- 公開状態は [配信照合](publication.json) と [公開アプリの操作確認](public/results.json) に記録する。個人Notionはローカル接続を利用できず未同期。元のClaude Artifact自体は更新していない。

再実行：`test-instructed-explanation.cjs`、`test-ui28-core.cjs`（`OUTPUT_DIR` を本レビューの `core` に指定）。`PLAYWRIGHT_MODULE` はPC上のPlaywrightパスを指定する。
