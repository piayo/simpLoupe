/**
 * Chrome / ウェブストアが描画するテキスト (src/_locales/) の検査
 *
 * 検出するもの:
 *   - 単一ソース自身の壊れ (keys.json / locales.json / messages.json の食い違い)
 *   - 訳の空文字・maxLength 超過・locales.json に無いロケールの訳
 *   - 未訳 (warn。fallbackLocale で代替される)
 *   - manifest.json の __MSG_xxx__ / コードの chrome.i18n.getMessage( "..." ) と
 *     キー定義の突合 (未定義キーの参照 / 使われていないキー)
 *   - 生成物 (src/_locales/) が単一ソースとずれていないか / 余分なディレクトリ
 *
 * 使い方:
 *   node scripts/i18n/check-store.mjs           error があれば exit 1
 *   node scripts/i18n/check-store.mjs --strict   warn (未訳) も失敗扱いにする
 *
 * ルーペ内 UI の文言 (src/i18n/ui/) は別系統。ここでは一切扱わない。
 */
import { isDeepStrictEqual } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCALES_DIR, ROOT_DIR, buildAll, keyNames, loadSource, readExisting, readLocaleDirs } from "./build-store.mjs";

export const MANIFEST_PATH = join(ROOT_DIR, "src/manifest.json");
export const SCAN_DIR = join(ROOT_DIR, "src/ts");

const error = (where, message) => ({ level: "error", where, message });
const warn = (where, message) => ({ level: "warn", where, message });

/**
 * manifest.json のテキストから __MSG_xxx__ 参照を拾う
 * @param {string} manifestText
 * @returns {{ key: string, where: string }[]}
 */
export function extractMsgRefs(manifestText) {
    const found = new Set();
    for (const m of manifestText.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) found.add(m[1]);
    return [...found].toSorted().map((key) => ({ key, where: "src/manifest.json" }));
}

/**
 * コードから chrome.i18n.getMessage( "xxx" ) 参照を拾う
 * @param {{ file: string, text: string }[]} files
 * @returns {{ key: string, where: string }[]}
 */
export function extractGetMessageRefs(files) {
    const found = [];
    for (const { file, text } of files) {
        for (const m of text.matchAll(/getMessage\(\s*"([A-Za-z0-9_@]+)"/g)) {
            const line = text.slice(0, m.index).split("\n").length;
            found.push({ key: m[1], where: `${relative(ROOT_DIR, file)}:${line}` });
        }
    }
    return found;
}

/** 走査対象の .ts を中身ごと読む */
export function loadSourceFiles(dir = SCAN_DIR) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const file = resolve(entry.parentPath, entry.name);
        files.push({ file, text: readFileSync(file, "utf8") });
    }
    return files.toSorted((a, b) => a.file.localeCompare(b.file));
}

/**
 * 単一ソース自身の整合性を見る
 * @param {object} source
 * @returns {{level: string, where: string, message: string}[]}
 */
export function checkSource(source) {
    const problems = [];
    const { keys, locales, messages } = source;
    const defined = keyNames(keys);

    if (!Object.hasOwn(locales, keys.fallbackLocale)) {
        problems.push(error("keys.json", `fallbackLocale "${keys.fallbackLocale}" が locales.json に無い`));
    }
    for (const [locale, label] of Object.entries(locales)) {
        (typeof label === "string" && label.trim() !== "") || problems.push(error("locales.json", `${locale}: 値 (言語名のラベル) が文字列でない`));
        /^[a-z]{2,3}(_[A-Za-z0-9]+)?$/.test(locale) || problems.push(error("locales.json", `Chrome の locale 形式に見えない: ${locale} (BCP 47 の "-" は UI 側の書式)`));
    }
    for (const key of Object.keys(messages)) {
        defined.includes(key) || problems.push(error("messages.json", `keys.json に定義の無いキー: ${key}`));
    }
    for (const key of defined) {
        messages[key] || problems.push(error("messages.json", `キーのブロックが無い: ${key}`));
    }
    return problems;
}

/**
 * 訳の中身の検査。未訳は warn (fallbackLocale で代替されるため)
 * @param {object} source
 * @returns {{level: string, where: string, message: string}[]}
 */
export function checkTranslations(source) {
    const problems = [];
    const { keys, locales, messages } = source;
    const localeCodes = Object.keys(locales);
    const fb = keys.fallbackLocale;

    for (const key of keyNames(keys)) {
        const block = messages[key] ?? {};
        const def = keys.keys[key];
        const where = `messages.json/${key}`;

        for (const locale of Object.keys(block)) {
            localeCodes.includes(locale) || problems.push(error(where, `locales.json に無いロケール: ${locale}`));
        }

        const fbText = block[fb];
        if (typeof fbText !== "string" || fbText.trim() === "") {
            problems.push(error(where, `fallbackLocale "${fb}" の訳が無い (これが無いと生成できない)`));
        }

        for (const locale of localeCodes) {
            const text = block[locale];
            if (text === undefined) {
                locale !== fb && problems.push(warn(where, `${locale}: 未訳 ("${fb}" の文言で代替されます)`));
                continue;
            }
            if (typeof text !== "string" || text.trim() === "") {
                problems.push(error(where, `${locale}: 訳が空`));
                continue;
            }
            if (def.maxLength && [...text].length > def.maxLength) {
                problems.push(error(where, `${locale}: ${def.maxLength} 文字を超えている (${[...text].length})`));
            }
            // en / en_GB のような意図的な重複もあり得るので警告に留める
            if (locale !== fb && text === fbText) {
                problems.push(warn(where, `${locale}: "${fb}" と同一の文言 (未訳なら行ごと消してよい)`));
            }
        }
    }
    return problems;
}

