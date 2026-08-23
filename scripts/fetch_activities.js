/**
 * fetch_activities.js
 * Aggregates social media activities and outputs to timeline.json
 */

const fs = require('fs');
const { Octokit } = require("@octokit/core");
const { BskyAgent } = require('@atproto/api');
const Parser = require('rss-parser');

// --- Configuration & Credentials ---
const ENV = process.env;
const CONFIG = {
    GITHUB_USERNAME: 'MuraseRyosuke',
    YOUTUBE_CHANNEL_ID: 'UCYnXDiX1IXfr7IfmtKGZd7w',
    NOTE_USERNAME: 'muraseryosuke',
    VIMEO_USERNAME: 'RyosukeMurase',
    SOUNDCLOUD_USER_ID: '16353954',
    PINTEREST_USERNAME: 'i9sa',
    STEAM_USER_ID: '76561198399565200'
};

// --- Clients ---
const octokit = new Octokit({ auth: ENV.GH_API_TOKEN });
const bskyAgent = new BskyAgent({ service: 'https://bsky.social' });
const rssParser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
});

// --- Helper Functions ---
const fetchJson = async (url, options = {}) => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
};

const createRssFetcher = (platform, getUrl, getContent) => async () => {
    try {
        const feed = await rssParser.parseURL(getUrl());
        return feed.items.slice(0, 5).map(item => ({
            platform,
            timestamp: item.isoDate || item.pubDate,
            content: getContent(item),
            url: item.link
        }));
    } catch (e) {
        console.error(`[${platform}] Error:`, e.message);
        return [];
    }
};

// --- API Fetchers ---
async function fetchGitHub() {
    try {
        const { data } = await octokit.request('GET /users/{username}/events', { username: CONFIG.GITHUB_USERNAME, per_page: 30 });
        return data
            .filter(e => ['PushEvent', 'CreateEvent', 'WatchEvent'].includes(e.type))
            .map(e => {
                const repo = e.repo.name;
                let content = '';
                if (e.type === 'PushEvent') content = `${repo} に ${e.payload.commits?.length || 0}件のコミットをPushしました`;
                else if (e.type === 'CreateEvent' && e.payload.ref_type === 'repository') content = `新しいリポジトリ ${repo} を作成しました`;
                else if (e.type === 'WatchEvent') content = `${repo} をStarしました`;
                
                return content ? { platform: 'GitHub', timestamp: e.created_at, content, url: `https://github.com/${repo}` } : null;
            })
            .filter(Boolean);
    } catch (e) {
        console.error("[GitHub] Error:", e.message);
        return [];
    }
}

async function fetchBluesky() {
    if (!ENV.BLUESKY_IDENTIFIER || !ENV.BLUESKY_APP_PASSWORD) return [];
    try {
        await bskyAgent.login({ identifier: ENV.BLUESKY_IDENTIFIER, password: ENV.BLUESKY_APP_PASSWORD });
        const { data } = await bskyAgent.getAuthorFeed({ actor: ENV.BLUESKY_IDENTIFIER, limit: 10 });
        return data.feed
            .filter(item => !item.reply && !item.reason)
            .map(({ post }) => ({
                platform: 'Bluesky',
                timestamp: post.indexedAt,
                content: post.record.text,
                url: `https://bsky.app/profile/${post.author.did}/post/${post.uri.split('/').pop()}`
            }));
    } catch (e) {
        console.error("[Bluesky] Error:", e.message);
        return [];
    }
}

