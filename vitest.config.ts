import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // 任意のページ上に置かれる Web Component とルーペの DOM を組み立てるため
        environment: "happy-dom",
        include: ["tests/**/*.test.ts"],
        coverage: {
            provider: "v8",
            include: ["src/ts/**/*.ts"],
            exclude: [
                "src/ts/types.ts",                  // 型定義のみ。実行コードが無い
                "src/ts/ext-simploupe/index.ts",    // re-export のみ
                "src/ts/ext-simploupe/styles.ts",   // css`` の文字列のみ
            ],
        },
    },
});
