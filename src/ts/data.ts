/**
 * @license
 * Copyright (C) piayo.
 */

import { Config } from "./types";

/**
 * 設定の既定値。service worker が保存データを組み立てるときに使う。
 *
 * 読み出し側が `Object.assign({}, defaultConfig, 保存値)` しているので、
 * **Config にキーを足しても既存ユーザーにはここの値が入る。**
 *
 * ⚠️ 既定値はもう1箇所ある（element.ts の `@state config`）。
 * 現在 `skin` の値が食い違っている（こちらは "1"、あちらは "2"）。
 * **変えるときは両方直すこと** → docs/known-issues.md
 */
export const defaultConfig: Config = {
    size: 2,
    zoom: 2,
    shape: "round",
    cursor: "crosshair",
    skin: "1",
};
