/**
 * @license
 * Copyright (C) piayo.
 */

import { defaultConfig } from "./data";
import { Config } from "./types";

const MENU_ID = "simpLoupe/toggle";

(() => {

    async function getStorage<T>( key: string, fallback?: T ): Promise<T> {
        let data = await chrome.storage.local.get(key);
        data = Object.assign({}, fallback ?? null, data[key] );
        return data as T;
    }

    async function setStorage( key: string, json: object|null ): Promise<void> {
        return chrome.storage.local.set({[key]: json})
    }

    // ハンドラ内で例外が出ても必ず応答を返す
    // （無応答だと呼び出し側の `await chrome.runtime.sendMessage` が永久に未解決になる）
    function onHandlerError( command: string, error: unknown, sendResponse: (response?: any) => void ): void {
        console.log("chrome.runtime.onMessage -> command:", command, error);
        sendResponse(null);
    }

    let _timer: any = null;
    let _prevData = "";

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

    // ブラウザアクションで開く
    function actionOnClickedHandler( tab: chrome.tabs.Tab ): void {
        tab && chrome.tabs.sendMessage(tab.id!, {command: "toggleSimpLoupe"})
            .catch((error) => {
                console.log("chrome.action.onClicked -> sendMessage -> openSetting:", error);
            });
    }

    // 右クリックで開く
    function menuOnClickedHandler( _: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab ): void {
        tab && chrome.tabs.sendMessage(tab.id!, {command: "toggleSimpLoupe"})
            .catch((error) => {
                console.log("chrome.contextMenus.onClicked -> sendMessage -> openSetting:", error);
            });
    }

    // 右クリックメニュー追加
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

    const notWorks = [
        /^https?:\/\/chromewebstore.google.com/,
        /^https?:\/\/chrome.google.com\/webstore\//,
        /^chrome:\/\//,
        /^file:\/\//,
    ];

    function isAdaptableURL( url: string ): boolean {
        return notWorks.every( regx => !regx.test( url ) );
    }

    // タブ切り替えでブラウザアイコンの有効/無効を切り替え
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
