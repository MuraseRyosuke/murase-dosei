# 村瀨動静

これは、個人の様々なオンライン活動を一つのタイムラインに集約して表示するウェブサイト「村瀨動静」のソースコードです。GitHub PagesとGitHub Actionsを利用し、サーバーレスかつ無料で運用しています。

[**完成したサイトはこちら**](https://dosei.muraseryosuke.info)

## ✨ 機能

* **タイムライン表示**: `timeline.json`ファイルから活動データを読み込み、日付ごとにグループ化して表示します。
* **自動更新**: GitHub Actionsを利用して、定期的に各APIおよびRSSから最新の活動を自動取得し、タイムラインを更新します。
* **サーバーレス & 無料**: 外部のホスティングサービスやデータベースを一切使わず、**すべてGitHub上で完結**しているため、完全に無料で運用できます。
* **シンプルなデザイン**: ダークモードにも対応し、タイトルに明朝体を取り入れた見やすく洗練されたデザイン。
* **ハイブリッド無限スクロール**: ヘッダー部分のSNSアイコンは、独自の無限スクロール機能を備えています。
    * **自動スクロール**: ページ操作がない時は、アイコンがゆっくりと自動で流れ続けます。
    * **一時停止**: PCでのホバー、またはスマホでのタッチ操作時にスクロールが即座に一時停止します。
    * **双方向の手動スクロール**: 一時停止中は左右どちらにも自由にスワイプ/スクロールが可能。端に到達してもシームレスにループします。

## 🛠️ 仕組み

1.  **スケジュール実行**: GitHub Actionsのワークフローが定期的に（現在は30分ごと）自動起動します。
2.  **データ取得**: Node.jsスクリプトが各サービス（GitHub, Bluesky, Spotify, Twitch, Steam など）のAPIやRSSフィードにアクセスし、最新の活動履歴を取得します。
3.  **データ保存**: 取得したデータを一つの `timeline.json` にまとめ、リポジトリ内に直接自動コミットします。
4.  **ウェブサイト表示**: ユーザーがアクセスすると、`index.html` 内のJavaScriptが `timeline.json` を読み込み、タイムラインを動的に描画します。

## 🚀 対応している連携サービス

現在、自動で活動を取得・集約しているプラットフォームは以下の通りです。

**API連携:**
*   GitHub (Push, Create, Watchイベント)
*   Bluesky (新規ポスト)
*   Spotify (最近再生した曲)
*   Twitch (最近の配信動画)
*   Steam (直近2週間でプレイしたゲーム)

**RSS連携:**
*   note (新規記事)
*   Vimeo (新規動画)
*   SoundCloud (新規トラック)
*   YouTube (新規動画)
*   Pinterest (新規ピン)

## 💻 使用技術

* **Frontend**: HTML5, CSS3, Vanilla JavaScript
* **Automation**: GitHub Actions, Node.js (`@octokit/core`, `@atproto/api`, `rss-parser`)
* **Hosting**: GitHub Pages
* **Database**: JSON (`timeline.json` on GitHub repository)

## 📄 ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。
