/**
 * Chrome / ウェブストアが描画するテキストのビルダー
 *
 *   src/i18n/store/{keys,locales,messages}.json  →  src/_locales/<locale>/messages.json
 *
 * ルーペ内 UI の文言 (src/i18n/ui/ → src/ts/i18n.ts) とは**別系統**のパイプライン。
 * データを混ぜないこと。詳細は docs/design/i18n.md。
 *
 * 使い方:
 *   node scripts/i18n/build-store.mjs           src/_locales/ を生成する
 *   node scripts/i18n/build-store.mjs --check   生成結果と現状の差分を見るだけ (書き込まない)
 */
import { isDeepStrictEqual } from "node:util";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** リポジトリのルート */
export const ROOT_DIR = resolve(HERE, "../..");
/** 単一ソースの置き場 */
export const STORE_DIR = join(ROOT_DIR, "src/i18n/store");
/** 生成先 */
export const LOCALES_DIR = join(ROOT_DIR, "src/_locales");

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * 単一ソースを読み込む
 * @param {string} storeDir
 * @returns {{ keys: object, locales: object, messages: object }}
 */
export function loadSource(storeDir = STORE_DIR) {
    return {
        keys: readJson(join(storeDir, "keys.json")),
        locales: readJson(join(storeDir, "locales.json")),
        messages: readJson(join(storeDir, "messages.json")),
    };
}

/**
 * キー名の一覧。
 * **keys.json のオブジェクトの並びがそのまま出力順になる。**
 * 並び順の配列 (姉妹プロジェクトの order) を別に持たないのは、二重管理でズレるため。
 * @param {object} keys keys.json の中身
 * @returns {string[]}
 */
export function keyNames(keys) {
    return Object.keys(keys.keys);
}

/**
 * 訳を1つ取り出す。空文字は「無い」と同じ扱いにする
 * @param {object|undefined} block messages.json の1キーぶん
 * @param {string} locale
 * @returns {string|undefined}
 */
function pickText(block, locale) {
    const text = block?.[locale];
    return typeof text === "string" && text.trim() !== "" ? text : undefined;
}

/**
 * ロケール 1 つぶんの messages.json の中身を組み立てる。
 * 訳が無いロケールは fallbackLocale の文言で埋める
 * (ディレクトリを作らないと Chrome が default_locale = ja に落ちてしまうため)。
 * @param {object} source loadSource() の戻り値
 * @param {string} locale Chrome の locale コード (例 "ja", "zh_TW")
 * @returns {object} { <key>: { message: string } }
 */
export function buildMessages(source, locale) {
    const { keys, locales, messages } = source;
    if (!Object.hasOwn(locales, locale)) {
        throw new Error(`locales.json に定義の無いロケール: ${locale}`);
    }

    const out = {};
    for (const key of keyNames(keys)) {
        const block = messages[key];
        const message = pickText(block, locale) ?? pickText(block, keys.fallbackLocale);
        if (message === undefined) {
            throw new Error(`値が取れない: locale=${locale} key=${key} (fallbackLocale "${keys.fallbackLocale}" の訳も無い)`);
        }
        out[key] = { message };
    }
    return out;
}

/**
 * 全ロケールぶんを組み立てる
 * @param {object} source
 * @returns {Map<string, object>} locale -> messages.json の中身
 */
export function buildAll(source) {
    const result = new Map();
    // 生成順を安定させるためロケールコードでソートする
    for (const locale of Object.keys(source.locales).toSorted()) {
        result.set(locale, buildMessages(source, locale));
    }
    return result;
}

/**
 * fallbackLocale で埋めた (= 未訳の) 組み合わせを列挙する
 * @param {object} source
 * @returns {{ key: string, locale: string }[]}
 */
export function listFallbacks(source) {
    const { keys, locales, messages } = source;
    const out = [];
    for (const key of keyNames(keys)) {
        for (const locale of Object.keys(locales).toSorted()) {
            if (locale === keys.fallbackLocale) continue;
            pickText(messages[key], locale) === undefined && out.push({ key, locale });
        }
    }
    return out;
}

/**
 * messages.json のテキストに整形する (スペース4・キーのコロン揃え・末尾改行)
 * @param {object} messages
 * @returns {string}
 */
export function formatMessages(messages) {
    const names = Object.keys(messages);
    const width = Math.max(...names.map((n) => n.length));
    const lines = names.map((name) => {
        const key = `"${name}"`.padEnd(width + 2);
        return `    ${key}: { "message": ${JSON.stringify(messages[name].message)} }`;
    });
    return `{\n${lines.join(",\n")}\n}\n`;
}

/**
 * 出力先にある既存の messages.json を読む。無ければ null
 * @param {string} outDir
 * @param {string} locale
 * @returns {object | null}
 */
export function readExisting(outDir, locale) {
    try {
        return readJson(join(outDir, locale, "messages.json"));
    } catch {
        return null;
    }
}

/** 出力先にあるディレクトリ名の一覧 */
export function readLocaleDirs(outDir) {
    try {
        return readdirSync(outDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .toSorted();
    } catch {
        return []; // 出力先がまだ無い
    }
}

/**
 * 生成結果と出力先の現状を意味的に比較する (整形の差は無視する)
 * @param {Map<string, object>} built
 * @param {string} outDir
 * @returns {{ same: string[], differ: string[], missing: string[], extra: string[] }}
 */
export function compareWithDisk(built, outDir) {
    const same = [],
        differ = [],
        missing = [];

    for (const [locale, messages] of built) {
        const current = readExisting(outDir, locale);
        if (current === null) missing.push(locale);
        else if (isDeepStrictEqual(current, messages)) same.push(locale);
        else differ.push(locale);
    }

    // ソースに定義が無いのにディレクトリだけ残っているもの
    const extra = readLocaleDirs(outDir).filter((d) => !built.has(d));

    return { same, differ, missing, extra };
}

/**
 * 生成結果をファイルに書き出す
 * @param {Map<string, object>} built
 * @param {string} outDir
 */
export function writeAll(built, outDir) {
    for (const [locale, messages] of built) {
        const dir = join(outDir, locale);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "messages.json"), formatMessages(messages), "utf8");
    }
}

// ---------------------------------------------------------------- CLI

function main(argv) {
    const check = argv.includes("--check");

    const source = loadSource();
    const built = buildAll(source);
    const { same, differ, missing, extra } = compareWithDisk(built, LOCALES_DIR);
    const fallbacks = listFallbacks(source);

    console.log(`[build-store] ロケール ${built.size} 件 / キー ${keyNames(source.keys).length} 件`);
    console.log(`[build-store] 未訳 ${fallbacks.length} 件は "${source.keys.fallbackLocale}" の文言で代替します`);
    console.log(`[build-store] 一致 ${same.length} / 相違 ${differ.length} / 未生成 ${missing.length} / 余分 ${extra.length}`);
    differ.length && console.log(`  相違: ${differ.join(", ")}`);
    missing.length && console.log(`  未生成: ${missing.join(", ")}`);
    extra.length && console.log(`  余分なディレクトリ (削除してください): ${extra.join(", ")}`);

    if (check) {
        const ng = differ.length + missing.length + extra.length;
        console.log(ng ? "[build-store] NG: 生成結果と src/_locales/ が一致しません (npm run i18n:build を実行してください)" : "[build-store] OK: 生成結果と src/_locales/ は一致しています");
        return ng ? 1 : 0;
    }

    writeAll(built, LOCALES_DIR);
    console.log(`[build-store] 書き出しました -> ${LOCALES_DIR}`);
    extra.length && console.log("[build-store] 余分なディレクトリは自動で消しません。手で削除してください");
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
