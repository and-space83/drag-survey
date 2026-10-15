# チュートリアルと振り返りの表示調整

更新: 2026-10-16。[変更と画面](index.html)、[新規回帰の結果](results.json)を参照。対象は `2026-10-16-ui21`。

今回のユーザー所見に対応する表示・操作案内の修正。分析・除外・謝礼の基準、課題の配置・刺激・評定尺度は変更していない。実装とChromeによる自動検証が完了しても、公開反映や実機Safariの確認が済んだとは扱わない。

再実行はリポジトリ直下で行う。Node.js v24.14.1、Google Chrome、Playwrightを使用。既定探索でPlaywrightが見つからない環境では `PLAYWRIGHT_MODULE` に利用可能なモジュールの絶対パスを設定する。

```powershell
node tools/pilot-anchor/test-tutorial-feedback.cjs
node tools/pilot-anchor/test-tutorial-controller.cjs
node tools/pilot-anchor/test-trial-recorder.cjs
node tools/pilot-anchor/test-refactor-contract.cjs
```

`test-tutorial-feedback.cjs` はlocalhostのみの配信と合成操作を使い、外部送信を遮断する。実装のソースハッシュと19枚の画像を同じ実行で保存する。7問の復習の未選択・誤答・正答、3端末相当の寸法と低い画面、実演の指倍率・接触前待機・字幕、背景、振り返りの本文と丸印、初回・再確認の誘導と回答保持を確認する。

青い接触円の追加調整では、操作練習・例題・本番の直径を48pxから72pxへ統一した。中心の接触座標と選択肢の矩形判定は変更していない。表示だけの調整であり、円の半径を到達・回答成立の判定へ加えていない。到達の色変化と指を離す時の回答先は、ともにブラウザから得た接触点を `getBoundingClientRect()` の四辺を含む矩形と比較する。角丸の形状に沿う判定ではない。

[接触円の局所検証](contact-ring-results.json)は3サイズの例題・本番・純操作で298項目成功。直径・中心点の位置、4辺と4隅の内外、円だけが重なる時の未到達、枠外で離した時の不成立、枠内で離した時の回答と終点座標を確認した。証拠画像は各サイズの `contact-ring-outside.png` / `contact-ring-inside.png`。補助検証の再実行スクリプトは `_work/tutorial-feedback/contact-ring-check.cjs`。

青丸拡大前のui21では既存の再開テスト `test-guided-recovery.cjs` が[28項目成功](recovery-regression.json)、実演と計測の `test-guided-release.cjs` が[255項目成功](guided-regression.json)。進捗の `validate.js --rating-progress`、controllerの6契約、trial recorderも成功した。青丸拡大後にも配布資産の8契約を確認した。`validate.js` と `test-guided-release.cjs` にはローカルの配信サーバーが必要。刺激・計測・保存の契約用fixtureは、旧版と比較して変更した版名とスタイルのハッシュだけを更新している。

全画面を確認する[固定の説明確認ページ](../2026-10-12-session-explanations/index.html)と[参加画面の一覧](../../screen-gallery/index.html)は現行ソースから再生成し、本文・画像・ソース一致の検査も成功した。更新方法は[アプリREADME](../../README.md#画面確認資料の更新)に従う。過去の比較基準は保持している。

2026-10-16に公開反映済み。正本の実装コミットは `ab4c831`、公開リポジトリの実装コミットは `2e593d8`。[公開照合記録](publication.json)で通常URLの21配布ファイルすべてが一致している。本人のiPhoneでの指の見え方、1秒の間、誤答時とページ移動時の操作感、初回と本番からの説明見直し時の誘導は実機未確認。

[公開ブラウザの確認](public-browser-results.json)も35項目成功。公開URLの新規touch contextで、送信・外部要求を遮断して実施した。実機Safariの確認とは区別する。
