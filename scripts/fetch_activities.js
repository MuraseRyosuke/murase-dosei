const axios = require('axios');
const querystring = require('querystring');

// --- 設定 ---
const YOUTUBE_CHANNEL_ID = 'UCYnXDiX1IXfr7IfmtKGZd7w'; // 村瀨さんのYouTubeチャンネルID
const GITHUB_USERNAME = 'MuraseRyosuke'; // 村瀨さんのGitHubユーザー名
const MASTODON_USERNAME = 'vl_lvoO'; // 村瀨さんのMastodonユーザー名

// --- メイン処理 ---
async function main() {
    console.log('活動の取得を開始します...');
    try {
        const { 
            GIST_ID, GIST_TOKEN, YOUTUBE_API_KEY, GH_API_TOKEN, 
            MASTODON_ACCESS_TOKEN, MASTODON_INSTANCE_URL,
            SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN,
            TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_USER_ID
        } = process.env;

        // 必須の環境変数をチェック
        if (!GIST_ID || !GIST_TOKEN) {
            throw new Error('GIST_ID and GIST_TOKEN are required secrets.');
        }
        
        let allActivities = [];

        // 各プラットフォームからアクティビティを取得 (Secretが設定されている場合のみ)
        if (YOUTUBE_API_KEY) {
            console.log('YouTubeの活動を取得中...');
            const youtubeActivities = await fetchYouTubeActivities(YOUTUBE_API_KEY);
            allActivities.push(...youtubeActivities);
        }
        if (GH_API_TOKEN) {
            console.log('GitHubの活動を取得中...');
            const githubActivities = await fetchGitHubActivities(GH_API_TOKEN);
            allActivities.push(...githubActivities);
        }
        if (MASTODON_ACCESS_TOKEN && MASTODON_INSTANCE_URL) {
            console.log('Mastodonの活動を取得中...');
            const mastodonActivities = await fetchMastodonActivities(MASTODON_INSTANCE_URL, MASTODON_ACCESS_TOKEN);
            allActivities.push(...mastodonActivities);
        }
        if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REFRESH_TOKEN) {
            console.log('Spotifyの活動を取得中...');
            const spotifyActivities = await fetchSpotifyActivities(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN);
            allActivities.push(...spotifyActivities);
        }
        if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET && TWITCH_USER_ID) {
            console.log('Twitchの活動を取得中...');
            const twitchActivities = await fetchTwitchActivities(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_USER_ID);
            allActivities.push(...twitchActivities);
        }
        
        // 全てのアクティビティをマージして、タイムスタンプで降順にソート
        allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
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
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=10&order=date&type=video&key=${apiKey}`;
        const response = await axios.get(url);
        return response.data.items.map(item => ({
            platform: 'YouTube',
            content: `動画を公開しました: 「${item.snippet.title}」`,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            timestamp: item.snippet.publishedAt
        }));
    } catch (error) {
        console.error('YouTubeアクティビティの取得に失敗しました:', error.response ? error.response.data.error.message : error.message);
        return [];
    }
}

// --- GitHubの活動を取得する関数 ---
async function fetchGitHubActivities(token) {
    try {
        const url = `https://api.github.com/users/${GITHUB_USERNAME}/events?per_page=20`;
        const response = await axios.get(url, {
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        return response.data.map(event => {
            let content = null;
            if (event.type === 'PushEvent') {
                content = `${event.repo.name} にコミットしました。`;
            } else if (event.type === 'CreateEvent' && event.payload.ref_type === 'repository') {
                content = `新しいリポジトリを作成しました: ${event.repo.name}`;
            } else if (event.type === 'IssuesEvent' && event.payload.action === 'opened') {
                content = `${event.repo.name} でIssueを作成しました。`;
            }
            if (!content) return null;
            return {
                platform: 'GitHub',
                content: content,
                url: `https://github.com/${event.repo.name}`,
                timestamp: event.created_at
            };
        }).filter(Boolean);
    } catch (error) {
        console.error('GitHubアクティビティの取得に失敗しました:', error.response ? error.response.data.message : error.message);
        return [];
    }
}

// --- Mastodonの活動を取得する関数 ---
async function fetchMastodonActivities(instanceUrl, accessToken) {
    try {
        const accountLookupUrl = `${instanceUrl}/api/v1/accounts/lookup?acct=${MASTODON_USERNAME}`;
        const lookupResponse = await axios.get(accountLookupUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const accountId = lookupResponse.data.id;

        const statusesUrl = `${instanceUrl}/api/v1/accounts/${accountId}/statuses?limit=15&exclude_replies=true&exclude_reblogs=true`;
        const response = await axios.get(statusesUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const stripHtml = (html) => html.replace(/<[^>]*>?/gm, '');

        return response.data.map(status => ({
            platform: 'Mastodon',
            content: `トゥートしました: 「${stripHtml(status.content).substring(0, 80)}...」`,
            url: status.url,
            timestamp: status.created_at
        }));
    } catch (error) {
        console.error('Mastodonアクティビティの取得に失敗しました:', error.response ? error.response.data.error : error.message);
        return [];
    }
}

// --- Spotifyの活動を取得する関数 ---
async function fetchSpotifyActivities(clientId, clientSecret, refreshToken) {
    try {
        const tokenResponse = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }), {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const accessToken = tokenResponse.data.access_token;

        const recentlyPlayedUrl = 'https://api.spotify.com/v1/me/player/recently-played?limit=20';
        const response = await axios.get(recentlyPlayedUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        const uniqueTracks = [];
        const trackIds = new Set();
        for (const item of response.data.items) {
            if (!trackIds.has(item.track.id)) {
                uniqueTracks.push(item);
                trackIds.add(item.track.id);
            }
        }
        
        return uniqueTracks.map(item => ({
            platform: 'Spotify',
            content: `「${item.track.name}」 by ${item.track.artists.map(a => a.name).join(', ')} を聴きました。`,
            url: item.track.external_urls.spotify,
            timestamp: item.played_at
        }));
    } catch (error) {
        console.error('Spotifyアクティビティの取得に失敗しました:', error.response ? error.response.data : error.message);
        return [];
    }
}

// --- Twitchの活動を取得する関数 ---
async function fetchTwitchActivities(clientId, clientSecret, userId) {
    try {
        // 1. Client IDとClient Secretを使ってApp Access Tokenを取得
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
        const tokenResponse = await axios.post(tokenUrl);
        const accessToken = tokenResponse.data.access_token;

        // 2. Access Tokenを使って過去の配信（ビデオ）情報を取得
        const videosUrl = `https://api.twitch.tv/helix/videos?user_id=${userId}&first=10&type=archive`;
        const response = await axios.get(videosUrl, {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
            }
        });

        return response.data.data.map(video => ({
            platform: 'Twitch',
            content: `配信しました: 「${video.title}」`,
            url: video.url,
            timestamp: video.created_at
        }));
    } catch (error) {
        console.error('Twitchアクティビティの取得に失敗しました:', error.response ? error.response.data : error.message);
        return [];
    }
}

// --- Gistを更新する関数 ---
async function updateGist(gistId, token, data) {
    const url = `https://api.github.com/gists/${gistId}`;
    await axios.patch(url, {
        files: { 'timeline.json': { content: JSON.stringify(data, null, 2) } }
    }, {
        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
    });
}

main();

