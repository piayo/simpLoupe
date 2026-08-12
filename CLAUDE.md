# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業するためのガイドです。

## 前提

- **応答・説明・報告はすべて日本語で書くこと。** 指示が英語混じりで来ても日本語で返す。
  コード・設定ファイル内のコメントも日本語（既存の慣習）。
- **このリポジトリで得た知見はリポジトリ内に残すこと。** マシンローカル（`~/.claude/`）に置かない。
  git で共有するため。

  | 何を | どこに |
  |---|---|
  | リポジトリの規約・手順・設計 | `CLAUDE.md` / `docs/` |
  | 進め方の好み・許可（人に紐づくもの） | `.claude/memory/` |

  **同じことを両方に書かないこと。** 二重管理になって、どちらが正か分からなくなる。

- **auto-memory の保存先を `.claude/memory/` に向けること。** これはマシンごとに1回だけ必要な設定で、
  **git では共有できません**（`autoMemoryDirectory` は仕様上、コミットされる `.claude/settings.json`
  に書いても無視されます）。クローンしたら `.claude/settings.local.json` に書いてください。

  ```json
  {
    "$schema": "https://json.schemastore.org/claude-code-settings.json",
    "autoMemoryDirectory": "<このリポジトリの絶対パス>/.claude/memory"
  }
  ```

  設定しないと知見が `~/.claude/projects/` 側に溜まり、他の人に渡りません。

## このプロジェクト

**simpLoupe** — 表示中のページを拡大して見るルーペ（拡大鏡）の Chrome 拡張機能 (Manifest V3)。
ツールバーアイコンか右クリックメニューでルーペを出し、マウスカーソルの周りを拡大表示します。
Chrome ウェブストアで公開中: <https://chromewebstore.google.com/detail/anbodbalmohikmogemapjmdodlgkegmg>

**小さい拡張です。** `src/ts/` は 1,000 行未満しかありません。着手前に全部読めます。
g-calize（同じ作者の別拡張）と規約・開発環境・ドキュメント体系を揃えていますが、規模が違うので
仕組みは意図的に簡素にしてあります（Firefox 対応を持たない、design ドキュメントが3本、など）。

## 前提: Node 24 が必須

`package.json` の `devEngines` で `node >= 24` を **error** として強制しているため、Node 22 以下では
`npm run` が一切通りません（`npm ls` すら `EBADDEVENGINES` で落ちます）。

```sh
nvm use            # .nvmrc (v24.19.0) を読む
```

うまくいかない場合は各コマンドの前に以下を付けてください。

```sh
. ~/.nvm/nvm.sh && nvm use && <command>
```

恒久的に直すなら `.claude/settings.local.json` の `env.PATH` に Node 24 の bin を入れます。
このファイルはマシン固有 (gitignore) です。auto-memory の設定と同じファイルです。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | clean → 静的ファイル copy → vite の watch ビルド (development) |
| `npm run build` | clean → version 同期 → tsc + vite → 静的ファイル copy |
| `npm run lint` | oxlint。**エラー 0 を維持すること** |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | テスト（Vitest + happy-dom） |
| `npm run test:ui` | ブラウザでテスト結果を見る。**対話的なので CI や自動実行では使わない** |
| `npm run zip` | `dist/` を `zip/${version}.zip` に固める（要 `npm run build`） |
| `npm run i18n:build` | `src/i18n/store/` から `src/_locales/` を生成 |
| `npm run i18n:check` | i18n データの検査。**CI で回している** |

**変更したら必ず `npm run lint` / `npm run typecheck` / `npm test` を通すこと。**
CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) が同じことを実行します。

## 直接編集してはいけない生成物

| 生成物 | 編集すべき場所 | 生成コマンド |
|---|---|---|
| `dist/`, `zip/` | — | `npm run build` / `npm run zip` |
| **`src/_locales/`** | `src/i18n/store/` | `npm run i18n:build` |
| `src/manifest.json` の `version` | `package.json` の `version` | `npm run build` |

`src/_locales/` は見た目がふつうの手書きファイルなので特に注意してください。
直接編集しても次の生成で黙って戻ります（CI の `i18n:check` で検出されます）。

`src/ts/i18n.ts` は**生成物ではありません**。訳の JSON を import して並べただけの対応表で、
言語を足すときは import と対応表に1行ずつ足します。書き忘れは `npm run i18n:check:ui` が検出します。

