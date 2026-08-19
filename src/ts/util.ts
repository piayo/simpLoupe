/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * 汎用の小道具。**simpLoupe 固有の知識を持ち込まないこと。**
 * ルーペやキャプチャに依存する処理は ext-simploupe/ 側に置く。
 */

/** querySelector の薄いラッパ。見つからなければ null */
export function qs<T extends HTMLElement>(query: string, context: Document | HTMLElement = document): T | null {
    return context.querySelector(query) || null;
}

/** querySelectorAll を配列で返す (NodeList のままだと map / filter が使えない) */
export function qsa<T extends HTMLElement>(query: string, context: Document | HTMLElement = document): T[] {
    return Array.from(context.querySelectorAll(query));
}

/**
 * transition の長さをミリ秒で取得する。CSS を直値で持たずに待ち時間を決めるために使う。
 *
 * ⚠️ **`"240ms"` を 240000 と読む不具合がある** (`endsWith("s")` が `"ms"` にも一致する)。
 * 実ブラウザの getComputedStyle は計算値を必ず秒に正規化する ("0.24s") ので実害は出ていないが、
 * happy-dom は指定値をそのまま返すためテストでは露出する。
 * 現状の挙動を固定するテストがあるので、直すときはそちらも直すこと
 * → docs/known-issues.md
 */
export function getCSSTransitionDuration(element: HTMLElement): number {
    const duration = window.getComputedStyle(element).transitionDuration;
    const msec = (parseFloat(duration) || 0) * (duration.endsWith("s") ? 1000 : 1);
    return msec;
}

/**
 * イベントの伝播を完全に止める。
 * 同じ要素に付いた他のリスナーまで止めるので `stopImmediatePropagation` も呼ぶ。
 */
export function stopPropagation(event: Event): void {
    event.stopPropagation();
    event.stopImmediatePropagation();
}

/**
 * CustomEvent を投げる。既定で bubbles / cancelable が有効。
 *
 * `composed` は既定で false。ルーペは Shadow DOM の中にあるので、
 * **内部のイベントを外に漏らさない**のが既定の挙動になる。
 * 外に出したいときは呼び出し側で `composed: true` を渡すこと。
 */
export function dispatchEvent(element: HTMLElement | Document | Window, eventName: string, option: CustomEventInit = {}): void {
    if (!element) {
        return;
    }

    element.dispatchEvent(
        new CustomEvent(eventName, {
            bubbles: true,
            cancelable: true,
            composed: false,
            ...option,
        }),
    );
}

/** 何もしない関数。コールバックの差し替え先として使う */
export const noop = function () {
    /* noop */
};

/**
 * 指定ミリ秒待つ。引数名は secTime だが**単位はミリ秒**（setTimeout にそのまま渡している）
 */
export async function delay(secTime: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), secTime);
    });
}

/**
 * 最後の呼び出しから delay ミリ秒何も来なければ実行する。
 * scroll / resize のような連続イベントを間引く用途。
 */
export function debounce<T extends (...args: any[]) => unknown>(callback: T, delay = 250): (...args: Parameters<T>) => void {
    let timeoutId: any;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => callback(...args), delay);
    };
}
