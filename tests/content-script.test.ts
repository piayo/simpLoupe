import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TAGNAME } from "../src/ts/ext-simploupe";
import type { ExtSimpLoupeElement } from "../src/ts/ext-simploupe";
import { defaultConfig } from "../src/ts/data";
import { createChromeMock, type ChromeMock } from "./fixtures/chrome";

/**
 * content-script.ts は import した瞬間に即時関数が走り、
 * ルーペ本体をページに設置して配線する。
 * そのため resetModules / 再 import はしない（custom element の二重定義になる）。
 */
let mock: ChromeMock;
let el: ExtSimpLoupeElement;

/** service worker の代わりに応答する */
const responses: Record<string, unknown> = {
    getConfig:  structuredClone( defaultConfig ),
    capture:    { dataURL: "data:image/png;base64,CAPTURED" },
    saveConfig: true,
};

beforeAll( async () => {
    mock = createChromeMock( message => {
        if ( !( message.command in responses ) ) {
            throw new Error( `unexpected command: ${message.command}` );
        }
        return responses[ message.command ];
    });
    vi.stubGlobal( "chrome", mock.chrome );

    await import( "../src/ts/content-script" );

    // 即時関数は import の解決を待たないので、設置されるまで待つ
    await vi.waitFor( () => {
        el = document.querySelector( TAGNAME )!;
        expect( el ).toBeTruthy();
        expect( el.config ).toBeTruthy();
    });
    await el.updateComplete;
});

beforeEach( () => {
    vi.clearAllMocks();
});

describe("初期化", () => {
    it("ルーペ本体をページに1つだけ置く", () => {
        expect( document.querySelectorAll( TAGNAME ).length ).toBe( 1 );
        expect( el.parentElement ).toBe( document.body );
    });

    it("service worker から取った config を渡す", () => {
        expect( el.config ).toEqual( defaultConfig );
    });

    it("config は複製して渡す（service worker の応答と同一参照にしない）", () => {
        expect( el.config ).not.toBe( responses["getConfig"] );
    });

    it("manifest を渡す（設定パネルの名前とバージョンに使う）", () => {
        expect( el.manifest ).toEqual({ name: "simpLoupe", version: "0.0.0-test" });
    });

    it("最初の描画が終わっている（show() が dialog を掴めるようにする）", () => {
        // 描画前に show() を呼ぶと this.dialog が undefined で落ちる
        expect( el.shadowRoot!.querySelector( ".dialog" ) ).toBeTruthy();
    });
});

describe("キャプチャの受け渡し", () => {
    it("getCapture で capture を要求し、画像に入れて updatedCapture を投げる", async () => {
        const updated = vi.fn();
        el.addEventListener( "updatedCapture", updated );

        el.updateCapture();   // getCapture を投げる
        await vi.waitFor( () => expect( updated ).toHaveBeenCalledOnce() );

        expect( mock.chrome.runtime.sendMessage ).toHaveBeenCalledWith({ command: "capture" });
        expect( el.view.captureImage.src ).toBe( "data:image/png;base64,CAPTURED" );

        el.removeEventListener( "updatedCapture", updated );
    });

    it("capture が失敗しても落ちない", async () => {
        mock.chrome.runtime.sendMessage.mockRejectedValueOnce( new Error( "capture failed" ) as never );
        const updated = vi.fn();
        el.addEventListener( "updatedCapture", updated );

        el.updateCapture();
        await new Promise( resolve => setTimeout( resolve, 0 ) );

        expect( updated ).not.toHaveBeenCalled();   // 更新はされないが例外も出ない
        el.removeEventListener( "updatedCapture", updated );
    });
});

describe("設定の保存", () => {
    it("save で saveConfig を送る", async () => {
        el.config = { ...el.config, zoom: 5 };

        el.commit();   // save を投げる
        await vi.waitFor( () =>
            expect( mock.chrome.runtime.sendMessage ).toHaveBeenCalledWith({
                command: "saveConfig",
                data:    { ...defaultConfig, zoom: 5 },
            })
        );
    });

    it("送るのは複製（あとで書き換えても送った内容は変わらない）", async () => {
        el.config = { ...el.config, size: 4 };
        el.commit();
        await vi.waitFor( () => expect( mock.chrome.runtime.sendMessage ).toHaveBeenCalled() );

        const sent = mock.chrome.runtime.sendMessage.mock.calls[0]![0] as any;
        el.config.size = 2;
        expect( sent.data.size ).toBe( 4 );
    });
});

describe("service worker からのメッセージ", () => {
    it("onMessage のリスナーを1つ登録する", () => {
        expect( mock.listeners.message.length ).toBe( 1 );
    });

    it("toggleSimpLoupe で開閉する", () => {
        const spy = vi.spyOn( el, "toggle" );

        mock.listeners.message[0]!({ command: "toggleSimpLoupe" }, {}, () => {});
        expect( spy ).toHaveBeenCalledOnce();
        expect( el.open ).toBe( true );

        mock.listeners.message[0]!({ command: "toggleSimpLoupe" }, {}, () => {});
        expect( el.open ).toBe( false );
    });

    it("知らないコマンドでは何もしない", () => {
        const spy = vi.spyOn( el, "toggle" );
        mock.listeners.message[0]!({ command: "somethingElse" }, {}, () => {});
        expect( spy ).not.toHaveBeenCalled();
    });
});
