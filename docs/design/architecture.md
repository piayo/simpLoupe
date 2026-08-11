# アーキテクチャ

## 全体像

simpLoupe は「**表示中のタブのスクリーンショットを1枚撮り、その一部を canvas に拡大して描く**」拡張機能です。
ページの DOM を読んだり書き換えたりはしません。CSS の `zoom` や `transform` でページを拡大するのでもなく、
**ビットマップの切り出しと引き伸ばし**だけを行います。

その結果、`<iframe>` / `<video>` / `<canvas>` / WebGL の中身も、CSS で隠された要素も、
**画面に見えているものはすべて拡大できます**。逆に「見えていないもの」（スクロールの外側、
別タブ）は原理的に拡大できません。

```
┌────────────────────────────────────────────────────────────────┐
│ どこかのタブ (http/https, トップフレームのみ)                      │
│                                                                │
│  content-script.ts                                             │
│   ├ getConfig ─────────────────────────────┐                   │
│   ├ <ext-simploupe> を document.body に追加  │                   │
│   └ toggleSimpLoupe を受けて toggle()       │                   │
│                                            │                   │
│  ext-simploupe/element.ts (Lit + Shadow DOM)│                   │
│   ┌──────────────────────────────────┐     │                   │
│   │ <dialog>  showModal() で top layer │    │                   │
│   │   └ .loupe  ← マウス追従           │    │                   │
│   │       ├ <canvas>  拡大描画         │    │                   │
│   │       ├ .parts    スキンの装飾     │    │                   │
│   │       └ .setting  設定パネル       │    │                   │
│   └──────────────────────────────────┘     │                   │
│        ▲                    │ getCapture   │                   │
│        │ img.onload         ▼              │                   │
│   view.captureImage  ◀── dataURL ──┐       │                   │
└────────────────────────────────────┼───────┼───────────────────┘
                                     │       │ chrome.runtime.sendMessage
                        ┌────────────┴───────┴──────────┐
                        │ service-worker.ts             │
                        │  capture / getConfig /        │
                        │  saveConfig / reset           │
                        └───┬───────────────────┬───────┘
                            │                   │
        chrome.tabs.captureVisibleTab   chrome.storage.local
```

## 1. ルーペ本体はページに注入する Web Component

[ext-simploupe/element.ts](../../src/ts/ext-simploupe/element.ts) は Lit の `LitElement` です。
タグ名は `ext-simploupe`（[element.ts](../../src/ts/ext-simploupe/element.ts) の `TAGNAME`）。

- [content-script.ts](../../src/ts/content-script.ts) が `document.createElement()` して
  `document.body` に append し、`config` と `chrome.runtime.getManifest()` の結果を渡します
- Shadow DOM に閉じているので、ページ側の CSS はルーペの中身に届きません
- **ページ側の CSS からルーペ要素そのものを隠される**事故はありました。対策として
  [styles.ts](../../src/ts/ext-simploupe/styles.ts) の `:host` に
  `display: contents !important` を指定しています。非表示は `:host(:not([open]))` で行い、
  `!important` を上書きしないと消えない状態にしてあります

### `<dialog>` + `showModal()` を使っている

ルーペは `<dialog>` を `showModal()` で開きます。狙いは **top layer** です。
ページ側の `z-index` がいくつであっても、必ずその上に出ます。

その代償として、`showModal()` は**ダイアログの外側を inert にします**。
つまり**ルーペ表示中はページ側をクリックできません**。`::backdrop` と `.dialog` は
`pointer-events: none` / `background-color: transparent` にしてあるので見た目は素通しですが、
操作は通りません。`.loupe` だけが `pointer-events: auto` で、クリックすると設定パネルが開きます。

`Esc` キーでダイアログが閉じると `@close` から `hide()` が呼ばれ、状態が同期されます。

## 2. キャプチャの流れ

拡大の材料は**タブの可視領域のスクリーンショット1枚**です。content script からは撮れないので
service worker に依頼します。

```
element: updateCapture()
  → "getCapture" イベント
     → content-script: sendMessage({command:"capture"})
        → service-worker: 100ms 待ってから chrome.tabs.captureVisibleTab(windowId, {format:"png"})
        → { dataURL }
     → content-script: element.view.captureImage.src = dataURL
        → img.onload: view.loaded = true → document に mousemove を発火 → 再描画
```

