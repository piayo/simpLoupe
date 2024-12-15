import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// __dirname の代替（ESM 環境）
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// ファイルパスを設定
const packageJsonPath = resolve(__dirname, './package.json');
const manifestJsonPath = resolve(__dirname, './src/manifest.json');

async function updateManifestVersion() {
    try {
        // package.json を読み込む
        const packageJsonData = await readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonData);

        // manifest.json を読み込む
        const manifestJsonData = await readFile(manifestJsonPath, 'utf-8');
        const manifestJson = JSON.parse(manifestJsonData);

        // package.json のバージョンを manifest.json に適用
        manifestJson.version = packageJson.version;

        // manifest.json を更新
        await writeFile(manifestJsonPath, JSON.stringify(manifestJson, null, 2), 'utf-8');

        console.log(`Updated manifest.json version to ${packageJson.version}`);
    }
    catch (error) {
        console.error('Error updating manifest.json version:', error);
    }
}

// 関数を実行
updateManifestVersion();
