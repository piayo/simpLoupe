# 作業手順

## 環境構築

```sh
nvm use          # .nvmrc = v24.19.0
npm ci
cp .env.example .env   # 任意
```

`package.json` の `devEngines` は `onFail: "error"` です。**Node 24 未満のシェルでは
`npm ls` すら `EBADDEVENGINES` で失敗します。** npm が謎の失敗をしたら、まず `node -v` を見てください。

`.npmrc` に `min-release-age=7` を設定しています。公開から7日未満のバージョンをインストールしない設定で、
npm のサプライチェーン攻撃対策です。出たばかりのパッケージを入れたいときは一時的に外す必要があります。

### `.env` は無くても動く

[.env.example](../.env.example) をコピーするだけで、**中身は両方とも空で構いません。**
必要になるのは次の2つの場面だけです。

| 変数 | いつ要るか |
|---|---|
| `SIMPLOUPE_KEY` | 既存ユーザーの保存値でマイグレーションを試すとき。拡張機能 ID を公開版と同じに固定する |
| `SIMPLOUPE_KEEP_CONSOLE` | minify 済みの production ビルドのまま `console.*` を追いたいとき |

どちらも**明示的に `npm run build:test` / `npm run zip:test` を呼んだときだけ**効きます。
`npm run build` / `npm run zip` は `.env` の状態に関わらず鍵無し・console 無しになり、
混入していれば `npm run check` が止めます。

`SIMPLOUPE_KEY` を使うときは、**ストア版の simpLoupe を先に無効化してください。**
ID が衝突して読み込めません。値の取り方は [.env.example](../.env.example) に書いてあります。

### 整形は oxfmt に任せる

```sh
npm run fmt         # 直す
npm run fmt:check   # 検査だけ（CI が回している）
```

バージョンは `0.62.0` に厳密固定です。整形結果はパッチバージョンでも変わることがあり、
上がると無関係な差分で CI が落ちます。設定 ([.oxfmtrc.json](../.oxfmtrc.json)) の
`printWidth` と `quoteProps` は**検査スクリプトを壊さないための値**なので変えないでください
（理由はファイル内の `_readme` と [CLAUDE.md](../CLAUDE.md)）。

## 開発

```sh
npm run dev
```

`dist/` に development ビルド（未圧縮・`console.log` 残し）を出力し、`src/**/*.ts` を監視して自動で再ビルドします。
production ビルド（`npm run build`）では terser が `console.*` を除去します
（`.env` の `SIMPLOUPE_KEEP_CONSOLE=1` で残せますが、`npm run check` が止めるので
そのまま提出することはできません）。

### Chrome に読み込む

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ **`dist/` を選択**
4. 適当な `https://` のページを開いてリロードする

### 変更を反映する

| 変更したもの | 必要な操作 |
|---|---|
| `src/ts/content-script.ts`, `src/ts/ext-simploupe/**`, `src/ts/util.ts`, `src/ts/i18n.ts` | 確認しているページをリロード |
| `src/ts/service-worker.ts` | `chrome://extensions` で拡張機能の再読み込み → ページもリロード |
| `src/manifest.json`, `src/_locales/`, `src/img/` | `chrome://extensions` で拡張機能の再読み込み |
| 右クリックメニューの定義（`onInstalled` 内） | 拡張機能の**削除 → 再読み込み**（`onInstalled` は再読み込みだけでは走らないことがある） |

> content script は**インストール直後や更新直後、既に開いているタブには注入されません。**
> 「アイコンを押しても何も出ない」ときは、まずページをリロードしてください。

### デバッグの見方

ログが2か所に分かれます。**片方だけ見て「動いていない」と判断しないでください。**

| 見たいもの | どこ |
|---|---|
| ルーペ本体・設定パネル・キャプチャの描画 | ページの DevTools コンソール |
| storage の読み書き、`captureVisibleTab`、アイコン / メニューの有効切替 | `chrome://extensions` → simpLoupe の「Service Worker」リンク |

service worker は数十秒アイドルすると停止します。**停止しているのが正常**で、メッセージが届けば起き直します。

## 動作確認の観点

ルーペは「**表示中のタブのビットマップを撮って、canvas で拡大する**」仕組みです
（→ [design/architecture.md](design/architecture.md)）。壊れ方が環境に強く依存するので、
以下を一通り確認してください。

### 起動と終了

- [ ] 拡張機能アイコンのクリックで表示 → もう一度クリックで非表示
- [ ] 右クリックメニューから表示
- [ ] `Esc` で閉じる（`<dialog>` の close → `hide()` が走る）
- [ ] ルーペ本体のクリックで設定パネルが開閉する。**パネルの中のクリックでは閉じない**
- [ ] 表示中はページ側の操作ができないこと（`showModal()` によって背後が inert になる仕様）

