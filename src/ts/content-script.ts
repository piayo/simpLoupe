/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * content script。**ページ側で動く唯一のエントリ。**
 *
 * やることは3つだけで、ルーペの中身には関与しない。
 *
 * 1. `<ext-simploupe>` を作って `document.body` に置き、config と manifest を渡す
 * 2. ルーペが投げる `getCapture` / `save` を受けて service worker に中継する
 * 3. service worker から来る `toggleSimpLoupe` でルーペを開閉する
 *
 * **chrome.storage には直接触らない。** 保存とキャプチャは必ず service worker 経由。
 *
 * ⚠️ この script は**インストール・更新の直後、既に開いているタブには注入されない。**
 * 「アイコンを押しても何も出ない」ときはページのリロードが必要。
 */

import { Config } from "./types";
import { TAGNAME as ElementTagName } from "./ext-simploupe";
import { dispatchEvent } from "./util";
(async () => {
    // manifest
    const manifest = chrome.runtime.getManifest();
    console.log("manifest", manifest);

    const config = await chrome.runtime.sendMessage<any, Config>({ command: "getConfig" });
    console.log("config", config);

    // 設定モーダル作成＆設置
    const simpLoupeElement = document.createElement(ElementTagName);
    document.body.append(simpLoupeElement);
    simpLoupeElement.config = structuredClone(config);
    simpLoupeElement.manifest = structuredClone(manifest);
    simpLoupeElement.requestUpdate();
    await simpLoupeElement.updateComplete;
    console.log("simpLoupeElement", simpLoupeElement);

    // ▼ キャプチャ要求 → service worker が撮った PNG を <img> に流す
    //    読み込み完了は element 側の captureImage.onload が拾う
    simpLoupeElement.addEventListener("getCapture", async () => {
        try {
            const { dataURL } = await chrome.runtime.sendMessage<any, { dataURL: string }>({ command: "capture" });
            simpLoupeElement.view.captureImage.src = dataURL;
            dispatchEvent(simpLoupeElement, "updatedCapture");
        } catch (error) {
            console.log("error", error);
        }
    });
    // ▼ 設定変更 → 保存を service worker に委譲する
    simpLoupeElement.addEventListener("save", async () => {
        try {
            const { config } = simpLoupeElement;
            await chrome.runtime.sendMessage<any, boolean>({ command: "saveConfig", data: structuredClone(config) });
            simpLoupeElement.requestUpdate();
        } catch (error) {
            console.log("error", error);
        }
    });

    // ▼ ツールバーアイコン / 右クリックメニューからの開閉
    chrome.runtime.onMessage.addListener((request) => {
        if (request.command === "toggleSimpLoupe") {
            simpLoupeElement.toggle();
        }
    });
})();
