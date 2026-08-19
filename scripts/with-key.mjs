#!/usr/bin/env node
/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * 拡張機能 ID を固定した状態で npm スクリプトを走らせる。
 *
 *   node scripts/with-key.mjs build
 *   node scripts/with-key.mjs zip
 *
 * `.env` の `SIMPLOUPE_KEY` を `dist/manifest.json` の `key` に差し込ませる。
 * 差し込み自体は vite.config.ts のプラグインが行い、**この目印が無いと差し込まない**。
 *
 * ## なぜ「付けたときだけ」にしているか
 *
 * 逆（`.env` にあれば常に差し込む）にすると、外し忘れた鍵入りの成果物を
 * そのままストアへ提出してしまう。**既定を安全側に倒し、必要なときだけ
 * 明示的に付ける。**
 *
 * ## なぜ環境変数を直接書かないか
 *
 * `SIMPLOUPE_INJECT_KEY=1 npm run build` は Windows のコマンドプロンプトで動かない。
 * ここを Node で吸収して、cross-env を足さずに済ませている。
 */

import { spawn } from "node:child_process";

const script = process.argv[2];

if (!script) {
    console.error("Usage: node scripts/with-key.mjs <npm-script>");
    process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(npm, ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, SIMPLOUPE_INJECT_KEY: "1" },
});

child.on("close", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
    console.error("[with-key]", error);
    process.exit(1);
});
