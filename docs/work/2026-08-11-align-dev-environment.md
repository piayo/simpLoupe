# 開発環境を g-calize に揃えた

日付: 2026-08-11
背景: 姉妹プロジェクト G-calize（同一作者の Chrome 拡張機能）で整えた開発環境・ドキュメント構成・
テスト・i18n の規律を、simpLoupe にも移す作業。**機能追加はしていない。**

## やったこと

6フェーズに分けて進めた。**Phase 5 だけを丸ごと戻しても Phase 0〜4 は成立する**ように順序を組んだ。

| | 内容 | 主な成果物 |
|---|---|---|
| Phase 0 | 足場。依存の総入れ替えと lint / typecheck | `package.json` / `tsconfig.json` / `.oxlintrc.json` / `.gitignore` / `.npmrc` / `.nvmrc` |
| Phase 1 | テスト | `vite.config.ts` の `test` ブロック / `tests/`（166本） |
| Phase 2 | CI | `.github/workflows/ci.yml` |
| Phase 3 | ドキュメント | `README.md` / `CHANGELOG.md` / `docs/` |
| Phase 4 | AI エージェント向けの構成 | `CLAUDE.md` / `.claude/` |
| Phase 5 | i18n を単一ソース化（2系統） | `src/i18n/` / `src/ts/i18n.ts` / `scripts/i18n/` / `src/_locales/`（生成物） |

あわせて `license` を `MIT` にし、[LICENSE](../../LICENSE)（MIT 全文）を置いた。
`package.json` の `"GPL"` は SPDX として無効な値で、LICENSE ファイルも存在しなかった。

## 判断したこと

### `docs/design/` は4本にした

当初の案は3本（`architecture.md` / `permissions.md` / `testing.md`）で、`i18n.md` と `firefox.md` は
「作らない」と決めていた。**このうち `i18n.md` は判断を覆して作った**（理由は下記）。
`firefox.md` は作っていない。

