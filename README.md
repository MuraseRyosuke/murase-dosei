# 村瀨動静 v0.2.1

これは、個人の様々なオンライン活動を一つのタイムラインに集約して表示するウェブサイト「村瀨動静」のソースコードです。GitHub PagesとGitHub Actionsを利用し、サーバーレスかつ無料で運用することを目指しています。

[**完成したサイトはこちら**](https://muraseryosuke.github.io/murase-dosei/)

## ✨ 機能

* **マルチプラットフォーム対応**: GitHub, YouTube, Mastodon, BlueSky, Spotify, Twitch, note, Tumblr, Vimeo, SoundCloud, Behanceなど、多数のサービスからの活動を自動で集約します。
* **自動更新**: GitHub Actionsを利用して、定期的に新しい活動がないか自動的にチェックし、タイムラインを更新します。
* **サーバーレス & 無料**: 外部のホスティングサービスやデータベースを一切使わず、**すべてGitHub上で完結**しているため、完全に無料で運用できます。
* **シンプルなデザイン**: ダークモードにも対応した、見やすいミニマルなデザイン。
* **ソーシャルリンク**: 各SNSやサービスへのプロフィールリンクをアイコンで表示します。アイコンリストは画面幅に応じて横スクロールできます。

## 🛠️ 仕組み

このプロジェクトは、以下の流れで動作しています。

1.  **スケジュール実行**: ワークフローが定期的に自動起動します。
2.  **データ取得**: 各サービス (GitHub, YouTube等) のAPIやRSSフィードにアクセスし、最新の活動履歴を取得します。
3.  **データ保存**: 取得した活動データを一つの`timeline.json`ファイルにまとめ、データベースの代わりにGitHub Gistに保存・更新します。
4.  **ウェブサイト表示**: ユーザーがウェブサイトにアクセスすると、`index.html`に書かれたJavaScriptがGistから`timeline.json`を読み込み、タイムラインを動的に描画します。

## 🚀 セットアップ方法

このプロジェクトを自分用にカスタマイズして動かすための手順です。

### 1. リポジトリをフォーク

まず、このリポジトリをあなたのアカウントにフォーク（コピー）してください。

### 2. GitHub Gistを作成

活動データを保存するためのデータベースとして、Gistを利用します。

1.  [GitHub Gist](https://gist.github.com/)にアクセスします。
2.  ファイル名に `timeline.json` と入力し、内容に `{}` とだけ書いてください。
3.  「Create public gist」ボタンを押して、公開Gistを作成します。
4.  作成後、ブラウザのアドレスバーに表示されているURLから、GistのID（長い英数字の羅列）をコピーしておきます。

### 3. アクセストークンとAPIキーを取得

各サービスからデータを取得するために必要な鍵（トークンやAPIキー）を、それぞれの公式サイトや開発者向けページから取得してください。必要な権限（スコープ）は最小限に設定することを推奨します。

* **APIキー等が必要なサービス:**
    * BlueSky
    * Mastodon
    * YouTube
    * Twitch
    * Spotify
    * GitHub (Gist更新用とAPIアクセス用の2種類)
* **RSSフィードで連携するサービス (APIキー不要):**
    * Vimeo
    * SoundCloud
    * note
    * Tumblr
    * Behance

### 4. GitHub Secretsを設定

フォークしたリポジトリの「Settings」>「Secrets and variables」>「Actions」で、ステップ3で取得したすべてのアクセストークンとAPIキー、そしてGistのIDを登録します。登録する際のキー名は、ワークフローファイル (`.github/workflows/fetch.yml`) 内の`env`セクションで定義されているものと一致させる必要があります。

### 5. GitHub Pagesを有効化

リポジトリの「Settings」>「Pages」で、Sourceを「Deploy from a branch」に設定し、`main`ブランチの`/(root)`からデプロイするように設定します。

### 6. Gist IDをHTMLに設定

`index.html`ファイルを開き、以下の部分をあなたのGist IDに書き換えます。

`const GIST_ID = 'ここにあなたのGist IDを貼り付け';`

以上で設定は完了です。「Actions」タブからワークフローを手動で実行し、サイトが表示されるか確認してみてください。

## 💻 使用技術

* **Frontend**: HTML, CSS, JavaScript (Vanilla JS)
* **Backend**: Node.js (for data fetching script)
* **Automation**: GitHub Actions
* **Hosting**: GitHub Pages
* **Database**: GitHub Gist

## 🔭 今後の展望

このプロジェクトはまだ始まったばかりであり、多くの改善の可能性があります。

* **対応サービスの追加**: StravaやDribbbleなど、より複雑な認証（OAuth2）を必要とするAPIとの連携に挑戦する。
* **表示コンテンツの拡充**: Spotifyで再生した曲のアルバムアートワークを表示したり、Mastodonの投稿内容を展開して表示するなど、よりリッチなタイムラインを目指す。
* **フロントエンドの機能改善**: プラットフォームごとのフィルタリング機能や、キーワード検索機能を追加する。
* **コードのリファクタリング**: 将来の機能追加を容易にするため、コードの構造をよりクリーンに改善する。

プルリクエストや改善提案はいつでも歓迎します！

## 📄 ライセンス

このプロジェクトはMITライセンスです。