- `view.captureImage` は **DOM に入っていない `<img>`**（`document.createElement('img')`）。
  デコード済みの画像を `drawImage()` のソースとして使うだけです
- service worker 側で **100ms 待つ**のは、スクロール直後などページの再描画が終わる前に撮ると
  古い / 途中の画面が写るためです
- 撮り直しの契機は3つ。**マウス移動では撮り直しません**（重いため）

  | 契機 | ハンドラ | 挙動 |
  |---|---|---|
  | 表示開始 | `show()` | `loaded = false` にして撮る |
  | `window` の `scroll` | `_onscrollHandler` | `loaded = false` にして 100ms 後に撮る |
  | `window` の `resize` | `_onresizelHandler` | 同上（※関数名は既存のタイポ） |

- `loaded = false` の間、`.loupe` は `?hidden` で消えます。**古い画面を拡大して見せないため**です
- `captureVisibleTab` が失敗したときは直前のキャプチャ (`_prevData`) を返します
  → 副作用があります。[known-issues.md](../known-issues.md) を参照

## 3. 拡大描画（canvas）

[element.ts](../../src/ts/ext-simploupe/element.ts) の `drawCapture()` が
`CanvasRenderingContext2D.drawImage()` の9引数版1回だけで拡大します。**CSS の拡大は使いません。**

```
ルーペの直径   width = height = 160 + 80 × config.size     // size 2..5 → 320..560 px
切り出す領域   sw = sh = width / zoom × devicePixelRatio    // zoom 2..5
切り出す位置   sx = (x - width / zoom / 2) × devicePixelRatio
              sy = (y - height / zoom / 2) × devicePixelRatio
描く先        dx, dy = 0, 0 / dw, dh = width, height
```

- `x`, `y` はカーソルの**ビューポート座標**（`MouseEvent.x` / `.y`）
- `devicePixelRatio` を掛けるのは、キャプチャ画像が**デバイスピクセル**単位だからです
- 「カーソルを中心に `width / zoom` CSS px ぶんを切り出して `width` px に伸ばす」＝ zoom 倍
- `view.pixelRatio` は**要素の初期化時に1度だけ**読んでいます。開いたままモニタを移したり
  ブラウザズームを変えるとずれます → [known-issues.md](../known-issues.md)

ルーペの位置は canvas ではなく `.loupe` の CSS で動かします。

```ts
loupe.style.setProperty( "transform", `translate3d(${x - width/2}px, ${y - height/2}px, 0px)` );
```

`left` / `top` ではなく `transform` なのは、マウス追従で毎フレーム動くためです（レイアウトを起こさない）。

## 4. スキンと形状は CSS の属性セレクタで切り替える

[styles.ts](../../src/ts/ext-simploupe/styles.ts) は 1本の `css` テンプレートリテラルです。
`.loupe` に `data-skin` / `data-shape` / `data-size` / `data-zoom` を出し、CSS 側で分岐します。

| セレクタ | 見た目 |
|---|---|
| `[data-shape='round']` | `border-radius: 50%`（canvas にも同じ半径を当てる。指定が無ければ角丸なしの四角） |
| `[data-skin='1']` | 影だけ。枠なし |
| `[data-skin='2']` | 16px の半透明リング + `backdrop-filter: blur(1px)` |
| `[data-skin='3']` | 金属フレーム。`:before` が `inset: -18px` まで**ルーペの外側**に出る |

重ね順の既定は `:before`(1) → `.canvas`(2) → `:after`(3) → `.parts`(4) → `.setting`(99) です。
**`.canvas` は装飾の間に挟まっています。** スキン3 は `:after` を `z-index: 1` に**上書きして
canvas の下へ潜らせています**（枠の内側の段差を拡大画像に被せないため）。
既定の重ね順を変えると、この上書きの前提が崩れます。

CSS ネストと `@starting-style` を使っています。Chrome 前提なので許容していますが、
[minifyTemplateLiterals](../../vite.config.ts) が壊さないかはビルド後の `dist/js/content-script.js` で確認してください。

