# simpLoupe

**simpLoupe** はどんな Web ページの上でも使える、シンプルなルーペ（拡大鏡）の Chrome 拡張機能です。
拡張機能アイコンか右クリックメニューで呼び出し、マウスカーソルの周りを 2〜5 倍に拡大します。

Chrome ウェブストア: <https://chromewebstore.google.com/detail/anbodbalmohikmogemapjmdodlgkegmg>

## 使い方

1. 拡張機能アイコンをクリック、または右クリックメニューから「simpLoupe」を選ぶ
2. ルーペ本体をクリックすると設定パネルが開く（拡大率・大きさ・形・スキン・カーソル）
3. もう一度アイコンをクリックするか、`Esc` で閉じる

> インストール直後・更新直後は、**すでに開いているタブには content script が入りません。**
> 一度ページをリロードしてください。

## 必要な環境

- **Node.js 24 以降**（`.nvmrc` 参照）

`package.json` の `devEngines` で強制しているため、Node 24 未満では `npm` 自体が
`EBADDEVENGINES` で止まります（`npm ls` すら通りません）。

```sh
nvm use
npm ci
```

## 開発

```sh
npm run dev
```

`dist/` にビルドし、`src/**/*.ts` を監視して自動で再ビルドします。

`chrome://extensions` を開き、デベロッパーモードを ON にして「パッケージ化されていない拡張機能を読み込む」から
**`dist/` を選択**します。その後、確認したいページをリロードしてください。

開発からリリースまでの手順は [docs/workflow.md](docs/workflow.md) にまとめています。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 監視ビルド（development） |
| `npm run build` | `dist/` へのビルド（production） |
| `npm test` | テスト実行（Vitest） |
| `npm run test:watch` | テストの監視実行 |
| `npm run test:ui` | ブラウザでテスト結果とカバレッジを見る |
| `npm run test:coverage` | カバレッジ計測 |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run i18n:build` | `src/i18n/store/` から `src/_locales/` を生成 |
| `npm run i18n:verify` | 生成物が単一ソースとずれていないか確認 |
| `npm run i18n:check` | i18n データの検査（CI で実行） |
| `npm run zip` | `dist/` を `zip/${version}.zip` に固める |

## ディレクトリ構成

```
src/
  manifest.json     Manifest V3（version は package.json から同期される）
  _locales/         Chrome が読む言語データ（35ロケール）★生成物
  i18n/
    store/          _locales の単一ソース（keys / locales / messages）
    ui/             設定パネルの文言（keys.json + <lang>.json）
  img/              アイコン
  ts/
    i18n.ts             src/i18n/ui/*.json の対応表と T()。生成物ではない
    content-script.ts   エントリ。ルーペ要素の設置と service worker との橋渡し
    service-worker.ts   storage の仲介、画面キャプチャ、アイコン、コンテキストメニュー
    util.ts             DOM / イベント / タイマーの小道具
    data.ts             設定のデフォルト値
    types.ts            型定義
    ext-simploupe/      ルーペ本体（Lit の Web Component）
      element.ts        表示・キャプチャ描画・設定パネル
      styles.ts         Shadow DOM 内の CSS（スキン・形状）
scripts/i18n/       i18n の生成と検査
tests/              テスト
docs/               設計・作業手順・作業記録 → docs/README.md
work/               Chrome ウェブストアの掲載素材（スクリーンショット、掲載文）
```

`src/manifest.json` の `version` は `npm run build` 時に [syncVersion.js](syncVersion.js) が
`package.json` から同期します。**直接書き換えないでください。**

`src/_locales/` は `npm run i18n:build` が [src/i18n/store/](src/i18n/store/) から生成します。
**直接編集しないでください。**

## ドキュメント

| | |
|---|---|
| [docs/workflow.md](docs/workflow.md) | 作業手順（開発・実機確認・リリース） |
| [docs/design/architecture.md](docs/design/architecture.md) | 設計。どう動いているか |
| [docs/design/permissions.md](docs/design/permissions.md) | 権限と画面キャプチャ。動かないページ |
| [docs/design/i18n.md](docs/design/i18n.md) | 多言語化。2系統の違いと生成パイプライン |
| [docs/design/testing.md](docs/design/testing.md) | テスト方針 |
| [docs/known-issues.md](docs/known-issues.md) | 既知の問題 |
| [CHANGELOG.md](CHANGELOG.md) | 変更履歴 |
| [CLAUDE.md](CLAUDE.md) | AI エージェント向けのガイド |

## ライセンス

MIT（[LICENSE](LICENSE) 参照）