`syncVersion.js` は `src/manifest.json` を読んで `version` を差し替え、
`JSON.stringify(json, null, 2)` で**丸ごと書き戻します**。手で入れた整形は消えるので、
manifest.json はインデント2スペースのまま保ってください。

## ディレクトリ構成

```
src/
  manifest.json          MV3 マニフェスト。version は syncVersion.js が package.json から同期する
  _locales/<lang>/       ストア表示用のメッセージ (35ロケール × 2キー。生成物)
  i18n/
    store/               src/_locales/ の単一ソース (keys / locales / messages)
    ui/                  設定パネルの文言 (keys.json + <lang>.json)
  img/                   アイコン
  ts/
    i18n.ts              src/i18n/ui/*.json の対応表と T()。生成物ではない
    content-script.ts    エントリ。Web Component を body に挿す / SW との仲介
    service-worker.ts    chrome.storage の仲介、キャプチャ取得、アイコン / コンテキストメニュー
    util.ts              汎用ヘルパ (qs / dispatchEvent / delay / debounce など)
    data.ts              設定のデフォルト値
    types.ts             型定義 (Config)
    ext-simploupe/       Lit 製のルーペ本体 (Web Component)
      element.ts         ルーペの状態・canvas 描画・設定 UI (中核)
      styles.ts          Shadow DOM 内の CSS。スキン3種はここで完結している
      index.ts           re-export のみ
syncVersion.js           package.json の version を manifest.json へ同期
scripts/i18n/            i18n の生成と検査 (build-store / check-store / check-ui)
tests/                   Vitest
docs/                    設計・プラン・作業記録 → docs/README.md
work/                    Chrome ウェブストアの掲載素材（スクリーンショット、掲載文）
```

## アーキテクチャの要点

詳細は [docs/design/architecture.md](docs/design/architecture.md)。最低限おさえること:

1. **ルーペは Web Component 1個** — [content-script.ts](src/ts/content-script.ts) が
   `<ext-simploupe>` を作って `document.body` に append し、`config` と `manifest` を渡すだけです。
   Shadow DOM なのでページ側の CSS に汚されません。閉じている間も要素は残ります。
   表示は `<dialog>.showModal()`（top layer に載る）で、
   トランジションは `@starting-style` と `transition-behavior: allow-discrete` に頼っています。

2. **拡大は canvas への再描画** — `chrome.tabs.captureVisibleTab` で「見えている範囲の PNG」を
   1枚もらい、DOM に入れていない `<img>` に読ませ、マウス座標を中心に `drawImage` の9引数版で
   切り出して拡大描画します（[element.ts](src/ts/ext-simploupe/element.ts) の `drawCapture`）。
   切り出し元の座標・サイズは `devicePixelRatio` 倍します。ルーペの一辺は `160 + 80 * size` px。

3. **スクロール / リサイズでキャプチャを撮り直す** — キャプチャは静止画なので、スクロールすると
   中身がずれます。`scroll` / `resize` で `loaded = false`（＝ルーペを隠す）にしてから 100ms 後に
   撮り直します。`captureVisibleTab` には呼び出し回数の上限があるため、間引きは必須です。
   service worker 側も失敗時は前回の dataURL (`_prevData`) を返して黒画面を避けています。

4. **描画のトリガが特殊** — 画像の `onload` で `loaded = true` にしたあと、
   **`document` に合成した `mousemove` を投げて自分のハンドラを叩いています**。
   これは `CustomEvent` なので `event.x` は `undefined` になり、
   `updatePosition()` の `view.x = x ?? view.x ?? 0` というフォールバックで前回位置が使われます。
   ハンドラの型は `MouseEvent` ですが実際に来るのは `CustomEvent` です。**壊さないよう注意。**

5. **設定の保存** — content script は `chrome.storage` に直接触らず、`chrome.runtime.sendMessage` で
   service worker に委譲します。コマンドは `getConfig` / `saveConfig` / `capture` / `reset` の4つ
   （`reset` は現状どこからも呼ばれていません）。保存先は `chrome.storage.local` の `config` キー1つだけ。
   読み出し側が `Object.assign({}, defaultConfig, 保存値)` しているので、`Config` にキーを足しても
   既存ユーザーには既定値が入ります。

6. **開閉の経路は2つ** — ツールバーアイコン (`chrome.action.onClicked`) と
   右クリックメニュー (`chrome.contextMenus.onClicked`)。どちらもアクティブタブに
   `{ command: "toggleSimpLoupe" }` を送るだけで、popup ページはありません。
   ルーペ本体をクリックすると設定パネルが開きます（`toggleSetting`）。