## 5. 設定の保存

content script も element も `chrome.storage` を直接触らず、service worker にメッセージで委譲します。
[service-worker.ts](../../src/ts/service-worker.ts) の `onMessageHandler` が受け口です。

| command | 送り元 | 内容 |
|---|---|---|
| `getConfig` | content script（起動時に1回） | `chrome.storage.local` の `config`。無ければ [data.ts](../../src/ts/data.ts) の `defaultConfig` |
| `saveConfig` | element の `save` イベント → content script | `config` を丸ごと保存 |
| `capture` | element の `getCapture` イベント → content script | 可視領域のキャプチャ |
| `reset` | **なし（呼び出し元が存在しない）** | storage を全消去してデフォルトに戻す |
| `toggleSimpLoupe` | service worker → content script | ルーペの表示/非表示 |

- `getStorage()` は `Object.assign({}, fallback, data[key])` の**浅いマージ**です。
  キーを増やしても既存ユーザーにはデフォルトが入ります。逆に `Config` にオブジェクトを
  ネストさせると部分的にしかマージされません
- 保存単位は `config` ひとつだけ。キャプチャ画像は保存しません
- どの分岐も `sendResponse()` を必ず呼び、`return true`（非同期応答の宣言）で終わります。
  例外時も `onHandlerError()` が `sendResponse(null)` を返します。
  **応答を返さないと呼び出し側の `await chrome.runtime.sendMessage` が永久に未解決になります**
- `reset` は実装だけあって UI から呼ばれていません → [known-issues.md](../known-issues.md)

## 6. 起動の導線と有効/無効

| 契機 | ハンドラ |
|---|---|
| 拡張機能アイコンのクリック | `chrome.action.onClicked` → `toggleSimpLoupe` を tab へ送る |
| 右クリックメニュー | `chrome.contextMenus.onClicked` → 同上 |
| インストール時 | `chrome.runtime.onInstalled` → メニューを1件作る（id: `simpLoupe/toggle`、表示名は `chrome.i18n.getMessage("tglTtl")`） |
| タブの切り替え | `chrome.tabs.onActivated` → URL を見てアイコンとメニューを有効/無効 |

すべてのリスナーは `removeListener()` → `addListener()` の順で登録しています。
service worker が再評価されたときの二重登録を避けるためです。

どの URL で無効にするかは `notWorks` の正規表現です → [permissions.md](permissions.md)。

## 7. 文言と多言語化

**2系統ある。詳細は [i18n.md](i18n.md) を読むこと。** ここでは要点だけ。

| 文言 | 単一ソース | 生成物 | 届け先 |
|---|---|---|---|
| 設定パネルのラベルと選択肢 | [src/i18n/ui/&lt;lang&gt;.json](../../src/i18n/ui/) | なし（[src/ts/i18n.ts](../../src/ts/i18n.ts) が import する対応表） | 拡張機能自身が描画 |
| 拡張機能の説明・アイコンの tooltip・右クリックメニュー名 | [src/i18n/store/messages.json](../../src/i18n/store/) | **[src/_locales/](../../src/_locales/)（`npm run i18n:build` で生成）** | Chrome / ウェブストアが描画 |

- **`src/_locales/` は生成物。直接編集しないこと。** `npm run i18n:check` が差分を検出する
- `default_locale` は `ja`。**未訳のロケールも `en` の文言で埋めて生成する**（ディレクトリが無いと Chrome が `ja` にフォールバックし、フランス語圏の利用者に日本語の説明が出るため）
- 設定パネルの文言を `chrome.i18n.getMessage()`（= `_locales`）に寄せていない理由も同じ問題。→ [i18n.md](i18n.md)
- 言語コードは UI 側が **BCP 47**（`zh-TW`）、store 側が **Chrome 形式**（`zh_TW`）。**混ぜないこと**

## 8. ビルド

```
package.json (version)
   │ syncVersion.js
   ▼
src/manifest.json ── copy ──▶ dist/manifest.json
src/img/*         ── copy ──▶ dist/img/
src/i18n/store/*  ─ i18n:build ▶ src/_locales/**
src/_locales/**   ── copy ──▶ dist/_locales/
src/i18n/ui/*.json ─ import ─▶ src/ts/i18n.ts ─┐
src/ts/*.ts       ─ tsc + vite ▶ dist/js/content-script.js
                                 dist/js/service-worker.js
```