### 設定の組み合わせ

`zoom` / `size` はスライダで 2〜5。**両端は必ず見ること。**

- [ ] zoom = 2 と 5（拡大率。カーソル位置が中心からずれていないか）
- [ ] size = 2 と 5（ルーペの直径。`160 + 80 × size` px = 320〜560px）
- [ ] shape = round / square（※**保存される値は `quare`**。表示ラベルだけ正しい綴りに直してある
      → [known-issues.md](known-issues.md)）
- [ ] skin = 1 / 2 / 3（1:影のみ 2:半透明リング 3:金属フレーム。3 は枠が `inset: -18px` まで外に出る）
- [ ] cursor = cross / none
- [ ] 設定を変えた直後に**再描画される**こと（`commit()` → `save` → 再描画）
- [ ] ページをリロードしても設定が復元されること（`chrome.storage.local` の `config`）

### ページの種類

- [ ] ふつうの `https://` ページ
- [ ] 縦に長いページを**スクロールしたあと**（100ms 後に再キャプチャされる）
- [ ] 横スクロールのあるページ
- [ ] `position: fixed` のヘッダがあるページ（キャプチャは画面の見たままなので追従する）
- [ ] `<iframe>` を含むページ（**ルーペ UI はトップフレームだけ**。`all_frames: false`。ただし
      拡大対象はビットマップなので iframe の中身も拡大される）
- [ ] `<video>` / `<canvas>` を含むページ
- [ ] `http://` のページ
- [ ] **動かないページ**で無害に終わること → [design/permissions.md](design/permissions.md)
      - `chrome://` 系、Chrome ウェブストア、Chrome 内蔵 PDF ビューア、`file://`（設定次第）、新しいタブ

### 環境

- [ ] ウィンドウのリサイズ後（100ms 後に再キャプチャ）
- [ ] ブラウザズーム 100% 以外（**既知の問題あり** → [known-issues.md](known-issues.md)）
- [ ] Retina と非 Retina の両方。**ルーペを開いたままウィンドウを別解像度のモニタへ移す**
      （`devicePixelRatio` を開いた時点でしか読まないため）
- [ ] `prefers-reduced-motion: reduce`（`--speed: 0ms` になり、開閉アニメが消える）
- [ ] 同じタブで**別のページへ遷移したあと**にもう一度起動する
- [ ] **日本語環境で設定パネルのラベル・アイコンの tooltip・右クリックメニューが日本語になる**
      （英語環境では英語。→ [design/i18n.md](design/i18n.md)）

## 翻訳を編集する

| 編集したいもの | 編集する場所 | そのあと |
|---|---|---|
| 設定パネルの文言 | `src/i18n/ui/<lang>.json` | 何もしなくてよい（直接 import している） |
| 説明文・tooltip・メニュー名 | `src/i18n/store/messages.json` | **`npm run i18n:build`** |
| 言語を増やす（UI） | `src/i18n/ui/<lang>.json` を追加 | `src/ts/i18n.ts` に import と `transData` を1行 |
| 言語を増やす（ストア） | `src/i18n/store/locales.json` と `messages.json` | `npm run i18n:build` |

**`src/_locales/` を直接編集しないこと。** 次の生成で黙って戻ります。
詳細と決めた理由は [design/i18n.md](design/i18n.md)。

## 検証

```sh
npm run verify     # 下の4つを通しで実行する
```

