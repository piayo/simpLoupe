/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * ルーペ内の設定パネルの文言。
 *
 * 訳は src/i18n/ui/<言語コード>.json にある。**このファイルは対応表と引き方だけを持つ。**
 * 言語を足すときは JSON を追加して、下の import と transData に1行ずつ足す。
 * 書き忘れは `npm run i18n:check:ui` が両方向で検出する。
 *
 * キーは意味的な ID (label.zoom など)。訳が無ければ FALLBACK_LANG の訳を使う。
 * 言語コードは **BCP 47** ("zh-TW", "pt-BR")。
 *
 * Chrome / ウェブストアが描画するテキスト (src/_locales/) は**別系統**。混ぜないこと。
 * 詳細は docs/design/i18n.md。
 */
import data_en from "../i18n/ui/en.json";
import data_ja from "../i18n/ui/ja.json";

/**
 * フォールバック先。**この言語の JSON は全キー必須。**
 * src/i18n/ui/keys.json の fallbackLang と一致させること (i18n:check:ui が検査する)。
 */
export const FALLBACK_LANG = "en";

export const transData: Record<string, Record<string, string>> = {
    "en": data_en,
    "ja": data_ja,
};

/**
 * 地域コードだけでは正しい訳に落ちない組み合わせの読み替え。
 * zh-HK / zh-MO は繁体字圏だが、素の解決だと並び順で zh-CN (簡体字) を拾ってしまう。
 */
const LANG_ALIAS: Record<string, string> = {
    "zh-HK": "zh-TW",
    "zh-MO": "zh-TW",
};

/**
 * 訳を持っている言語コードの中から、与えられた言語に一番近いものを選ぶ。
 *
 * 1. 完全一致を優先 — zh-TW と zh-CN は訳が違うので zh に落としてはいけない
 * 2. 無ければ地域コードを外して再検索 — pt-BR → pt, fr-CA → fr
 * 3. それも無ければ同じ言語の変種を使う — pt しか渡されず pt-BR/pt-PT がある場合
 * 4. どれも無ければ FALLBACK_LANG
 */
export function pickLang(lang: string, available: string[] = Object.keys(transData)): string {
    if (!lang) {
        return FALLBACK_LANG;
    }
    const code = LANG_ALIAS[lang] ?? lang;
    if (available.includes(code)) {
        return code;
    }
    const base = code.split("-")[0]!;
    if (available.includes(base)) {
        return base;
    }
    // 並び順に依存しないよう、変種が複数あるときは常に同じものを選ぶ
    // (lib が ES2022 なので toSorted() は使えない。複製済みの配列なので sort() で問題ない)
    return [...available].filter((c) => c.startsWith(`${base}-`)).sort()[0] ?? FALLBACK_LANG;
}

/**
 * 表示に使う言語を取得する。
 *
 * **ページの lang 属性は見ない。** simpLoupe は任意のページに注入されるため、
 * lang が無いページが多く、また「英語のページを読んでいる日本語話者」に
 * 英語の UI を出してしまう。ブラウザの UI 言語が利用者の言語として正しい。
 * (chrome.i18n.getUILanguage() は content script でも権限なしで使える。
 *  翻訳データは参照しないので src/_locales/ とは無関係)
 */
export function getUILang(): string {
    return globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || FALLBACK_LANG;
}

let _lang = pickLang(getUILang());

/** 言語を差し替える (テストと動作確認用) */
export function setLang(lang: string): void {
    _lang = pickLang(lang);
}

/** 現在選ばれている言語コード */
export function getLang(): string {
    return _lang;
}

/**
 * 文言を引く。訳が無ければ FALLBACK_LANG → キーそのもの、の順で返す
 */
export function T(key: string): string {
    return transData[_lang]?.[key] || transData[FALLBACK_LANG]?.[key] || key;
}
