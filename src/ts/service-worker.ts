/**
 * @license
 * Copyright (C) piayo.
 */

import { defaultConfig } from "./data";
import { Config } from "./types";

(() => {

    async function getStorage<T>( key: string, fallback?: T ): Promise<T> {
        let data = await chrome.storage.local.get(key);
        data = Object.assign({}, fallback ?? null, data[key] );
        return data as T;
    }

    async function setStorage( key: string, json: Object|null ): Promise<void> {
        return chrome.storage.local.set({[key]: json})
    }

    let _timer: any = null;
    let _prevData = "";

    function onMessageHandler(
        data: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void
    ): boolean {
        // console.log("data.command", data.command);
        // ▼ 保存データ取得
        if ( data.command === "getConfig" ) {
            new Promise( async resolve => {
                const config = await getStorage<Config>( "config", structuredClone( defaultConfig ) );
                resolve(config);
            })
            .then( res => sendResponse( res ) );
            return true;
        }
        // ▼ 保存: 設定
        if ( data.command === "saveConfig" ) {
            new Promise( async resolve => {
                await setStorage( "config", data.data );
                resolve(true);
            })
            .then( res => sendResponse( res ) );
            return true;
        }
        // ▼ 初期化
        if ( data.command === "reset" ) {
            new Promise( async resolve => {
                const config   = structuredClone( defaultConfig );
                await chrome.storage.local.clear();
                await setStorage( "config", config );
                resolve( config );
            })
            .then( res => sendResponse( res ) );
            return true;
        }
        // ▼ キャプチャ取得
        if ( data.command === "capture" ) {
            clearTimeout(_timer);
            setTimeout( async () => {
                try {
                    const windowID = sender.tab!.windowId;
                    const zoom     = await chrome.tabs.getZoom();
                    const dataURL  = _prevData = await chrome.tabs.captureVisibleTab(windowID, {format:"png"});
                    console.log("zoom", zoom);
                    console.log("dataURL", dataURL);
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

    const _menuID = "simpLoupe/toggle";

    function getContextMenu( id: string ): any {
        return (chrome.contextMenus as any )[id] ?? null;
    }

    // 右クリックメニュー追加
    function onInstalledHandler(): void {
        chrome.contextMenus.removeAll();
        (chrome.contextMenus as any )[_menuID] = chrome.contextMenus.create({
            id: _menuID,
            title: "toggle simpLoupe",
            type: "normal",
            contexts: [ "page" ],
            documentUrlPatterns: [
                "http://*/*",
                "https://*/*"
            ]
        });
        // console.log("...", (chrome.contextMenus as any )[_menuID]);
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

    // タブ切り替えでブラウザアイコン有効/無効を消えりかえ
    async function onActivatedHandler( { tabId }: chrome.tabs.TabActiveInfo ): Promise<void> {
        try {
            const tab = await chrome.tabs.get( tabId );
            // console.log("tab", tab);
            const menuID = getContextMenu( _menuID );
            // console.log("...menuID:", menuID, "isAdaptableURL( tab.url )", isAdaptableURL( tab.url ?? "" ) );
            if( isAdaptableURL( tab.url ?? "" ) ){
                await chrome.action.enable();
                chrome.contextMenus.update( menuID, { enabled: true });
            }
            else {
                await chrome.action.disable();
                chrome.contextMenus.update( menuID, { enabled: false });
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

