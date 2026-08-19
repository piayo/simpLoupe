import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, delay, dispatchEvent, getCSSTransitionDuration, noop, qs, qsa, stopPropagation } from "../src/ts/util";
import { mountHTML, mountStyle, resetPage } from "./fixtures/page";

beforeEach(() => {
    resetPage();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("qs / qsa", () => {
    it("qs は最初の1つを返す", () => {
        mountHTML(`<p class="a">1</p><p class="a">2</p>`);
        expect(qs<HTMLElement>(".a")!.textContent).toBe("1");
    });

    it("qs は見つからなければ null を返す", () => {
        // querySelector 自体も null を返すが、|| null で undefined を潰す契約になっている
        expect(qs(".missing")).toBeNull();
    });

    it("qsa は配列を返す（NodeList ではない）", () => {
        mountHTML(`<p class="a"></p><p class="a"></p>`);
        const list = qsa(".a");
        expect(Array.isArray(list)).toBe(true);
        expect(list.length).toBe(2);
    });

    it("qsa は見つからなければ空配列を返す", () => {
        expect(qsa(".missing")).toEqual([]);
    });

    it("第2引数で探索範囲を絞れる", () => {
        const host = mountHTML(`<div class="in"><p class="a">in</p></div>`);
        mountHTML(`<p class="a">out</p>`);
        expect(qsa(".a", host).length).toBe(1);
        expect(qs<HTMLElement>(".a", host)!.textContent).toBe("in");
    });
});

/** 宣言を1つ当てただけの要素を作る */
function styled(decl: string): HTMLElement {
    mountStyle(`.t{ ${decl} }`);
    return mountHTML(`<div class="t"></div>`).firstElementChild as HTMLElement;
}

/**
 * ルーペの開閉は CSS の transition が終わってから shown / hidden を投げる。
 * その待ち時間をここで算出している。
 *
 * ⚠️ 単位の扱いに問題がある。`duration.endsWith("s")` は "240ms" にも一致するため、
 *    ms 表記が来ると 1000 倍されてしまう。
 *    実ブラウザの getComputedStyle は transitionDuration を必ず秒（"0.24s"）で返すので
 *    本番では露出しないが、happy-dom は指定値をそのまま返すため露出する。
 *    ここでは **現状の挙動をそのまま期待値にしている**（直したらこのテストが落ちる）。
 */
describe("getCSSTransitionDuration", () => {
    it("秒の指定をミリ秒に直す", () => {
        expect(getCSSTransitionDuration(styled("transition-duration: 0.24s"))).toBe(240);
    });

    it("transition が無ければ 0 を返す", () => {
        expect(getCSSTransitionDuration(styled("color: red"))).toBe(0);
    });

    it("ms 指定は 1000 倍されてしまう（既知の問題・現状固定）", () => {
        // 期待したいのは 240。"240ms".endsWith("s") が true になるのが原因。
        expect(getCSSTransitionDuration(styled("transition-duration: 240ms"))).toBe(240_000);
    });

    it("transition の一括指定は happy-dom では展開されず 0 になる", () => {
        // styles.ts の .dialog は一括指定なので、テスト中は待ち時間 0 で shown / hidden が飛ぶ。
        // 実ブラウザでは 240ms 待つ。テストの前提条件としてここに固定しておく。
        expect(getCSSTransitionDuration(styled("transition: opacity 0.24s"))).toBe(0);
    });
});

describe("dispatchEvent", () => {
    it("bubbles / cancelable / composed の既定値", () => {
        const host = mountHTML(`<div class="child"></div>`);
        const child = qs<HTMLElement>(".child", host)!;
        const spy = vi.fn();
        document.addEventListener("myevent", spy);

        dispatchEvent(child, "myevent");

        expect(spy).toHaveBeenCalledOnce();
        const event = spy.mock.calls[0]![0] as CustomEvent;
        expect(event.bubbles).toBe(true); // 親まで上がる
        expect(event.cancelable).toBe(true);
        expect(event.composed).toBe(false); // Shadow DOM の外には出さない
        document.removeEventListener("myevent", spy);
    });

    it("option で既定値を上書きできる", () => {
        const spy = vi.fn();
        document.addEventListener("myevent", spy);
        dispatchEvent(document, "myevent", { detail: { a: 1 } });
        expect((spy.mock.calls[0]![0] as CustomEvent).detail).toEqual({ a: 1 });
        document.removeEventListener("myevent", spy);
    });

    it("element が無ければ何もしない（落ちない）", () => {
        // ルーペ本体がまだ描画されていない状態でイベントを投げても落ちないための保険
        expect(() => dispatchEvent(null as unknown as HTMLElement, "myevent")).not.toThrow();
    });
});

describe("stopPropagation", () => {
    it("stopPropagation と stopImmediatePropagation の両方を呼ぶ", () => {
        const event = {
            stopPropagation: vi.fn(),
            stopImmediatePropagation: vi.fn(),
        } as unknown as Event;

        stopPropagation(event);

        expect(event.stopPropagation).toHaveBeenCalledOnce();
        expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    });

    it("同じ要素の後続リスナーも止まる", () => {
        const first = vi.fn((e: Event) => stopPropagation(e));
        const second = vi.fn();
        const target = mountHTML(`<div class="t"></div>`).firstElementChild!;
        target.addEventListener("click", first);
        target.addEventListener("click", second);

        target.dispatchEvent(new Event("click", { bubbles: true }));

        expect(first).toHaveBeenCalledOnce();
        expect(second).not.toHaveBeenCalled();
    });
});

describe("delay", () => {
    it("指定時間だけ待つ", async () => {
        vi.useFakeTimers();
        const spy = vi.fn();
        const promise = delay(100).then(spy);

        await vi.advanceTimersByTimeAsync(99);
        expect(spy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        await promise;
        expect(spy).toHaveBeenCalledOnce();
    });

    it("0 を渡しても解決する", async () => {
        await expect(delay(0)).resolves.toBeUndefined();
    });
});

describe("noop", () => {
    it("何も返さない", () => {
        expect(noop()).toBeUndefined();
    });
});

/**
 * スクロール／リサイズ後のキャプチャ取り直しを間引くために使っている。
 * （element.ts は同等の処理を手書きの setTimeout でやっており、こちらは未使用。
 *   util の契約として固定しておく）
 */
describe("debounce", () => {
    it("最後の呼び出しだけが実行される", () => {
        vi.useFakeTimers();
        const spy = vi.fn();
        const fn = debounce(spy, 100);

        fn("a");
        fn("b");
        fn("c");
        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("c");
    });

    it("既定の待ち時間は 250ms", () => {
        vi.useFakeTimers();
        const spy = vi.fn();
        const fn = debounce(spy);

        fn();
        vi.advanceTimersByTime(249);
        expect(spy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledOnce();
    });

    it("間隔が空けば複数回実行される", () => {
        vi.useFakeTimers();
        const spy = vi.fn();
        const fn = debounce(spy, 100);

        fn();
        vi.advanceTimersByTime(100);
        fn();
        vi.advanceTimersByTime(100);
        expect(spy).toHaveBeenCalledTimes(2);
    });
});
