import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtSimpLoupeElement, TAGNAME } from "../src/ts/ext-simploupe";
import { defaultConfig } from "../src/ts/data";
import type { Config } from "../src/ts/types";
import { stubCanvas2D, type Fake2DContext } from "./fixtures/canvas";
import { flushTimers, mouseMoveEvent, resetPage } from "./fixtures/page";

let el: ExtSimpLoupeElement;
let context2d: Fake2DContext;

/** ルーペ本体をページに置いて最初の描画を待つ（content-script.ts と同じ手順） */
async function mountLoupe( config: Config = structuredClone( defaultConfig ) ): Promise<ExtSimpLoupeElement> {
    const element = document.createElement( TAGNAME );
    document.body.append( element );
    element.config   = structuredClone( config );
    element.manifest = { name: "simpLoupe", version: "9.9.9" } as never;
    element.requestUpdate();
    await element.updateComplete;
    return element;
}

/** shadow DOM の中を引く */
function part<T extends HTMLElement>( selector: string ): T {
    return el.shadowRoot!.querySelector<T>( selector )!;
}

beforeEach( async () => {
    resetPage();
    context2d = stubCanvas2D();
    el = await mountLoupe();
});

afterEach( () => {
    el.hide();
    el.remove();
    vi.restoreAllMocks();
});

describe("初期状態", () => {
    it("閉じている", () => {
        expect( el.open ).toBe( false );
        expect( part<HTMLDialogElement>( ".dialog" ).open ).toBe( false );
    });

    it("キャプチャが届くまでルーペを隠しておく", () => {
        // 中身が空のまま輪郭だけ出るのを避けるため hidden にしている
        expect( part( ".loupe" ).hasAttribute( "hidden" ) ).toBe( true );
    });

    it("設定パネルは隠れている", () => {
        expect( el.showSetting ).toBe( false );
        expect( part( ".setting" ).hasAttribute( "hidden" ) ).toBe( true );
    });

    /**
     * element.ts のクラスフィールドの既定値と data.ts の defaultConfig がズレている。
     * 実行時は content-script.ts が service worker の値で必ず上書きするので表には出ないが、
     * 既定値が2箇所にあるのは事故のもと。片方に寄せたらこのテストが落ちる。
     */
    it("element.ts の既定 skin が data.ts と一致していない（既知の問題・現状固定）", () => {
        const bare = new ExtSimpLoupeElement();
        expect( bare.config.skin ).toBe( "2" );
        expect( defaultConfig.skin ).toBe( "1" );
    });
});

