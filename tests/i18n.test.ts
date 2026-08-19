import { describe, expect, it } from "vitest";
import { FALLBACK_LANG, T, getLang, pickLang, setLang, transData } from "../src/ts/i18n";
import uiKeys from "../src/i18n/ui/keys.json";

/**
 * 設定パネルの文言。訳の JSON と対応表 (transData) のずれは
 * `npm run i18n:check:ui` が検出するので、ここでは実行時ロジックだけを見る。
 */
describe("pickLang", () => {
    const available = ["en", "ja", "pt-BR", "pt-PT", "zh-CN", "zh-TW"];

    it("完全一致を優先する（zh-TW を zh-CN に落とさない）", () => {
        expect(pickLang("zh-TW", available)).toBe("zh-TW");
        expect(pickLang("zh-CN", available)).toBe("zh-CN");
    });

    it("地域コードを外して探す", () => {
        // en-US の訳は持たないが en は持つ
        expect(pickLang("en-US", available)).toBe("en");
        expect(pickLang("ja-JP", available)).toBe("ja");
    });

    it("素の言語コードしか来なければ変種を使う（並び順に依存しない）", () => {
        expect(pickLang("pt", available)).toBe("pt-BR");
        // 入力の並びを変えても同じものを選ぶ
        expect(pickLang("pt", ["pt-PT", "pt-BR", "en"])).toBe("pt-BR");
    });

    it("zh-HK / zh-MO は繁体字 (zh-TW) に読み替える", () => {
        // エイリアスが無いと、変種の並び順で zh-CN (簡体字) を拾ってしまう
        expect(pickLang("zh-HK", available)).toBe("zh-TW");
        expect(pickLang("zh-MO", available)).toBe("zh-TW");
    });

    it("該当が無ければフォールバック", () => {
        expect(pickLang("xx", available)).toBe(FALLBACK_LANG);
        expect(pickLang("", available)).toBe(FALLBACK_LANG);
    });
});

describe("T", () => {
    it("フォールバック先の訳は全キー揃っている（欠けると実行時にキーが露出する）", () => {
        const keys = Object.keys(uiKeys.keys);
        for (const key of keys) {
            expect(transData[FALLBACK_LANG], `${FALLBACK_LANG} に ${key} が無い`).toHaveProperty(key);
        }
    });

    it("keys.json の fallbackLang と FALLBACK_LANG が一致している", () => {
        expect(uiKeys.fallbackLang).toBe(FALLBACK_LANG);
    });

    it("言語を切り替えると訳が変わる", () => {
        setLang("ja");
        expect(getLang()).toBe("ja");
        expect(T("label.zoom")).toBe(transData["ja"]!["label.zoom"]);

        setLang("en");
        expect(T("label.zoom")).toBe(transData["en"]!["label.zoom"]);
    });

    it("未定義のキーはキーそのものが返る（画面で気づけるようにする）", () => {
        setLang("ja");
        expect(T("no.such.key")).toBe("no.such.key");
    });

    it("訳の無い言語はフォールバックの訳を返す", () => {
        setLang("de"); // de.json は無い → pickLang が en を選ぶ
        expect(getLang()).toBe(FALLBACK_LANG);
    });
});
