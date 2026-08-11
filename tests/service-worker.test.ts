import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/ts/data";
import type { Config } from "../src/ts/types";
import { createChromeMock, sendMessage, type ChromeMock } from "./fixtures/chrome";

let mock: ChromeMock;

/** メッセージを送って sendResponse の値を受け取る */
function send<T>( command: string, data?: unknown, sender?: unknown ): Promise<T> {
    return sender === undefined
        ? sendMessage<T>( mock, command, data )
        : sendMessage<T>( mock, command, data, sender );
}

beforeEach( async () => {
    mock = createChromeMock();
    vi.stubGlobal( "chrome", mock.chrome );
    vi.resetModules();
    await import( "../src/ts/service-worker" );   // import 時にリスナーが登録される
});

afterEach( () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("リスナーの登録", () => {
    it("各イベントに1つだけ登録される", () => {
        // 二重登録を防ぐため removeListener してから addListener している
        expect( mock.listeners.message.length ).toBe( 1 );
        expect( mock.listeners.actionClick.length ).toBe( 1 );
        expect( mock.listeners.menuClick.length ).toBe( 1 );
        expect( mock.listeners.installed.length ).toBe( 1 );
        expect( mock.listeners.tabActivate.length ).toBe( 1 );
    });
});

describe("getConfig", () => {
    it("保存データが無ければデフォルトを返す", async () => {
        expect( await send<Config>( "getConfig" ) ).toEqual( defaultConfig );
    });

    it("保存済みの値を返す", async () => {
        await send( "saveConfig", { ...defaultConfig, zoom: 5 });
        expect( ( await send<Config>( "getConfig" ) ).zoom ).toBe( 5 );
    });

    it("欠けたキーをデフォルトで補完する（設定項目を追加したときのマイグレーション）", async () => {
        // 旧バージョンで保存された、cursor / skin を持たない config
        mock.store["config"] = { size: 3, zoom: 4, shape: "quare" };

        const config = await send<Config>( "getConfig" );

        expect( config.size ).toBe( 3 );                          // 保存値が優先
        expect( config.shape ).toBe( "quare" );
        expect( config.cursor ).toBe( defaultConfig.cursor );     // 欠けた分を補完
        expect( config.skin ).toBe( defaultConfig.skin );
    });

    it("保存値に余計なキーが入っていても落とさない（現状固定）", async () => {
        // Object.assign なので未知のキーはそのまま通る。削除したい設定項目が残り続ける点に注意
        mock.store["config"] = { ...defaultConfig, legacy: true };
        expect( await send<Config & { legacy?: boolean }>( "getConfig" ) ).toHaveProperty( "legacy", true );
    });

    it("defaultConfig を書き換えない", async () => {
        const snapshot = structuredClone( defaultConfig );
        mock.store["config"] = { zoom: 5, size: 5 };
        await send<Config>( "getConfig" );
        expect( defaultConfig ).toEqual( snapshot );
    });

    it("返り値は毎回別のオブジェクト（content script 側で structuredClone しても壊れない）", async () => {
        const a = await send<Config>( "getConfig" );
        const b = await send<Config>( "getConfig" );
        expect( a ).not.toBe( b );
        expect( a ).toEqual( b );
    });
});

describe("saveConfig", () => {
    it("config を storage に保存して true を返す", async () => {
        const config: Config = { ...defaultConfig, shape: "quare", zoom: 3 };
        await expect( send( "saveConfig", config ) ).resolves.toBe( true );
        expect( mock.store["config"] ).toEqual( config );
    });

    it("保存キーは config だけ", async () => {
        await send( "saveConfig", defaultConfig );
        expect( Object.keys( mock.store ) ).toEqual([ "config" ]);
    });
});

describe("reset", () => {
    it("storage を消してデフォルトを保存し、デフォルトを返す", async () => {
        await send( "saveConfig", { ...defaultConfig, zoom: 5, size: 5 });

        const config = await send<Config>( "reset" );

        expect( mock.chrome.storage.local.clear ).toHaveBeenCalledOnce();
        expect( config ).toEqual( defaultConfig );
        expect( mock.store["config"] ).toEqual( defaultConfig );
    });
});

describe("未知のコマンド", () => {
    it("null を返す（無応答にしない）", async () => {
        // 応答しないと content script の sendMessage が解決せず、原因の分からないまま固まる
        expect( await send( "unknownCommand" ) ).toBeNull();
    });
});

/**
 * ルーペの中身は「表示中のタブのスクリーンショット」を canvas に切り出したもの。
 * capture はスクロール／リサイズごとに飛んでくるので 100ms の遅延を挟んでいる。
 */
describe("capture", () => {
    beforeEach( () => {
        vi.useFakeTimers();
    });

    it("100ms 後に dataURL を返す", async () => {
        const promise = send<{ dataURL: string }>( "capture" );

        await vi.advanceTimersByTimeAsync( 99 );
        expect( mock.chrome.tabs.captureVisibleTab ).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync( 1 );
        expect( await promise ).toEqual({ dataURL: "data:image/png;base64,CAPTURED" });
    });

    it("sender のタブが属するウィンドウを png で撮る", async () => {
        const promise = send<{ dataURL: string }>( "capture", undefined, { tab: { id: 1, windowId: 42 } });
        await vi.advanceTimersByTimeAsync( 100 );
        await promise;

        expect( mock.chrome.tabs.captureVisibleTab ).toHaveBeenCalledWith( 42, { format: "png" });
    });

    it("撮影に失敗したら直前の画像を返す", async () => {
        const first = send<{ dataURL: string }>( "capture" );
        await vi.advanceTimersByTimeAsync( 100 );
        await first;

        mock.chrome.tabs.captureVisibleTab.mockRejectedValueOnce( new Error( "rate limit" ) as never );
        const second = send<{ dataURL: string }>( "capture" );
        await vi.advanceTimersByTimeAsync( 100 );

        // 画面が真っ白になるのを避けるため、最後に成功した画像を使い回す
        expect( await second ).toEqual({ dataURL: "data:image/png;base64,CAPTURED" });
    });

    it("1回も成功していないうちに失敗したら空文字を返す", async () => {
        mock.chrome.tabs.captureVisibleTab.mockRejectedValueOnce( new Error( "no permission" ) as never );
        const promise = send<{ dataURL: string }>( "capture" );
        await vi.advanceTimersByTimeAsync( 100 );

        expect( await promise ).toEqual({ dataURL: "" });
    });

    it("連続で呼ぶと間引かれずに全部撮ってしまう（既知の問題・現状固定）", async () => {
        // clearTimeout(_timer) はあるが setTimeout の戻り値を _timer に入れていないため、
        // デバウンスが効いていない。captureVisibleTab には呼び出し回数の上限があるので直したい。
        // 直したら 1 になってここが落ちる。
        const a = send<{ dataURL: string }>( "capture" );
        const b = send<{ dataURL: string }>( "capture" );
        const c = send<{ dataURL: string }>( "capture" );
        await vi.advanceTimersByTimeAsync( 100 );
        await Promise.all([ a, b, c ]);

        expect( mock.chrome.tabs.captureVisibleTab ).toHaveBeenCalledTimes( 3 );
    });
});

describe("ルーペの開閉を送る経路", () => {
    it("ツールバーのアイコンから toggleSimpLoupe を送る", () => {
        mock.listeners.actionClick[0]!({ id: 42 });
        expect( mock.chrome.tabs.sendMessage ).toHaveBeenCalledWith( 42, { command: "toggleSimpLoupe" });
    });

    it("右クリックメニューから toggleSimpLoupe を送る", () => {
        mock.listeners.menuClick[0]!({}, { id: 7 });
        expect( mock.chrome.tabs.sendMessage ).toHaveBeenCalledWith( 7, { command: "toggleSimpLoupe" });
    });

    it("タブが無ければ何も送らない", () => {
        mock.listeners.actionClick[0]!( undefined );
        mock.listeners.menuClick[0]!({}, undefined );
        expect( mock.chrome.tabs.sendMessage ).not.toHaveBeenCalled();
    });

    it("content script が居ないタブでも例外にしない", async () => {
        // 拡張機能をインストールした直後のタブには content script が入っていない
        mock.chrome.tabs.sendMessage.mockRejectedValueOnce( new Error( "Receiving end does not exist" ) as never );
        expect( () => mock.listeners.actionClick[0]!({ id: 1 }) ).not.toThrow();
        await Promise.resolve();
    });
});

describe("インストール時", () => {
    it("右クリックメニューを http(s) 限定で追加する", () => {
        mock.listeners.installed[0]!();

        expect( mock.chrome.contextMenus.create ).toHaveBeenCalledOnce();
        expect( mock.chrome.contextMenus.create.mock.calls[0]![0] ).toEqual({
            id:      "simpLoupe/toggle",
            title:   "[tglTtl]",
            type:    "normal",
            contexts: [ "page" ],
            documentUrlPatterns: [
                "http://*/*",
                "https://*/*",
            ],
        });
    });
});

/**
 * captureVisibleTab が使えないページではルーペが真っ白になるので、
 * アイコンと右クリックメニューをまとめて無効にしている。
 */
describe("タブ切り替えでの有効／無効", () => {
    async function activate( url: string ): Promise<void> {
        mock.chrome.tabs.get.mockResolvedValueOnce({ url } as never );
        await mock.listeners.tabActivate[0]!({ tabId: 1 });
    }

    it.each([
        "https://example.com/",
        "http://example.com/page",
        "https://www.google.com/search?q=a",
    ])("ふつうのページ (%s) では有効にする", async url => {
        await activate( url );
        expect( mock.chrome.action.enable ).toHaveBeenCalledOnce();
        expect( mock.chrome.action.disable ).not.toHaveBeenCalled();
        expect( mock.chrome.contextMenus.update ).toHaveBeenCalledWith( "simpLoupe/toggle", { enabled: true });
    });

    it.each([
        "https://chromewebstore.google.com/detail/xxx",
        "https://chrome.google.com/webstore/detail/xxx",
        "chrome://extensions",
        "file:///Users/foo/index.html",
    ])("拡張機能が動けないページ (%s) では無効にする", async url => {
        await activate( url );
        expect( mock.chrome.action.disable ).toHaveBeenCalledOnce();
        expect( mock.chrome.action.enable ).not.toHaveBeenCalled();
        expect( mock.chrome.contextMenus.update ).toHaveBeenCalledWith( "simpLoupe/toggle", { enabled: false });
    });

    it("URL が取れないタブは有効扱いにする（現状固定）", async () => {
        // tab.url は権限が無いと undefined になる。空文字はどの除外パターンにも一致しない
        await activate( undefined as unknown as string );
        expect( mock.chrome.action.enable ).toHaveBeenCalledOnce();
    });

    it("タブの取得に失敗しても例外を投げない", async () => {
        mock.chrome.tabs.get.mockRejectedValueOnce( new Error( "No tab with id" ) as never );
        await expect( mock.listeners.tabActivate[0]!({ tabId: 999 }) ).resolves.toBeUndefined();
        expect( mock.chrome.action.enable ).not.toHaveBeenCalled();
        expect( mock.chrome.action.disable ).not.toHaveBeenCalled();
    });
});
