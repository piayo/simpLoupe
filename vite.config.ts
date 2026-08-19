import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { minifyTemplateLiterals } from "rollup-plugin-minify-template-literals";

// ▼ 配布物の著作権表示
//
// 同梱するサードパーティ (lit 系 = BSD-3-Clause / @webcomponents/custom-elements = Polymer の
// BSD スタイル) は、**バイナリ配布時に著作権表示・ライセンス条項・免責事項を再掲すること**を
// 求めている。ところが表示は build の途中で失われる:
//
//   1. `@license` の付かないコメント (@webcomponents のもの) は rolldown のバンドル段階で消える
//   2. 残った `@license` コメントも minify で消える。`terserOptions.format.comments` は
//      vite 8 (rolldown) 経由では効かない (`"some"` も正規表現も試したが無効。
//      `compress.drop_console` は効くので terserOptions 自体は届いている)
//
// そのため**上流のコメントの保持に頼らず、banner に全文を書いて必ず残す**方式にしている。
// これは法的に要求されている表示なので、消さないこと。依存を増やしたときは
// そのライセンスをここに追記する。

const BANNER_SELF = `/**
 * @license
 * simpLoupe <https://github.com/piayo/simpLoupe>
 * Copyright (c) 2024 piayo
 * SPDX-License-Identifier: MIT
 */`;

const BANNER_THIRD_PARTY = `/**
 * @license
 * This file bundles third-party code. Their notices follow.
 *
 * ----------------------------------------------------------------------------
 * lit-html, lit-element, @lit/reactive-element
 * Copyright (c) 2017 Google LLC. All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * BSD 3-Clause License
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ----------------------------------------------------------------------------
 * @webcomponents/custom-elements
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 *
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also subject to
 * an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 * ----------------------------------------------------------------------------
 */`;

// service-worker.js は lit を含まないので、サードパーティの表示は入れない
// （含んでいないものの表示を貼ると、かえって何が入っているか分からなくなる）
function banner(chunk: { modules?: Record<string, unknown> }): string {
    const hasThirdParty = Object.keys(chunk.modules ?? {}).some((id) => id.includes("node_modules"));
    return hasThirdParty ? `${BANNER_SELF}\n${BANNER_THIRD_PARTY}` : BANNER_SELF;
}

/**
 * `.env` の `SIMPLOUPE_KEY` を `dist/manifest.json` の `key` に差し込む。
 *
 * **拡張機能 ID を固定するため。**「パッケージ化されていない拡張機能を読み込む」では
 * ID が読み込み元のパスから作られるので**マシンごと・置き場所ごとに変わる**。
 * `chrome.storage.local` の保存領域は ID ごとに区切られているため、ID が違うと
 * **設定を1つも持っていない別の拡張機能**として起動する。公開版と同じ ID にすると、
 * 公開版が書いた保存値をそのまま読めるので、**マイグレーションの実機確認ができる。**
 *
 * ## 差し込むのは `npm run build:test` / `zip:test` のときだけ
 *
 * `.env` に鍵があっても、それだけでは差し込まない。`scripts/with-key.mjs` が
 * 立てる `SIMPLOUPE_INJECT_KEY` が要る。
 *
 * **既定を安全側に倒すため。**「あれば差し込む」にすると、外し忘れた鍵入りの
 * 成果物をそのままストアへ提出してしまう。`npm run build` / `npm run zip` は
 * `.env` の状態に関わらず**必ず鍵無し**になる。
 *
 * ⚠️ `dist/manifest.json` は `copy:manifest` が `src/manifest.json` からコピーする。
 * **このプラグインはその後に走る必要がある**ので、package.json の `build` は
 * `copy:*` を `build:js` より先に並べてある。順序を戻すと差し込みが消える。
 *
 * ⚠️ 書き戻しは syncVersion.js と同じくインデント2スペース。manifest.json の整形を保つ。
 */
function injectExtensionKey(key: string): Plugin {
    const path = "dist/manifest.json";
    return {
        name: "simploupe-inject-extension-key",
        apply: "build",
        closeBundle() {
            if (!key) {
                return;
            }
            if (!existsSync(path)) {
                this.warn(` が無いので key を差し込めない（copy:manifest より先に走っている）`);
                return;
            }
            const manifest = JSON.parse(readFileSync(path, "utf8"));
            manifest.key = key;
            writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
            console.log("\n⚠️  SIMPLOUPE_KEY を manifest に差し込んだ（拡張機能 ID が公開版と同じになる）");
            console.log("   ストアへ提出する zip には含めないこと\n");
        },
    };
}

