/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * service worker。**拡張機能側の唯一の窓口。**
 *
 * content script は chrome.storage にも captureVisibleTab にも直接触らないので、
 * ここが全部を仲介する。担当は4つ。
 *
 * 1. 設定の読み書き (`getConfig` / `saveConfig` / `reset`)
 * 2. 表示中のタブのキャプチャ (`capture`)
 * 3. ツールバーアイコンと右クリックメニューからの開閉指示
 * 4. 開けないページでアイコンとメニューを無効化する
 *
 * ⚠️ **数十秒アイドルすると停止する。停止しているのが正常。** メッセージが届けば起き直る。
 * そのため**モジュールスコープに状態を持たせても消える** (`_prevData` は起き直すと空になる)。
 */

import { defaultConfig } from "./data";
import { Config } from "./types";

/** 右クリックメニューの ID。作成と有効/無効の切り替えで同じ値を使う */
const MENU_ID = "simpLoupe/toggle";

(() => {

    /** storage から読む。保存値を fallback に重ねるので、キーを足しても既定値が入る */
    async function getStorage<T>( key: string, fallback?: T ): Promise<T> {
        let data = await chrome.storage.local.get(key);
        data = Object.assign({}, fallback ?? null, data[key] );
        return data as T;
    }

    /** storage に書く */
    async function setStorage( key: string, json: object|null ): Promise<void> {
        return chrome.storage.local.set({[key]: json})
    }

    // ハンドラ内で例外が出ても必ず応答を返す
    // （無応答だと呼び出し側の `await chrome.runtime.sendMessage` が永久に未解決になる）
    function onHandlerError( command: string, error: unknown, sendResponse: (response?: any) => void ): void {
        console.log("chrome.runtime.onMessage -> command:", command, error);
        sendResponse(null);
    }

    /**
     * capture の間引き用タイマー。
     *
     * ⚠️ **setTimeout の戻り値を代入していないため間引きが効いていない**（常に null）。
     * 現状の挙動を固定するテストがあるので、直すときはそちらも直すこと
     * → docs/known-issues.md
     */
    let _timer: any = null;
    /**
     * 直前に撮れたキャプチャ。撮影に失敗したときに黒画面を出さないための保険。
     * **タブ別に持っていない**ので、別タブの絵が出ることがある → docs/known-issues.md
     */
    let _prevData = "";

    /**
     * content script からのコマンドを処理する。
     *
     * **どの分岐でも必ず `sendResponse` を呼び、`return true` する。**
     * 無応答だと呼び出し側の `await chrome.runtime.sendMessage` が永久に未解決になり、
     * ルーペが固まる。非同期で応答するため `return true` は必須。
     */
    function onMessageHandler(
        data: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        // ▼ 保存データ取得
        if ( data.command === "getConfig" ) {
            ( async () => {
                return await getStorage<Config>( "config", structuredClone( defaultConfig ) );
            })()
            .then(  res   => sendResponse( res ) )
            .catch( error => onHandlerError( data.command, error, sendResponse ) );
            return true;
        }
        // ▼ 保存: 設定
        if ( data.command === "saveConfig" ) {
            ( async () => {
                await setStorage( "config", data.data );
                return true;
            })()
            .then(  res   => sendResponse( res ) )
            .catch( error => onHandlerError( data.command, error, sendResponse ) );
            return true;
        }
        // ▼ 初期化
        if ( data.command === "reset" ) {
            ( async () => {
                const config = structuredClone( defaultConfig );
                await chrome.storage.local.clear();
                await setStorage( "config", config );
                return config;
            })()
            .then(  res   => sendResponse( res ) )
            .catch( error => onHandlerError( data.command, error, sendResponse ) );
            return true;
        }
        // ▼ キャプチャ取得
        if ( data.command === "capture" ) {
            clearTimeout(_timer);
            setTimeout( async () => {
                try {
                    const windowID = sender.tab!.windowId;
                    const dataURL  = _prevData = await chrome.tabs.captureVisibleTab(windowID, {format:"png"});
                    sendResponse({ dataURL });
                }
                catch ( error ) {
                    console.log("chrome.runtime.onMessage -> command:", data.command, error);
                    sendResponse({ dataURL: _prevData });
                }
            }, 100);
            return true;
        }

        sendResponse(null);
        return true;
    }

    /** ツールバーアイコンのクリック。アクティブタブに開閉を投げるだけ */
    function actionOnClickedHandler( tab: chrome.tabs.Tab ): void {
        tab && chrome.tabs.sendMessage(tab.id!, {command: "toggleSimpLoupe"})
            .catch((error) => {
                console.log("chrome.action.onClicked -> sendMessage -> openSetting:", error);
            });
    }

    /** 右クリックメニューのクリック。アイコンと同じことをする */
    function menuOnClickedHandler( _: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab ): void {
        tab && chrome.tabs.sendMessage(tab.id!, {command: "toggleSimpLoupe"})
            .catch((error) => {
                console.log("chrome.contextMenus.onClicked -> sendMessage -> openSetting:", error);
            });
    }

    /**
     * 右クリックメニューを作る。
     *
     * ⚠️ `onInstalled` は**拡張機能の再読み込みだけでは走らないことがある。**
     * メニューの定義を変えたら、一度削除してから読み込み直して確認すること。
     */
    function onInstalledHandler(): void {
        chrome.contextMenus.create({
            id: MENU_ID,
            // ツールバーアイコンの tooltip (manifest の action.default_title) と同じキーを共有する
            title: chrome.i18n.getMessage( "tglTtl" ),
            type: "normal",
            contexts: [ "page" ],
            documentUrlPatterns: [
                "http://*/*",
                "https://*/*"
            ]
        });
    }

    /**
     * content script を注入できない URL。ここでは機能を無効化する。
     * ウェブストアと `chrome://` は Chrome が注入を禁じており、`file://` は別途許可が必要。
     */
    const notWorks = [
        /^https?:\/\/chromewebstore.google.com/,
        /^https?:\/\/chrome.google.com\/webstore\//,
        /^chrome:\/\//,
        /^file:\/\//,
    ];

    /** その URL でルーペを使えるか */
    function isAdaptableURL( url: string ): boolean {
        return notWorks.every( regx => !regx.test( url ) );
    }

    /**
     * タブ切り替えでアイコンとメニューの有効/無効を切り替える。
     *
     * ⚠️ **`enable()` / `disable()` を tabId なしで呼んでいるので全タブに効く。**
     * かつ `onActivated` しか見ていないため**同じタブ内での遷移には追従しない**
     * → docs/known-issues.md
     */
    async function onActivatedHandler( { tabId }: chrome.tabs.OnActivatedInfo ): Promise<void> {
        try {
            const tab = await chrome.tabs.get( tabId );
            if( isAdaptableURL( tab.url ?? "" ) ){
                await chrome.action.enable();
                chrome.contextMenus.update( MENU_ID, { enabled: true });
            }
            else {
                await chrome.action.disable();
                chrome.contextMenus.update( MENU_ID, { enabled: false });
            }
        }
        catch ( error ) {
            console.log("error", error);
        }
        return;
    }

    // ▼ リスナー登録
    //    service worker は何度も起き直るので、addListener の前に必ず removeListener する
    //    (同じ関数参照なので二重登録は防げる)
    chrome.runtime.onMessage.removeListener(onMessageHandler);
    chrome.runtime.onMessage.addListener(onMessageHandler);

    chrome.action.onClicked.removeListener( actionOnClickedHandler );
    chrome.action.onClicked.addListener( actionOnClickedHandler );

    chrome.contextMenus.onClicked.removeListener( menuOnClickedHandler );
    chrome.contextMenus.onClicked.addListener( menuOnClickedHandler );

    chrome.runtime.onInstalled.removeListener( onInstalledHandler );
    chrome.runtime.onInstalled.addListener( onInstalledHandler );

    chrome.tabs.onActivated.removeListener( onActivatedHandler );
    chrome.tabs.onActivated.addListener( onActivatedHandler );

})();
