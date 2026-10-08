import axios from 'axios';
import { randomUUID } from 'crypto';
import { getXiangjiao, playXiangjiao } from '../../settings/xiangjiao-credentials.js';

const SITE = 'https://xiangjiaoai.ai';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCLUDED = /未成年|小学生|初中|高中|萝莉|幼女|正太|校园|师生|儿女|儿子|女儿|继女|继子|妹妹|弟弟|换脸|乱伦/;
const cursorCache = new Map();
const playlistCache = new Map();
const PLAYLIST_LIFETIME = 4 * 60 * 60 * 1000;

async function compatiblePlaylist(manifestUrl, request) {
    const response = await axios.get(manifestUrl, {
        timeout: 15000,
        responseType: 'text',
        headers: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0' },
    });
    const original = String(response.data || '');
    if (!original.startsWith('#EXTM3U')) throw new Error('香蕉短剧返回了无效的播放清单');
    if (!original.includes('URI="data:')) return manifestUrl;

    const id = randomUUID();
    const base = `http://127.0.0.1:${request.server.address().port}/spider/xiangjiao/3/hls/${id}`;
    const keys = [];
    const lines = original.split(/\r?\n/).map((line) => {
        if (line.startsWith('#EXT-X-KEY:')) {
            return line.replace(/URI="data:[^",]+;base64,([A-Za-z0-9+/=]+)"/g, (_match, encoded) => {
                const key = Buffer.from(encoded, 'base64');
                if (key.length !== 16) throw new Error('香蕉短剧播放密钥格式不受支持');
                const index = keys.push(key) - 1;
                return `URI="${base}/key/${index}"`;
            });
        }
        if (line && !line.startsWith('#')) return new URL(line, manifestUrl).href;
        return line;
    });
    if (!keys.length) return manifestUrl;
    const now = Date.now();
    for (const [entryId, entry] of playlistCache) {
        if (entry.expiresAt < now) playlistCache.delete(entryId);
    }
    playlistCache.set(id, { body: lines.join('\n'), keys, expiresAt: now + PLAYLIST_LIFETIME });
    return `${base}/playlist.m3u8`;
}

function allowed(item) {
    const text = [item?.name, item?.title, item?.description, item?.primary_category?.name,
        ...(item?.categories || []).map((x) => x?.name), ...(item?.tags || []).map((x) => x?.name)]
        .filter(Boolean).join(' ');
    return !EXCLUDED.test(text);
}