// vitest の設定もこのファイルに置いている（`vitest.config.ts` は作らない）。
// vitest は `vitest.config.ts` があるとそちらを優先して **vite.config.ts を完全に無視する**ため、
// 分けていると「テストが見ているコード」と「配布されるコード」が静かに食い違う。
// 実際に分けていたときは `style="--cursor: none"` を期待するテストが通っていたが、
// 配布物では minify-literals が空白を削って `--cursor:none` になっていた。
export default defineConfig(({ mode }) => {
    const isProd = mode === "production";
    // 第3引数を "" にすると VITE_ 接頭辞なしの変数も読める
    const env = loadEnv(mode, process.cwd(), "");
    console.log("...mode:", mode);
    return {
        root: "./",
        base: "./",
        envDir: "./",
        publicDir: "./public",
        build: {
            outDir: "dist",
            emptyOutDir: false,
            assetsDir: "./",
            sourcemap: false,
            minify: isProd ? "terser" : false,
            terserOptions: {
                compress: {
                    // ⚠️ 調査用。SIMPLOUPE_KEEP_CONSOLE=1 のときだけ console を残す。
                    //    リリースのビルドでは必ず落とすこと（既定は落とす。npm run check が検出する）
                    drop_console: !env["SIMPLOUPE_KEEP_CONSOLE"],
                },
            },
            lib: {
                name: "simploupe",
                fileName: (format, entryName) => `${entryName}.js`,
                entry: {
                    "js/content-script": "src/ts/content-script.ts",
                    "js/service-worker": "src/ts/service-worker.ts",
                },
            },
            rollupOptions: {
                output: {
                    format: "iife",
                    banner,
                },
            },
            // ファイルの変更を監視
            watch: isProd
                ? null
                : {
                      include: ["src/**/*.ts"],
                  },
        },
        optimizeDeps: {},
        resolve: {
            alias: [],
        },
        plugins: [
            // html`...` / css`...` の中身を圧縮する。
            //
            // node_modules を除外する理由: lit の css-tag.js / reactive-element.js が
            // `unsafeCSS` を含むため、minify-literals が
            // "unsafeCSS() detected in source. CSS minification will not be performed for this file."
            // を毎回2件出す。依存を圧縮する必要は無いので、走査ごと外してノイズを消す。
            //
            // **styles.ts は除外しないこと。** unsafeCSS を使っていないので警告の原因ではなく、
            // 除外すると 249 行の CSS が圧縮されなくなる（現状は圧縮されている）。
            //
            // v2.1.0 に `failOnError` は無い（型にもコードにも無く、失敗は常に this.warn になる）。
            // 渡しても黙って無視されるので書かない。
            //
            // `apply: "build"` を付けているのは、この設定ファイルを vitest と共用しているため。
            // 付けないとテストの transform でも走る。ビルド時の最適化であって振る舞いではないので、
            // テストは圧縮前のソースの意味を検証する。外さないと
            // `style="--cursor: ${cursor}"` が `--cursor:none` に縮んで属性値の検証が落ちる。
            {
                ...minifyTemplateLiterals({
                    exclude: ["**/node_modules/**"],
                }),
                apply: "build",
            } as any,

            // 拡張機能 ID を固定する。build:test / zip:test のときだけ効く
            injectExtensionKey(env["SIMPLOUPE_INJECT_KEY"] ? (env["SIMPLOUPE_KEY"] ?? "") : ""),
        ],
        test: {
            // 任意のページ上に置かれる Web Component とルーペの DOM を組み立てるため
            environment: "happy-dom",
            include: ["tests/**/*.test.ts"],
            coverage: {
                provider: "v8",
                include: ["src/ts/**/*.ts"],
                exclude: [
                    "src/ts/types.ts", // 型定義のみ。実行コードが無い
                    "src/ts/ext-simploupe/index.ts", // re-export のみ
                    "src/ts/ext-simploupe/styles.ts", // css`` の文字列のみ
                ],
            },
        },
    };
});
