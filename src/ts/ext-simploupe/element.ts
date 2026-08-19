/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * ルーペ本体。**この拡張機能の中核。**
 *
 * 仕組みは「表示中のタブを1枚の PNG として撮り、canvas に切り出して拡大描画する」。
 * DOM を拡大しているわけではないので、**キャプチャした時点の絵**が出る。
 * だからスクロールやリサイズのたびに撮り直しが必要になる。
 *
 * 画面の構造は `<dialog>` > `.loupe` > `.canvas` + `.setting`。
 * `showModal()` で top layer に載せるのでページ側の z-index に埋もれない。
 * Shadow DOM なのでページ側の CSS にも汚されない。
 *
 * キャプチャの取得と設定の保存は自分ではやらず、`getCapture` / `save` を投げて
 * content script に任せる（chrome API に触るのは service worker だけという分担）。
 */

import "@webcomponents/custom-elements/custom-elements.min.js";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import { delay, dispatchEvent, getCSSTransitionDuration } from "../util";
import { T } from "../i18n";
import { Config } from "../types";
import { styles } from "./styles";

/** カスタム要素名。content script が createElement に使う */
export const TAGNAME = "ext-simploupe";

@customElement(TAGNAME)
export class ExtSimpLoupeElement extends LitElement {
    static override styles = [styles];

    /** 表示中か。`reflect` しているので CSS 側は `:host([open])` で拾える */
    @property({ type: Boolean, reflect: true })
    open = false;

    @query(".dialog")
    dialog!: HTMLDialogElement;

    @query(".canvas")
    canvas!: HTMLCanvasElement;

    @query(".loupe")
    loupe!: HTMLDivElement;

    /** 設定パネルを開いているか。開いている間はマウス追従を止める */
    @property({ type: Boolean })
    showSetting = false;

    /** 設定パネルのヘッダに出す名前とバージョン。content script が渡す */
    @state()
    manifest: chrome.runtime.Manifest = {} as any;

    /**
     * 現在の設定。content script が保存値で上書きする。
     *
     * ⚠️ ここの既定値は**保存値が届く前の一瞬だけ**効く。data.ts の defaultConfig と
     * `skin` が食い違っている（あちらは "1"）→ docs/known-issues.md
     */
    @state()
    config: Config = {
        skin: "2",
        shape: "round",
        cursor: "crosshair",
        size: 2,
        zoom: 2,
    };

    /**
     * 描画に必要な実行時の状態。**設定ではないので保存しない。**
     *
     * `captureImage` は DOM に入れていない `<img>`。ここに dataURL を流し、
     * `onload` を合図に canvas へ描く。`loaded` が false の間はルーペを隠す
     * （撮り直し中に古い絵やズレた絵を見せないため）。
     */
    @state()
    view = {
        pixelRatio: window.devicePixelRatio,
        x: 0,
        y: 0,
        width: 160 + 80 * this.config.size,
        height: 160 + 80 * this.config.size,
        loaded: false,
        captureImage: document.createElement("img"),
    };

    /** View Transition を1回だけ使うためのフラグ兼ハンドル */
    private _viewTransition?: ViewTransition | boolean;

    /**
     * View Transition を挟んで再描画する。
     * `startViewTransition()` が呼ばれた次の更新だけ包み、以降は通常の更新に戻る。
     * 非対応ブラウザでは素の performUpdate に落ちる。
     */
    override async performUpdate(): Promise<void> {
        if (!document.startViewTransition || !this._viewTransition) {
            return super.performUpdate();
        }
        this._viewTransition = document.startViewTransition(async () => await super.performUpdate());
        await this._viewTransition.updateCallbackDone;
        this._viewTransition = false;
    }

    /** 次の1回の更新を View Transition で行う */
    startViewTransition(): boolean {
        this._viewTransition = true;
        return this._viewTransition;
    }

    /** キャプチャ撮り直しの遅延用 */
    timer: any = null;
    /** スクロール中はルーペを隠し、止まってから撮り直す */
    _onscrollHandler = () => {
        clearTimeout(this.timer);
        this.view.loaded = false;
        this.requestUpdate();
        this.timer = setTimeout(() => this.updateCapture(), 100);
    };

    /** リサイズも同じ扱い（変数名の `resizel` は typo だが内部名なので影響なし） */
    _onresizelHandler = () => {
        clearTimeout(this.timer);
        this.view.loaded = false;
        this.requestUpdate();
        this.timer = setTimeout(() => this.updateCapture(), 100);
    };

    /**
     * マウス追従。位置を更新して切り出し直す。
     *
     * ⚠️ 型は `MouseEvent` だが、**実際には合成した `CustomEvent` も来る**
     * （`on()` の onload が `document` に mousemove を投げている）。
     * その場合 `event.x` は undefined になり、`updatePosition()` 側の
     * `x ?? view.x` で前回位置が使われる。**この前提を壊さないこと。**
     */
    _mousemoveHandler = (event: MouseEvent) => {
        this.updatePosition({ x: event.x, y: event.y });
        this.drawCapture();
    };

