/**
 * canvas 2D コンテキストの記録用フェイク。
 *
 * happy-dom の canvas は getContext("2d") が **null を返す**（描画実装を持たない）。
 * そのため drawCapture() は本来 early return してしまい、
 * トリミング座標の計算＝この拡張機能の中核が一切検証できない。
 * getContext を差し替えて、渡された引数だけを記録する。
 */
import { vi } from "vitest";

export type DrawImageArgs = {
    sx: number; sy: number; sw: number; sh: number;
    dx: number; dy: number; dw: number; dh: number;
    image: unknown;
};

export type Fake2DContext = {
    clearRects: { x: number; y: number; w: number; h: number }[];
    drawImages: DrawImageArgs[];
    saved:    number;
    restored: number;
};

/**
 * HTMLCanvasElement.prototype.getContext を差し替える。
 * vi.spyOn なので afterEach の vi.restoreAllMocks() で元に戻る。
 */
export function stubCanvas2D(): Fake2DContext {
    const record: Fake2DContext = {
        clearRects: [],
        drawImages: [],
        saved:    0,
        restored: 0,
    };

    const context = {
        clearRect: ( x: number, y: number, w: number, h: number ) => { record.clearRects.push({ x, y, w, h }); },
        save:      () => { record.saved++; },
        restore:   () => { record.restored++; },
        drawImage: (
            image: unknown,
            sx: number, sy: number, sw: number, sh: number,
            dx: number, dy: number, dw: number, dh: number,
        ) => { record.drawImages.push({ image, sx, sy, sw, sh, dx, dy, dw, dh }); },
    };

    vi.spyOn( HTMLCanvasElement.prototype, "getContext" ).mockReturnValue( context as never );

    return record;
}
