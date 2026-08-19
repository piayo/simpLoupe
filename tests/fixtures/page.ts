/**
 * 「任意のページ」を組み立てるフィクスチャ。
 *
 * simpLoupe は特定サイトに依存しないので、ここで作るのは
 * ルーペを乗せるための素のページと、CSS を当てるための最小の道具だけ。
 */

/** document を空に戻す */
export function resetPage(): void {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-test]").forEach((el) => el.remove());
}

/** HTML を body に足して、足した入れ物を返す */
export function mountHTML(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    return host;
}

/** テスト用の <style> を head に足す */
export function mountStyle(cssText: string): HTMLStyleElement {
    const style = document.createElement("style");
    style.dataset.test = "";
    style.textContent = cssText;
    document.head.append(style);
    return style;
}

/**
 * mousemove イベントを作る。
 *
 * ⚠️ element.ts の _mousemoveHandler は `event.x` / `event.y` を読むが、
 *    **happy-dom の MouseEvent は x / y（clientX / clientY のエイリアス）を実装していない。**
 *    実ブラウザでは存在するので、ここで明示的に足して実物に近づける。
 */
export function mouseMoveEvent(x: number, y: number): MouseEvent {
    const event = new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, "x", { value: x });
    Object.defineProperty(event, "y", { value: y });
    return event;
}

/** setTimeout(0) を1回消化する（delay(0) の完了待ち） */
export function flushTimers(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
