#!/usr/bin/env node
/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * ストアへ提出する成果物 (dist/) の検査。
 *
 *   node scripts/check-dist.mjs        リリース用。問題があれば exit 1
 *   node scripts/check-dist.mjs --test 検証用ビルド向け（key と console があってよい）
 *
 * ## なぜ必要か
 *
 * lint / typecheck / test は**ソース**を見る。ここで見たいのは**出来上がった zip の中身**で、
 * 両者がずれる経路がいくつもある。
 *
 * - `.env` の戻し忘れ … `SIMPLOUPE_KEY` は ID を公開版と衝突させ、
 *   `SIMPLOUPE_KEEP_CONSOLE` は利用者の環境にログを撒く
 * - `format: "iife"` なのに名前付き export を足すと `exports` を参照するコードが出る。
 *   **ビルドは成功するのに読み込み時に落ちて、拡張機能の登録そのものが失敗する**
 * - 著作権表示は banner で入れているだけなので、vite の設定を触ると黙って消える。
 *   これは法的に要求されている表示 → docs/design/architecture.md
 *
 * 途中でどう作られたかは見ない。**提出物そのものが正しいこと**だけを確かめる。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = resolve(rootDir, "dist");

const isTest = process.argv.includes("--test");
const problems = [];

const read = (path) => readFileSync(resolve(distDir, path), "utf8");

// ------------------------------------------------------------------
// まず土台。ここが欠けていると以降の検査が全部意味を失うので、先に打ち切る

const required = ["manifest.json", "js/content-script.js", "js/service-worker.js"];
for (const path of required) {
    if (!existsSync(resolve(distDir, path))) {
        problems.push(`${path} が無い。npm run build を先に実行すること`);
    }
}
if (problems.length) {
    problems.forEach((m) => console.error(`ERROR ${m}`));
    process.exit(1);
}

const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));

// ------------------------------------------------------------------
// version は package.json だけが正。syncVersion.js が同期に失敗していたら気づきたい

if (manifest.version !== pkg.version) {
    problems.push(`manifest の version (${manifest.version}) が package.json (${pkg.version}) と違う`);
}

// ------------------------------------------------------------------
// 拡張機能 ID を固定する鍵。リリースには入れない

if (manifest.key && !isTest) {
    problems.push("manifest に key が入っている。.env の SIMPLOUPE_KEY を空にして再ビルドすること");
}
if (!manifest.key && isTest) {
    problems.push("検証用ビルドなのに manifest に key が無い。.env の SIMPLOUPE_KEY を確認すること");
}

// ------------------------------------------------------------------
// manifest が参照しているファイルが実在するか。
// アイコンとロケールは copy:* が拾い損ねても**ビルドは成功する**ので、ここでしか気づけない

for (const [size, path] of Object.entries(manifest.icons ?? {})) {
    if (!existsSync(resolve(distDir, path))) {
        problems.push(`icons[${size}] の ${path} が dist に無い（copy:img を確認すること）`);
    }
}

const srcLocales = readdirSync(resolve(rootDir, "src/_locales")).sort();
const distLocales = existsSync(resolve(distDir, "_locales")) ? readdirSync(resolve(distDir, "_locales")).sort() : [];
if (distLocales.join() !== srcLocales.join()) {
    problems.push(`_locales が src と違う（src ${srcLocales.length} / dist ${distLocales.length}）。copy:locales を確認すること`);
}
if (manifest.default_locale && !distLocales.includes(manifest.default_locale)) {
    problems.push(`default_locale (${manifest.default_locale}) のディレクトリが dist/_locales に無い`);
}

// ------------------------------------------------------------------
// JS の中身

for (const path of ["js/content-script.js", "js/service-worker.js"]) {
    const js = read(path);

    // 調査用のログ。terser の drop_console で消えるはずのもの
    if (/console\.(log|table|debug|info)\s*\(/.test(js) && !isTest) {
        problems.push(`${path} に console が残っている。.env の SIMPLOUPE_KEEP_CONSOLE を空にして再ビルドすること`);
    }

    // IIFE に import / export が出ていたら、その場で壊れている
    if (/(^|[^.\w])import\s+[^(]*?\bfrom\s*["']/.test(js)) {
        problems.push(`${path} に import 文がある。共有モジュールがチャンクに切り出された可能性がある`);
    }
    // `Object.defineProperty(exports,Symbol.toStringTag,...)` の形で出るので、
    // `exports.` や `exports[` だけを見ていると素通りする
    if (/(^|[^.\w$])exports\b/.test(js)) {
        problems.push(`${path} が exports を参照している。エントリから名前付き export を消すこと（読み込み時に落ちる）`);
    }

    // 著作権表示。banner で入れているので、vite.config.ts を触ると黙って消える
    if (!js.startsWith("/**\n * @license")) {
        problems.push(`${path} の先頭に @license の banner が無い（vite.config.ts の banner を確認すること）`);
    }
}

// lit を同梱するのは content-script だけ。BSD-3-Clause の再掲が要る
const contentScript = read("js/content-script.js");
if (!contentScript.includes("BSD-3-Clause")) {
    problems.push("js/content-script.js にサードパーティの著作権表示が無い（lit の BSD-3-Clause は再掲が必要）");
}

// 切り出されたチャンクが残っていないか（IIFE では読み込めない）
const chunk = contentScript.match(/["'][^"']*\.(?:c?js)["']/g) ?? [];
const bad = chunk.filter((s) => !/content-script|service-worker/.test(s));
if (bad.length) {
    problems.push(`js/content-script.js が別ファイルを参照している: ${bad.join(", ")}`);
}

// ------------------------------------------------------------------

if (problems.length) {
    console.error(`[check] NG: ${problems.length} 件`);
    problems.forEach((m) => console.error(`ERROR ${m}`));
    process.exit(1);
}

console.log(`[check] OK: ${manifest.version}${isTest ? "（検証用。key あり）" : ""}`);
