import "@webcomponents/custom-elements/custom-elements.min.js";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import { delay, dispatchEvent, getCSSTransitionDuration } from "../util";
import { Config } from "../types";
import { styles } from "./styles";

export const TAGNAME = "ext-simploupe";

@customElement( TAGNAME )
export class ExtSimpLoupeElement extends LitElement {
    static override styles = [ styles ];

    @property({ type: Boolean, reflect: true })
    open = false;

    @query( ".dialog" )
    dialog!: HTMLDialogElement;

    @query( ".canvas" )
    canvas!: HTMLCanvasElement;

    @query( ".loupe" )
    loupe!: HTMLDivElement;

    @property({ type: Boolean })
    showSetting = false;

    @state()
    manifest: chrome.runtime.Manifest = {} as any;

    @state()
    config: Config = {
        skin   : "2",
        shape  : "round",
        cursor : "crosshair",
        size   : 2,
        zoom   : 2,
    };

    @state()
    view = {
        pixelRatio: window.devicePixelRatio,
        x: 0,
        y: 0,
        width : 160 + (80 * this.config.size),
        height: 160 + (80 * this.config.size),
        loaded: false,
        captureImage: document.createElement('img'),
    };

    private _viewTransition?: ViewTransition|boolean;

    override async performUpdate(): Promise<void> {
        if ( !document.startViewTransition|| !this._viewTransition ) {
            return super.performUpdate();
        }
        this._viewTransition = document.startViewTransition( async () => await super.performUpdate() );
        await this._viewTransition.updateCallbackDone;
        this._viewTransition = false;
    }

    startViewTransition(): boolean {
        this._viewTransition = true;
        return this._viewTransition;
    }

    timer: any = null;
    _onscrollHandler  = (() => {
        clearTimeout(this.timer);
        this.view.loaded = false;
        this.requestUpdate();
        this.timer = setTimeout( () => this.updateCapture(), 100 );
    }).bind(this);

    _onresizelHandler = (() => {
        clearTimeout(this.timer);
        this.view.loaded = false;
        this.requestUpdate();
        this.timer = setTimeout( () => this.updateCapture(), 100 );
    }).bind(this);

    _mousemoveHandler = (( event: MouseEvent ) => {
        this.updatePosition({ x: event.x, y: event.y });
        this.drawCapture();
    }).bind(this);

    show(): boolean {
        super.requestUpdate();
        const { dialog } = this;
        if ( this.open ) {
            return false;
        }

        this.open = true;
        dialog.showModal();
        this.on();
        this.updateCapture();
        dispatchEvent(this, "show");

        delay( getCSSTransitionDuration(dialog) ).then( () =>
            ( this.open === true ) && dispatchEvent(this, "shown" )
        );

        return true;
    }

    hide(): boolean {
        const { dialog } = this;
        if ( !this.open ) {
            return false;
        }

        dialog.close();
        this.open = false;
        this.showSetting = false;
        this.off();
        dispatchEvent(this, "hide");

        delay( getCSSTransitionDuration(dialog) ).then( () =>
            ( this.open === false ) && dispatchEvent(this, "hidden" )
        );

        return true;
    }

    toggle(): boolean {
        return this.open
            ? this.hide()
            : this.show();
    }

    on(): void {
        this.off();
        this.view.captureImage.onload = () => {
            this.view.loaded = true;
            this.requestUpdate();
            dispatchEvent( document, "mousemove" );
        };
        document.addEventListener("mousemove", this._mousemoveHandler, false);
        window.addEventListener("resize", this._onresizelHandler, false);
        window.addEventListener("scroll", this._onscrollHandler, false);
    }

    off( onload = true ): void {
        onload && ( this.view.captureImage.onload = () => null);
        document.removeEventListener("mousemove", this._mousemoveHandler, false);
        window.removeEventListener("resize", this._onresizelHandler, false);
        window.removeEventListener("scroll", this._onscrollHandler, false);
    }

    updateCapture(): void {
        dispatchEvent( this, "getCapture" );
    }

    updatePosition({ x, y }: { x?: number; y?: number }): void {
        const { loupe, config, view } = this;

        view.width  = 160 + (80 * config.size);
        view.height = 160 + (80 * config.size);
        loupe?.style.setProperty( "width",  `${view.width}px` );
        loupe?.style.setProperty( "height", `${view.height}px` );

        view.x = x ?? view.x ?? 0;
        view.y = y ?? view.y ?? 0;
        const left = view.x - (view.width  / 2);
        const top  = view.y - (view.height / 2);
        loupe?.style.setProperty( "transform", `translate3d(${left}px, ${top}px, 0px)`);
    }

