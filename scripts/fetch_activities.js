const https = require('https');
const { Octokit } = require("@octokit/core");
const { BskyAgent } = require('@atproto/api');
const Parser = require('rss-parser');

// --- 環境変数 (GitHub Secretsから渡される) ---
const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;
const GH_API_TOKEN = process.env.GH_API_TOKEN;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const MASTODON_INSTANCE_URL = process.env.MASTODON_INSTANCE_URL;
const MASTODON_USER_ID = process.env.MASTODON_USER_ID;
const BLUESKY_IDENTIFIER = process.env.BLUESKY_IDENTIFIER;
const BLUESKY_APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER_ID = process.env.TWITCH_USER_ID;


// --- ユーザー情報 ---
const GITHUB_USERNAME = 'MuraseRyosuke';
const YOUTUBE_CHANNEL_ID = 'UCYnXDiX1IXfr7IfmtKGZd7w';
const NOTE_USERNAME = 'muraseryosuke';
const TUMBLR_HOSTNAME = 'vl-lvoo.tumblr.com';
const VIMEO_USERNAME = 'RyosukeMurase';
const SOUNDCLOUD_USER_ID = '16353954'; // SoundCloudのユーザーIDを追加


// --- APIクライアントの初期化 ---
const octokit = new Octokit({ auth: GH_API_TOKEN });
const gistOctokit = new Octokit({ auth: GIST_TOKEN });
const bskyAgent = new BskyAgent({ service: 'https://bsky.social' });
const parser = new Parser();


/**
 * 汎用的なHTTPS GETリクエスト関数
 */
function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = { headers };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`HTTPステータスコード: ${res.statusCode}, 応答: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`JSONの解析に失敗しました: ${e.message}`));
                }
            });
        }).on('error', (err) => {
            reject(new Error(`HTTPSリクエストに失敗しました: ${err.message}`));
        });
    });
}

/**
 * 汎用的なHTTPS POSTリクエスト関数
 */
function httpsPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: headers
        };
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                     if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`HTTPステータスコード: ${res.statusCode}, 応答: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`JSONの解析に失敗しました: ${e.message}`));
                }
            });
        });
        req.on('error', (err) => {
            reject(new Error(`HTTPSリクエストに失敗しました: ${err.message}`));
        });
        req.write(body);
        req.end();
    });
}


// --- 各サービスからのデータ取得関数 ---

/**
 * GitHubの活動を取得
 */
async function fetchGitHubActivities() {
    try {
        const response = await octokit.request('GET /users/{username}/events', {
            username: GITHUB_USERNAME,
            per_page: 30
        });

        return response.data
            .filter(event => ['PushEvent', 'CreateEvent', 'WatchEvent'].includes(event.type))
            .map(event => {
                let content = '';
                let url = `https://github.com/${event.repo.name}`;
                switch (event.type) {
                    case 'PushEvent':
                        content = `${event.repo.name} に ${event.payload.commits.length}件のコミットをPushしました`;
                        break;
                    case 'CreateEvent':
                         if (event.payload.ref_type === 'repository') {
                             content = `新しいリポジトリ ${event.repo.name} を作成しました`;
                         } else {
                             return null; 
                         }
                        break;
                    case 'WatchEvent':
                        content = `${event.repo.name} をStarしました`;
                        break;
                    default:
                        return null;
                }
                return {
                    platform: 'GitHub',
                    timestamp: event.created_at,
                    content: content,
                    url: url
                };
            }).filter(item => item !== null);
    } catch (error) {
        console.error("GitHubの活動取得中にエラー:", error.message);
        return [];
    }
}


/**
 * YouTubeの活動を取得
 */
