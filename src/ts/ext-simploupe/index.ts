/**
 * @license
 * Copyright (C) piayo.
 */

/**
 * ext-simploupe の入口。**再 export だけ。**
 * content script はここから TAGNAME と要素の型を取る。
 * import した時点で element.ts の `@customElement` が customElements.define() を走らせる
 * （つまり**副作用のある import**。テストで再 import すると二重定義で落ちる）。
 */
export * from "./element";