    /**
     * 表示する。既に開いていれば false を返して何もしない。
     * `show` を即時、transition の長さだけ待って `shown` を投げる。
     */
    show(): boolean {
        super.requestUpdate();
        const { dialog } = this;
        if (this.open) {
            return false;
        }
        this.view.loaded = false;
        this.open = true;
        dialog.showModal();
        this.on();
        this.updateCapture();
        dispatchEvent(this, "show");

        delay(getCSSTransitionDuration(dialog)).then(() => this.open === true && dispatchEvent(this, "shown"));

        return true;
    }

    /**
     * 隠す。設定パネルも一緒に閉じる。
     * `hide` を即時、transition の長さだけ待って `hidden` を投げる。
     */
    hide(): boolean {
        const { dialog } = this;
        if (!this.open) {
            return false;
        }

        dialog.close();
        this.open = false;
        this.showSetting = false;
        this.off();
        dispatchEvent(this, "hide");

        delay(getCSSTransitionDuration(dialog)).then(() => this.open === false && dispatchEvent(this, "hidden"));

        return true;
    }

    /** 開いていれば閉じ、閉じていれば開く。content script から呼ばれる入口 */
    toggle(): boolean {
        return this.open ? this.hide() : this.show();
    }

    /**
     * 追従を開始する。二重登録を防ぐため先に off() する。
     *
     * `captureImage.onload` で `loaded` を立てたあと、**`document` に mousemove を合成して投げ、
     * 自分のハンドラを叩いて初回描画している。** 開いた直後にマウスが動かなくても絵が出るのはこのため。
     */
    on(): void {
        this.off();
        this.view.captureImage.onload = () => {
            this.view.loaded = true;
            this.requestUpdate();
            dispatchEvent(document, "mousemove");
        };
        document.addEventListener("mousemove", this._mousemoveHandler, false);
        window.addEventListener("resize", this._onresizelHandler, false);
        window.addEventListener("scroll", this._onscrollHandler, false);
    }

    /**
     * 追従を止める。
     * @param onload false を渡すと `captureImage.onload` は残す
     *   （設定パネルを開いている間も撮り直しの結果は反映したいため）
     */
    off(onload = true): void {
        onload && (this.view.captureImage.onload = () => null);
        document.removeEventListener("mousemove", this._mousemoveHandler, false);
        window.removeEventListener("resize", this._onresizelHandler, false);
        window.removeEventListener("scroll", this._onscrollHandler, false);
    }

    /** キャプチャを撮り直してほしいと content script に頼む */
    updateCapture(): void {
        dispatchEvent(this, "getCapture");
    }

    /**
     * ルーペの大きさと位置を DOM に反映する。
     * 中心をカーソルに合わせるため、左上は幅/高さの半分だけ戻した位置になる。
     * `x` / `y` を省略すると前回の位置を使う（合成イベント経由の呼び出し用）。
     */
    updatePosition({ x, y }: { x?: number; y?: number }): void {
        const { loupe, config, view } = this;

        view.width = 160 + 80 * config.size;
        view.height = 160 + 80 * config.size;
        loupe?.style.setProperty("width", `${view.width}px`);
        loupe?.style.setProperty("height", `${view.height}px`);

        view.x = x ?? view.x ?? 0;
        view.y = y ?? view.y ?? 0;
        const left = view.x - view.width / 2;
        const top = view.y - view.height / 2;
        loupe?.style.setProperty("transform", `translate3d(${left}px, ${top}px, 0px)`);
    }

    /**
     * キャプチャから切り出して canvas に拡大描画する。**拡大の本体。**
     *
     * 切り出す領域はカーソルを中心とした `幅 / zoom` 四方で、それを canvas 全面に伸ばす。
     * キャプチャは物理ピクセルなので、切り出し座標には `devicePixelRatio` を掛ける。
     *
     * ⚠️ canvas は CSS ピクセル寸法で作っているため、HiDPI では拡大画像が 1x 相当に甘くなる
     * → docs/known-issues.md
     */
    drawCapture(): void {
        const {
            view: { pixelRatio: pr, width, height, x, y, captureImage },
            config: { zoom },
        } = this;
        const contenxt = this.canvas?.getContext("2d");

        if (!this.view.loaded || !contenxt) {
            return;
        }

        /*
        ・元の画像の (sx, sy) から、
        ・横幅 sw、縦幅 sh の領域をトリミングします。
        ・トリミング画像を、Canvasの座標 (dx, dy) に、
        ・横幅 dw、縦幅 dh のサイズに伸縮して描画します。
        */
        const dx = 0,
            dy = 0,
            dw = width,
            dh = height;

        const sx = (x - width / zoom / 2) * pr,
            sy = (y - height / zoom / 2) * pr,
            sw = (width / zoom) * pr,
            sh = (height / zoom) * pr;

        contenxt.clearRect(0, 0, dw, dh);
        contenxt.save();
        contenxt.drawImage(captureImage, sx, sy, sw, sh, dx, dy, dw, dh);
        contenxt.restore();
    }

