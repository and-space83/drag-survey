# drag-survey

修論研究「モバイル入力ダイナミクスから調査回答の確信度を推定する」の実験アプリ群。各アプリは単一の静的HTMLで完結し、サーバ依存はない。研究全体のドキュメント・解析計画・先行研究調査は別リポ (private) で管理。

ランディング (一覧表示): <https://and-space83.github.io/drag-survey/>

## アプリ一覧

| 名前 | 用途 | URL |
|---|---|---|
| [pilot-anchor/](pilot-anchor/) | **Stage 1 + Stage 2**: ブロック駆動の reach-decision 課題 (①アンカー / ②価値・選好 / ③道徳ジレンマ / ②③統合+注意チェック。`?block=` で切替)。詳細は [pilot-anchor/README.md](pilot-anchor/README.md) | <https://and-space83.github.io/drag-survey/pilot-anchor/> |
| [sampling-rate-test/](sampling-rate-test/) | タッチ実効サンプリングレート計測ツール (取得系 60Hz floor の設計根拠を実機検証するため使用 = 2026-05-29 完了) | <https://and-space83.github.io/drag-survey/sampling-rate-test/> |

Stage 2 (②価値・選好 / ③道徳ジレンマ / ②③統合セッション) は pilot-anchor の**ブロック駆動** (`?block=value|moral|combo`) として実装済み (新ディレクトリは作らない方針に変更)。

## 構成

```
drag-survey/
├── README.md            このファイル
├── index.html           ランディング (アプリ一覧へのリンク)
├── serve.js             ローカル LAN 開発用静的サーバ
├── pilot-anchor/        Stage 1 アプリ + README
└── sampling-rate-test/  取得系計測ツール
```

## ローカル開発

リポ root で起動するとリポ全体を `:8000` に配信:

```sh
node serve.js
# http://127.0.0.1:8000/                       → ランディング
# http://127.0.0.1:8000/pilot-anchor/          → pilot-anchor
# http://127.0.0.1:8000/sampling-rate-test/    → sampling-rate-test
```

同 wifi のスマホからも LAN IP で開ける。HTTPS が必要な実機テストは GitHub Pages を使う。
