# docs

| ドキュメント | 内容 |
|---|---|
| [workflow.md](workflow.md) | **作業手順**。環境構築・開発・実機確認・リリース |
| [known-issues.md](known-issues.md) | 未修正の問題 |
| [design/architecture.md](design/architecture.md) | 全体設計。ルーペの注入方式、キャプチャと拡大描画、設定の保存 |
| [design/permissions.md](design/permissions.md) | 権限とキャプチャ。`activeTab` の効き方、動かないページ |
| [design/i18n.md](design/i18n.md) | 多言語化。2系統の違いと生成パイプライン |
| [design/testing.md](design/testing.md) | テスト方針。chrome API のモックと happy-dom の制約 |
| [plan/](plan/) | これから何をするかの計画。**完了したら削除する** |
| [work/](work/) | 実際に何をしたかの記録 |
| [../CHANGELOG.md](../CHANGELOG.md) | 変更履歴。完了したプランはここに1行残る |

リポジトリ全体の入口は [../README.md](../README.md)、AI 向けのガイドは [../CLAUDE.md](../CLAUDE.md) です。

> `work/`（リポジトリ直下）は Chrome ウェブストアの掲載素材置き場で、`docs/work/`（作業記録）とは別物です。

## 無いもの

意図的に作っていないドキュメントです。**必要になるまで作りません。**

| | なぜ無いか |
|---|---|
| `design/firefox.md` | Firefox 対応の予定が無い。判断の理由は [architecture.md](design/architecture.md#対象ブラウザ) |
| ストア掲載文の多言語管理（姉妹プロジェクトの `work/store/` + `store:check`） | simpLoupe には日本語のマスター文面がまだ無い（[../work/store_description.md](../work/store_description.md) は断片）。文面を書くのが先。→ [known-issues.md](known-issues.md) |