async function fetchSpotify() {
    if (!ENV.SPOTIFY_CLIENT_ID || !ENV.SPOTIFY_CLIENT_SECRET || !ENV.SPOTIFY_REFRESH_TOKEN) return [];
    try {
        const tokenRes = await fetchJson('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${ENV.SPOTIFY_CLIENT_ID}:${ENV.SPOTIFY_CLIENT_SECRET}`).toString('base64')
            },
            body: `grant_type=refresh_token&refresh_token=${ENV.SPOTIFY_REFRESH_TOKEN}`
        });

        const recent = await fetchJson('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
            headers: { 'Authorization': `Bearer ${tokenRes.access_token}` }
        });
        return recent.items.map(({ track, played_at }) => ({
            platform: 'Spotify',
            timestamp: played_at,
            content: `${track.artists[0].name} の「${track.name}」を聴きました`,
            url: track.external_urls.spotify
        }));
    } catch (e) {
        console.error("[Spotify] Error:", e.message);
        return [];
    }
}

async function fetchTwitch() {
    if (!ENV.TWITCH_CLIENT_ID || !ENV.TWITCH_CLIENT_SECRET || !ENV.TWITCH_USER_ID) return [];
    try {
        const { access_token } = await fetchJson(`https://id.twitch.tv/oauth2/token?client_id=${ENV.TWITCH_CLIENT_ID}&client_secret=${ENV.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
        const { data } = await fetchJson(`https://api.twitch.tv/helix/videos?user_id=${ENV.TWITCH_USER_ID}&first=5`, {
            headers: { 'Client-ID': ENV.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${access_token}` }
        });
        return data.map(v => ({
            platform: 'Twitch',
            timestamp: v.created_at,
            content: `「${v.title}」を配信しました`,
            url: v.url
        }));
    } catch (e) {
        console.error("[Twitch] Error:", e.message);
        return [];
    }
}

async function fetchSteam() {
    if (!ENV.STEAM_API_KEY || !CONFIG.STEAM_USER_ID) return [];
    try {
        const { response } = await fetchJson(`http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${ENV.STEAM_API_KEY}&steamid=${CONFIG.STEAM_USER_ID}&format=json`);
        if (!response?.games) return [];
        const now = new Date().toISOString();
        return response.games
            .filter(g => g.playtime_2weeks > 0)
            .slice(0, 5)
            .map(g => ({
                platform: 'Steam',
                timestamp: now,
                content: `${g.name} をプレイしました`,
                url: `https://store.steampowered.com/app/${g.appid}/`
            }));
    } catch (e) {
        console.error("[Steam] Error:", e.message);
        return [];
    }
}

// --- Main Execution ---
(async () => {
    console.log('Starting activity fetch...');
    try {
        const fetchers = [
            fetchGitHub, fetchBluesky, fetchSpotify, fetchTwitch, fetchSteam,
            createRssFetcher('note', () => `https://note.com/${CONFIG.NOTE_USERNAME}/rss`, i => `記事「${i.title}」を投稿しました`),
            createRssFetcher('Vimeo', () => `https://vimeo.com/${CONFIG.VIMEO_USERNAME}/videos/rss`, i => `動画「${i.title}」を公開しました`),
            createRssFetcher('SoundCloud', () => `https://feeds.soundcloud.com/users/soundcloud:users:${CONFIG.SOUNDCLOUD_USER_ID}/sounds.rss`, i => `トラック「${i.title}」を公開しました`),
            createRssFetcher('YouTube', () => `https://www.youtube.com/feeds/videos.xml?channel_id=${CONFIG.YOUTUBE_CHANNEL_ID}`, i => `動画「${i.title}」を公開しました`),
            createRssFetcher('Pinterest', () => `https://jp.pinterest.com/${CONFIG.PINTEREST_USERNAME}/feed.rss`, i => `「${i.title || '新しい画像'}」をピンしました`)
        ];

        const results = await Promise.all(fetchers.map(fn => fn()));
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const timeline = results.flat()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .filter(a => new Date(a.timestamp) >= sevenDaysAgo);

        fs.writeFileSync('timeline.json', JSON.stringify(timeline, null, 2));
        console.log(`Successfully saved ${timeline.length} activities to timeline.json.`);
    } catch (e) {
        console.error("Fatal error:", e);
        process.exit(1);
    }
})();
