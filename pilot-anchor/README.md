# pilot-anchor (Stage 1)

数値サイズ一致性課題 (Ouellette Zuk, 2025) のリーチデシジョン版。修論研究「モバイル入力ダイナミクスから調査回答の確信度を推定する」の **Stage 1 (装置妥当性確認)** = 取得系が先行研究の効果を再現するかを確認するためのアンカー課題。

**公開URL**: <https://and-space83.github.io/drag-survey/pilot-anchor/>
リポ全体のアプリ一覧は [../README.md](../README.md) を参照。

## このアプリの目的

研究全体の主問いは「ドラッグ軌道から各設問への主観的確信度を機械学習で予測できるか」。本アプリはその前段で、**「Web × モバイル × ドラッグ」という取得系が、先行研究で確立した『難易度 → 運動指標』の効果を再現するかを実機で確認**するためのもの。アンカー課題は客観難易度が既知なので、本実験の本筋 (主観確信度予測) に進む前の妥当性確認として使う。

主観評定 (自信・迷い・難しさ) はアンカー課題では取得しない方針（タスクの性質上、確信度は構成的に変動しないため）。評定は Stage 2 ブロック (価値・選好 / 道徳ジレンマ) で再有効化する想定で実装は残してある (`CONFIG.ratings`)。

## 参加者の動作

1. スマートフォンで URL を開く（アプリインストール不要）
2. 任意: 参加者 ID を入力
3. 練習 6 試行 (正誤フィードバックあり) → 本番 84 試行 (約 4 分)
4. 各試行: 下中央の START に指を置く → 数が大きい方のボックスへ**指を離さず**ドラッグ → 離す
5. 完了画面で**データは自動送信**される (「✅ 送信完了」表示)。参加者の追加操作は不要
   - 自動送信に失敗した場合のみ「データを保存 (JSON)」「データを送る (共有)」ボタンが現れ、手動で研究者に送れる (LINE / メール / Drive)
   - 中断後に再訪すると、前回データの保存ボタンが intro 画面に出る

## 記録されるデータ (1試行あたり)

- **Pointer Events 列**: `pointerdown` / `pointermove` / `pointerup`、raw `event.timeStamp`、surface 相対座標、Android Chrome の `getCoalescedEvents` 含む
- **試行メタ**: 数値ペア・congruency・大きい数の左右位置・選択結果・正誤・RT/MT/total の proxy
- **端末情報**: UA・画面サイズ・DPR・推定リフレッシュレート
- **geometry スナップショット**: 試行ごとの START / 選択肢 / surface 位置 (空間正規化用)
- **実効サンプリングレート**: `dt>0` ガード付き

完全な data spec は [`index.html`](index.html) 冒頭のコメントを参照。

## 用途別 URL 早見表

| 用途 | URL | 備考 |
|---|---|---|
| **本番 (参加者に配布)** | `https://and-space83.github.io/drag-survey/pilot-anchor/` | 練習 6 + 本番 84 試行、自動送信 ON |
| 短縮スモークテスト | `…/pilot-anchor/?reps=1&practice=0` | 12 試行のみ。**送信は ON なので Drive に届く**点に注意 |
| デモ (Drive に送らない) | `…/pilot-anchor/?upload=0` | 自動送信を止め、保存/共有ボタンを常時表示 |
| 開発・自動テスト | `…/pilot-anchor/?debug=1&upload=0` | `window.__pilot` 露出 + CSV ボタン表示 |

## 設定 (URL クエリで上書き可)

| パラメータ | 既定 | 内容 |
|---|---|---|
| `?reps=N` | 7 | セルあたり反復数 (12 セル × 7 = 84 本番試行) |
| `?practice=N` | 6 | 練習試行数 |
| `?break=N` | 0 | N 試行ごとの休憩画面 (0 で無効) |
| `?ratings=1` | 0 | 試行後の 3 項目評定を有効化 (Stage 2 で使用) |
| `?rotate=0` | — | 横向きガードを無効化 |
| `?upload=0` | — | 自動送信を無効化 (デモ・検証で Drive にゴミを送らない) |
| `?debug=1` | — | `window.__pilot` 露出 + 軌道CSVボタン表示 (自動テスト用) |

データ回収は完了時に GAS Web アプリへ自動 POST → Google Drive `pilot-anchor-data/` に保存。失敗時はダウンロード / Web Share にフォールバック。受け口の実装・デプロイ手順は private リポの `tools/pilot-anchor/gas-collector.gs` / `DEPLOY.md`。

## 課題仕様

- **刺激**: アラビア数字、物理サイズ比 2:1 (大: `--choice-w` の 22vmin、小: 11vmin)
- **数値ペア**: `1v2` / `2v8` / `8v9` (距離が小さい `8v9` がサイズ効果で最難)
- **congruency**: congruent (大きい数が物理的にも大) / incongruent (大きい数が物理的に小)
- **左右カウンターバランス**: 大きい数の左右配置を均等にして右手バイアスを統制
- **試行構成**: 2 × 3 × 2 = 12 セル × 7 反復 = **84 本番試行**

レイアウト (片手操作向け) は CSS 変数 `--choice-top` (既定 27%) と `--start-bottom` (既定 12%) で調整可。

## クロスプラットフォーム実装上の注意

- iOS は静止中 `pointermove` を出さない / Android は出す → 生記録のまま保持し後処理で扱う
- 同一 `timeStamp` の重複イベントが発生しうる → `dt>0` ガード必須
- iOS は `timeStamp` 1ms 量子化、Android は小数
- 画面サイズ / DPR が機種で大きく異なる → surface 相対座標 + 毎試行 geometry 記録
- URL バー伸縮で viewport がずれる → 全画面 fixed + surface 相対で対応
- 画面端ドラッグが OS ジェスチャと衝突 → 選択肢を端から ~6% 内側にレイアウト + `touch-action: none`
- マルチタッチ二本目は無視、early release / 短すぎ試行は再呈示

## ローカル開発

リポ root の `serve.js` がリポ全体を配信するので、root からのパスでアクセス:

```sh
node ../serve.js   # http://127.0.0.1:8000/pilot-anchor/ で開く
```

HTTPS が必要なら GitHub Pages (公開済み) を使う。

## 技術

- 単一の静的 HTML ファイル + 静的サーバスクリプトのみ。ビルドステップなし、依存ライブラリなし。
- Pointer Events API ベース。
- データ保存: ブラウザ標準のダウンロード (Blob URL)。任意で `CONFIG.uploadUrl` に POST 先を設定可能。

## 由来

- 課題: 数値サイズ一致性 (Numeric-Size Congruity)。スマホ・タブレットでの reach-decision 版は Ouellette Zuk (2025) が確立。
- 修論研究の Stage 1 として作成。研究全体のドキュメント・解析計画・先行研究調査は別リポ (private) で管理。
- 取得系 (Pointer Events / `event.timeStamp` 生記録 / `getCoalescedEvents`) は同階層の [../sampling-rate-test/](../sampling-rate-test/) から流用 (60Hz floor の設計根拠もそこで確立)。
