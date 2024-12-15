import { Config } from "./types";
import { TAGNAME as ElementTagName } from "./ext-simploupe";
import { dispatchEvent } from "./util";
(async () => {
    // manifest
    const manifest = chrome.runtime.getManifest();
    console.log( "manifest", manifest );

    const config = await chrome.runtime.sendMessage<any, Config>({ command: "getConfig" });
    console.log( "config", config );

    // 設定モーダル作成＆設置
    const simpLoupeElement = document.createElement( ElementTagName );
    document.body.append( simpLoupeElement );
    simpLoupeElement.config   = structuredClone(config);
    simpLoupeElement.manifest = structuredClone(manifest);
    simpLoupeElement.requestUpdate();
    await simpLoupeElement.updateComplete;
    console.log("simpLoupeElement", simpLoupeElement);

    simpLoupeElement.addEventListener( "getCapture", async () => {
        try {
            const { dataURL } = await chrome.runtime.sendMessage<any, {dataURL: string}>({command: "capture" });
            // console.log("dataURL!!", dataURL);
            simpLoupeElement.view.captureImage.src = dataURL;
            dispatchEvent( simpLoupeElement, "updatedCapture" );
        }
        catch ( error ) {
            console.log("error", error);
        }
    });
    simpLoupeElement.addEventListener( "save", async () => {
        try {
            const { config } = simpLoupeElement;
            await chrome.runtime.sendMessage<any, boolean>( { command: "saveConfig",  data: structuredClone(config) });
            simpLoupeElement.requestUpdate();
        }
        catch ( error ) {
            console.log("error", error);
        }
    });

    chrome.runtime.onMessage.addListener( (request ) => {
        // console.log({request, sender, sendResponse});
        if ( request.command === "toggleSimpLoupe" ) {
            simpLoupeElement.toggle();
        }
    });

})();