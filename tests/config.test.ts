import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/ts/data";
import type { Config } from "../src/ts/types";

/**
 * 設定は chrome.storage に丸ごと入る。
 * 値そのものが**保存済みデータとの契約**なので、うかつに変えられない。
 */
describe("defaultConfig", () => {
    it("Config の全キーが埋まっている", () => {
        // 欠けると getConfig のマージで undefined が混ざり、CSS の data 属性が壊れる
        const keys: (keyof Config)[] = ["skin", "shape", "size", "zoom", "cursor"];
        expect(Object.keys(defaultConfig).sort()).toEqual([...keys].sort());
    });

    it("既定値", () => {
        expect(defaultConfig).toEqual({
            size: 2,
            zoom: 2,
            shape: "round",
            cursor: "crosshair",
            skin: "1",
        });
    });

    it("structuredClone できる（service worker / content script が複製して渡す）", () => {
        expect(structuredClone(defaultConfig)).toEqual(defaultConfig);
    });

    /**
     * ⚠️ shape の値は "square" ではなく **"quare"**（タイプミス）。
     *    styles.ts のセレクタ `[data-shape='round']` と保存済みデータの両方に効くので、
     *    直すなら _locales の表示名だけを直し、値はマイグレーションを書くまで触らないこと。
     *    値を "square" にすると既存ユーザーの設定が読めなくなる。
     */
    it("shape の取りうる値は round / quare（タイプミスを現状固定）", () => {
        const shapes: Config["shape"][] = ["round", "quare"];
        expect(shapes).toContain(defaultConfig.shape);
    });

    it("cursor は CSS の cursor に直接入る値", () => {
        // style="--cursor: ${cursor}" にそのまま入るので CSS のキーワードでなければならない
        expect(["crosshair", "none"]).toContain(defaultConfig.cursor);
    });

    it("skin は文字列（data 属性に入るため数値にしない）", () => {
        expect(typeof defaultConfig.skin).toBe("string");
        expect(["1", "2", "3"]).toContain(defaultConfig.skin);
    });

    it.each(["size", "zoom"] as const)("%s は 2〜5 の整数（設定 UI のスライダーの範囲）", (key) => {
        expect(Number.isInteger(defaultConfig[key])).toBe(true);
        expect(defaultConfig[key]).toBeGreaterThanOrEqual(2);
        expect(defaultConfig[key]).toBeLessThanOrEqual(5);
    });
});
