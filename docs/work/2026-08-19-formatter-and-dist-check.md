# フォーマッタと成果物検査を入れた

日付: 2026-08-19
背景: 姉妹プロジェクト（同一作者の Chrome 拡張機能）の開発環境に合わせる作業の続き。
[2026-08-11 の作業](2026-08-11-align-dev-environment.md)のあとに向こうだけが進んだ差分を取り込んだ。
**機能追加はしていない。**

## やったこと

| | 内容 | 主な成果物 |
|---|---|---|
| 1 | フォーマッタ (oxfmt) の導入と全体整形 | `.oxfmtrc.json` / `fmt` / `fmt:check` |
| 2 | 検証コマンドの一本化 | `npm run verify` |
| 3 | 成果物 (`dist/`) の検査 | `scripts/check-dist.mjs` / `npm run check` |
| 4 | `zip` を検査ゲート付きにした | `zip` = verify → build → check → `zip:pack` |
| 5 | `.env`（ID 固定 / console 残し） | `.env.example` / `scripts/with-key.mjs` / `vite.config.ts` |
| 6 | CI に整形チェックと成果物検査を追加 | `.github/workflows/ci.yml` |

`.gitignore` に `/temp`（参考用に置く別プロジェクトのファイルの置き場）、
`.claude/memory/` に `no-auto-commit` を追加した。

## 判断したこと

### 「フォーマッタは入れない」という方針を覆した

[CLAUDE.md](../../CLAUDE.md) にはこう書いてあった。

> **フォーマッタは意図的に入れていません。** 行数が少ないので整形は簡単ですが、
> このリポジトリのスタイルには**フォーマッタが必ず壊すもの**が含まれており、
> 一括整形すると差分が読めなくなるうえ姉妹プロジェクトとも揃わなくなります。

**後半は事実誤認だった。** 姉妹プロジェクトは oxfmt を導入済みで、揃えるなら**入れるほうが揃う**。
前半（壊れるものがある）は正しく、実際に次の2つは失われた。

| 失ったもの | 例 |
|---|---|
| 括弧の内側のスペース | `function qs( query: string )` → `qs(query: string)` |
| オブジェクトリテラルの値の縦揃え | `size:   2,` / `skin   : "1",` → `size: 2,` |

一方、**残ると思っていなかったものは残った。**

- 短絡実行の文（`tab && chrome.tabs.sendMessage(...)`）は保たれる。長いと改行が入るだけ
- `src/ts/i18n.ts` の `"ja":` の引用符は `quoteProps: "preserve"` で保たれる

整形されたのは **27 ファイル**（`src/ts/` / `tests/` / `scripts/` / `vite.config.ts` / `syncVersion.js`）。
**この変更以降、`git log -p` で見る差分の大半は整形由来**になる。

### `.oxfmtrc.json` の2つの値は検査スクリプトの都合で決まっている

既定値のままだと**このリポジトリの検査が壊れる**。設定ファイルの `_readme` にも書いたが、
外されやすいのでここにも残す。

| | 値 | 外すと何が起きるか |
|---|---|---|
| `printWidth` | 200 | `T( "..." )` が折り返され、[check-ui.mjs](../../scripts/i18n/check-ui.mjs) の走査（ソースをテキストとして読む）に当たらず、翻訳キーが「未使用」と誤判定される |
| `quoteProps` | `preserve` | `transData` の `"ja":` から引用符が外れ、`tableLangs()` が言語コードを拾えず対応表が空になる |

`ignorePatterns` の `src/_locales/**` も同様で、`i18n:check:store` が単一ソースと突き合わせるため
触れると必ず落ちる。

### oxfmt のバージョンは厳密固定にした（`^` を付けない）

整形結果はパッチバージョンでも変わりうる。上がった瞬間に無関係な差分が出て CI の `fmt:check` が
落ちるので、`"oxfmt": "0.62.0"` と書いた。姉妹プロジェクトと同じバージョンでもある。
**上げるときは意図的に上げ、`npm run fmt` の差分ごとコミットする。**

### 拡張機能 ID を固定する理由が姉妹プロジェクトと違う

向こうの `.env` は `chrome.storage.sync` を実機で検証するためのもの（ID が違うと同期しない）。
**simpLoupe は `sync` を使っていない**ので、そのままでは理由が成立しない。

移す価値があると判断したのは**保存値のマイグレーション検証**のため。`chrome.storage.local` も
ID ごとに区切られているので、開発用ビルドは常に「設定を1つも持っていない新規ユーザー」になる。
`shape: "quare"` のような既存の値を持った状態を再現できない
（→ [CLAUDE.md](../../CLAUDE.md) の「保存済みのキーと値を勝手に改名しない」）。
公開版と同じ ID にすれば、公開版が書いた保存値をそのまま読める。

`.env.example` の文面はこの理由に書き換えてある。**同期の話をそのまま持ってこないこと。**

### 差し込みは「明示的に呼んだときだけ」にした（既定を安全側に）

