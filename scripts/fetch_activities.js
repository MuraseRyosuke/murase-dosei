const https = require('https');
const { Octokit } = require("@octokit/core");

// --- 環境変数 (GitHub Secretsから渡される) ---
const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN; // Gistを更新するためのトークン
const GH_API_TOKEN = process.env.GH_API_TOKEN; // GitHub API叩く用のトークン
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const MASTODON_INSTANCE_URL = process.env.MASTODON_INSTANCE_URL;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_USER_ID = process.env.TWITCH_USER_ID;


// ユーザー情報
const GITHUB_USERNAME = 'MuraseRyosuke';
const YOUTUBE_CHANNEL_ID = 'UCYnXDiX1IXfr7IfmtKGZd7w';
const MASTODON_USER_ID = '109353974694481373'; // pawoo.netでのvl_lvoOのID

const octokit = new Octokit({ auth: GH_API_TOKEN });
const gistOctokit = new Octokit({ auth: GIST_TOKEN });

/**
 * 汎用的なHTTPS GETリクエスト関数
 * @param {string} url
 * @param {object} headers
 * @returns {Promise<any>}
 */
function httpsGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = { headers };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
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
 * @param {URL} url
 * @param {object} headers
 * @param {string} body
 * @returns {Promise<any>}
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
                    resolve(JSON.parse(data));
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
                switch (event.type) {
                    case 'PushEvent':
                        content = `${event.repo.name} に ${event.payload.commits.length}件のコミットをPushしました`;
                        break;
                    case 'CreateEvent':
                         if (event.payload.ref_type === 'repository') {
                            content = `新しいリポジトリ ${event.repo.name} を作成しました`;
                         } else {
                            return null; // リポジトリ作成以外のCreateEventは無視
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
                    url: `https://github.com/${event.repo.name}`
                };
            }).filter(item => item !== null); // nullをフィルタリング
    } catch (error) {
        console.error("GitHubの活動取得中にエラー:", error.message);
        return []; // エラーが発生した場合は空の配列を返す
    }
}


/**
 * YouTubeの活動を取得
 */
async function fetchYouTubeActivities() {
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
    if (!MASTODON_INSTANCE_URL || !MASTODON_ACCESS_TOKEN) return [];
    try {
        const url = `${MASTODON_INSTANCE_URL}/api/v1/accounts/${MASTODON_USER_ID}/statuses?limit=10`;
        const headers = { 'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}` };
        const data = await httpsGet(url, headers);

        return data
            .filter(status => !status.reblog && !status.in_reply_to_id) // ブーストと返信を除外
            .map(status => ({
                platform: 'Mastodon',
                timestamp: status.created_at,
                content: status.content.replace(/<("[^"]*"|'[^']*'|[^'">])*>/g, ''), // HTMLタグを除去
                url: status.url
            }));
    } catch (error) {
        console.error("Mastodonの活動取得中にエラー:", error.message);
        return [];
    }
}


/**
 * Spotifyの最近聴いた曲を取得
 */
async function fetchSpotifyActivities() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return [];
    try {
        // 1. Refresh Tokenを使って新しいAccess Tokenを取得
        const tokenUrl = new URL('https://accounts.spotify.com/api/token');
        const tokenHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
        };
        const tokenBody = `grant_type=refresh_token&refresh_token=${SPOTIFY_REFRESH_TOKEN}`;
        const tokenData = await httpsPost(tokenUrl, tokenHeaders, tokenBody);
        const accessToken = tokenData.access_token;

        // 2. Access Tokenを使って最近聴いた曲を取得
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
        // 1. App Access Tokenを取得
        const tokenUrl = new URL(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`);
        const tokenData = await httpsPost(tokenUrl, {}, "");
        const accessToken = tokenData.access_token;
        
        // 2. 過去の配信動画(VOD)を取得
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
 * Gistを更新する
 * @param {Array<object>} activities 
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
        throw error; // エラーを再スローしてワークフローを失敗させる
    }
}

/**
 * メインの実行関数
 */
async function main() {
    console.log('活動の取得を開始します...');

    // --- 環境変数の存在チェック ---
    if (!GIST_ID || !GIST_TOKEN || !GH_API_TOKEN || !YOUTUBE_API_KEY) {
        console.error('--- 受け取った環境変数の確認 ---');
        console.log(`GIST_ID: ${GIST_ID ? '✅' : '❌'}`);
        console.log(`GIST_TOKEN: ${GIST_TOKEN ? '✅' : '❌'}`);
        console.log(`GH_API_TOKEN: ${GH_API_TOKEN ? '✅' : '❌'}`);
        console.log(`YOUTUBE_API_KEY: ${YOUTUBE_API_KEY ? '✅' : '❌'}`);
        throw new Error('基本的な環境変数（Secret）が設定されていません。');
    }

    // 全てのサービスの活動取得を並行して実行
    const allActivitiesPromises = [
        fetchGitHubActivities(),
        fetchYouTubeActivities(),
        fetchMastodonActivities(),
        fetchSpotifyActivities(),
        fetchTwitchActivities()
    ];

    // 結果を一つの配列にまとめる
    const results = await Promise.all(allActivitiesPromises);
    const allActivities = [].concat(...results);
    
    // タイムスタンプでソートし、最新7日分にフィルタリング
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sortedAndFilteredActivities = allActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .filter(activity => new Date(activity.timestamp) >= sevenDaysAgo);

    console.log(`合計 ${sortedAndFilteredActivities.length} 件の活動を取得しました。`);

    // Gistを更新
    await updateGist(sortedAndFilteredActivities);
    
    console.log('処理が正常に完了しました。');
}

// 実行
main().catch(error => {
    console.error("スクリプトの実行中に致命的なエラーが発生しました:", error.message);
    process.exit(1); // エラーコード1でプロセスを終了
});