function image(value) {
    try {
        const url = new URL(value, SITE);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
}

function card(item) {
    const drama = item?.drama || item;
    if (item?.type && item.type !== 'drama') return null;
    if (!drama || !allowed(drama)) return null;
    const id = String(drama.id || '');
    if (!UUID.test(id)) return null;
    return {
        vod_id: id,
        vod_name: String(drama.title || item?.title || ''),
        vod_pic: image(drama.cover_url || item?.image_url),
        vod_remarks: drama.episode_count ? `共${drama.episode_count}集` : '',
    };
}

function cards(items) { return (Array.isArray(items) ? items : []).map(card).filter(Boolean); }

async function init() { return {}; }

async function home() {
    const [hot, categories] = await Promise.all([
        getXiangjiao('/api/home/hot?limit=30'), getXiangjiao('/api/categories'),
    ]);
    return {
        class: [{ type_id: 'all', type_name: '全部' },
            ...(Array.isArray(categories) ? categories : []).filter(allowed).map((x) => ({
                type_id: `category:${x.id}`, type_name: x.name,
            }))],
        list: cards(hot?.items),
    };
}

async function category(request) {
    const id = String(request.body?.id || '');
    const page = Math.max(1, Number(request.body?.page) || 1);
    const categoryId = id === 'all' ? '' : id.match(/^category:([0-9a-f-]+)$/i)?.[1];
    if (categoryId === undefined) return { page, pagecount: 1, list: [] };
    if (categoryId) {
        const categories = await getXiangjiao('/api/categories');
        if (!(Array.isArray(categories) ? categories : []).some((item) => item.id === categoryId && allowed(item))) {
            return { page, pagecount: 1, list: [] };
        }
    }
    const key = id;
    let cursor = '';
    for (let n = 1; n < page; n++) {
        const cached = cursorCache.get(`${key}:${n + 1}`);
        if (cached !== undefined) { cursor = cached; continue; }
        const query = new URLSearchParams({ limit: '20' });
        if (categoryId) query.set('category_id', categoryId);
        if (cursor) query.set('cursor', cursor);
        const data = await getXiangjiao(`/api/theater?${query}`);
        cursor = String(data?.next_cursor || '');
        if (!cursor) return { page, pagecount: n, list: [] };
        cursorCache.set(`${key}:${n + 1}`, cursor);
    }
    const query = new URLSearchParams({ limit: '20' });
    if (categoryId) query.set('category_id', categoryId);
    if (cursor) query.set('cursor', cursor);
    const data = await getXiangjiao(`/api/theater?${query}`);
    if (data?.next_cursor) cursorCache.set(`${key}:${page + 1}`, String(data.next_cursor));
    return { page, pagecount: Math.max(page, Math.ceil((Number(data?.total) || 0) / 20)), list: cards(data?.items) };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const id = String(raw || '');
    if (!UUID.test(id)) return { list: [] };
    const [drama, episodes] = await Promise.all([
        getXiangjiao(`/api/dramas/${id}`), getXiangjiao(`/api/dramas/${id}/episodes`),
    ]);
    if (!drama || !allowed(drama)) return { list: [] };
    const entries = (Array.isArray(episodes) ? episodes : []).filter((item) => UUID.test(item?.id || ''))
        .sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
    return { list: [{
        vod_id: id, vod_name: String(drama.title || ''), vod_pic: image(drama.cover_url),
        vod_content: `共${entries.length}集`, vod_remarks: `共${entries.length}集`,
        vod_play_from: '香蕉短剧',
        vod_play_url: entries.map((item) => `第${item.episode_number}集$${id}/${item.id}`).join('#'),
    }] };
}

async function play(request) {
    const [dramaId, episodeId] = String(request.body?.id || '').split('/');
    if (!UUID.test(dramaId || '') || !UUID.test(episodeId || '')) return { parse: 0, url: '' };
    const [drama, episodes] = await Promise.all([
        getXiangjiao(`/api/dramas/${dramaId}`), getXiangjiao(`/api/dramas/${dramaId}/episodes`),
    ]);
    if (!drama || !allowed(drama) || !(Array.isArray(episodes) ? episodes : []).some((item) => item.id === episodeId)) {
        return { parse: 0, url: '' };
    }
    const url = await playXiangjiao(episodeId);
    const playableUrl = await compatiblePlaylist(url, request);
    return { parse: 0, url: playableUrl, header: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0' } };
}

async function search(request) {
    const keyword = String(request.body?.wd || '').trim();
    const page = Math.max(1, Number(request.body?.page) || 1);
    if (!keyword || EXCLUDED.test(keyword) || page > 1) return { page, pagecount: 1, list: [] };
    const query = new URLSearchParams({ q: keyword, limit: '30' });
    const data = await getXiangjiao(`/api/search?${query}`);
    return { page, pagecount: 1, list: cards(data?.items) };
}

export default {
    meta: { key: 'xiangjiao', name: '香蕉短剧', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/hls/:id/playlist.m3u8', async (request, reply) => {
            const entry = playlistCache.get(request.params.id);
            if (!entry || entry.expiresAt < Date.now()) return reply.code(404).send();
            return reply.header('Cache-Control', 'no-store')
                .header('Access-Control-Allow-Origin', '*')
                .type('application/vnd.apple.mpegurl').send(entry.body);
        });
        fastify.get('/hls/:id/key/:index', async (request, reply) => {
            const entry = playlistCache.get(request.params.id);
            const index = Number(request.params.index);
            if (!entry || entry.expiresAt < Date.now() || !Number.isInteger(index) || !entry.keys[index]) {
                return reply.code(404).send();
            }
            return reply.header('Cache-Control', 'no-store')
                .header('Access-Control-Allow-Origin', '*')
                .type('application/octet-stream').send(entry.keys[index]);
        });
    },
};