`.env` に鍵があっても、それだけでは差し込まない。`scripts/with-key.mjs` が立てる
`SIMPLOUPE_INJECT_KEY` が要る。逆（あれば常に差し込む）にすると、外し忘れた鍵入りの成果物を
そのまま提出してしまう。`npm run build` / `npm run zip` は `.env` の状態に関わらず必ず鍵無しになる。

### `build` の順序を変えた（`copy:*` を `build:js` より先に）

```diff
-"build": "run-s clean build:* copy:*"
+"build": "run-s clean build:version copy:* build:js"
```

鍵の差し込みは vite プラグインの `closeBundle` で `dist/manifest.json` を書き換える方式なので、
**`copy:manifest` が後だと上書きされて消える。** 順序を戻すと差し込みが黙って効かなくなる
（`vite.config.ts` の該当プラグインにも ⚠️ で書いた）。

`build:*` のワイルドカードをやめたのは、`build:test` を足したため。残していると
`build` が `build:test` を呼び、`build:test` が `build` を呼ぶ**無限再帰**になる。

### `check-dist.mjs` に simpLoupe 固有の検査を足した

姉妹プロジェクト版（version / key / console / `import` / `exports` / チャンク切り出し）に加えて、
このリポジトリで壊れうるものを3つ足した。

1. **著作権表示 (banner) の有無。** 両方の JS の先頭に `@license` があること、
   `content-script.js` に `BSD-3-Clause` の再掲があること。banner は
   [vite.config.ts](../../vite.config.ts) に書いてあるだけなので、設定を触ると黙って消える。
   **法的に要求されている表示** → [design/architecture.md](../design/architecture.md)
2. **manifest が参照するアイコンの実在。** `copy:img` が取りこぼしてもビルドは成功する
3. **`dist/_locales` が `src/_locales` と一致すること。** 同上（35ロケール）

### CI は `npm run zip` ではなく `zip:pack` を呼ぶ

`zip` が verify から通しで走るようになったので、CI で `zip` を呼ぶと lint / test / build が
**二重に走る**。CI 側はステップを個別に見せたいので、`check` までを個別ステップにして
最後に `zip:pack` だけを呼ぶ形にした。

## 実測したこと

推測で書いていないことの裏付け。

| 確認したこと | 結果 |
|---|---|
| 整形後に `npm run verify` が通るか | lint エラー 0（警告2件は整形前から）/ typecheck 0 / **166 テスト全通過** / i18n エラー 0 |
| 鍵入りのまま `npm run check` | **exit 1**「manifest に key が入っている」 |
| `SIMPLOUPE_KEEP_CONSOLE=1` でビルドして `npm run check` | **exit 1** 2件（content-script と service-worker の両方） |
| `npm run build:test` → `npm run check:test` | OK（`dist/manifest.json` に `key` が入り、`--test` では通る） |
| `.env` を消して `npm run build` → `npm run check` | OK（鍵も console も入らない） |

`check-ui.mjs` / `check-store.mjs` の走査は `T(\s*` のように空白を許す正規表現だったため、
括弧内スペースが消えても**そのまま動いた**（`printWidth` の折り返しだけが危険だった）。

## 移していないもの

姉妹プロジェクトにあるが、**意図的に持ってこなかったもの。**

| | なぜ |
|---|---|
| `store:check`（掲載文の各言語版が日本語マスターに追随しているか） | simpLoupe には日本語マスターがまだ無い（`work/store_description.md` は断片）。検査する対象が存在しない → [known-issues.md](../known-issues.md) |
| Firefox 対応一式（`web-ext` / `firefox:*` / `manifest.config.ts`） | 対応予定が無い。理由は [design/architecture.md](../design/architecture.md#対象ブラウザ) |
| `i18n:verify` を CI に足すこと | simpLoupe の `i18n:check:store` が**生成物のずれも見ている**ので重複する。向こうが `i18n:verify` なのは `i18n:check` に未解決の問題が残っているという別事情 |
| `terserOptions.format.comments` | 向こうは付けているが、**このリポジトリでは効かないことを実測済み**（vite 8 / rolldown 経由）。だから banner 方式にしてある。付けても無害だが、効かない設定を残すと次に読む人が誤解する |

逆に、**CI は simpLoupe のほうが進んでいる**（全ブランチで実行 / `concurrency` で古い実行を打ち切り /
`permissions: contents: read`）。向こうに合わせて後退させることはしていない。

## 直していないこと

既知の問題は1件も直していない（→ [known-issues.md](../known-issues.md)）。
この作業は検査の整備であって、振る舞いを変えるものではない。

**実機確認はしていない。** 確認できたのは「整形後も型・lint・テストが通る」「production ビルドが
出る」「検査が意図どおり止まる」までで、ビルドした `dist/` を Chrome に読ませてはいない。
`vite.config.ts` を触っている（プラグインの追加と `drop_console` の条件化）ので、
**次に触る人は最初に実機で開閉と拡大を確認すること** → [workflow.md](../workflow.md#動作確認の観点)
