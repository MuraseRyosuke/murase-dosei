const fs = require('fs');
const { Octokit } = require("@octokit/core");
const { BskyAgent } = require('@atproto/api');
const Parser = require('rss-parser');

// --- 環境変数 ---
const {
    GH_API_TOKEN,
    YOUTUBE_API_KEY,
    MASTODON_ACCESS_TOKEN,
    MASTODON_INSTANCE_URL,
    MASTODON_USER_ID,
    BLUESKY_IDENTIFIER,
    BLUESKY_APP_PASSWORD,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    SPOTIFY_REFRESH_TOKEN,
    TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET,
    TWITCH_USER_ID
} = process.env;

// --- ユーザー設定 ---
const CONFIG = {
    GITHUB_USERNAME: 'MuraseRyosuke',
    YOUTUBE_CHANNEL_ID: 'UCYnXDiX1IXfr7IfmtKGZd7w',
    NOTE_USERNAME: 'muraseryosuke',
    VIMEO_USERNAME: 'RyosukeMurase',
    SOUNDCLOUD_USER_ID: '16353954'
};

// --- クライアント初期化 ---
const octokit = new Octokit({ auth: GH_API_TOKEN });
const bskyAgent = new BskyAgent({ service: 'https://bsky.social' });
const parser = new Parser();

/**
 * 汎用的なデータ取得ヘルパー (Node.js 20 native fetch)
 */
async function fetchData(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, url: ${url}`);
    }
    return response.json();
}

// --- 各サービス取得関数 ---

async function fetchGitHubActivities() {
    try {
        const response = await octokit.request('GET /users/{username}/events', {
            username: CONFIG.GITHUB_USERNAME,
            per_page: 30
        });

        return response.data
            .filter(event => ['PushEvent', 'CreateEvent', 'WatchEvent'].includes(event.type))
            .map(event => {
                const repoName = event.repo.name;
                const url = `https://github.com/${repoName}`;
                let content = '';

                switch (event.type) {
                    case 'PushEvent':
                        content = `${repoName} に ${event.payload.commits.length}件のコミットをPushしました`;
                        break;
                    case 'CreateEvent':
                        if (event.payload.ref_type !== 'repository') return null;
                        content = `新しいリポジトリ ${repoName} を作成しました`;
                        break;
                    case 'WatchEvent':
                        content = `${repoName} をStarしました`;
                        break;
                }
                return { platform: 'GitHub', timestamp: event.created_at, content, url };
            })
            .filter(Boolean); // nullを除去
    } catch (error) {
        console.error("GitHub取得エラー:", error.message);
        return [];
    }
}

async function fetchYouTubeActivities() {
    if (!YOUTUBE_API_KEY) return [];
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CONFIG.YOUTUBE_CHANNEL_ID}&maxResults=5&order=date&type=video&key=${YOUTUBE_API_KEY}`;
        const data = await fetchData(url);
        return data.items.map(item => ({
            platform: 'YouTube',
            timestamp: item.snippet.publishedAt,
            content: `動画「${item.snippet.title}」を公開しました`,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
    } catch (error) {
        console.error("YouTube取得エラー:", error.message);
        return [];
    }
}

async function fetchMastodonActivities() {
    if (!MASTODON_INSTANCE_URL || !MASTODON_ACCESS_TOKEN || !MASTODON_USER_ID) return [];
    try {
        const url = `${MASTODON_INSTANCE_URL}/api/v1/accounts/${MASTODON_USER_ID}/statuses?limit=10`;
        const data = await fetchData(url, {
            headers: { 'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}` }
        });

        return data
            .filter(status => !status.reblog && !status.in_reply_to_id)
            .map(status => ({
                platform: 'Mastodon',
                timestamp: status.created_at,
                content: status.content.replace(/<[^>]*>/g, ''), // 簡易HTMLタグ除去
                url: status.url
            }));
    } catch (error) {
        console.error("Mastodon取得エラー:", error.message);
        return [];
    }
}

