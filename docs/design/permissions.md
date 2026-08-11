# 権限とキャプチャ

simpLoupe の「動かない」はほぼここに集約されます。**バグを疑う前にこのページを確認してください。**

## 宣言している権限

[src/manifest.json](../../src/manifest.json)

| 権限 | 何に使っているか |
|---|---|
| `activeTab` | `chrome.tabs.captureVisibleTab()` の実行に必要 |
| `tabs` | `chrome.tabs.get()`（URL 判定）、`chrome.tabs.sendMessage()` |
| `storage` | `chrome.storage.local` に `config` を保存 |
| `contextMenus` | 右クリックメニューの追加 |
| `optional_host_permissions: ["<all_urls>"]` | **宣言だけで、コードから要求していない** |

`content_scripts.matches` は `http://*/*` と `https://*/*`、`all_frames: false`、`run_at: document_end`。

## `activeTab` はいつ効くか

`captureVisibleTab()` は「そのタブに対する権限」を要求します。**ホスト権限を常時持たない代わりに、
`activeTab` は限られた瞬間だけ権限を与えます。**

付与される契機（simpLoupe が使っているもの）:

- 拡張機能アイコンのクリック
- 右クリックメニューの項目のクリック

simpLoupe の起動導線はこの2つだけなので、**ルーペを開いた時点では必ず権限があります。**
付与はそのタブに限られ、**そのタブがナビゲートするまで**有効です。
だからスクロールやリサイズでの撮り直しも通ります。

権限が切れるのは主にこの経路です。

```
アイコンをクリック（権限が付く）→ ルーペを開いたまま同じタブでページ遷移
  → content script は再注入されるが activeTab は失効
  → captureVisibleTab が例外 → _prevData（前のページのキャプチャ）が返る
```

失敗時に直前の画像を返す作りなので、**無反応ではなく「古い画面が見える」**という壊れ方をします。
[known-issues.md](../known-issues.md) に挙げてあります。

## `optional_host_permissions` は使われていない

`<all_urls>` を optional で宣言していますが、`chrome.permissions.request()` を呼ぶコードは
**リポジトリ内に存在しません**（`grep -rn "permissions" src/ts/` が空）。
つまりユーザーが `chrome://extensions` の「サイトへのアクセス」で手動許可しない限り、
このエントリは効きません。

残っている理由は「`activeTab` だけでは足りない場面（起動時以外のキャプチャ）への保険」と推測されます。
**次のどちらかに決める必要があります。**

- 使う: 恒久的にキャプチャしたい機能を入れるときに `chrome.permissions.request()` を実装する
- 使わない: manifest から削る。ストア審査で権限の理由を問われる材料を減らせる

現状は**どちらでもない中間状態**です。決めるまで、この宣言に依存したコードを書かないでください。

## 動かないページ

### コードで明示的に無効化しているもの

[service-worker.ts](../../src/ts/service-worker.ts) の `notWorks`。
ここに一致する URL のタブでは、アイコンと右クリックメニューを無効にします。

```ts
const notWorks = [
    /^https?:\/\/chromewebstore.google.com/,
    /^https?:\/\/chrome.google.com\/webstore\//,
    /^chrome:\/\//,
    /^file:\/\//,
];
```

Chrome ウェブストアと `chrome://` は**ブラウザが拡張機能の注入を禁止している**ため、
そもそも content script が動きません。無効化は「押しても無反応」を避けるための表示上の配慮です。

> 上の正規表現は `.` をエスケープしていません（`chromewebstore.google.com` の `.` が任意の1文字に一致する）。
> 挙動を変える修正をするときは、[testing.md](testing.md) の方針どおり**先に現状を期待値として固定**してください。

判定は `chrome.tabs.onActivated`（タブの切り替え）でしか走りません。
**同じタブの中で遷移しても更新されない**、`chrome.action.enable()/disable()` に `tabId` を
渡していないため**全タブに効いてしまう**という2点の問題があります
→ [known-issues.md](../known-issues.md)。

### そもそも content script が入らないもの

無効化リストに載っていなくても動かない場所があります。

| 場所 | 理由 |
|---|---|
| `chrome://` 系、`chrome-extension://` | ブラウザが禁止 |
| Chrome ウェブストア | 同上 |
| 新しいタブ、設定画面 | 同上 |
| **Chrome 内蔵の PDF ビューア** | 拡張機能由来のビューアであり `matches` に一致しない |
| `file://` | 「ファイルの URL へのアクセスを許可する」が必要。かつ `notWorks` で無効化済み |
| `view-source:`、`about:blank` | `matches` に一致しない |
| `<iframe>` の中 | `all_frames: false`。ルーペ UI はトップフレームだけ（**中身の拡大はできる**。キャプチャはビットマップなので） |

## キャプチャの回数制限

`chrome.tabs.captureVisibleTab()` には `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` の
クォータがあります。超えると例外になり、`_prevData`（古い画像）にフォールバックします。

そのために2段の抑制を入れてあります。

1. element 側 — マウス移動では撮り直さない。scroll / resize から 100ms 後に1回
2. service worker 側 — `capture` を受けてから 100ms 待つ

> ⚠️ service worker 側の抑制は**現在効いていません。**`clearTimeout(_timer)` は書かれていますが
> `setTimeout()` の戻り値を `_timer` に入れていないためです
> → [known-issues.md](../known-issues.md)。連続スクロールでクォータに当たる余地があります。

## プライバシー上の注意

キャプチャは**画面に写っているものすべて**です。他人のパスワード欄やメール本文も含まれます。

- ネットワークに送信するコードはありません。`dataURL` は content script に渡して canvas に
  描くだけで、`chrome.storage` にも保存しません
- ただし service worker のモジュールスコープに `_prevData` として**最後の1枚が残ります**。
  service worker が停止するまで（数十秒アイドル）メモリ上に残り、
  **別のタブ・別のウィンドウのフォールバックとしても使われます**。設計上の弱点です
- 新機能でキャプチャを保存したり送信したりする場合、ストアの
  「データ使用に関する開示」を必ず更新してください