`npm run build` は i18n を**生成しない**（生成物を git 管理しているため、ビルドの副作用でソースツリーが
書き換わるのを避けている）。ずれは CI の `i18n:check` が検出する。

- vite の `lib` モードで2エントリを **IIFE** として出力します。content script は ESM を使えません
- `manifest.json` の `background.type` は `module` ですが、実際の出力は IIFE です。
  **IIFE は module としても読めるため動いています**（`import` を含まないため）
- production では terser が `console.*` を除去します
- `emptyOutDir: false` です。`dist/` の掃除は `npm run clean`（rimraf）が行います。
  **copy 系のタスクより後に vite が走ると生成物が消えるため、順番を変えないでください**
- Lit のテンプレートリテラル内の CSS は `rollup-plugin-minify-template-literals` で圧縮されます
  （[styles.ts](../../src/ts/ext-simploupe/styles.ts) の 249 行はバンドル内で1行になっています）。
  `node_modules` は `exclude` しています。**`styles.ts` を exclude に加えないでください**
  → [known-issues.md](../known-issues.md) の項目14
- [element.ts](../../src/ts/ext-simploupe/element.ts) の先頭で
  `@webcomponents/custom-elements` のポリフィルを import しています。
  MV3 が動く Chrome では不要です → [known-issues.md](../known-issues.md)

### 著作権表示は banner で入れている（消さないこと）

同梱するサードパーティは**バイナリ配布時に著作権表示・ライセンス条項・免責事項を再掲すること**を
要求しています。`dist/js/*.js` はそのまま Chrome ウェブストアで配布されるので、これは守る必要があります。

| 同梱物 | ライセンス | 著作権 |
|---|---|---|
| `lit-html` / `lit-element` / `@lit/reactive-element` | BSD-3-Clause | Copyright (c) 2017 Google LLC |
| `@webcomponents/custom-elements` | BSD style（Polymer） | Copyright (c) 2016 The Polymer Project Authors |

**上流のコメントは build の途中で2段階に失われます。**

1. `@license` の付かないコメント（`@webcomponents` のもの）は **rolldown のバンドル段階**で消える
2. 残った `@license` コメントも **minify** で消える。`terserOptions.format.comments` は
   vite 8（rolldown）経由では効きません（`"some"` も正規表現も無効。
   `compress.drop_console` は効くので `terserOptions` 自体は届いています）

そのため上流のコメントの保持に頼らず、[vite.config.ts](../../vite.config.ts) の `BANNER_*` に
**ライセンス全文を書いて必ず残す**方式にしています。banner は関数なので、
`node_modules` を含むチャンク（`content-script.js`）にだけサードパーティの表示が入り、
`service-worker.js` には本体の MIT 表示だけが入ります。

**依存を増やしたら、そのライセンスを `BANNER_THIRD_PARTY` に追記してください。**
確認は次のコマンドです。

```sh
npm run build
grep -o 'Copyright ([Cc]) [0-9]* [A-Za-z .]*' dist/js/content-script.js | sort -u
```

## 対象ブラウザ

**Chrome (Manifest V3) 専用です。** Firefox 対応は検討していません。理由:

1. `chrome.tabs.captureVisibleTab` に相当する API の挙動（解像度・デバイスピクセル比・
   失敗条件）が異なり、**拡大の座標計算をやり直す必要がある**（simpLoupe の中核ロジック）
2. `<dialog>` の top layer と `@starting-style` に依存した見た目の作り直しが要る
3. MV3 の background が service worker ではなく `scripts` になるなど manifest の差分がある

姉妹プロジェクトの g-calize は Firefox 対応（`manifest.config.ts` / `web-ext` / `firefox:*`）を
入れていますが、あちらは CSS を注入するだけで**キャプチャに依存していません**。
simpLoupe では「動くか調べる」だけで済む規模ではないため、単なる設定追加ではなく**機能追加**として扱います。
必要になった時点で `docs/plan/` にプランを立ててから着手してください。