    drawCapture(): void {
        const {
            view: { pixelRatio: pr, width, height, x, y, captureImage },
            config: { zoom }
        } = this;
        const contenxt = this.canvas?.getContext("2d");

        if ( !this.view.loaded || !contenxt ) {
            return;
        }

        /*
        ・元の画像の (sx, sy) から、
        ・横幅 sw、縦幅 sh の領域をトリミングします。
        ・トリミング画像を、Canvasの座標 (dx, dy) に、
        ・横幅 dw、縦幅 dh のサイズに伸縮して描画します。
        */
        const
            dx = 0,
            dy = 0,
            dw = width,
            dh = height;

        const
            sx = (x - ( width  / zoom / 2 ) ) * pr,
            sy = (y - ( height / zoom / 2 ) ) * pr,
            sw = width  / zoom * pr,
            sh = height / zoom * pr;

        contenxt.clearRect(0, 0, dw, dh);
        contenxt.save();
        contenxt.drawImage(
            captureImage,
            sx, sy, sw, sh,
            dx, dy, dw, dh
        );
        contenxt.restore();
        // console.log("...drawCapture", { sx, sy, sw, sh });
    }

    toggleSetting(): void {
        if ( this.showSetting ) {
            this.showSetting = false;
            this.on();
            // dispatchEvent( document, "scroll" );
            return;
        }
        this.showSetting = true;
        this.off(false);
    }

    commit(): void {
        this.view.width  = 160 + (80 * this.config.size),
        this.view.height = 160 + (80 * this.config.size),
        this.requestUpdate();

        dispatchEvent(this, "save");
        this.updatePosition({});
        queueMicrotask( () => this.drawCapture());
    }

    override render(): TemplateResult {
        const {
            manifest: { name, version }, showSetting,
            config, config: { shape, skin, size, zoom, cursor },
            view: { loaded, width, height }
        } = this;
        return html`<dialog
            class="dialog"
            part="dialog"
            style="--cursor: ${cursor}"
            @close=${() => this.hide()}
        >
            <div
                class="loupe"
                part="loupe"
                data-skin=${skin}
                data-shape=${shape}
                data-size=${size}
                data-zoom=${zoom}
                ?hidden=${!loaded}
                @click=${(e: any) => {
                    if ( this.loupe !== e.target ) {
                        return;
                    }
                    this.toggleSetting();
                }}
            >
                <canvas
                    class="canvas"
                    .width=${width}
                    .height=${height}
                ></canvas>
                <div class="parts"></div>

                <div class="setting" ?hidden=${!showSetting}>
                    <div class="header">
                        <span class="_name">${name}</span>
                        <span class="_version">${version}</span>
                    </div>
                    <table class="table">
                        <tr>
                            <th>zoom:</th>
                            <td>
                                <input type="range" name="zoom" style="width: 80px;"
                                    min="2"
                                    max="5"
                                    .value=${zoom}
                                    @input =${(e: any) => (config.zoom = Number(e.target.value)) && this.commit()}
                                    @change=${(e: any) => (config.zoom = Number(e.target.value)) && this.commit()}
                                >
                            </td>
                        </tr>
                        <tr>
                            <th>size:</th>
                            <td>
                                <input type="range" name="size" style="width: 80px;"
                                    min="2"
                                    max="5"
                                    .value=${size}
                                    @input =${(e: any) => (config.size = Number(e.target.value)) && this.commit()}
                                    @change=${(e: any) => (config.size = Number(e.target.value)) && this.commit()}
                                >
                            </td>
                        </tr>
                        <tr>
                            <th>shape:</th>
                            <td @change=${(e: any) => (config.shape = e.target.value) && this.commit()}>
                                <label><input type="radio" name="shape" value="round" .checked=${shape === "round"}> round</label>
                                <label><input type="radio" name="shape" value="quare" .checked=${shape === "quare"}> quare</label>
                            </td>
                        </tr>
                        <tr>
                            <th>skin:</th>
                            <td @change=${(e: any) => (config.skin = e.target.value) && this.commit()}>
                                <label><input type="radio" name="skin" value="1" .checked=${skin === "1"}> 1</label>
                                <label><input type="radio" name="skin" value="2" .checked=${skin === "2"}> 2</label>
                                <label><input type="radio" name="skin" value="3" .checked=${skin === "3"}> 3</label>
                            </td>
                        </tr>
                        <tr>
                            <th>cursor:</th>
                            <td @change=${(e: any) => (config.cursor = e.target.value) && this.commit()}>
                                <label><input type="radio" name="cursor" value="crosshair" .checked=${cursor === "crosshair"}> cross</label>
                                <label><input type="radio" name="cursor" value="none"      .checked=${cursor === "none"}> none</label>
                            </td>
                        </tr>
                    </table>
                </div>
            </div><!-- /.loupe -->
        </dialog>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        [TAGNAME]: ExtSimpLoupeElement;
    }
}
