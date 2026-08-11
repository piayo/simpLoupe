/**
 * ルーペ内 UI の文言 (src/i18n/ui/) の検査
 *
 * 検出するもの:
 *   1. コード内の T( "..." ) 呼び出しのうち、キー定義 (keys.json) に無いもの
 *   2. キー定義にあるのに、どのコードからも使われていないキー
 *   3. ロケールごとの未翻訳 / 余分 / 空 / 並び順のずれ
 *   4. 訳の JSON と src/ts/i18n.ts の対応表 (transData) のずれ (import 忘れ・消し忘れ)
 *   5. keys.json の fallbackLang と src/ts/i18n.ts の FALLBACK_LANG のずれ
 *
 * 問題があれば exit 1。
 *
 * 使い方:
 *   node scripts/i18n/check-ui.mjs
 *
 * Chrome が描画するテキスト (src/_locales/) は別系統。ここでは一切扱わない。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname( fileURLToPath( import.meta.url ) );

export const ROOT   = resolve( HERE, "../.." );
export const UI_DIR = resolve( ROOT, "src/i18n/ui" );
export const TABLE  = resolve( ROOT, "src/ts/i18n.ts" );

const SCAN_DIR = resolve( ROOT, "src/ts" );
// 翻訳データの対応表そのもの。走査対象から外す
const SCAN_IGNORE = new Set([ TABLE ]);

const readJson = ( file ) => JSON.parse( readFileSync( file, "utf8" ) );

/**
 * 訳のデータ一式を読む。
 * **言語の一覧はディレクトリから導出する。** 一覧を別ファイルに持つと
 * 「JSON は足したが一覧に書き忘れた」というズレが生まれるため。
 */
export function loadSource( dir = UI_DIR ) {
    const def = readJson( resolve( dir, "keys.json" ) );
    const langs = readdirSync( dir )
        .filter( name => name.endsWith( ".json" ) && name !== "keys.json" )
        .map( name => name.replace( /\.json$/, "" ) )
        .toSorted();

    const messages = {};
    for ( const code of langs ) messages[code] = readJson( resolve( dir, `${code}.json` ) );

    // キーの並び順 = keys.json のオブジェクトの並び順
    return { keys: Object.keys( def.keys ), fallbackLang: def.fallbackLang, langs, messages };
}

/**
 * src/ts/i18n.ts の transData に並んでいる言語コード。
 * **対応表の終わり (行頭の "};") までに限定する。** ファイル末尾まで見ると、
 * 後続の LANG_ALIAS など別の対応表のキーまで言語コードとして拾ってしまう。
 */
export function tableLangs( file = TABLE ) {
    const text = readFileSync( file, "utf8" );
    const start = text.indexOf( "export const transData" );
    if ( start < 0 ) return [];
    const rest = text.slice( start );
    const end  = rest.search( /^};/m );
    const body = end < 0 ? rest : rest.slice( 0, end );
    return [ ...body.matchAll( /^\s*"([\w-]+)"\s*:/gm ) ].map( m => m[1] ).toSorted();
}

/** src/ts/i18n.ts の FALLBACK_LANG */
export function tableFallback( file = TABLE ) {
    return readFileSync( file, "utf8" ).match( /FALLBACK_LANG\s*=\s*"([\w-]+)"/ )?.[1] ?? "";
}

/** 訳の JSON と対応表・フォールバック指定がずれていないか */
export function checkTable( source, listed, fallback ) {
    const issues = [];
    const langs = [ ...source.langs ].sort();
    const where = "src/ts/i18n.ts";

    for ( const code of langs ) {
        listed.includes( code ) || issues.push({
            level: "error", where,
            message: `src/i18n/ui/${code}.json が transData に入っていません (import を足してください)`,
        });
    }
    for ( const code of listed ) {
        langs.includes( code ) || issues.push({
            level: "error", where,
            message: `transData の "${code}" に対応する src/i18n/ui/${code}.json がありません`,
        });
    }
    if ( fallback !== undefined && fallback !== source.fallbackLang ) {
        issues.push({
            level: "error", where,
            message: `FALLBACK_LANG ("${fallback}") が keys.json の fallbackLang ("${source.fallbackLang}") と違います`,
        });
    }
    source.langs.includes( source.fallbackLang ) || issues.push({
        level: "error", where: "src/i18n/ui",
        message: `フォールバック先の ${source.fallbackLang}.json がありません (全キー必須)`,
    });
    return issues;
}

/** 走査対象の .ts を集める */
export function listSourceFiles( dir = SCAN_DIR ) {
    const files = [];
    for ( const entry of readdirSync( dir, { withFileTypes: true, recursive: true } ) ) {
        if ( !entry.isFile() || !entry.name.endsWith( ".ts" ) ) continue;
        const file = resolve( entry.parentPath, entry.name );
        !SCAN_IGNORE.has( file ) && files.push( file );
    }
    return files.toSorted();
}