| | 内容 |
|---|---|
| `npm run lint` | oxlint。エラー 0 を維持する |
| `npm run fmt:check` | 整形されているか（直すのは `npm run fmt`） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run i18n:check` | i18n データの検査（生成物のずれも見る） |

**ソースではなく成果物を見る検査が別にあります。**

```sh
npm run build
npm run check      # dist/ を検査する
```

`check` が塞いでいるのは、**lint も test も通るのに提出物だけが壊れる**経路です。

- `.env` の戻し忘れ（`key` の混入、`console.*` の残り）
- `format: "iife"` なのに `exports` を参照するコードが出る。ビルドは成功するのに
  **読み込み時に落ちて拡張機能の登録そのものが失敗する**
- 著作権表示 (banner) の消失。これは法的に要求されている表示です
- `dist/_locales` やアイコンの取りこぼし（`copy:*` が失敗してもビルドは成功する）

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) が**全ブランチの push と PR** で同じことを実行し、
`zip` まで作って artifact に保存します。作業ブランチを push した時点で結果が出るので、
PR を作る前に壊れていることに気づけます。タグの push では走りません。

**キャプチャと canvas の実描画は自動テストで守れません**（→ [design/testing.md](design/testing.md)）。
`src/ts/ext-simploupe/` と `service-worker.ts` の `capture` に触ったときは、
必ず上の「動作確認の観点」を実機で通してください。

## リリース

### 1. バージョンを上げる

**`package.json` の `version` が正**です。`src/manifest.json` は `npm run build` 時に
[syncVersion.js](../syncVersion.js) が同期するので、直接書き換えないでください。

```sh
npm version patch --no-git-tag-version   # 2.0.2 -> 2.0.3
```

### 2. 変更履歴を更新する

[CHANGELOG.md](../CHANGELOG.md) の「未リリース」をバージョン見出しに変えます。
**利用者に見える変更**（機能・修正）と**開発環境の変更**（開発）を混ぜないこと。

### 2.5. i18n の生成物を確認する

```sh
npm run i18n:check
```

`src/_locales/` が単一ソースとずれていたら `npm run i18n:build` を実行してコミットします。

### 3. ビルドして固める

```sh
npm run zip        # -> zip/2.0.3.zip
```

`zip` は **verify → build → check → 固める** の順で走ります。途中で落ちたら zip は作られないので、
「検証を忘れたまま提出用の zip を作る」ことができません。個別に走らせる必要はありません。

`.env` に `SIMPLOUPE_KEY` や `SIMPLOUPE_KEEP_CONSOLE` が残っていても、`npm run zip` の成果物には
入りません（差し込むのは `build:test` / `zip:test` だけ）。万一入っていれば `check` が exit 1 で止めます。

`zip/` は gitignore 済みです。生成物をコミットしないでください。

### 4. 動作確認

`zip` を作る前の `dist/` を Chrome に読み込んで、上の「動作確認の観点」を一通り確認します。

### 5. ストアにアップロード

1. [Chrome ウェブストア デベロッパー ダッシュボード](https://chrome.google.com/webstore/devconsole) を開く
2. simpLoupe → 「パッケージ」→「新しいパッケージをアップロード」で `zip/${version}.zip` を選択
3. 必要なら「ストアの掲載情報」の説明文（[work/store_description.md](../work/store_description.md)）と
   スクリーンショット（`work/`）を更新
4. 「審査のために送信」

審査には通常数日かかります。
**`optional_host_permissions` に `<all_urls>` を宣言しているため、権限の説明を求められることがあります**
（→ [design/permissions.md](design/permissions.md)）。

### 6. コミットとタグ

```sh
git commit -am "2.0.3"
git tag v2.0.3
git push && git push --tags
```

## ドキュメントの書き方

`docs/` 配下の使い分けです。

| ディレクトリ | 内容 | ライフサイクル |
|---|---|---|
| `docs/design/` | 設計。**今どうなっているか** | 常に最新に保つ。消さない |
| `docs/plan/` | プラン。**これから何をするか** | **完了したら削除する** |
| `docs/work/` | 作業記録。**何をしたか / なぜそうしたか** | 作業の区切りごと。**プラン完了時は必ず書く**（消えるプランの受け皿） |
| `docs/known-issues.md` | 未修正の問題 | 見つけたら追記、直したら削除 |
| [CHANGELOG.md](../CHANGELOG.md) | 変更履歴 | リリースごと / プラン完了ごとに1行 |

ファイル名は `docs/plan/` と `docs/work/` は `YYYY-MM-DD-<内容>.md` にします。

### 完了したプランは消す

`docs/plan/` に完了済みのプランが溜まると、**どれが生きているのか分からなくなります。**
やり切ったら次の順で片付けてください。

1. **`docs/work/` に作業記録を書く** — 何をしたか、なぜそう決めたか、何につまずいたか。
   プランは消えるので、**経緯が残る唯一の場所**になります
2. プランで決めたことのうち**今後も効くもの**（設計判断・規約）を `docs/design/` に移す
   — 決定の**理由**まで移すこと。理由が消えると、後から誰かが同じ議論をやり直します
3. 未解決のまま残る問題を [known-issues.md](known-issues.md) に移す
4. [CHANGELOG.md](../CHANGELOG.md) の「未リリース」に1行書く
5. **プランのファイルを削除する**
6. **そのプランを指しているリンクを直す**

```sh
grep -rn "plan/<消したファイル名>" --include="*.md" .
```

### 3つの記録の役割

| | 読み手 | 粒度 |
|---|---|---|
| [CHANGELOG.md](../CHANGELOG.md) | 開発者 | **1行**。「何が変わったか」だけ |
| `docs/work/` | 後から経緯を追う人 | **詳しく**。判断の理由、試して捨てた案、つまずき |
| `docs/design/` | これから触る人 | **今の姿だけ**。経緯は書かない |

`docs/work/` に**そこにしか無い知見を作らない**でください。後から効く事実は `docs/design/` か
`known-issues.md` に必ず書き、作業記録は「そのときの経緯」を追える読み物にします。
そうしておけば、古くなった作業記録はいつでも消せます。
