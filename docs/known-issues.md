# 既知の問題

未修正の問題の一覧です。着手したら該当項目に PR / コミットへのリンクを追記してください。
直したら**項目を削除**し、[CHANGELOG.md](../CHANGELOG.md) に1行書きます。

> **番号は識別子です。項目を削除しても振り直しません。**
> テストのコメントや他のドキュメントから番号で参照しているため、詰めると参照が壊れます。
> 追加は末尾に足してください（欠番があるのは削除済みという意味です）。

---

## 1. ブラウザズームやモニタ移動で拡大位置がずれる

**場所** [src/ts/ext-simploupe/element.ts](../src/ts/ext-simploupe/element.ts) の `view.pixelRatio`
**影響** 大 — カーソルの位置と拡大される場所がずれる

```ts
view = {
    pixelRatio: window.devicePixelRatio,   // ← 要素の初期化時に1度だけ読んでいる
```

`devicePixelRatio` は**ブラウザズームと表示スケールの積**なので、以下で変わります。

- ページのズームを 100% 以外にする（ルーペを開く前でも、`view` の初期化はページ読み込み時なのでずれる）
- ウィンドウを解像度の違うモニタへ移す
- OS の表示スケールを変える

`drawCapture()` は `sx` / `sw` にこの値を掛けるため、値が古いと**切り出す位置と範囲が両方ずれます**。

以前の `service-worker.ts` には `chrome.tabs.getZoom()` を呼びかけたコメントアウトが残っていました
（開発環境の整備で削除）。当時この問題に気づいていた痕跡です。

**直し方の候補** `drawCapture()` の中で毎回 `window.devicePixelRatio` を読む（最小の修正）。
あるいは `resize` イベント（ズーム変更でも発火する）で更新する。

---

## 2. キャプチャ失敗時に「別のページのキャプチャ」が表示される

**場所** [src/ts/service-worker.ts](../src/ts/service-worker.ts) の `_prevData`
**影響** 大（プライバシー）

```ts
sendResponse({ dataURL: _prevData });   // 失敗したら直前のキャプチャを返す
```

`_prevData` はモジュールスコープに1枚だけ持つグローバルです。**タブもウィンドウも区別しません。**
`activeTab` が失効した状態（ルーペを開いたまま同じタブで遷移した後など）でキャプチャに失敗すると、
**前に撮った別ページの画面がルーペの中に出ます**。

**直し方の候補** フォールバックをやめて、失敗を content script に伝えてルーペを隠す。
どうしても残すなら `sender.tab.id` ごとに持ち、タブの `onUpdated` で破棄する。

---

## 3. キャプチャの間引きが効いていない

**場所** [src/ts/service-worker.ts](../src/ts/service-worker.ts) の `_timer`
**影響** 中

```ts
let _timer: any = null;
...
clearTimeout(_timer);          // _timer には何も代入されていない
setTimeout( async () => {      // ← 戻り値を _timer に入れていない
```

`clearTimeout()` は常に `null` を渡しているため何もしません。連続スクロールで `capture` が来ると、
**100ms 後にその回数ぶんの `captureVisibleTab()` が並んで走ります。**
`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` のクォータに当たると例外になり、問題2 のフォールバックに落ちます。

**直し方** `_timer = setTimeout(...)` にする。ただし `sendResponse` を持つ呼び出しを取り消すと
**応答が返らないまま**になるため、キャンセルした側にも応答を返すか、間引きを element 側だけに寄せるか決めること。

---

## 4. アイコンの有効/無効が全タブに効き、同一タブ内の遷移で更新されない

**場所** [src/ts/service-worker.ts](../src/ts/service-worker.ts) の `onActivatedHandler`
**影響** 中

```ts
await chrome.action.disable();   // tabId を渡していない → 全タブが対象
```

- `chrome.action.enable()` / `disable()` に `tabId` を渡していないため、
  `chrome://` のタブを一度開くと**他のタブでもアイコンが無効のまま**になることがあります
- 判定が `chrome.tabs.onActivated`（タブの切り替え）だけなので、
  **同じタブの中でページを移動しても更新されません**

**直し方** `chrome.action.enable({ tabId })` / `disable({ tabId })` にし、
`chrome.tabs.onUpdated` でも同じ判定を走らせる。

---

## 6. `shape` の値が `quare`（square のタイポ）

**場所** [src/ts/types.ts](../src/ts/types.ts)、[src/ts/data.ts](../src/ts/data.ts)、
[element.ts](../src/ts/ext-simploupe/element.ts)、[styles.ts](../src/ts/ext-simploupe/styles.ts)
**影響** 小（動作には影響しない）