/** 走査対象の .ts を中身ごと読む */
export function loadSourceFiles( dir = SCAN_DIR ) {
    return listSourceFiles( dir ).map( file => ({ file, text: readFileSync( file, "utf8" ) }) );
}

// T( "..." ) / T("...") を拾う。プロパティアクセス (.T()) や識別子の一部は除く
const CALL_RE = /(?<![\w$.])T\(\s*([^()]*?)\s*\)/g;
const LITERAL_RE = /^"((?:[^"\\]|\\.)*)"$/;

/**
 * ソース1ファイルから T() の呼び出しを抜き出す
 * @returns {{ key?: string, expression?: string, line: number }[]}
 */
export function scanCalls( text ) {
    const found = [];
    for ( const m of text.matchAll( CALL_RE ) ) {
        const arg = m[1];
        // function T( key: string ) の宣言自体は対象外
        if ( /^\w+\s*:/.test( arg ) ) continue;
        const line = text.slice( 0, m.index ).split( "\n" ).length;
        const lit = arg.match( LITERAL_RE );
        lit ? found.push({ key: JSON.parse( `"${lit[1]}"` ), line })
            : found.push({ expression: arg, line });
    }
    return found;
}

/**
 * 検査本体。問題の一覧を返す
 * @returns {{ level: "error"|"info", where: string, message: string }[]}
 */
export function check( { source, files, listed, fallback } ) {
    const issues = [];

    // 0. 訳の JSON と対応表のずれ
    listed && issues.push( ...checkTable( source, listed, fallback ) );

    const defined = new Set( source.keys );

    // 1. コード内の T() とキー定義の突合
    const used = new Set();
    for ( const { file, text } of files ) {
        const where = relative( ROOT, file );
        for ( const call of scanCalls( text ) ) {
            if ( call.expression !== undefined ) {
                issues.push({
                    level: "info", where: `${where}:${call.line}`,
                    message: `T() が変数で呼ばれています: T( ${call.expression} ) — キー定義との突合はできません`,
                });
                continue;
            }
            used.add( call.key );
            defined.has( call.key ) || issues.push({
                level: "error", where: `${where}:${call.line}`,
                message: `キー定義 (keys.json) に無いキーを使っています: "${call.key}"`,
            });
        }
    }

    // 2. 定義されているのに使われていないキー
    for ( const key of source.keys ) {
        used.has( key ) || issues.push({
            level: "error", where: "src/i18n/ui/keys.json",
            message: `どのソースからも使われていないキー: "${key}"`,
        });
    }

    // 3. ロケールごとの過不足。**JSON を置いたら全キー必須**
    //    (まだ訳さない言語は JSON を置かない。実行時は fallbackLang に落ちる)
    for ( const code of source.langs ) {
        const where = `src/i18n/ui/${code}.json`;
        const data = source.messages[code];
        const keys = Object.keys( data );

        for ( const key of source.keys ) {
            if ( !( key in data ) ) issues.push({ level: "error", where, message: `未翻訳のキー: "${key}"` });
            else if ( typeof data[key] !== "string" || data[key].trim() === "" ) {
                issues.push({ level: "error", where, message: `訳が空のキー: "${key}"` });
            }
        }
        for ( const key of keys ) {
            defined.has( key ) || issues.push({ level: "error", where, message: `キー定義に無い余分なキー: "${key}"` });
        }
        // 並び順 (過不足が無い場合のみ見る)
        const common = keys.filter( k => defined.has( k ) );
        const expected = source.keys.filter( k => k in data );
        if ( common.length === expected.length && common.join( "|" ) !== expected.join( "|" ) ) {
            issues.push({ level: "error", where, message: "キーの並びが keys.json と違います" });
        }
    }

    return issues;
}

// ---------------------------------------------------------------- CLI

function main() {
    const source = loadSource();
    const issues = check({
        source,
        files   : loadSourceFiles(),
        listed  : tableLangs(),
        fallback: tableFallback(),
    });
    const errors = issues.filter( i => i.level === "error" );
    const infos  = issues.filter( i => i.level === "info" );

    console.log( `[check-ui] ${source.langs.length} 言語 / ${source.keys.length} キー (フォールバック: ${source.fallbackLang})` );
    for ( const i of infos )  console.log( `INFO  ${i.where}\n      ${i.message}` );
    for ( const i of errors ) console.error( `ERROR ${i.where}\n      ${i.message}` );

    if ( errors.length ) {
        console.error( `\n[check-ui] NG: ${errors.length} 件の問題があります。` );
        return 1;
    }
    console.log( "\n[check-ui] OK" );
    return 0;
}

if ( process.argv[1] && pathToFileURL( process.argv[1] ).href === import.meta.url ) {
    process.exit( main() );
}