7. **アイコンの有効 / 無効** — `chrome.tabs.onActivated` で URL を見て `chrome.action.enable/disable`
   とメニューの `enabled` を切り替えています。ウェブストア・`chrome://`・`file://` は content script を
   注入できないので無効にします（`notWorks`）。**`onActivated` しか見ていないので、同じタブ内で
   遷移したときは切り替わりません**（[docs/known-issues.md](docs/known-issues.md)）。

権限まわりの詳細は [docs/design/permissions.md](docs/design/permissions.md) にあります。

## 作業するときの注意

### 静的解析とテストでは正しさが確認できない部分がある

`captureVisibleTab` のキャプチャ、canvas の切り出し座標、`<dialog>` の top layer、
View Transition、スキンの CSS は**実際に Chrome に読み込まないと確認できません**。
見た目と座標に関わる変更をしたら必ず実機で確認してください（手順は [docs/workflow.md](docs/workflow.md)）。

### content script は既存のタブには入らない

拡張機能をインストール・再読み込みした直後、**すでに開いているタブには content script が入っていません。**
対象ページをリロードしてください。忘れると `chrome.tabs.sendMessage` が
「Receiving end does not exist」で失敗しますが、コードは `console.log` するだけなので
**ユーザーには何も起きません**（アイコンを押しても無反応に見える）。実機確認の最初につまずく点です。

キャプチャは `activeTab` の許可で撮っています。アイコン / メニューというユーザー操作を経由するので
許可が下りますが、この許可は**そのタブがナビゲートするまで**です。

### 設定のデフォルト値が2箇所にある

| 場所 | 用途 |
|---|---|
| [data.ts](src/ts/data.ts) の `defaultConfig` | service worker が保存データを組み立てるときの既定値 |
| [element.ts](src/ts/ext-simploupe/element.ts) の `@state config` | Web Component の初期値（`config` が渡る前の一瞬だけ効く） |

**現在この2つは `skin` の値が食い違っています**（`"1"` と `"2"`）。
既定値を変えるときは**両方**直してください。片方だけだと保存前と保存後で見た目が変わります。

### 保存済みのキーと値を勝手に改名しない

`Config` のキーと値は `chrome.storage.local` に入って**既存ユーザーの端末に残っています**。
`shape: "quare"`（`square` の綴り間違い）のような分かりやすい typo も、直すなら
読み出し時のマイグレーションを一緒に書いてください。型だけ直すと既存ユーザーの設定が壊れます。

一方、**内部の変数名の typo（`contenxt` など）は自由に直して構いません。**

`shape` の**表示ラベル**は `src/i18n/ui/` で `square`（正しい綴り）にしていますが、
`value="quare"` は据え置きです。**キーと値が一致していないことを承知して触ってください。**

### `console.log` は production ビルドで消える

`vite.config.ts` の terser 設定で `drop_console: true` にしているため、
`npm run build`（production）では `console.log` が落ちます。development ビルドでは残ります。
既存のデバッグ出力は**わざわざ消さないでください**（実機確認の手がかりになっています）。

### 配布物の著作権表示を消さない

同梱する lit 系（BSD-3-Clause）と `@webcomponents/custom-elements`（Polymer の BSD スタイル）は
**バイナリ配布時に著作権表示とライセンス全文の再掲を要求しています。**
上流のコメントは rolldown と minify の2段階で失われるため、
[vite.config.ts](vite.config.ts) の `BANNER_SELF` / `BANNER_THIRD_PARTY` に全文を書いて
`dist/js/*.js` の先頭に必ず入れています。**法的に要求されている表示なので消さないこと。**
依存を増やしたらここに追記します。詳細は
[docs/design/architecture.md](docs/design/architecture.md) の「著作権表示は banner で入れている」。

### 既存のコードスタイルに合わせる

**フォーマッタは意図的に入れていません。** 行数が少ないので整形は簡単ですが、
このリポジトリのスタイルには**フォーマッタが必ず壊すもの**が含まれており、
一括整形すると差分が読めなくなるうえ姉妹プロジェクト (g-calize) とも揃わなくなります。
周囲のコードに合わせてください。