describe("show / hide / toggle", () => {
    it("show でモーダルを開く", () => {
        expect( el.show() ).toBe( true );
        expect( el.open ).toBe( true );
        expect( part<HTMLDialogElement>( ".dialog" ).open ).toBe( true );
    });

    it("show は open 属性を反映する", async () => {
        el.show();
        await el.updateComplete;
        expect( el.hasAttribute( "open" ) ).toBe( true );
    });

    it("開いているときの show は何もせず false を返す", () => {
        el.show();
        expect( el.show() ).toBe( false );
    });

    it("閉じているときの hide は何もせず false を返す", () => {
        expect( el.hide() ).toBe( false );
    });

    it("hide で閉じて設定パネルも閉じる", () => {
        el.show();
        el.toggleSetting();
        expect( el.showSetting ).toBe( true );

        expect( el.hide() ).toBe( true );
        expect( el.open ).toBe( false );
        expect( el.showSetting ).toBe( false );
    });

    it("toggle は開閉を入れ替える", () => {
        expect( el.toggle() ).toBe( true );
        expect( el.open ).toBe( true );
        expect( el.toggle() ).toBe( true );
        expect( el.open ).toBe( false );
    });

    it("show は表示直後に getCapture を要求する", () => {
        const spy = vi.fn();
        el.addEventListener( "getCapture", spy );
        el.show();
        expect( spy ).toHaveBeenCalledOnce();
    });

    it("show / hide のイベントを投げる", () => {
        const shown = vi.fn();
        const hidden = vi.fn();
        el.addEventListener( "show", shown );
        el.addEventListener( "hide", hidden );

        el.show();
        expect( shown ).toHaveBeenCalledOnce();
        el.hide();
        expect( hidden ).toHaveBeenCalled();
    });

    /**
     * ⚠️ happy-dom は dialog.close() の close イベントを **同期** で投げる。
     *    hide() は dialog.close() の後に this.open = false を入れているため、
     *    @close ハンドラから hide() が再入して "hide" が2回飛ぶ。
     *    HTML 仕様では close イベントはタスクに積まれる（非同期）ので、
     *    実ブラウザでは 1 回。テスト環境固有の差として固定しておく。
     */
    it("happy-dom では hide が再入して hide イベントが2回飛ぶ", () => {
        const hidden = vi.fn();
        el.show();
        el.addEventListener( "hide", hidden );
        el.hide();
        expect( hidden ).toHaveBeenCalledTimes( 2 );
        expect( el.open ).toBe( false );   // 状態は正しく閉じている
    });

    it("transition のあとに shown / hidden を投げる", async () => {
        // happy-dom は transition の一括指定を展開しないため待ち時間は 0（実ブラウザでは 240ms）
        const shown = vi.fn();
        el.addEventListener( "shown", shown );

        el.show();
        expect( shown ).not.toHaveBeenCalled();   // 同期では飛ばない
        await flushTimers();
        expect( shown ).toHaveBeenCalledOnce();
    });

    it("待っている間に閉じられたら shown を投げない", async () => {
        const shown = vi.fn();
        el.addEventListener( "shown", shown );

        el.show();
        el.hide();
        await flushTimers();

        expect( shown ).not.toHaveBeenCalled();
    });

    it("dialog の close（Esc キー）で閉じる", async () => {
        el.show();
        part<HTMLDialogElement>( ".dialog" ).dispatchEvent( new Event( "close" ) );
        await el.updateComplete;
        expect( el.open ).toBe( false );
    });
});

