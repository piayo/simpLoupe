# CHANGELOG

simpLoupe の変更履歴。

- ユーザーに見える変更は「機能」「修正」に、開発環境まわりの変更は「開発」に書く
- ストア掲載用の文面は [work/store_description.md](work/store_description.md)（利用者向け。開発の詳細は書かない）
- **完了したプラン（`docs/plan/`）はここに1行残して削除する**
- 詳しい経緯は `docs/work/` の作業記録に書く。ここは1行

> **2.0.0 より前の履歴はありません。** このリポジトリの最初のコミットが 2.0.0（2024-12-15）で、
> 1.x の記録は git に残っていません。2.0.1 / 2.0.2 の項目は当時のコミットから復元したものです。

## 未リリース

### 機能

- **設定パネル・アイコンの tooltip・右クリックメニューを多言語化した**
  日本語環境では日本語で表示されます（それまでは英語のハードコード）。
  説明文・tooltip・メニュー名は35ロケール分を生成しています（`ja` 以外は英語）

### 開発

- **開発環境を g-calize と揃えた**（記録は [docs/work/2026-08-11-align-with-g-calize.md](docs/work/2026-08-11-align-with-g-calize.md)）
  - `docs/`（設計 / 作業手順 / 既知の問題 / 作業記録）と `CHANGELOG.md` / `CLAUDE.md` / `.claude/` を新設
  - `README.md` を日本語化し、環境・コマンド・構成・ドキュメント索引を追加
  - **テストを導入**（Vitest + happy-dom、166本）。`vitest.config.ts` / `tests/`
  - **lint / typecheck を導入**（oxlint / `tsc --noEmit`）。`.oxlintrc.json`
  - **CI を追加**（`.github/workflows/ci.yml`）。lint / typecheck / i18n / test / build / zip
  - **依存を総入れ替え**（vite 5→8、TypeScript 5→7、`@types/chrome` 0.0.243→0.2.5、
    `copyfiles`→`cpy-cli`、`npm-run-all`→`npm-run-all2`）。Node 24 が必須になりました
  - `.npmrc` に `min-release-age=7`（サプライチェーン攻撃対策）
  - **i18n を単一ソース化**（`src/i18n/` → `src/_locales/` / `src/ts/i18n.ts`）。
    `src/_locales/` は**生成物になりました**
  - `zip` の出力先を `zip/${version}.zip` に変更
  - **配布物 (`dist/js/*.js`) の先頭に著作権表示を入れた**。
    同梱する lit 系 (BSD-3-Clause) と `@webcomponents/custom-elements` は再掲を要求しているが、
    rolldown と minify の2段階で消えていた
  - **`license` を `MIT` に変更し、[LICENSE](LICENSE)（MIT 全文）を追加**
    （`package.json` の `"GPL"` は SPDX として無効な値で、LICENSE ファイルも無かった）

### 修正

- **service worker のメッセージ処理で、storage が失敗すると応答が返らず
  content script が固まる問題を修正**（`new Promise(async ...)` の executor 内の例外が
  reject されていなかった）

## 2.0.2 — 2024-12-27

### 修正

- **右クリックメニューから起動できなかったのを修正**
- **サイト側の CSS でルーペ要素に `display:none` が当たると表示されなかったのを修正**
  （`:host` に `display: contents !important` を指定）

## 2.0.1 — 2024-12-22

### 変更

- 画面キャプチャの取得タイミングと失敗時の扱いを見直し
- ルーペの外観（スキンの CSS）を調整

## 2.0.0 — 2024-12-15

- **Lit の Web Component で作り直した版。** このリポジトリの最初のコミット
