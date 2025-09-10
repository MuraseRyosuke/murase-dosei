const axios = require('axios');

// --- 設定 ---
const YOUTUBE_CHANNEL_ID = 'UCYnXDiX1IXfr7IfmtKGZd7w'; // 村瀨さんのYouTubeチャンネルID
const GITHUB_USERNAME = 'MuraseRyosuke'; // 村瀨さんのGitHubユーザー名

// --- メイン処理 ---
async function main() {
    console.log('活動の取得を開始します...');
    try {
        const { GIST_ID, GIST_TOKEN, YOUTUBE_API_KEY, GH_API_TOKEN } = process.env;
        
        // --- ▼▼▼ 新しいデバッグコード ▼▼▼ ---
        console.log('--- 受け取った環境変数の確認 ---');
        console.log(`GIST_ID: ${GIST_ID ? '設定あり' : '未設定'}`);
        console.log(`GIST_TOKEN: ${GIST_TOKEN ? '設定あり' : '未設定'}`);
        console.log(`YOUTUBE_API_KEY: ${YOUTUBE_API_KEY ? '設定あり' : '未設定'}`);
        console.log(`GH_API_TOKEN: ${GH_API_TOKEN ? '設定あり' : '未設定'}`);
        console.log('------------------------------------');
        // --- ▲▲▲ 新しいデバッグコード ▲▲▲ ---

        // 環境変数のチェック
        if (!GIST_ID || !GIST_TOKEN || !YOUTUBE_API_KEY || !GH_API_TOKEN) {
            throw new Error('必要な環境変数（Secret）が設定されていません。');
        }

        // 各プラットフォームからアクティビティを取得
        const youtubeActivities = await fetchYouTubeActivities(YOUTUBE_API_KEY);
        const githubActivities = await fetchGitHubActivities(GH_API_TOKEN);
        
        // 全てのアクティビティをマージして、タイムスタンプで降順にソート
        const allActivities = [...youtubeActivities, ...githubActivities]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
        // 過去7日分のアクティビティに絞り込む
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentActivities = allActivities.filter(activity => new Date(activity.timestamp) >= sevenDaysAgo);

        console.log(`合計 ${recentActivities.length} 件の最近のアクティビティを取得しました。`);

        // Gistを更新
        await updateGist(GIST_ID, GIST_TOKEN, recentActivities);

        console.log('Gistの更新が正常に完了しました。');

    } catch (error) {
        console.error('エラーが発生しました:', error.message);
        process.exit(1); // エラーで終了
    }
}

// --- YouTubeの活動を取得する関数 ---
async function fetchYouTubeActivities(apiKey) {
    try {
        // 最近のアップロード動画を取得
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=10&order=date&type=video&key=${apiKey}`;
        const response = await axios.get(url);
        
        return response.data.items.map(item => ({
            platform: 'YouTube',
            content: `動画を公開しました: 「${item.snippet.title}」`,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            timestamp: item.snippet.publishedAt
        }));
    } catch (error) {
        console.error('YouTubeアクティビティの取得に失敗しました:', error.response ? error.response.data : error.message);
        return []; // エラーが発生しても他の処理は続ける
    }
}

// --- GitHubの活動を取得する関数 ---
async function fetchGitHubActivities(token) {
    try {
        const url = `https://api.github.com/users/${GITHUB_USERNAME}/events?per_page=20`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        return response.data.map(event => {
            let content = 'GitHubで活動しました。';
            if (event.type === 'PushEvent') {
                content = `${event.repo.name} にコミットしました。`;
            } else if (event.type === 'CreateEvent' && event.payload.ref_type === 'repository') {
                content = `新しいリポジトリを作成しました: ${event.repo.name}`;
            } else if (event.type === 'IssuesEvent' && event.payload.action === 'opened') {
                content = `${event.repo.name} でIssueを作成しました。`;
            }
            return {
                platform: 'GitHub',
                content: content,
                url: `https://github.com/${event.repo.name}`,
                timestamp: event.created_at
            };
        }).filter(Boolean); // nullの要素を除外
    } catch (error) {
        console.error('GitHubアクティビティの取得に失敗しました:', error.response ? error.response.data : error.message);
        return [];
    }
}

// --- Gistを更新する関数 ---
async function updateGist(gistId, token, data) {
    const url = `https://api.github.com/gists/${gistId}`;
    const content = JSON.stringify(data, null, 2);

    await axios.patch(url, {
        files: {
            'timeline.json': {
                content: content
            }
        }
    }, {
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
}

main();

