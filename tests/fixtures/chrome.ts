/**
 * chrome 拡張 API の最小限のモック。
 *
 * simpLoupe は「任意のページの上に乗るルーペ」なので、g-calize の
 * tests/fixtures/gcal.ts のような “特定サイトの DOM を写したフィクスチャ” は要らない。
 * 代わりに拡張機能の境界＝chrome API がフィクスチャの中心になる。
 *
 * ここに並んでいる API は src/ts/service-worker.ts と src/ts/content-script.ts が
 * 実際に呼ぶものだけ。src 側で新しい API を使い始めたらここに足すこと。
 */
import { vi } from "vitest";

type Listener = ( ...args: any[] ) => any;

/** addListener / removeListener を持つイベントを作る（登録先の配列を共有する） */
function createEvent( bucket: Listener[] ) {
    return {
        addListener:    ( fn: Listener ) => { bucket.push( fn ); },
        removeListener: ( fn: Listener ) => {
            const i = bucket.indexOf( fn );
            i >= 0 && bucket.splice( i, 1 );
        },
    };
}

export type ChromeMock = ReturnType<typeof createChromeMock>;

/**
 * @param respond content script 側のテストで chrome.runtime.sendMessage の
 *                応答を差し替えるためのフック（service worker の代役）
 */
export function createChromeMock( respond: ( message: any ) => unknown = () => undefined ) {
    /** chrome.storage.local の中身。テストから直接覗いて検証する */
    const store: Record<string, unknown> = {};

    const listeners = {
        message:     [] as Listener[],
        actionClick: [] as Listener[],
        menuClick:   [] as Listener[],
        tabActivate: [] as Listener[],
        installed:   [] as Listener[],
    };

    const chrome = {
        i18n: {
            // 実文言ではなく `[key]` を返す。テストが訳の中身に依存しないようにする
            getMessage:    vi.fn( ( key: string ) => `[${key}]` ),
            // src/ts/i18n.ts の getUILang() が読む。ページの lang ではなくブラウザの UI 言語
            getUILanguage: vi.fn( () => "en-US" ),
        },
        runtime: {
            onMessage:   createEvent( listeners.message ),
            onInstalled: createEvent( listeners.installed ),
            getManifest: vi.fn( () => ({ name: "simpLoupe", version: "0.0.0-test" }) ),
            sendMessage: vi.fn( async ( message: any ): Promise<any> => respond( message ) ),
        },
        storage: {
            local: {
                get:   vi.fn( async ( key: string ) => ( key in store ? { [key]: store[key] } : {} ) ),
                set:   vi.fn( async ( obj: Record<string, unknown> ) => { Object.assign( store, obj ); } ),
                clear: vi.fn( async () => { Object.keys( store ).forEach( k => delete store[k] ); } ),
            },
        },
        action: {
            onClicked: createEvent( listeners.actionClick ),
            enable:    vi.fn( async () => {} ),
            disable:   vi.fn( async () => {} ),
        },
        contextMenus: {
            onClicked: createEvent( listeners.menuClick ),
            create:    vi.fn(),
            update:    vi.fn( async ( _id: string, _props: any ) => {} ),
        },
        tabs: {
            onActivated:       createEvent( listeners.tabActivate ),
            get:               vi.fn( async ( _tabId: number ): Promise<{ url?: string }> => ({ url: "https://example.com/" }) ),
            sendMessage:       vi.fn( async ( _tabId: number, _message: any ): Promise<any> => undefined ),
            captureVisibleTab: vi.fn( async ( _windowId?: number, _options?: any ): Promise<string> => "data:image/png;base64,CAPTURED" ),
        },
    };

    return { chrome, store, listeners };
}

/**
 * service worker にメッセージを送って sendResponse の値を受け取る。
 * sender は capture が sender.tab.windowId を読むため既定で埋めてある。
 */
export function sendMessage<T>(
    mock:    ChromeMock,
    command: string,
    data?:   unknown,
    sender:  unknown = { tab: { id: 1, windowId: 9 } },
): Promise<T> {
    return new Promise( resolve => {
        mock.listeners.message[0]!( { command, data }, sender, resolve );
    });
}
