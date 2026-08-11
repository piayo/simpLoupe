# テスト方針

```sh
npm test            # 1回実行
npm run test:watch  # 監視
npm run test:ui     # ブラウザで結果とカバレッジを見る (http://localhost:51204)
npm run test:coverage
```

`test:ui` は失敗したテストの差分や、どのファイルのどの行が実行されたかをブラウザで追えます。
**カバレッジのタブを出すために `--coverage` を付けてあります**（付けないと計測されず、タブが空になります）。

**サーバーが起動したままになるので、CI や自動実行では使わないでください。**

**Vitest + happy-dom。** 設定は [vitest.config.ts](../../vitest.config.ts)、テストは [tests/](../../tests/) 配下。
`tsconfig.json` の `include` に `tests/**/*.ts` を入れてあるので、`npm run typecheck` の対象にもなります。

## なぜ DOM 環境まで用意するのか

この拡張機能は**中身のほとんどが Lit の Web Component**（[ext-simploupe/element.ts](../../src/ts/ext-simploupe/element.ts)）です。
ルーペ本体そのものなので、ここを外すと守れる範囲がほとんど残りません。
happy-dom 上で実際に `<ext-simploupe>` をマウントし、Shadow DOM の中を見てテストしています。

> 参考にした G-calize では Lit コンポーネント（設定ダイアログ）を coverage 対象外にしています。
> あちらの Lit は約4600行のうちの周辺機能で、Shadow DOM とアニメーションの再現コストに
> 見合わないという判断でした。simpLoupe は逆で、**Lit が本体**なので同じ判断はしません。

## フィクスチャ

G-calize の `tests/fixtures/gcal.ts` に相当するもの（特定サイトの DOM を写したフィクスチャ）は
**ありません。** simpLoupe は任意のページの上に乗るので、そういう依存が存在しないためです。
代わりに拡張機能の境界をフィクスチャにしています。

| ファイル | 中身 |
|---|---|
| [tests/fixtures/chrome.ts](../../tests/fixtures/chrome.ts) | `chrome.*` API の最小限のモック。**src が実際に呼ぶものだけ**置いてある |
| [tests/fixtures/page.ts](../../tests/fixtures/page.ts) | 素のページを組む道具（`resetPage` / `mountHTML` / `mountStyle` / `mouseMoveEvent`） |
| [tests/fixtures/canvas.ts](../../tests/fixtures/canvas.ts) | canvas 2D コンテキストの記録用フェイク |

src 側で新しい chrome API を使い始めたら `fixtures/chrome.ts` に足してください。
モックに無い API を呼ぶと `undefined is not a function` で落ちます。

## happy-dom の制約

実測して分かっているものだけを書いています。**推測で足さないでください。**
（バージョンを上げたら再確認すること。確認は `tests/` の該当テストが落ちるかどうかで分かります）

| 制約 | 影響と回避 |
|---|---|
| **`canvas.getContext("2d")` が `null` を返す**（描画実装を持たない） | `drawCapture()` が early return してしまい、トリミング座標＝この拡張機能の中核が検証できない。`fixtures/canvas.ts` の `stubCanvas2D()` で `getContext` を差し替え、`drawImage` に渡された引数を記録して検証している |
| **`MouseEvent` に `x` / `y` が無い**（`clientX` / `clientY` のみ） | `element.ts` の `_mousemoveHandler` は `event.x` を読む。`fixtures/page.ts` の `mouseMoveEvent()` が `x` / `y` を足して実物に近づける |
| **`transition` の一括指定を `transitionDuration` に展開しない**（`""` になる） | [styles.ts](../../src/ts/ext-simploupe/styles.ts) の `.dialog` は一括指定なので、テスト中は `getCSSTransitionDuration()` が 0 を返し、`shown` / `hidden` が即座に飛ぶ。**実ブラウザでは 240ms 待つ**ので、待ち時間そのものはテストで守れていない |
| **`transition-duration: 240ms` を指定値のまま返す**（実ブラウザは計算値を必ず秒で返す） | `getCSSTransitionDuration()` の `endsWith("s")` バグが happy-dom でだけ露出する。「現状固定」として押さえてある |
| **`dialog.close()` の `close` イベントを同期で投げる**（HTML 仕様ではタスクに積む＝非同期） | `hide()` が `@close` ハンドラから再入し、`hide` イベントが2回飛ぶ。実ブラウザでは1回 |
| **`document.startViewTransition` が無い** | `performUpdate()` の `startViewTransition` 分岐は到達不能。coverage の欠けのうち [element.ts](../../src/ts/ext-simploupe/element.ts) 側はこれだけ（他の未カバー行は下の「カバーしていないもの」を参照） |

