import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * manifest.json と _locales は手書きなので、ビルド設定や翻訳とズレても
 * 気づけるのは「拡張機能を読み込んだとき」になってしまう。
 * 静的に取れる整合だけでも CI で見張る。
 *
 * ※ environment: "happy-dom" ではグローバルの URL が happy-dom のものに差し替わるため、
 *    new URL( "...", import.meta.url ) を node:fs に渡すと "The URL must be of scheme file" で落ちる。
 *    vitest の cwd はプロジェクトルートなので、そこからの相対パスで読む。
 */
const ROOT = process.cwd();

function readJSON(path: string): any {
    return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function readDir(path: string): string[] {
    return readdirSync(join(ROOT, path)).filter((name) => !name.startsWith("."));
}

const manifest = readJSON("src/manifest.json");
const packageJSON = readJSON("package.json");
const locales = readDir("src/_locales");

describe("version", () => {
    it("package.json と同期している", () => {
        // ズレていたら npm run build（syncVersion.js）を通していない
        expect(manifest.version).toBe(packageJSON.version);
    });

    it("x.y.z 形式（Chrome ウェブストアの要求）", () => {
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
});

describe("エントリポイント", () => {
    it("service worker は vite の出力パスと一致する", () => {
        // vite.config.ts の lib.entry のキー "js/service-worker" に対応
        expect(manifest.background.service_worker).toBe("js/service-worker.js");
        expect(manifest.background.type).toBe("module");
    });

    it("content script は vite の出力パスと一致する", () => {
        expect(manifest.content_scripts[0].js).toEqual(["js/content-script.js"]);
    });

    it("content script は http(s) の全ページに入る", () => {
        // 「どのページでも使えるルーペ」がこの拡張機能の前提
        expect(manifest.content_scripts[0].matches).toEqual(["https://*/*", "http://*/*"]);
    });

    it("content script は document_end で入る（body.append できる状態）", () => {
        expect(manifest.content_scripts[0].run_at).toBe("document_end");
    });
});

describe("permissions", () => {
    it.each([
        ["contextMenus", "右クリックメニューからの開閉"],
        ["activeTab", "captureVisibleTab のため"],
        ["storage", "設定の保存"],
        ["tabs", "タブ切り替えでのアイコン有効/無効"],
    ])("%s を要求する（%s）", (permission) => {
        expect(manifest.permissions).toContain(permission);
    });

    it("使っていない権限を要求しない", () => {
        // 権限を増やすとストア審査とインストール時の警告が重くなる
        expect([...manifest.permissions].sort()).toEqual(["activeTab", "contextMenus", "storage", "tabs"]);
    });
});

describe("アイコン", () => {
    const files = readDir("src/img");

    it("manifest が指すアイコンが全部存在する", () => {
        for (const path of Object.values<string>(manifest.icons)) {
            expect(files, `${path} が無い`).toContain(path.replace("img/", ""));
        }
    });
});

describe("_locales", () => {
    it("default_locale のディレクトリが存在する", () => {
        expect(locales).toContain(manifest.default_locale);
    });

    it("description は __MSG_*__ で参照している", () => {
        expect(manifest.description).toMatch(/^__MSG_(\w+)__$/);
    });

    it("manifest が参照するメッセージが全ロケールに存在する", () => {
        const keys = JSON.stringify(manifest)
            .match(/__MSG_(\w+)__/g)!
            .map((token) => token.slice(6, -2));

        expect(keys.length).toBeGreaterThan(0);
        for (const locale of locales) {
            const messages = readJSON(`src/_locales/${locale}/messages.json`);
            for (const key of keys) {
                expect(messages, `${locale} に ${key} が無い`).toHaveProperty(key);
                expect(messages[key].message, `${locale}/${key} が空`).toBeTruthy();
            }
        }
    });

    it("全ロケールのキー集合が一致する", () => {
        // 言語を足したときの入れ忘れを検出する
        const base = Object.keys(readJSON(`src/_locales/${manifest.default_locale}/messages.json`)).sort();
        for (const locale of locales) {
            const keys = Object.keys(readJSON(`src/_locales/${locale}/messages.json`)).sort();
            expect(keys, `${locale} のキーが ${manifest.default_locale} と違う`).toEqual(base);
        }
    });

    it("ロケール名は Chrome 形式（ja / en_US。ja-JP ではない）", () => {
        for (const locale of locales) {
            expect(locale, `${locale} はハイフン区切りになっている`).toMatch(/^[a-z]{2,3}(_[A-Za-z]+)?$/);
        }
    });
});

describe("action", () => {
    it("ポップアップを持たない（クリックで直接トグルする）", () => {
        expect(manifest.action.default_popup).toBeUndefined();
    });
});