describe("イベントリスナーの着脱", () => {
    it("表示中だけ document の mousemove を見る", () => {
        const before = vi.fn();
        el.addEventListener( "getCapture", before );

        // 閉じている間はルーペが追従しない
        document.dispatchEvent( mouseMoveEvent( 10, 10 ) );
        expect( el.view.x ).toBe( 0 );

        el.show();
        document.dispatchEvent( mouseMoveEvent( 10, 10 ) );
        expect( el.view.x ).toBe( 10 );

        el.hide();
        document.dispatchEvent( mouseMoveEvent( 99, 99 ) );
        expect( el.view.x ).toBe( 10 );   // 外したので更新されない
    });

    it("show を繰り返してもリスナーは重複しない", () => {
        // show() は on() を呼び、on() は先に off() する
        el.show();
        el.on();
        el.on();

        const spy = vi.spyOn( el, "drawCapture" );
        document.dispatchEvent( mouseMoveEvent( 20, 20 ) );
        expect( spy ).toHaveBeenCalledOnce();
    });

    it.each([ "scroll", "resize" ])( "%s でキャプチャを撮り直す", async eventName => {
        vi.useFakeTimers();
        try {
            el.show();
            const spy = vi.fn();
            el.addEventListener( "getCapture", spy );

            window.dispatchEvent( new Event( eventName ) );
            expect( el.view.loaded ).toBe( false );   // 撮り直すまで隠す
            expect( spy ).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync( 100 );
            expect( spy ).toHaveBeenCalledOnce();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it("スクロールが続いている間は撮り直さない（100ms のデバウンス）", async () => {
        vi.useFakeTimers();
        try {
            el.show();
            const spy = vi.fn();
            el.addEventListener( "getCapture", spy );

            window.dispatchEvent( new Event( "scroll" ) );
            await vi.advanceTimersByTimeAsync( 99 );
            window.dispatchEvent( new Event( "scroll" ) );
            await vi.advanceTimersByTimeAsync( 100 );

            expect( spy ).toHaveBeenCalledOnce();
        }
        finally {
            vi.useRealTimers();
        }
    });
});

/**
 * ルーペの直径は 160px + 80px × size。
 * この式は element.ts の updatePosition / commit / view の初期値に3箇所ある。
 */
describe("updatePosition", () => {
    it.each([
        [ 2, 320 ],
        [ 3, 400 ],
        [ 5, 560 ],
    ])("size %i のとき直径は %ipx", ( size, expected ) => {
        el.config.size = size;
        el.updatePosition({ x: 0, y: 0 });

        expect( el.view.width ).toBe( expected );
        expect( el.view.height ).toBe( expected );
        expect( part( ".loupe" ).style.width ).toBe( `${expected}px` );
    });

    it("カーソルがルーペの中心に来る", () => {
        el.updatePosition({ x: 500, y: 400 });
        // 320 / 2 = 160 ずつ左上にずらす
        expect( part( ".loupe" ).style.transform ).toBe( "translate3d(340px, 240px, 0px)" );
    });

    it("省略した座標は直前の値を保つ", () => {
        el.updatePosition({ x: 500, y: 400 });
        el.updatePosition({});
        expect( el.view.x ).toBe( 500 );
        expect( el.view.y ).toBe( 400 );
    });
});

/**
 * ここが拡張機能の中核。タブ全体のスクリーンショットから
 * 「カーソル周辺 ÷ zoom」の矩形を切り出して canvas 全面に伸ばす。
 * happy-dom は 2D コンテキストを持たないので getContext を差し替えて引数を検証する。
 */
describe("drawCapture のトリミング", () => {
    beforeEach( () => {
        el.view.loaded = true;
    });

    it("zoom 2 / size 2 / pixelRatio 1", () => {
        el.updatePosition({ x: 400, y: 300 });
        el.drawCapture();

        expect( context2d.drawImages ).toHaveLength( 1 );
        expect( context2d.drawImages[0] ).toMatchObject({
            sx: 320, sy: 220, sw: 160, sh: 160,   // 320 / 2 = 160 の矩形を中心から切る
            dx: 0,   dy: 0,   dw: 320, dh: 320,   // canvas 全面に伸ばす
        });
    });

    it("zoom を上げると切り出す矩形が小さくなる", () => {
        el.config.zoom = 4;
        el.updatePosition({ x: 400, y: 300 });
        el.drawCapture();

        expect( context2d.drawImages[0] ).toMatchObject({
            sx: 360, sy: 260, sw: 80, sh: 80,
            dw: 320, dh: 320,
        });
    });

    it("pixelRatio の分だけ元画像の座標を拡大する", () => {
        // Retina では captureVisibleTab の画像が CSS ピクセルの2倍で返る
        el.view.pixelRatio = 2;
        el.updatePosition({ x: 400, y: 300 });
        el.drawCapture();

        expect( context2d.drawImages[0] ).toMatchObject({
            sx: 640, sy: 440, sw: 320, sh: 320,
            dw: 320, dh: 320,   // 描画先は CSS ピクセルのまま
        });
    });

    it("描画前に前のフレームを消す", () => {
        el.updatePosition({ x: 400, y: 300 });
        el.drawCapture();
        expect( context2d.clearRects[0] ).toEqual({ x: 0, y: 0, w: 320, h: 320 });
        expect( context2d.saved ).toBe( 1 );
        expect( context2d.restored ).toBe( 1 );
    });

    it("キャプチャが未読み込みなら描画しない", () => {
        el.view.loaded = false;
        el.drawCapture();
        expect( context2d.drawImages ).toHaveLength( 0 );
    });

    it("2D コンテキストが取れなくても落ちない", () => {
        // happy-dom の素の canvas は getContext("2d") が null を返す。実機でも取れない場合がある
        vi.spyOn( HTMLCanvasElement.prototype, "getContext" ).mockReturnValue( null as never );
        expect( () => el.drawCapture() ).not.toThrow();
    });
});

describe("render", () => {
    it("config を data 属性に流す（CSS はこれを見てスキンを切り替える）", async () => {
        el.config = { skin: "3", shape: "quare", size: 4, zoom: 5, cursor: "none" };
        await el.updateComplete;

        const loupe = part( ".loupe" );
        expect( loupe.dataset.skin ).toBe( "3" );
        expect( loupe.dataset.shape ).toBe( "quare" );
        expect( loupe.dataset.size ).toBe( "4" );
        expect( loupe.dataset.zoom ).toBe( "5" );
        expect( part( ".dialog" ).getAttribute( "style" ) ).toContain( "--cursor: none" );
    });

    /**
     * view は @state のオブジェクトを **中身だけ書き換えて**使っているため、
     * Lit の変更検知が働かない。だから element.ts は各所で requestUpdate() を明示している。
     * この前提が崩れると canvas の解像度がルーペの直径とズレて、拡大率が狂う。
     */
    it("view を書き換えただけでは canvas の解像度が変わらない", async () => {
        el.config.size = 5;
        el.updatePosition({});
        await el.updateComplete;

        expect( el.view.width ).toBe( 560 );
        expect( part<HTMLCanvasElement>( ".canvas" ).width ).toBe( 320 );   // 追随していない
    });

    it("requestUpdate すると canvas の解像度が追随する", async () => {
        el.config.size = 5;
        el.updatePosition({});
        el.requestUpdate();
        await el.updateComplete;

        const canvas = part<HTMLCanvasElement>( ".canvas" );
        expect( canvas.width ).toBe( 560 );
        expect( canvas.height ).toBe( 560 );
    });

    it("manifest の名前とバージョンを設定パネルに出す", () => {
        expect( part( "._name" ).textContent ).toBe( "simpLoupe" );
        expect( part( "._version" ).textContent ).toBe( "9.9.9" );
    });

    /**
     * defaultConfig の値が設定 UI の選択肢に無いと、
     * ラジオがどれも選ばれていない／スライダーが端に寄った状態で開くことになる。
     */
    it("defaultConfig は設定 UI で必ず1つ選択された状態になる", () => {
        for ( const name of [ "shape", "skin", "cursor" ] ) {
            const radios = el.shadowRoot!.querySelectorAll<HTMLInputElement>( `input[name='${name}']` );
            expect( radios.length ).toBeGreaterThan( 0 );
            expect( Array.from( radios ).filter( r => r.checked ) ).toHaveLength( 1 );
        }
    });

    it.each([ "zoom", "size" ])( "%s のスライダーの範囲に既定値が収まっている", name => {
        const range = part<HTMLInputElement>( `input[name='${name}']` );
        const value = defaultConfig[name as "zoom" | "size"];
        expect( value ).toBeGreaterThanOrEqual( Number( range.min ) );
        expect( value ).toBeLessThanOrEqual( Number( range.max ) );
        expect( range.value ).toBe( String( value ) );
    });
});

describe("toggleSetting", () => {
    it("設定を開くとカーソル追従を止める", () => {
        el.show();
        el.toggleSetting();

        expect( el.showSetting ).toBe( true );
        const spy = vi.spyOn( el, "drawCapture" );
        document.dispatchEvent( mouseMoveEvent( 50, 50 ) );
        expect( spy ).not.toHaveBeenCalled();
    });

    it("設定を開いてもキャプチャの onload は外さない", () => {
        // off(false) で呼んでいる。外すとルーペの中身が更新されなくなる
        el.show();
        const before = el.view.captureImage.onload;
        el.toggleSetting();
        expect( el.view.captureImage.onload ).toBe( before );
    });

    it("設定を閉じるとカーソル追従が戻る", () => {
        el.show();
        el.toggleSetting();
        el.toggleSetting();

        expect( el.showSetting ).toBe( false );
        const spy = vi.spyOn( el, "drawCapture" );
        document.dispatchEvent( mouseMoveEvent( 50, 50 ) );
        expect( spy ).toHaveBeenCalledOnce();
    });
});

describe("キャプチャの読み込み完了", () => {
    it("読み込めたらルーペを出して描き直す", () => {
        el.show();
        const spy = vi.spyOn( el, "drawCapture" );

        // content-script.ts が captureImage.src に dataURL を入れたときに走る
        el.view.captureImage.onload!.call( el.view.captureImage, new Event( "load" ) );

        expect( el.view.loaded ).toBe( true );
        // document に mousemove を投げて、直前のカーソル位置のまま描き直させている
        expect( spy ).toHaveBeenCalledOnce();
    });

    it("hide のあとは読み込み完了でも描き直さない", () => {
        el.show();
        const onload = el.view.captureImage.onload!;
        el.hide();
        const spy = vi.spyOn( el, "drawCapture" );

        onload.call( el.view.captureImage, new Event( "load" ) );

        expect( spy ).not.toHaveBeenCalled();
    });
});

/**
 * 設定パネルの入力。値を書き換えて commit() するだけの薄い配線だが、
 * ここが壊れると設定が保存されないまま見た目だけ変わる。
 */
describe("設定パネルの入力", () => {
    beforeEach( async () => {
        el.show();
        el.toggleSetting();
        await el.updateComplete;
    });

    // input（ドラッグ中）と change（離したとき）の両方に同じ処理を付けてある
    it.each([
        [ "zoom", "input" ],
        [ "zoom", "change" ],
        [ "size", "input" ],
        [ "size", "change" ],
    ] as const)( "%s のスライダーの %s で config と保存が走る", ( key, eventName ) => {
        const save = vi.fn();
        el.addEventListener( "save", save );

        const range = part<HTMLInputElement>( `input[name='${key}']` );
        range.value = "4";
        range.dispatchEvent( new Event( eventName, { bubbles: true }) );

        expect( el.config[key] ).toBe( 4 );
        expect( save ).toHaveBeenCalledOnce();
    });

    it.each([
        [ "shape",  "quare" ],
        [ "skin",   "3" ],
        [ "cursor", "none" ],
    ])( "%s のラジオを選ぶと config と保存が走る", ( name, value ) => {
        const save = vi.fn();
        el.addEventListener( "save", save );

        const radio = el.shadowRoot!.querySelector<HTMLInputElement>( `input[name='${name}'][value='${value}']` )!;
        radio.checked = true;
        radio.dispatchEvent( new Event( "change", { bubbles: true }) );

        expect( el.config[ name as "shape" | "skin" | "cursor" ] ).toBe( value );
        expect( save ).toHaveBeenCalledOnce();
    });

    it("ルーペの余白をクリックしても設定は閉じない", () => {
        // クリックの対象が .loupe 自身のときだけトグルする
        part( ".canvas" ).dispatchEvent( new Event( "click", { bubbles: true }) );
        expect( el.showSetting ).toBe( true );
    });

    it("ルーペ自身のクリックで設定を閉じる", () => {
        part( ".loupe" ).dispatchEvent( new Event( "click", { bubbles: true }) );
        expect( el.showSetting ).toBe( false );
    });
});

describe("commit", () => {
    it("save イベントを投げて保存を依頼する", () => {
        const spy = vi.fn();
        el.addEventListener( "save", spy );
        el.commit();
        expect( spy ).toHaveBeenCalledOnce();
    });

    it("size の変更を view と DOM に反映する", async () => {
        el.config.size = 5;
        el.commit();
        await el.updateComplete;

        expect( el.view.width ).toBe( 560 );
        expect( part( ".loupe" ).style.height ).toBe( "560px" );
    });

    it("反映後に描画し直す", async () => {
        el.view.loaded = true;
        el.updatePosition({ x: 400, y: 300 });
        context2d.drawImages.length = 0;

        el.commit();
        await Promise.resolve();   // queueMicrotask の消化

        expect( context2d.drawImages ).toHaveLength( 1 );
    });
});