動いたものも書いておきます（同じ調査を繰り返さないため）:
`<dialog>` の `showModal()` / `close()` / `open`、Shadow DOM 内での `<dialog>`、
`adoptedStyleSheets` + `CSSStyleSheet.replaceSync()`（[styles.ts](../../src/ts/ext-simploupe/styles.ts) の
ネスト CSS・`@starting-style`・`@media` を含む実データで確認）、
`@webcomponents/custom-elements` ポリフィルの import、`devicePixelRatio`（= 1）。

## chrome API のモック

`service-worker.ts` は import 時にリスナーを登録するため、
`vi.stubGlobal( "chrome", mock )` → `vi.resetModules()` → 動的 import の順で読み込みます。

`content-script.ts` も同じですが、**こちらは `vi.resetModules()` して再 import してはいけません。**
`ext-simploupe` を巻き込んで `customElements.define()` が二重に走り、
`NotSupportedError` になります。`beforeAll` で1回だけ import してください。

`content-script.ts` の即時関数は `await import()` の解決を待たない（top-level await ではない）ので、
`vi.waitFor()` で設置完了を待ちます。

## 既知のバグは「現状」として固定する

未修正のバグがある箇所は、**現状の挙動をそのまま期待値にします。**
バグを正しいものとして扱うのではなく、**修正時に必ずテストが落ちる**ようにするためです。
テスト名に「既知の問題・現状固定」と入れ、コメントに理由と直し方を書き、
[../known-issues.md](../known-issues.md) の該当項目を参照してください。

現在固定しているもの:

| テスト | 内容 |
|---|---|
| `service-worker.test.ts` の `連続で呼ぶと間引かれずに全部撮ってしまう` | `_timer` に `setTimeout` の戻り値を入れていないためデバウンスが不発 |
| `util.test.ts` の `ms 指定は 1000 倍されてしまう` | `endsWith("s")` が `"ms"` にも一致する |
| `loupe-element.test.ts` の `element.ts の既定 skin が data.ts と一致していない` | 既定値が2箇所にある |
| `config.test.ts` の `shape の取りうる値は round / quare` | `"square"` のタイプミス。**保存済みデータの値なのでマイグレーション無しに直せない** |

## カバレッジ

`vitest.config.ts` の `coverage.include` は `src/ts/**/*.ts`。除外はこれだけです。

| 除外 | 理由 |
|---|---|
| `types.ts` | 型定義のみ。実行コードが無い |
| `ext-simploupe/index.ts` | re-export 1行 |
| `ext-simploupe/styles.ts` | `css` テンプレートリテラルの文字列のみ。249行あるが v8 は1文と数えるので、含めると数字が水増しされる |

`element.ts` は**除外しません**（本体だから）。閾値は設けていません。
text レポータには 100% のファイルが表示されないので、`util.ts` や `data.ts` が
一覧に出てこないのは正常です。`npm run test:ui` で全ファイル見られます。

## カバーしていないもの

| | 理由 |
|---|---|
| `styles.ts` の見た目（skin 1/2/3、round / quare の形） | CSS の描画結果は happy-dom では検証できない。`data-skin` / `data-shape` 属性が正しく出ることまでを守り、見た目は実機で確認する |
| `drawCapture()` の**実際のピクセル** | 2D コンテキストが無いので、渡す座標が正しいことまでしか守れない。拡大率が合っているかは実機で確認する |
| `performUpdate()` の View Transition 分岐 | happy-dom に `document.startViewTransition` が無い |
| storage が失敗したときの `getConfig` / `saveConfig` / `reset` | `.catch()` → `onHandlerError()` で `sendResponse(null)` を返すようにしたが、**テストは書いていない**。`chrome.storage.local.get` を reject させるテストは書けるが、呼び出し側（content script）が `null` を受けたときの挙動が未定義なので、テストで固定すると仕様を捏造することになる。呼び出し側の扱いを決めてから書く |
| `chrome.action` / `contextMenus` が実際に無効化されるか | モックが呼ばれたことまで。実機で確認する |

**実ブラウザでの動作確認はテストで代替できません。**
チェックリストは [../workflow.md](../workflow.md#動作確認の観点) にあります。特に以下は手で確認してください。
- Retina（`devicePixelRatio` 2以上）での拡大率のズレ — happy-dom は常に 1
- 開閉アニメーション（240ms の transition と View Transition）
- `chrome://` やウェブストア上でアイコンが無効になること