async function fetchYouTubeActivities() {
    if (!YOUTUBE_API_KEY) return [];
    try {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${YOUTUBE_CHANNEL_ID}&maxResults=5&order=date&type=video&key=${YOUTUBE_API_KEY}`;
        const data = await httpsGet(url);
        return data.items.map(item => ({
            platform: 'YouTube',
            timestamp: item.snippet.publishedAt,
            content: `動画「${item.snippet.title}」を公開しました`,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));
    } catch (error) {
        console.error("YouTubeの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * Mastodonの活動を取得
 */
async function fetchMastodonActivities() {
    if (!MASTODON_INSTANCE_URL || !MASTODON_ACCESS_TOKEN || !MASTODON_USER_ID) return [];
    try {
        const url = `${MASTODON_INSTANCE_URL}/api/v1/accounts/${MASTODON_USER_ID}/statuses?limit=10`;
        const headers = { 'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}` };
        const data = await httpsGet(url, headers);

        return data
            .filter(status => !status.reblog && !status.in_reply_to_id)
            .map(status => ({
                platform: 'Mastodon',
                timestamp: status.created_at,
                content: status.content.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, ''),
                url: status.url
            }));
    } catch (error) {
        console.error("Mastodonの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * BlueSkyの活動を取得
 */
async function fetchBlueskyActivities() {
    if (!BLUESKY_IDENTIFIER || !BLUESKY_APP_PASSWORD) return [];
    try {
        await bskyAgent.login({ identifier: BLUESKY_IDENTIFIER, password: BLUESKY_APP_PASSWORD });
        const response = await bskyAgent.getAuthorFeed({ actor: BLUESKY_IDENTIFIER, limit: 10 });
        
        return response.data.feed
            .filter(item => !item.reply && !item.reason) // リプライとリポストを除外
            .map(item => ({
                platform: 'Bluesky',
                timestamp: item.post.indexedAt,
                content: item.post.record.text,
                url: `https://bsky.app/profile/${item.post.author.did}/post/${item.post.uri.split('/').pop()}`
            }));
    } catch (error) {
        console.error("BlueSkyの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * Spotifyの最近聴いた曲を取得
 */
async function fetchSpotifyActivities() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return [];
    try {
        const tokenUrl = new URL('https://accounts.spotify.com/api/token');
        const tokenHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
        };
        const tokenBody = `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`;
        const tokenData = await httpsPost(tokenUrl, tokenHeaders, tokenBody);
        const accessToken = tokenData.access_token;

        const apiUrl = 'https://api.spotify.com/v1/me/player/recently-played?limit=10';
        const apiHeaders = { 'Authorization': `Bearer ${accessToken}` };
        const recentData = await httpsGet(apiUrl, apiHeaders);

        return recentData.items.map(item => ({
            platform: 'Spotify',
            timestamp: item.played_at,
            content: `${item.track.artists[0].name} の「${item.track.name}」を聴きました`,
            url: item.track.external_urls.spotify
        }));
    } catch (error) {
        console.error("Spotifyの活動取得中にエラー:", error.message);
        return [];
    }
}


/**
 * Twitchの活動を取得
 */
async function fetchTwitchActivities() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_USER_ID) return [];
    try {
        const tokenUrl = new URL(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`);
        const tokenData = await httpsPost(tokenUrl, {}, "");
        const accessToken = tokenData.access_token;
        
        const apiUrl = `https://api.twitch.tv/helix/videos?user_id=${TWITCH_USER_ID}&first=5`;
        const apiHeaders = {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`
        };
        const videoData = await httpsGet(apiUrl, apiHeaders);
        
        return videoData.data.map(video => ({
            platform: 'Twitch',
            timestamp: video.created_at,
            content: `「${video.title}」を配信しました`,
            url: video.url
        }));
    } catch (error) {
        console.error("Twitchの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * noteの活動を取得
 */
async function fetchNoteActivities() {
    try {
        const feedUrl = `https://note.com/${NOTE_USERNAME}/rss`;
        const feed = await parser.parseURL(feedUrl);
        
        return feed.items.slice(0, 5).map(item => ({
            platform: 'note',
            timestamp: item.isoDate,
            content: `記事「${item.title}」を投稿しました`,
            url: item.link
        }));
    } catch (error) {
        console.error("noteの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * Tumblrの活動を取得
 */
async function fetchTumblrActivities() {
    try {
        const feedUrl = `https://${TUMBLR_HOSTNAME}/rss`;
        const feed = await parser.parseURL(feedUrl);
        
        return feed.items.slice(0, 5).map(item => ({
            platform: 'Tumblr',
            timestamp: item.isoDate || item.pubDate,
            content: `投稿「${item.title}」をしました`,
            url: item.link
        }));
    } catch (error) {
        console.error("Tumblrの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * Vimeoの活動を取得
 */
async function fetchVimeoActivities() {
    try {
        const feedUrl = `https://vimeo.com/${VIMEO_USERNAME}/videos/rss`;
        const feed = await parser.parseURL(feedUrl);
        
        return feed.items.slice(0, 5).map(item => ({
            platform: 'Vimeo',
            timestamp: item.isoDate || item.pubDate,
            content: `動画「${item.title}」を公開しました`,
            url: item.link
        }));
    } catch (error) {
        console.error("Vimeoの活動取得中にエラー:", error.message);
        return [];
    }
}

/**
 * SoundCloudの活動を取得 (NEW)
 */
async function fetchSoundCloudActivities() {
    try {
        const feedUrl = `https://feeds.soundcloud.com/users/soundcloud:users:${SOUNDCLOUD_USER_ID}/sounds.rss`;
        const feed = await parser.parseURL(feedUrl);
        
        return feed.items.slice(0, 5).map(item => ({
            platform: 'SoundCloud',
            timestamp: item.isoDate || item.pubDate,
            content: `トラック「${item.title}」を公開しました`,
            url: item.link
        }));
    } catch (error) {
        console.error("SoundCloudの活動取得中にエラー:", error.message);
        return [];
    }
}


/**
 * Gistを更新する
 */
async function updateGist(activities) {
    try {
        await gistOctokit.request('PATCH /gists/{gist_id}', {
            gist_id: GIST_ID,
            files: {
                'timeline.json': {
                    content: JSON.stringify(activities, null, 2)
                }
            }
        });
        console.log('Gistの更新に成功しました。');
    } catch (error) {
        console.error('Gistの更新に失敗しました:', error.message);
        throw error;
    }
}

/**
 * メインの実行関数
 */
async function main() {
    console.log('活動の取得を開始します...');

    if (!GIST_ID || !GIST_TOKEN || !GH_API_TOKEN) {
        throw new Error('基本的な環境変数（GIST_ID, GIST_TOKEN, GH_API_TOKEN）が設定されていません。');
    }

    const allActivitiesPromises = [
        fetchGitHubActivities(),
        fetchYouTubeActivities(),
        fetchMastodonActivities(),
        fetchBlueskyActivities(),
        fetchSpotifyActivities(),
        fetchTwitchActivities(),
        fetchNoteActivities(),
        fetchTumblrActivities(),
        fetchVimeoActivities(),
        fetchSoundCloudActivities() // SoundCloudの取得を追加
    ];

    const results = await Promise.all(allActivitiesPromises);
    const allActivities = [].concat(...results);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sortedAndFilteredActivities = allActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .filter(activity => new Date(activity.timestamp) >= sevenDaysAgo);

    console.log(`合計 ${sortedAndFilteredActivities.length} 件の活動を取得しました。`);

    await updateGist(sortedAndFilteredActivities);
    
    console.log('処理が正常に完了しました。');
}

// 実行
main().catch(error => {
    console.error("スクリプトの実行中に致命的なエラーが発生しました:", error.message);
    process.exit(1);
});