/**
 * 参照とキー定義の突合
 * @param {object} args
 * @param {object} args.source
 * @param {{ key: string, where: string }[]} args.refs
 * @returns {{level: string, where: string, message: string}[]}
 */
export function checkRefs({ source, refs }) {
    const problems = [];
    const defined = keyNames(source.keys);

    for (const { key, where } of refs) {
        defined.includes(key) || problems.push(error(where, `keys.json に定義の無いキーを参照しています: ${key}`));
    }
    const used = new Set(refs.map((r) => r.key));
    for (const key of defined) {
        used.has(key) || problems.push(error("keys.json", `どこからも参照されていないキー: ${key} (manifest.json / chrome.i18n.getMessage)`));
    }
    return problems;
}

/**
 * 生成物 (src/_locales/) との突き合わせ
 * @param {object} args
 * @param {Map<string, object>} args.built
 * @param {Map<string, object|null>} args.onDisk
 * @param {string[]} args.extraDirs
 * @param {string} args.defaultLocale
 * @returns {{level: string, where: string, message: string}[]}
 */
export function checkOutput({ built, onDisk, extraDirs, defaultLocale }) {
    const problems = [];

    built.has(defaultLocale) || problems.push(error("manifest.json", `default_locale "${defaultLocale}" が locales.json に無い`));
    onDisk.get(defaultLocale) || problems.push(error("src/_locales", `default_locale "${defaultLocale}" のディレクトリが無い`));

    for (const dir of extraDirs) {
        problems.push(error("src/_locales", `ソースに定義の無いディレクトリ: ${dir} (削除してください)`));
    }
    for (const [locale, expected] of built) {
        const current = onDisk.get(locale) ?? null;
        if (current === null) {
            problems.push(error("src/_locales", `${locale}: messages.json が無い (npm run i18n:build)`));
            continue;
        }
        isDeepStrictEqual(current, expected) || problems.push(error("src/_locales", `${locale}: 単一ソースから生成した内容と一致しない (npm run i18n:build)`));
    }
    return problems;
}

/**
 * すべての検査をまとめて実行する (IO をしない純粋関数)
 * @returns {{level: string, where: string, message: string}[]}
 */
export function collectProblems({ source, manifest, manifestText, files, onDisk, extraDirs }) {
    const problems = [...checkSource(source), ...checkTranslations(source), ...checkRefs({ source, refs: [...extractMsgRefs(manifestText), ...extractGetMessageRefs(files)] })];

    // ソースが壊れていると buildAll が投げるので、そこまで通ったときだけ生成物を見る
    if (!problems.some((p) => p.level === "error")) {
        problems.push(
            ...checkOutput({
                built: buildAll(source),
                onDisk,
                extraDirs,
                defaultLocale: manifest.default_locale,
            }),
        );
    }
    return problems;
}

// ---------------------------------------------------------------- CLI

/** manifest.json を読む。__MSG_xxx__ の抽出に生テキストが要るので両方返す */
export function loadManifest(path = MANIFEST_PATH) {
    const text = readFileSync(path, "utf8");
    return { text, json: JSON.parse(text) };
}

/** src/_locales/ を読み込む */
export function readLocalesDir(outDir, localeCodes) {
    const dirs = readLocaleDirs(outDir);
    const onDisk = new Map();
    for (const locale of new Set([...localeCodes, ...dirs])) {
        onDisk.set(locale, readExisting(outDir, locale));
    }
    return { onDisk, extraDirs: dirs.filter((d) => !localeCodes.includes(d)) };
}

function main(argv) {
    const strict = argv.includes("--strict");

    const source = loadSource();
    const { text: manifestText, json: manifest } = loadManifest();
    const files = loadSourceFiles();
    const { onDisk, extraDirs } = readLocalesDir(LOCALES_DIR, Object.keys(source.locales));

    const problems = collectProblems({ source, manifest, manifestText, files, onDisk, extraDirs });
    const errors = problems.filter((p) => p.level === "error");
    const warns = problems.filter((p) => p.level === "warn");

    for (const p of problems) {
        console.log(`[${p.level === "error" ? "ERROR" : "WARN "}] ${p.where}: ${p.message}`);
    }
    console.log(`[check-store] ロケール ${Object.keys(source.locales).length} 件 / エラー ${errors.length} / 警告 ${warns.length}`);

    if (errors.length || (strict && warns.length)) {
        console.log("[check-store] NG");
        return 1;
    }
    console.log("[check-store] OK");
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(main(process.argv.slice(2)));
}
