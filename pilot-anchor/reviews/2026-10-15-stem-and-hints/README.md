# 問題文・操作の注意・説明と見本の比較

[比較画面](index.html) と [回帰検証結果](results.json)。Chromeのタッチ表示で375×548・375×700・402×759を確認しています。iPhone Safari実機での確認とは区別します。

- 問題文の角丸、本人操作の2種類の注意、通常課題の部品寸法と座標・時刻の記録を比較します。
- 「選択肢の枠内で離す」「3秒以内にスタートの枠を出る」は説明→図→進むボタンの順に配置します。
- 3秒の実演は接触前300ms、接触と枠外の緑表示、次のループでの消去を実際のアニメーションでも観測します。
- 横向きでは縦に戻す案内を優先し、キーボードによる高さ変化と区別します。[横向き判定の検証](./orientation-results.json) と [再生成テスト](./test-orientation.cjs) も保存します。
- 静止サンプル画像は製品と同じ `createTimeDemo` の `capture/sample` を使用します。問題文の強調は同じ位相で静止しています。

本体333項目・42画像の結果に加え、[動きを減らす設定の検証](reduced-motion-results.json)（33項目・6画像）と [再生成スクリプト](test-reduced-motion.cjs) を保存します。[範囲見本のリサイズ確認](range-resize-results.json) は、リサイズ処理後だけを観測する48項目の追加検証です。

[全体回帰検証](full-validation-results.json) は889項目が通過し、実行前後の14資産が一致しました。[横向きの変更前](shots/orientation-before-800x400.png) と [変更後](shots/orientation-after-800x400.png) は同じ縦基準のscreen寸法で比較しています。[確認用サイトの保存・同意・再開](device-lab-latest-results.json) は最終コピーで82項目が通過し、実際の回収先へは送信していません。

## 再生成

Node.jsとPlaywright、Chromeが必要です。必要に応じて `PLAYWRIGHT_MODULE` にPlaywrightのモジュールパス、`CHROME_PATH` にChromeの実行ファイルを指定します。

```powershell
node tools/pilot-anchor/reviews/2026-10-15-stem-and-hints/test-stem-and-hints.cjs
node tools/pilot-anchor/reviews/2026-10-15-stem-and-hints/test-reduced-motion.cjs
# リサイズ部分だけを再確認する場合
$env:STEM_RANGE_ONLY = '1'
node tools/pilot-anchor/reviews/2026-10-15-stem-and-hints/test-stem-and-hints.cjs
Remove-Item Env:STEM_RANGE_ONLY
```

変更前の14資産は初回にリポジトリ直下の `_work/rounded-stem-hints/before-app` へコピーしました。この作業フォルダがない環境では、テストが基準コミット `e2c0219db650decb66fd236d5f3b827baca0c765` の `tools/pilot-anchor/` から `git show` で不足ファイルを取得します。別の取得先は `BEFORE_ROOT` で指定できます。各資産のハッシュは結果の `beforeSource` に記録します。

測定には localhost の新しいブラウザ領域と `go`・`debug=1`・`upload=0` を使います。参加者の回答や本番の保存領域、実際の回収先を使用しません。初回ui20の検証は既存の `guided-release/verification.json` の `source/tests` に残し、この変更の証拠は同ファイルの `latestPatch` へ追加します。