```ts
shape: "round" | "quare";
```

**表示ラベルは多言語化のときに正しい綴り（`square` / 四角）に直しました。値だけが `quare` のままです。**
型・`data-shape` 属性・CSS が全部この綴りで揃っているため動いています。
ただし**既存ユーザーの `chrome.storage.local` に `"quare"` が保存済み**なので、
直すなら読み込み時の変換（`"quare"` → `"square"`）が必要です。

`styles.ts` は `[data-shape='round']` にしか規則が無く、四角は「指定なし」で表現しています。
綴りを直す際はここも合わせて確認してください。

---

## 7. 設定パネルを閉じたあと、古いキャプチャのまま表示される

**場所** [element.ts](../src/ts/ext-simploupe/element.ts) の `toggleSetting()`
**影響** 小

```ts
this.showSetting = true;
this.off(false);      // mousemove / scroll / resize のリスナーを全部外す
```

設定パネルを開いている間はスクロールとリサイズを監視しません。
そのため**パネルを開いたままページをスクロールし、閉じる**と、
`on()` でリスナーは戻りますが**撮り直しは走らず**、古い画面を拡大したまま表示されます。
次にスクロールするまで直りません。

**直し方** `toggleSetting()` でパネルを閉じるときに `updateCapture()` を呼ぶ。

---

## 8. `view-transition-name` が g-calize からのコピー残り

**場所** [src/ts/ext-simploupe/styles.ts](../src/ts/ext-simploupe/styles.ts)
**影響** 小

```css
view-transition-name: "gcz-setting";
```

- 値がクォートされています。`view-transition-name` は `<custom-ident>` を取るため、
  **文字列リテラルは不正で無視されます**
- 名前の `gcz-` は G-calize の接頭辞です。simpLoupe には無関係

`element.ts` の `startViewTransition()` / `performUpdate()` の View Transition 周りも、
**現状はどこからも `startViewTransition()` が呼ばれていません**（`_viewTransition` は常に undefined）。
使うのか捨てるのかを決めてください。

---

## 9. 高 DPI 環境で拡大画像が甘い

**場所** [element.ts](../src/ts/ext-simploupe/element.ts) の `<canvas .width .height>`
**影響** 小

canvas のバッキングストアを `view.width`（CSS px 相当）で確保しています。
`devicePixelRatio` を掛けていないため、Retina では**canvas 1px が 2 デバイスピクセルに拡大表示**され、
その分ぼけます。

「拡大鏡なので粗いのは自然」とも言えるため、**直すかどうかは見た目の判断**です。
直す場合は `canvas.width = view.width * pr` にして `drawImage` の宛先も合わせます。

---

## 10. 不要なポリフィルを読み込んでいる

**場所** [src/ts/ext-simploupe/element.ts:1](../src/ts/ext-simploupe/element.ts)
**影響** 小（バンドルサイズ）

```ts
import "@webcomponents/custom-elements/custom-elements.min.js";
```

Manifest V3 が動作する Chrome では Custom Elements v1 がネイティブで使えます。
外せば `dependencies` から `@webcomponents/custom-elements` を落とせます。
**外したあと、必ず実機でルーペが表示されることを確認してください。**

---

## 11. 設定の既定値が2箇所にあり、`skin` が食い違っている

**場所** [src/ts/data.ts](../src/ts/data.ts) の `defaultConfig.skin === "1"`、
[element.ts](../src/ts/ext-simploupe/element.ts) の `@state config.skin === "2"`
**影響** 小（実行時は content script が上書きするので表には出ない）

既定値を変えるときは**両方**直すこと。片方だけだと保存前と保存後で見た目が変わります。
`tests/loupe-element.test.ts` の「element.ts の既定 skin が data.ts と一致していない」が現状を固定しています。

---

## 12. `reset` コマンドがどこからも呼ばれていない

**場所** [src/ts/service-worker.ts](../src/ts/service-worker.ts)
**影響** 小

実装だけあって設定パネルに導線がありません。**残すなら UI を付ける。付けないなら消す。**
どちらでもない中間状態です。

---

## 13. UI の訳が `ja` と `en` の2言語しかない

**場所** [src/i18n/ui/](../src/i18n/ui/)
**影響** 中

仕組みは35言語に対応していますが、実データは `ja` / `en` だけです。
それ以外の言語では設定パネルが英語（`FALLBACK_LANG`）になります。