async function fetchBlueskyActivities() {
    if (!BLUESKY_IDENTIFIER || !BLUESKY_APP_PASSWORD) return [];
    try {
        await bskyAgent.login({ identifier: BLUESKY_IDENTIFIER, password: BLUESKY_APP_PASSWORD });
        const { data } = await bskyAgent.getAuthorFeed({ actor: BLUESKY_IDENTIFIER, limit: 10 });

        return data.feed
            .filter(item => !item.reply && !item.reason)
            .map(item => ({
                platform: 'Bluesky',
                timestamp: item.post.indexedAt,
                content: item.post.record.text,
                url: `https://bsky.app/profile/${item.post.author.did}/post/${item.post.uri.split('/').pop()}`
            }));
    } catch (error) {
        console.error("BlueSky取得エラー:", error.message);
        return [];
    }
}

async function fetchSpotifyActivities() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return [];
    try {
        // トークン取得
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
            },
            body: `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`
        });
        
        if (!tokenRes.ok) throw new Error(`Spotify Token Error: ${tokenRes.status}`);
        const { access_token } = await tokenRes.json();

        // 再生履歴取得
        const recentData = await fetchData('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        return recentData.items.map(item => ({
            platform: 'Spotify',
            timestamp: item.played_at,
            content: `${item.track.artists[0].name} の「${item.track.name}」を聴きました`,
            url: item.track.external_urls.spotify
        }));
    } catch (error) {
        console.error("Spotify取得エラー:", error.message);
        return [];
    }
}

async function fetchTwitchActivities() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_USER_ID) return [];
    try {
        // トークン取得
        const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
        const { access_token } = await fetchData(tokenUrl, { method: 'POST' });

        // 動画データ取得
        const apiUrl = `https://api.twitch.tv/helix/videos?user_id=${TWITCH_USER_ID}&first=5`;
        const videoData = await fetchData(apiUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${access_token}`
            }
        });

        return videoData.data.map(video => ({
            platform: 'Twitch',
            timestamp: video.created_at,
            content: `「${video.title}」を配信しました`,
            url: video.url
        }));
    } catch (error) {
        console.error("Twitch取得エラー:", error.message);
        return [];
    }
}

// RSSベースの取得関数ジェネレータ
function createRssFetcher(platformName, feedUrlFn, contentFn) {
    return async () => {
        try {
            const feedUrl = feedUrlFn();
            const feed = await parser.parseURL(feedUrl);
            return feed.items.slice(0, 5).map(item => ({
                platform: platformName,
                timestamp: item.isoDate || item.pubDate,
                content: contentFn(item),
                url: item.link
            }));
        } catch (error) {
            console.error(`${platformName}取得エラー:`, error.message);
            return [];
        }
    };
}

const fetchNoteActivities = createRssFetcher('note', 
    () => `https://note.com/${CONFIG.NOTE_USERNAME}/rss`,
    item => `記事「${item.title}」を投稿しました`
);

const fetchVimeoActivities = createRssFetcher('Vimeo',
    () => `https://vimeo.com/${CONFIG.VIMEO_USERNAME}/videos/rss`,
    item => `動画「${item.title}」を公開しました`
);

const fetchSoundCloudActivities = createRssFetcher('SoundCloud',
    () => `https://feeds.soundcloud.com/users/soundcloud:users:${CONFIG.SOUNDCLOUD_USER_ID}/sounds.rss`,
    item => `トラック「${item.title}」を公開しました`
);

/**
 * メイン処理
 */
async function main() {
    console.log('活動の取得を開始します...');

    // 並行してデータ取得
    const results = await Promise.all([
        fetchGitHubActivities(),
        fetchYouTubeActivities(),
        fetchMastodonActivities(),
        fetchBlueskyActivities(),
        fetchSpotifyActivities(),
        fetchTwitchActivities(),
        fetchNoteActivities(),
        fetchVimeoActivities(),
        fetchSoundCloudActivities(),
    ]);

    // 配列をフラット化
    const allActivities = results.flat();

    // 過去7日分のみフィルタリング & ソート
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const finalActivities = allActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .filter(activity => new Date(activity.timestamp) >= sevenDaysAgo);

    console.log(`合計 ${finalActivities.length} 件の活動を取得しました。`);

    // ファイル書き込み
    try {
        fs.writeFileSync('timeline.json', JSON.stringify(finalActivities, null, 2));
        console.log('timeline.jsonの書き込みに成功しました。');
    } catch (error) {
        console.error('timeline.jsonの書き込みに失敗しました:', error.message);
        process.exit(1);
    }
}

main().catch(error => {
    console.error("スクリプト実行中の致命的エラー:", error);
    process.exit(1);
});