    /**
     * 設定パネルを開閉する。開いている間はマウス追従を止める
     * （パネルを操作している最中にルーペが逃げないようにするため）。
     */
    toggleSetting(): void {
        if (this.showSetting) {
            this.showSetting = false;
            this.on();
            return;
        }
        this.showSetting = true;
        this.off(false);
    }

    /**
     * 設定変更を反映して保存を依頼する。
     * 大きさが変わるので寸法と位置を作り直し、canvas への再描画は
     * Lit の更新が終わってからになるよう queueMicrotask で後回しにする。
     */
    commit(): void {
        this.view.width = 160 + 80 * this.config.size;
        this.view.height = 160 + 80 * this.config.size;
        this.requestUpdate();

        dispatchEvent(this, "save");
        this.updatePosition({});
        queueMicrotask(() => this.drawCapture());
    }

    /**
     * 描画。ラジオとスライダーは変更のたびに `commit()` を呼んで即座に反映する。
     *
     * 文言は `T()` 経由（src/i18n/ui/）。`value` は保存値なので**訳さない**。
     * `shape` のラベルだけは `square` と正しく綴ってあるが `value` は `quare` のまま
     * → docs/design/i18n.md
     */
    override render(): TemplateResult {
        const {
            manifest: { name, version },
            showSetting,
            config,
            config: { shape, skin, size, zoom, cursor },
            view: { loaded, width, height },
        } = this;
        return html`<dialog class="dialog" part="dialog" style="--cursor: ${cursor}" @close=${() => this.hide()}>
            <div
                class="loupe"
                part="loupe"
                data-skin=${skin}
                data-shape=${shape}
                data-size=${size}
                data-zoom=${zoom}
                ?hidden=${!loaded}
                @click=${(e: any) => {
                    if (this.loupe !== e.target) {
                        return;
                    }
                    this.toggleSetting();
                }}
            >
                <canvas class="canvas" .width=${width} .height=${height}></canvas>
                <div class="parts"></div>

                <div class="setting" ?hidden=${!showSetting}>
                    <div class="header">
                        <span class="_name">${name}</span>
                        <span class="_version">${version}</span>
                    </div>
                    <table class="table">
                        <tr>
                            <th>${T("label.zoom")}:</th>
                            <td>
                                <input
                                    type="range"
                                    name="zoom"
                                    style="width: 80px;"
                                    min="2"
                                    max="5"
                                    .value=${zoom}
                                    @input=${(e: any) => (config.zoom = Number(e.target.value)) && this.commit()}
                                    @change=${(e: any) => (config.zoom = Number(e.target.value)) && this.commit()}
                                />
                            </td>
                        </tr>
                        <tr>
                            <th>${T("label.size")}:</th>
                            <td>
                                <input
                                    type="range"
                                    name="size"
                                    style="width: 80px;"
                                    min="2"
                                    max="5"
                                    .value=${size}
                                    @input=${(e: any) => (config.size = Number(e.target.value)) && this.commit()}
                                    @change=${(e: any) => (config.size = Number(e.target.value)) && this.commit()}
                                />
                            </td>
                        </tr>
                        <tr>
                            <th>${T("label.shape")}:</th>
                            <td @change=${(e: any) => (config.shape = e.target.value) && this.commit()}>
                                <label><input type="radio" name="shape" value="round" .checked=${shape === "round"} /> ${T("shape.round")}</label>
                                <!-- value="quare" は square の綴り間違いだが、保存済みの設定と非互換になるため据え置き。
                                     表示ラベルだけ正しい綴りにしている (キーは shape.square) -->
                                <label><input type="radio" name="shape" value="quare" .checked=${shape === "quare"} /> ${T("shape.square")}</label>
                            </td>
                        </tr>
                        <tr>
                            <th>${T("label.skin")}:</th>
                            <td @change=${(e: any) => (config.skin = e.target.value) && this.commit()}>
                                <!-- 選択肢は数字なので翻訳しない -->
                                <label><input type="radio" name="skin" value="1" .checked=${skin === "1"} /> 1</label>
                                <label><input type="radio" name="skin" value="2" .checked=${skin === "2"} /> 2</label>
                                <label><input type="radio" name="skin" value="3" .checked=${skin === "3"} /> 3</label>
                            </td>
                        </tr>
                        <tr>
                            <th>${T("label.cursor")}:</th>
                            <td @change=${(e: any) => (config.cursor = e.target.value) && this.commit()}>
                                <label><input type="radio" name="cursor" value="crosshair" .checked=${cursor === "crosshair"} /> ${T("cursor.crosshair")}</label>
                                <label><input type="radio" name="cursor" value="none" .checked=${cursor === "none"} /> ${T("cursor.none")}</label>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </dialog>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        [TAGNAME]: ExtSimpLoupeElement;
    }
}