| | 判断 | 理由 |
|---|---|---|
| `architecture.md` | 作る | 「キャプチャを canvas で拡大する」という中核が、コードを読むだけでは追いにくい |
| `permissions.md` | **作る（g-calize には無い）** | simpLoupe の「動かない」の大半が `activeTab` と URL 制限。g-calize の「Google カレンダーの DOM 依存」に相当する固有リスクで、ここだけは独立させる価値がある |
| `testing.md` | 作る | 「何をテストしないか」を書き残すため。canvas と `<dialog>` は実機確認しかない |
| `i18n.md` | **作った（当初は「作らない」判断だった）** | 下記 |
| `firefox.md` | **作らない** | 対応予定が無い。`captureVisibleTab` の挙動差と `<dialog>` の top layer 依存があり、調査なしに手順を書けない。判断の理由だけ [architecture.md](../design/architecture.md#対象ブラウザ) の「対象ブラウザ」に残した |

#### `i18n.md` は「作らない」から「作る」に覆した

当初の根拠は「`_locales` は `extDes` 1キー×2言語しかなく、UI 文言は `element.ts` に
ハードコードなので**2系統が対立していない**。生成パイプラインも無い」だった。
これは **Phase 5 の前の事実**で、Phase 5 を入れると前提ごと消える。

- Phase 5 後は **2キー×35ロケール + UI 9キー×2言語 + 生成パイプライン + 検査コマンド3本**
  （`i18n:verify` / `i18n:check:ui` / `i18n:check:store`）になる。最も説明が必要な領域に変わった
- **`src/_locales/` が生成物になった。** これを書き残さないと直接編集されて黙って戻る
- 「なぜ UI 文言を `chrome.i18n.getMessage()` に寄せないのか」（`default_locale: ja` への
  フォールバック問題）は、`architecture.md` の1節では説明しきれない

`architecture.md` の「7. 文言と多言語化」は要点の表だけ残し、詳細は [design/i18n.md](../design/i18n.md) に送った。

### `CHANGELOG.md` は 2.0.2 ではなく 2.0.0 から書いた

git の履歴を確認したところ:

```
$ git log --oneline | wc -l   → 18
$ git log --oneline | tail -1 → 499c9b4 version 2.0.0   （根コミット・2024-12-15）
$ git tag                     → v2.0.1 / v2.0.2         （2.0.0 のタグは無い）
```

- **1.x の履歴は git に存在しない。** 遡って書くとコミットに裏付けの無い記述になるので書かない
- 一方、2.0.1 / 2.0.2 の内容はコミットメッセージから復元できる
  （`fix: contextMenus cannot click.` / `fix: when display:none at site-page side...` /
  `update capture.` / `edit loupe design css.`）

よって **2.0.0（= リポジトリの起点）から書き、それ以前が無いことを CHANGELOG の冒頭に明記する**
方式にした。「2.0.2 以降」にすると、既にストアで公開済みの 2.0.1 の修正内容が
どこにも残らなくなる。

### `README.md` は日本語にした

現状は英語3行（ストアの説明文の抜粋）だった。両リポジトリとも作者は同一で、
`CLAUDE.md` の規約が「日本語」なので g-calize の README と章立てごと揃えた
（概要 / 必要な環境 / 開発 / コマンド / ディレクトリ構成 / ドキュメント / ライセンス）。

英語のストア向け文面は**開発者向け README の役割ではない**ので載せていない。
掲載文は [work/store_description.md](../../work/store_description.md)（日本語マスター）に寄せた。
ただし**まだ断片**で、完成した掲載文にはなっていない（→ [known-issues.md](../known-issues.md) 項目19）。

### `workflow.md` の「動作確認の観点」は環境軸で並べた

g-calize は「ビューごと」（月表示 / 週表示 …）だったが、simpLoupe に画面の種類は無い。
代わりに**壊れ方が環境依存**なので、次の4軸で並べた。

1. 起動と終了（アイコン / メニュー / Esc / 設定パネル）
2. 設定の組み合わせ（zoom と size は 2〜5 の**両端**を必ず見る）
3. ページの種類（iframe / video / PDF / `chrome://` / `file://`）
4. 環境（ブラウザズーム、Retina、モニタ移動、`prefers-reduced-motion`、UI 言語）

3 と 4 はコードを読んで危ないと判断した箇所そのままなので、
[design/permissions.md](../design/permissions.md) と [known-issues.md](../known-issues.md) から相互に参照している。

## 依存の総入れ替え

| | 変更 | 理由 / 影響 |
|---|---|---|
| vite | 5 → **8**（rolldown） | production ビルド・watch・terser minify すべて実測で成功。`lib` モード + iife の設定はそのまま通った |
| TypeScript | 5 → **7** | `tsc --noEmit` は exit 0。破壊的変更は `tsconfig.json` の `baseUrl` 削除だけ |
| `@types/chrome` | 0.0.243 → **0.2.5** | 破壊的変更は1件。`chrome.tabs.TabActiveInfo` → **`OnActivatedInfo`**（`service-worker.ts` を修正） |
| `copyfiles` → `cpy-cli` / `npm-run-all` → `npm-run-all2` | 置き換え | g-calize と同じ構成に揃えた。`copy:locales` は 35ロケールでもそのまま動く |
| `terser` | **明示追加** | ビルドが**宣言されていない依存に乗っていた**。`html-minifier-next` の dependencies 経由で入っているだけで、vite からは optional peer。上流が外したらビルドが突然落ちる |
| `oxlint` / `vitest` / `happy-dom` / `@vitest/*` | 追加 | バージョンは g-calize と完全に一致させた（同じ作者の2リポジトリで挙動が違うと調査が二重になる） |

`devEngines.runtime` に `node >= 24` / `onFail: "error"` を入れた。Node 24 が必須になった。
これには**落とし穴がある**（→ つまずいたこと）。

`.npmrc` の `min-release-age=7` は**依存を入れ替えた後**に置いた。先に置くと、出たばかりの
パッチバージョンが拒否されて `npm install` が想定どおりに解決しない。

## テストを 166 本入れた

Vitest + happy-dom。`tests/` に8ファイル。

### element.ts を coverage 対象にした（g-calize と逆）

g-calize は Lit コンポーネント（設定ダイアログ）を coverage 対象外にしている。
あちらの Lit は約4600行のうちの周辺機能で、Shadow DOM とアニメーションの再現コストに
見合わないという判断だった。**simpLoupe は Lit が本体**なので、外すと守れる範囲がほとんど残らない。
happy-dom 上で実際に `<ext-simploupe>` をマウントしてテストしている。

### happy-dom の制約を6件、実測で洗い出した

詳細は [design/testing.md](../design/testing.md) の表に残した。要点だけ:

- **`canvas.getContext("2d")` が `null`。** これが最大の障害だった。`drawCapture()` が early return
  してしまい、**この拡張機能の中核である座標計算が検証できない**。`getContext` ごと差し替えて
  `drawImage()` に渡された9引数を記録する方式で解決した（実描画は見ない）
- `MouseEvent` に `x` / `y` が無い（`clientX` / `clientY` のみ）
- `transition` の一括指定を `transitionDuration` に展開しない
- `transition-duration` を指定値のまま返す（実ブラウザは必ず秒に正規化する）
- `dialog.close()` の `close` イベントが同期で飛ぶ（仕様では非同期）
- `document.startViewTransition` が無い（`performUpdate()` の分岐は到達不能）

### 既知のバグは「現状」として固定した（4箇所）

修正するのではなく、**現状の挙動をそのまま期待値にした**。修正時に必ずテストが落ちるようにするため。

1. `_timer` の代入漏れで**間引きが不発**（service worker のキャプチャ）
2. `getCSSTransitionDuration()` が `"240ms"` を 240000 と読む（`endsWith("s")` が `"ms"` にも一致）
3. `element.ts` の既定 `skin` が `data.ts` と一致していない
4. `shape` の値が `quare`（`square` のタイプミス）

いずれもテスト名に「既知の問題・現状固定」と入れ、[known-issues.md](../known-issues.md) を参照している。

## i18n を2系統に分けた

`src/i18n/` を単一ソースにし、**性質の違う2系統を混ぜない**構成にした。

| | (A) UI 文言 | (B) ストア / ブラウザ UI |
|---|---|---|
| 誰が描画するか | 拡張機能自身（Lit） | Chrome とウェブストア |
| 単一ソース | `src/i18n/ui/<lang>.json` | `src/i18n/store/messages.json` |
| 生成物 | なし（`src/ts/i18n.ts` が直接 import） | **`src/_locales/`** |
| 参照 | `T( "label.zoom" )` | `__MSG_xxx__` / `chrome.i18n.getMessage()` |
| キー | 意味的な ID（9キー） | `extDes` / `tglTtl`（2キー） |

### UI 文言を `chrome.i18n.getMessage()` に寄せなかった理由

「9キーしかないなら `_locales` に全部入れて Chrome 任せにすれば自前パイプラインが不要」という案を
検討して**却下した**。決定的な理由は**フォールバック先が `default_locale` になること**。

Chrome の messages.json は `<locale>` → 親 → **`default_locale`** の順にフォールバックする。
simpLoupe の `default_locale` は `ja` なので、**未訳の言語では UI が日本語で出てしまう**。
英語に落としたいので、UI 側は自前で持つ。

`default_locale` を `en` に変えれば解決するが、**公開済みの拡張機能のストア掲載の既定言語が変わる**
副作用がある。この作業で取るべきリスクではないと判断し、`ja` に据え置いた。
**なおこの副作用の存在自体は検証していない**（→ [design/i18n.md](../design/i18n.md) の「今後の判断事項」）。

加えて、store 側は「35ロケール全部が揃っていること」が要件、UI 側は「揃っていなくてよい」が要件で、
**検査の厳しさが逆**。同じファイルに入れると検査が書けない。

### 35ロケールを英語で埋めた理由

`src/_locales/` は35ロケール全部を生成する。訳が無いロケールも **`en` の文言で埋める**。
ディレクトリを作らないと Chrome が `default_locale` = `ja` に落ち、**フランス語圏の利用者に
日本語の説明が出る**。英語で埋めたほうがマシ、という判断。

UI 側（A）は逆で、**訳が無い言語の JSON は置かない**。実行時に `en` へフォールバックするので、
置かないほうが「未訳」が可視化されて安全。

ロケール一覧は g-calize の37から `en_GB` / `en_US` を落として**35**にした。
Chrome は `en_GB` → `en` と親にフォールバックするので、`en` があればカバー範囲は同じ。

### キーを意味的な ID にした（g-calize からの意図的な逸脱）

g-calize は英語の原文をキーにしている（`"Holiday color"` など）。原文を直すと全言語が黙って壊れる。
simpLoupe は**これから作る9キー**なので移行コストがゼロで、最初から `label.zoom` / `shape.round` の
ような意味 ID にした。

副作用として「訳が無ければキーがそのまま出る」という暗黙の英語フォールバックが使えなくなるので、
**`en.json` を実ファイルとして持ち、`FALLBACK_LANG = "en"` を明示**し、
検査で `en.json` の全キー完備を必須にした。

## 統合で覆した判断

5軸（開発環境 / テスト / ドキュメント / i18n / AI 構成）の仕様を1本に統合する際、
実際に走らせて**5件の主張が誤りだと分かった**。記録として残す。

1. **「`src/.DS_Store` と `/.DS_Store` がコミットされている」→ 誤り。**
   `git ls-files | grep -i ds_store` は**空**。`git rm --cached` は不要だった。
   root の `.DS_Store` はファイルとしては存在するが未追跡
2. **「`rollup-plugin-minify-template-literals` v2 で CSS の minify が効くようになる」→ 誤り。**
   v2 でもビルドログは `unsafeCSS() detected in source.` を出し、**CSS の minify は依然スキップ**される
   （`styles.ts` に `unsafeCSS` は無い。lit 由来の誤検知）。v2 に上げる価値は「古い依存を落とす」だけ
   → [known-issues.md](../known-issues.md) 項目14
3. **「src 側に必要な変更はゼロ」→ 不正確。** 無改変の src でもテストは通るが、
   **`npm run typecheck` は通らない**（`TabActiveInfo` → `OnActivatedInfo`）
4. **`types: ["chrome"]` → 採用不可。** `tests/manifest.test.ts` が `node:fs` / `node:path` を
   使うため `["chrome", "node"]` が必須。副作用として `setTimeout` が Node 版で解決されうる
   → [known-issues.md](../known-issues.md) 項目15
5. **`.toSorted()` は `lib: ES2022` では型エラー**（TS2550）。`.sort()` に戻した

## つまずいたこと

### `showModal()` の inert に気づかなかった

`<dialog>` を `showModal()` で開いているのに `pointer-events: none` が指定されているため、
最初「ページを操作しながら使える」と読んだ。実際は `showModal()` が
**ダイアログの外側を inert にする**ので、表示中はページをクリックできない。
`pointer-events: none` は見た目（カーソル形状と `::backdrop`）のためのもの。
勘違いしやすいので [design/architecture.md](../design/architecture.md) に明記した。

### `.toSorted()` が `lib: ES2022` で使えない

`TS2550: Property 'toSorted' does not exist ... Try changing 'lib' to 'es2023'`。
`lib` を上げるより `.sort()` に戻すほうが影響が小さい。ただし oxlint の `unicorn/no-array-sort` が
「破壊的だから `toSorted()` を使え」と警告するので、**このルールを off にした**
（該当箇所はいずれも `Object.keys()` やスプレッドで複製した配列に対する `sort` なので破壊的ではない）。
理由は `.oxlintrc.json` にコメントで残してある。

### `devEngines.onFail: "error"` は npm 自体を止める

`package.json` に `devEngines.runtime = { node: ">=24", onFail: "error" }` を入れると、
**Node 22 のシェルでは `npm ls` すら `npm error code EBADDEVENGINES` で失敗する。**
`npm install` も通らない。つまり Phase 0 で `package.json` を書いた瞬間、
`nvm use` していないシェルでは**すべての npm コマンドが謎の失敗をする**。

`node -v` を最初に確認する、というだけの話だが、エラーメッセージから原因に辿り着きにくい。
[workflow.md](../workflow.md) の「環境構築」に明記した。

## 直していないこと

**既知の問題は1件も直していない。** この作業は構成の整備であって、振る舞いを変えるものではない。
一覧は [known-issues.md](../known-issues.md)（19項目）。

特に次の3件は**利用者に見える不具合**なので、次のプランの入力になる。

1. `view.pixelRatio` を初期化時に1度しか読まないため、ブラウザズームやモニタ移動で拡大位置がずれる（項目1）
2. キャプチャ失敗時に `_prevData`（**別ページのキャプチャ**）を表示する（項目2）
3. `clearTimeout(_timer)` の `_timer` に `setTimeout` の戻り値を入れておらず、間引きが効いていない（項目3）

**修正はテストの書き換えとセットになる。** 上記のうち 3 は
`tests/service-worker.test.ts` が現状を意図的に固定しているので、直すとテストが落ちる（落ちるのが正しい）。
`shape: "quare"` の改名は**既存ユーザーの `chrome.storage.local` のマイグレーション**を伴い、
実機での移行確認が要る。修正の是非とテストの更新を一緒に議論するプランを立ててから着手すること。

そのほか未決のまま残したもの:

- **`optional_host_permissions: ["<all_urls>"]` を使うか消すか。**
  `chrome.permissions.request()` の呼び出しがリポジトリ内に存在しない
  → [design/permissions.md](../design/permissions.md)
- **残り33言語の訳出。** 仕組みは完成しているのでデータを足すだけ
  → [known-issues.md](../known-issues.md) 項目13
- **ストア掲載文のマスター。** 書きかけ → [known-issues.md](../known-issues.md) 項目19
- **Firefox 対応。** 別プラン → [design/architecture.md](../design/architecture.md#対象ブラウザ)

### 実機確認について

この作業で確認できたのは「型が通る / lint が通る / テストが通る / minify された iife が出る」までで、
**vite 8（rolldown）が出したバンドルを Chrome に読ませて実際に拡大されるかは自動化できない。**
特に次の3点は各フェーズの受け入れ条件として手で確認する必要がある。

1. Lit のデコレータ（`@customElement` / `@property` / `@query` / `@state`）が
   rolldown + `useDefineForClassFields: false` で正しく出ているか
2. `@webcomponents/custom-elements` のポリフィルが壊れていないか
3. 日本語環境で設定パネル・tooltip・メニューが日本語になるか
   （`chrome.i18n.getUILanguage()` が content script で権限なしに呼べることは MV3 の仕様だが、未実測）

手順は [workflow.md](../workflow.md#動作確認の観点) のチェックリスト。