- インデントは**スペース4**
- 括弧の内側にスペース: `function qs( query: string )`, `if ( !this.open ) {`
- **オブジェクトリテラルの値を縦に揃える**: `size:   2,` / `skin   : "1",`（フォーマッタが潰す）
- 短絡実行を文として使う: `tab && chrome.tabs.sendMessage(...)`, `onload && (...)`
- 内部変数・内部プロパティは `_` 始まり: `_timer`, `_prevData`, `_mousemoveHandler`
- 文字列は基本ダブルクォート
- content script と service worker は全体を IIFE で包む
- 節の区切りコメントは `// ▼ 保存: 設定` の形
- コメントは日本語

[.oxlintrc.json](.oxlintrc.json) はこれらを許可するよう設定してあります。
**規約に合わせるためだけの一括整形はしないでください。**

### JSDoc の書き方

- **`.ts` では型を書かない。** `@param {string}` のような型注釈は TypeScript と二重管理になります。
  説明が要る引数だけ `@param name 説明` の形で書きます
- **`.mjs` / `.js` では型を書く。** 型情報が他に無いので `@param {string}` まで書きます
  （`scripts/i18n/*.mjs` がその書き方です）
- **「何を」ではなく「なぜ」を書く。** シグネチャを日本語に訳し直しただけの説明は入れません
- **壊しやすい前提には `⚠️` を付け、`docs/known-issues.md` か `docs/design/` を指します。**
  既知の不具合をそのまま残している箇所は、直し方の入口をコメントから辿れるようにしてください
- `src/**/*.ts` は全ファイル冒頭に `@license` ヘッダを置きます（build で除去されるので配布物には残りません）
- 手本は [src/ts/i18n.ts](src/ts/i18n.ts) と [src/ts/ext-simploupe/element.ts](src/ts/ext-simploupe/element.ts) です

### i18n は2系統ある。混ぜないこと

| | 単一ソース | 生成物 | 誰が描画するか |
|---|---|---|---|
| (A) 設定パネルの文言 | `src/i18n/ui/<lang>.json` | なし（`src/ts/i18n.ts` が import） | **拡張機能自身** |
| (B) 説明文・tooltip・メニュー名 | `src/i18n/store/messages.json` | **`src/_locales/`** | **Chrome / ウェブストア** |

- (A) は `T( "label.zoom" )`、(B) は `manifest.json` の `__MSG_xxx__` / `chrome.i18n.getMessage()`
- **(A) を `_locales` に移さないこと。** `default_locale` が `ja` なので、未訳の言語では
  UI が日本語で出てしまいます。(A) は自前で `en` にフォールバックしています
- 言語コードは (A) が BCP 47（`zh-TW`）、(B) が Chrome 形式（`zh_TW`）。**用語も lang / locale で分けています**
- **キーは英語の原文にしないこと。** 意味的な ID（`label.zoom`）にしてあります

理由まで含めて [docs/design/i18n.md](docs/design/i18n.md) にあります。**キーや言語を増やす前に必ず読むこと。**

### 既知の問題

未修正の問題は [docs/known-issues.md](docs/known-issues.md) にあります。着手前に確認してください。

### ストア掲載文は開発者向けに書かない

`work/` はスクリーンショットと**ストアの説明欄に貼るテキスト**の置き場です。
読み手はエンドユーザーなので、ライブラリの更新・内部のリファクタリング・ビルド整備は**書きません**。
書くのは新機能と、ユーザーが気づく不具合の修正だけです。

開発者向けの記録は [CHANGELOG.md](CHANGELOG.md) に書きます。**両者の内容を混ぜないでください。**

> `work/`（リポジトリ直下）はストア掲載素材、`docs/work/`（作業記録）は別物です。紛らわしいので注意。

### ドキュメントを溜めない

`docs/plan/` のプランは**完了したら削除**します。消す前に受け皿を用意してください。

| 移す先 | 何を |
|---|---|
| `docs/work/` | **作業記録。必ず書く。** プランが消えるので、経緯が残る唯一の場所になる |
| `docs/design/` | 今後も効く設計判断。**理由まで**書く |
| `docs/known-issues.md` | 未解決のまま残る問題 |
| [CHANGELOG.md](CHANGELOG.md) | 1行 |

消したあとは**そのプランを指すリンクを直すこと**。
手順は [docs/workflow.md](docs/workflow.md) にあります。

## リリース

手順は [docs/workflow.md](docs/workflow.md) を参照。バージョンは `package.json` が正で、
`npm run build` 時に `syncVersion.js` が `src/manifest.json` へ同期します。
**manifest.json の version を直接書き換えないでください。**

ライセンスは MIT です（[LICENSE](LICENSE)）。
