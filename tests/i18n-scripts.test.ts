/**
 * i18n の2系統のパイプラインのテスト。
 * スクリプトは .mjs (tsconfig の対象外) なので URL 経由の動的 import で読み込む。
 */
import { describe, expect, it } from "vitest";

const load = (name: string) => import(/* @vite-ignore */ new URL(`../scripts/i18n/${name}`, import.meta.url).href);

const build = await load("build-store.mjs");
const store = await load("check-store.mjs");
const ui = await load("check-ui.mjs");
const errorsOf = (list: any[]) => list.filter((p) => p.level === "error");

/**
 * store 側のテスト用の最小ソース。
 * 実データ (src/i18n/store/) の値に依存しないよう、毎回作り直して使う。
 * 型を明示しているのは、テスト中に de の訳を差し込むため (実データは Record 型)。
 */
type StoreFixture = {
    keys: { fallbackLocale: string; keys: Record<string, { maxLength?: number }> };
    locales: Record<string, string>;
    messages: Record<string, Record<string, string>>;
};

const storeFixture = (): StoreFixture => ({
    keys: {
        fallbackLocale: "en",
        keys: { extDes: { maxLength: 132 }, tglTtl: { maxLength: 64 } },
    },
    locales: { en: "English", ja: "Japanese", de: "German" },
    messages: {
        extDes: { en: "desc", ja: "説明" },
        tglTtl: { en: "Toggle", ja: "切り替え" },
    },
});

describe("build-store", () => {
    it("未訳のロケールは fallbackLocale の文言で埋まる", () => {
        expect(build.buildMessages(storeFixture(), "de")).toEqual({
            extDes: { message: "desc" },
            tglTtl: { message: "Toggle" },
        });
    });

    it("キーの並びは keys.json のオブジェクトの並び", () => {
        expect(Object.keys(build.buildMessages(storeFixture(), "ja"))).toEqual(["extDes", "tglTtl"]);
    });

    it("fallbackLocale の訳も無ければ例外", () => {
        const source = storeFixture();
        delete (source.messages.extDes as any).en;
        expect(() => build.buildMessages(source, "de")).toThrow(/locale=de key=extDes/);
    });

    it("未訳の組み合わせを列挙できる", () => {
        expect(build.listFallbacks(storeFixture())).toEqual([
            { key: "extDes", locale: "de" },
            { key: "tglTtl", locale: "de" },
        ]);
    });
});

describe("check-store", () => {
    it("未訳は warn、空文字は error", () => {
        const source = storeFixture();
        const warns = store.checkTranslations(source).filter((p: any) => p.level === "warn");
        expect(warns).toHaveLength(2); // de の2キー
        expect(errorsOf(store.checkTranslations(source))).toEqual([]);

        source.messages.extDes.de = "   ";
        expect(errorsOf(store.checkTranslations(source))[0].message).toMatch(/de: 訳が空/);
    });

    it("maxLength 超過を検出する (サロゲートペアは1文字)", () => {
        const source = storeFixture();
        source.keys.keys.extDes.maxLength = 5;
        source.messages.extDes.ja = "😀😀😀😀😀";
        expect(errorsOf(store.checkTranslations(source))).toEqual([]);
        source.messages.extDes.ja = "😀😀😀😀😀😀";
        expect(errorsOf(store.checkTranslations(source))[0].message).toMatch(/5 文字を超えている \(6\)/);
    });

    it("参照されていないキーと未定義キーの参照を検出する", () => {
        const source = storeFixture();
        const refs = [
            { key: "extDes", where: "src/manifest.json" },
            { key: "nope", where: "src/ts/x.ts:1" },
        ];
        const messages = errorsOf(store.checkRefs({ source, refs })).map((p: any) => p.message);
        expect(messages.some((m: string) => /定義の無いキー.*nope/.test(m))).toBe(true);
        expect(messages.some((m: string) => /参照されていないキー: tglTtl/.test(m))).toBe(true);
    });

    it("chrome.i18n.getMessage の参照を拾う", () => {
        const files = [{ file: `${build.ROOT_DIR}/src/ts/service-worker.ts`, text: 'chrome.i18n.getMessage( "tglTtl" )' }];
        expect(store.extractGetMessageRefs(files)[0].key).toBe("tglTtl");
    });

    it("manifest.json の __MSG_xxx__ を拾う", () => {
        expect(store.extractMsgRefs(`{ "a": "__MSG_extDes__", "b": "__MSG_extDes__" }`)).toEqual([{ key: "extDes", where: "src/manifest.json" }]);
    });
});

describe("実データ", () => {
    it("src/i18n/store から生成した結果が src/_locales と一致する", () => {
        const built = build.buildAll(build.loadSource());
        const { differ, missing, extra } = build.compareWithDisk(built, build.LOCALES_DIR);
        expect({ differ, missing, extra }).toEqual({ differ: [], missing: [], extra: [] });
    });

    it("check-store にエラーが無い", () => {
        const source = build.loadSource();
        const { text: manifestText, json: manifest } = store.loadManifest();
        const { onDisk, extraDirs } = store.readLocalesDir(build.LOCALES_DIR, Object.keys(source.locales));
        const problems = store.collectProblems({ source, manifest, manifestText, files: store.loadSourceFiles(), onDisk, extraDirs });
        expect(errorsOf(problems)).toEqual([]);
    });

    it("check-ui にエラーが無い", () => {
        const issues = ui.check({
            source: ui.loadSource(),
            files: ui.loadSourceFiles(),
            listed: ui.tableLangs(),
            fallback: ui.tableFallback(),
        });
        expect(errorsOf(issues)).toEqual([]);
    });
});