`src/_locales/`（説明文・tooltip・メニュー名）も同様で、35ロケールを生成していますが
**中身は `ja` 以外すべて英語**です。`npm run i18n:check:store` が未訳を warn で報告します。
全言語が揃ったら `check:store --strict` を常用にしてください。→ [design/i18n.md](design/i18n.md)

---

## 14.（解決済み）`minify-literals` の `unsafeCSS` 警告

**解決日** 2026-08-11 / **場所** [vite.config.ts](../vite.config.ts)

ビルドログに毎回2件出ていた警告です。

```
minify-literals: unsafeCSS() detected in source. CSS minification will not be performed for this file.
```

**原因は `node_modules` 側でした。** `unsafeCSS` を含むのは
`@lit/reactive-element` の `css-tag.js` / `reactive-element.js` で、
[styles.ts](../src/ts/ext-simploupe/styles.ts) にはありません（`grep -rln unsafeCSS src/` は空）。

`exclude: ["**/node_modules/**"]` を渡して依存の走査ごと外し、警告は 0 件になりました。
**出力はバイト単位で完全に同一**（`diff` で確認）。

> **「249行の CSS が圧縮されていない」という以前の記述は誤りでした。**
> `styles.ts` の CSS は**元から圧縮されています**（バンドル内は
> `:host{color:#333;text-rendering:geometricprecision;...}` と1行になっている）。
> 警告は依存ファイルについてのもので、本体の CSS とは無関係でした。
> **`styles.ts` を `exclude` に加えないこと** — 加えると、いま効いている圧縮を失います。

`rollup-plugin-minify-template-literals` v2.1.0 に `failOnError` は**ありません**
（型にもコードにも無く、失敗は常に `this.warn` になる）。渡しても黙って無視されます。

---

## 15. `setTimeout` の戻り値の型を `any` で誤魔化している

**場所** [element.ts](../src/ts/ext-simploupe/element.ts) の `timer: any`、
[service-worker.ts](../src/ts/service-worker.ts) の `_timer: any`
**影響** 小

`tsconfig.json` の `types` に `node` が入っているため、`setTimeout` が Node 版
（`NodeJS.Timeout` を返す）で解決される可能性があります。`types: ["chrome"]` に絞れば
DOM 版（`number`）に解決されて `any` を外せますが、**`tests/manifest.test.ts` が `node:fs` を
使うため `node` を外せません。** テスト用の tsconfig を分けるなら解消できます。

---

## 16. ビルドが同じ出力を2回書く

**場所** [vite.config.ts](../vite.config.ts)
**影響** 小（ビルド時間が倍）

`lib.entry` が複数エントリのとき vite は es / umd の2形式をビルドしようとし、
`rollupOptions.output.format: "iife"` の上書きによって**同名ファイルに2回書き込みます**。
`build.lib.formats: ["iife"]` で1回にしようとすると
`Multiple entry points are not supported when output formats include "umd" or "iife"` で
**ビルドが失敗します**（実測）。塞ぐ手が無いので放置しています。vite 5 でも同じ挙動でした。

---

## 17. `getStorage` の `fallback ?? null` は無意味

**場所** [src/ts/service-worker.ts](../src/ts/service-worker.ts)
**影響** なし（コードの読みやすさだけ）

`Object.assign` は `undefined` も `null` も無視するので、`?? null` があってもなくても同じです。

---

## 18. 内部の typo が残っている

**場所** [element.ts](../src/ts/ext-simploupe/element.ts) の `contenxt`（`drawCapture` 内のローカル変数）、
`_onresizelHandler`
**影響** なし

**内部名なので自由に直して構いません。** ただし `_onresizelHandler` は
[design/architecture.md](design/architecture.md) の表から参照しているので、直したらそちらも直すこと。
`shape: "quare"` のような**保存データに出る綴り**とは扱いが違います（→ 項目6）。

---

## 19. ストア掲載文が書きかけ

**場所** [work/store_description.md](../work/store_description.md)
**影響** 小（リポジトリの外＝ストアの掲載情報は別途手で入れてある）

日本語のマスター文面が4行の断片しかありません（旧 `work/memo.md` の使い方メモを移したもの）。
そのため g-calize の `work/store/<locale>.md` + `npm run store:check`（35言語版とマスターの
追随を検査する仕組み）を simpLoupe には入れていません。**追随させる元が無いためです。**
→ [README.md](README.md) の「無いもの」

**直し方** まずマスター文面を書く。多言語化の器はそのあとで足せます。
