/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * ルーペの設定。**chrome.storage.local の `config` キーにこの形でそのまま入る。**
 *
 * ⚠️ **キー名と値を勝手に改名しないこと。** 既存ユーザーの端末に保存済みのデータなので、
 * 変えるなら読み出し時のマイグレーションを一緒に書く必要がある。
 * 既定値は data.ts の defaultConfig（→ element.ts の @state config とは食い違っている。
 * docs/known-issues.md を参照）。
 */
export type Config = {
    /** 外観のバリエーション。styles.ts の `[data-skin='...']` に対応する */
    skin:   "1" | "2" | "3";
    /**
     * ルーペの形。
     *
     * ⚠️ `"quare"` は `"square"` の綴り間違いだが、**保存済みデータの値なので直せない。**
     * 表示ラベルだけ src/i18n/ui/ 側で `square`（正しい綴り）にしてある。
     * キーと値が一致していないことを承知して触ること。
     */
    shape:  "round" | "quare";
    /** 大きさ。2〜5。一辺は `160 + 80 * size` px になる */
    size:   number;
    /** 拡大率。2〜5 */
    zoom:   number;
    /** ルーペ内のカーソル。`"crosshair"` か `"none"`（CSS の cursor にそのまま流す） */
    cursor: string;
}
