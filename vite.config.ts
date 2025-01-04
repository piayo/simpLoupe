import { defineConfig } from "vite";
import { minifyTemplateLiterals } from "rollup-plugin-minify-template-literals";

export default defineConfig(({ mode }) => {
    const isProd = mode === "production";
    console.log("...mode:", mode);
    return {
        root: "./",
        base: "./",
        envDir: "./",
        publicDir: "./public",
        build: {
            outDir: "dist",
            emptyOutDir: false,
            assetsDir: "./",
            sourcemap: false,
            minify: isProd ? "terser" : false,
            terserOptions: {
                compress: {
                    drop_console: true,
                },
            },
            lib: {
                name: "lib",
                fileName: (format, entryName) => `${entryName}.js`,
                entry: {
                    "js/content-script"  : "src/ts/content-script.ts",
                    "js/service-worker"  : "src/ts/service-worker.ts",
                },
            },
            rollupOptions: {
                output: {
                    format: "iife",
                },
            },
            // ファイルの変更を監視
            watch: isProd ? null : {
                include: [
                    "src/**/*.ts",
                ],
            },
        },
        optimizeDeps: {
        },
        resolve: {
            alias: [
            ],
        },
        plugins: [
            minifyTemplateLiterals({
                failOnError: false,
            }) as any,
        ],
    };
});
