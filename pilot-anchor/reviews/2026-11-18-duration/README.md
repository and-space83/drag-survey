# 所要時間と同意文の版ラベル（UI32）

状態: 公開済み。SSOT本体 `82cb54d` を公開リポジトリの `3fee4f3` へ反映した。通常URLの30配布資材が現行ソースと一致することをGETだけで確認した（[公開照合記録](publication.json)）。

## 変更範囲

- 最初の「所要時間と回答のペース」を「全体で30〜50分ほどかかります。」へ変更した。
- 同意説明の所要時間を「全体で30〜50分ほどを見込んでいます。」へ変更した。その他の説明本文・氏名・質問・課題数・保存条件・参加URLは変更していない。
- 同意末尾の表示ラベルを「説明文の版」から「同意文のバージョン」へ変更した。保存項目名 `documentVersion` は維持する。
- `appVersion`・`INSTRUCTION_VERSION` は `2026-11-18-ui32`、新たに同意する説明本文は `documentVersion: 2026-11-18-v5`。`js/app.js` と `consent.js` のキャッシュ識別子も更新した。

この範囲表記は本人が指定した募集・案内の変更で、全参加者の実測分布を検証したという記録ではない。原本・完了コードが未提供の実機操作を、保存原本照合済みとして扱わない。

## 開始済みセッションと同意

`doResume()` は保存済みの `device` を復元し、開始時の `appVersion` と同意の全文・版・日時を保持する。`showConsent()` は同意済みならその保存済み本文を表示し、`consentPayload()` も同じ同意を送る。送信待ちのA/Bは保存したpayloadを再送する。GASは元同意との全文一致を確認するため、受領済みの旧同意を新しい本文へ置き換えて送らない。

更新後に新しく同意する場合はv5を使う。同意前のチェックポイントから再開する場合も、同意がまだ作られていなければ新本文を読む。既に同意済みのセッションに自動で再同意を要求する変更ではない。

公開の途中で再読込すると、その後に表示した説明のログは新しい `INSTRUCTION_VERSION` になる。開始時の版を新しい版へ書き換えず、表示版の記録と区別する。Rの完了連絡前に公開更新を行ったため、実際の使用版と表示版の混在の有無は原本で確認する。UI31の実機N/RをUI32の実機・原本確認済みとは読み替えない。今回、復元の同一クエリ・3時間の条件や保存形式は変更していない。

## 画面確認

- [固定ページの所要時間](../2026-10-12-session-explanations/index.html#welcome-2)
- [固定ページの同意説明](../2026-10-12-session-explanations/index.html#consent-top)
- [固定ページの同意末尾](../2026-10-12-session-explanations/index.html#consent-end)
- [現行の3サイズ一覧](../../screen-gallery/index.html)

固定ページは既存の生成器で現行画面を再撮影し、変更前の比較基準を保持する。旧screen-mapは過去の撮影資料として残し、この記録と現行3サイズ一覧へのリンクを追加した。日付付きの過去レビュー・公開一致記録は書き換えない。

## ローカル検証

参加者原本を使わず、合成データと模擬GASで検証した。本番GASへの送信はしていない。新しいテストケースは追加せず、既存の `test-consent-copy.cjs` の期待版と表示ラベルを更新した。

| 既存検証 | 結果 |
|---|---|
| `test-consent-copy.cjs` | 6件通過。新本文表示、旧同意全文・版・チェックポイント保持、A/B保存・結合・再送、旧同意の置換拒否 |
| `test-consent.cjs` | 9件通過。同意の保存・不変性・日付・大容量合成データ等 |
| `test-recovery-storage.cjs` | 34件通過。再訪時の同コード・保存状態、再開・BFCache等 |
| `test-staged-delivery.cjs` | 7件通過。オフライン保持・A→B順序・固定した再送等 |
| `test-staged-collector.cjs` | 7件通過。依存するcollectorの22件も通過 |
| `test-refactor-contract.cjs` | 10件・30配布資材を通過。意図した版・同意文と既承認のUI31マークアップに契約fixtureを更新 |

配布契約検査の最初の実行はローカルHTTPへの接続が環境に拒否された。ローカル通信を許可した実行で10件すべてを確認した。外部サービスへの通信は行わない検査である。

固定ページは4サイズの504枚・2,025検査を通過し、確認ページの8表示検査も通過した。現行の3サイズ一覧は254画面・762枚を再撮影し、83検査を通過した。両資料の30配布資材ハッシュは現行ソースと一致し、外部送信はなかった。miniの所要時間画面と同意末尾を目視し、改行・はみ出しに問題がないことも確認した。

アプリの版を変えたため、固定ページと一覧は既存の生成器で全体を再撮影した。変更した文言以外にも、アニメーションの描画時刻・合成完了コード等の差分がある。撮影前の比較基準・承認状態・過去の公開一致記録は保持した。使用コマンド:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/watal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node tools/pilot-anchor/refresh-explanation-review.cjs
node tools/pilot-anchor/screen-gallery/capture-flow.cjs
node tools/pilot-anchor/screen-gallery/capture-branches.cjs
node tools/pilot-anchor/screen-gallery/build.cjs
node tools/pilot-anchor/screen-gallery/verify.cjs
```

公開状態の更新では、撮影済み504枚を `refresh-explanation-review.cjs --from` で再利用した。screen-galleryも既存画像から再生成し、通常URLの[一覧用公開照合記録](../../screen-gallery/data/publication.json)を反映した。比較基準と承認記録は変更していない。

合成画面の確認はSafari実機の代替ではない。本人から提供されるN/Rのコード・実施日時と保存原本の照合は別に行う。Rで実際に使った版と公開更新前後の表示版が混在したかは、原本受領後の確認待ちである。旧同意を保持する仕様・検証結果は上記のとおり。
