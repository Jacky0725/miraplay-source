import axios from 'axios';
import * as cheerio from 'cheerio';
import { randomUUID } from 'crypto';
import { savedSession } from '../../settings/credentials.js';

const BASE = 'https://chengguodj.com';
const PLAY_HEADERS = { Referer: `${BASE}/`, 'User-Agent': 'Mozilla/5.0' };
const PLAYLIST_LIFETIME = 15 * 60 * 1000;
const EPISODE_ID = /^dj-[a-zA-Z0-9-]+\/\d+$/;
const CHANNELS = [
    ['recommend', '推荐'],
    ['yuanchuang', '原创'],
    ['mogai', '魔改'],
    ['manju', 'AI漫剧'],
    ['zhenren', '真人短剧'],
    ['aiduanju', 'AI短剧'],
    ['browse', '分类'],
];

async function fetchPage(path) {
    const url = new URL(path, BASE).href;
    const session = await savedSession();
    const response = await axios.get(url, {
        timeout: 15000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            Referer: BASE + '/',
            Accept: 'text/html,application/xhtml+xml',
            ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
    });
    return cheerio.load(response.data);
}

function absolute(url) {
    if (!url || url.startsWith('data:')) return '';
    return new URL(url, BASE).href;
}

function imageUrl(url) {
    const full = absolute(url);
    if (!full) return '';
    if (full.startsWith(`${BASE}/_img/`)) return full;
    const extension = new URL(full).pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1] || 'jpeg';
    const encoded = Buffer.from(full).toString('base64url');
    return `${BASE}/_img/${encoded}.${extension}`;
}

function nuxtData($) {
    const raw = $('#__NUXT_DATA__').html();
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

function cards($) {
    const seen = new Set();
    const list = [];
    const data = nuxtData($);
    const covers = new Map();
    for (const item of data) {
        if (!item || typeof item !== 'object' || typeof item.slug !== 'number' || typeof item.cover !== 'number') continue;
        const slug = data[item.slug];
        const cover = data[item.cover];
        if (typeof slug === 'string' && cover) {
            const source = typeof cover === 'string' ? cover :
                typeof cover.url === 'number' ? data[cover.url] : '';
            covers.set(slug, imageUrl(source));
        }
    }
    $('article[data-xpch="card-drama"]').each((_i, node) => {
        const card = $(node);
        const href = card.find('a[href^="/drama/"]').first().attr('href') || '';
        const slug = href.match(/\/drama\/([a-zA-Z0-9-]+)/)?.[1];
        if (!slug || seen.has(slug)) return;
        seen.add(slug);
        const img = card.find('img[alt]').first();
        const name = img.attr('alt') || card.find('div.truncate').first().text().trim();
        const cover = covers.get(slug) || imageUrl(img.attr('src') || img.attr('data-src'));
        const mark = card.find('.ph-cover span').last().text().trim();
        list.push({ vod_id: slug, vod_name: name, vod_pic: cover, vod_remarks: mark });
    });
    return list;
}

function pageCount($, current) {
    let max = current;
    $('a[href*="page"]').each((_i, a) => {
        const href = $(a).attr('href') || '';
        const value = Number(href.match(/\/page-(\d+)(?:\/|\?|$)/)?.[1] ||
            new URL(href, BASE).searchParams.get('page'));
        if (Number.isFinite(value)) max = Math.max(max, value);
    });
    return max;
}

async function init() { return {}; }

async function home() {
    const $ = await fetchPage('/');
    return {
        class: CHANNELS.map(([type_id, type_name]) => ({ type_id, type_name })),
        list: cards($),
    };
}

async function category(inReq) {
    const id = String(inReq.body?.id || '');
    if (!CHANNELS.some(([key]) => key === id)) return { page: 1, pagecount: 1, list: [] };
    const page = Math.max(1, Number(inReq.body?.page) || 1);
    const path = id === 'recommend' ? '/' : id === 'browse' ? '/browse' : `/${id}`;
    const $ = await fetchPage(page === 1 || path === '/' ? path : `${path}/page-${page}`);
    return { page, pagecount: id === 'recommend' ? 1 : pageCount($, page), list: cards($) };
}

function dramaFromNuxt(data, slug) {
    return data.find((item) => item && typeof item === 'object' &&
        typeof item.slug === 'number' && data[item.slug] === slug &&
        typeof item.title === 'number' && Array.isArray(data[item.title]) === false);
}

async function detail(inReq, directPlayback) {
    const raw = Array.isArray(inReq.body?.id) ? inReq.body.id[0] : inReq.body?.id;
    const slug = String(raw || '');
    if (!/^dj-[a-zA-Z0-9-]+$/.test(slug)) return { list: [] };
    const $ = await fetchPage(`/drama/${slug}`);
    const data = nuxtData($);
    const drama = dramaFromNuxt(data, slug);
    const coverObject = drama && data[drama.cover];
    const cover = typeof coverObject === 'string' ? imageUrl(coverObject) :
        coverObject && typeof coverObject.url === 'number' ? imageUrl(data[coverObject.url]) : '';
    const episodes = [];
    $(`[data-xpch="episode-grid"] a[href^="/play/${slug}/"]`).each((_i, a) => {
        const href = $(a).attr('href') || '';
        const n = href.match(/\/(\d+)$/)?.[1];
        if (n && !episodes.some((entry) => entry.n === n)) episodes.push({ n, id: `${slug}/${n}` });
    });
    episodes.sort((a, b) => Number(a.n) - Number(b.n));
    const name = $('h1').first().text().trim() || (drama ? data[drama.title] : slug);
    const intro = drama && typeof drama.intro === 'number' ? String(data[drama.intro] || '') : '';
    const episodeList = episodes.map(({ n, id }) => `第${n}集$${id}`).join('#');
    const hasDirectLine = !directPlayback && episodes.length > 0;
    return {
        list: [{
            vod_id: slug,
            vod_name: name,
            vod_pic: cover,
            type_name: drama && typeof drama.channel === 'number' ? String(data[drama.channel]?.name || '') : '',
            vod_content: intro || $('meta[name="description"]').attr('content') || '',
            vod_remarks: `共${episodes.length}集`,
            vod_play_from: hasDirectLine ? '橙果短剧$$$原站直连' : '橙果短剧',
            vod_play_url: hasDirectLine ? `${episodeList}$$$${episodes.map(({ n, id }) => `第${n}集$direct:${id}`).join('#')}` : episodeList,
        }],
    };
}

async function fetchMedia(url, options) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await axios.get(url, options);
        } catch (error) {
            const status = error.response?.status;
            const temporary = status === 408 || status === 429 || status >= 500 ||
                ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code);
            if (attempt > 0 || !temporary) throw error;
            error.response?.data?.destroy?.();
        }
    }
}

async function compatiblePlaylist(url, request, playlists) {
    const port = request.server.address?.()?.port || request.server.server.address()?.port ||
        request.raw.socket.localPort;
    if (!port) return url;

    const response = await fetchMedia(url, {
        headers: { ...PLAY_HEADERS, Accept: 'application/vnd.apple.mpegurl, */*' },
        responseType: 'text', timeout: 8000, maxContentLength: 2 * 1024 * 1024,
    });
    const manifest = response.data.trimStart();
    if (!manifest.startsWith('#EXTM3U')) throw new Error('橙果短剧返回了无效的播放清单');
    if (!manifest.includes('#EXTINF:') || manifest.includes('#EXT-X-STREAM-INF:')) return url;

    const manifestUrl = response.request?.res?.responseUrl || url;
    const id = randomUUID();
    const base = `http://127.0.0.1:${port}${request.server.prefix}/hls/${id}`;
    const keyUrls = new Map();
    const segments = [];
    const body = manifest.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#EXT-X-WJ-T:')).map((line) => {
        const entry = line.trim();
        if (!entry) return line;
        if (!entry.startsWith('#')) {
            const segment = new URL(entry, manifestUrl);
            if (segment.protocol !== 'https:' || !segment.pathname.toLowerCase().endsWith('.ts')) return segment.href;
            const index = segments.push(segment.href) - 1;
            return `${base}/segment/${index}.ts`;
        }
        return entry.replace(/([:,])URI="([^"]+)"/g, (_match, separator, raw) => {
            const resolved = new URL(raw, manifestUrl);
            if (!entry.startsWith('#EXT-X-KEY:') || !/(?:[:,])METHOD=AES-128(?:,|$)/.test(entry) ||
                resolved.protocol !== 'https:') return `${separator}URI="${resolved.href}"`;
            if (!keyUrls.has(resolved.href)) keyUrls.set(resolved.href, keyUrls.size);
            return `${separator}URI="${base}/key/${keyUrls.get(resolved.href)}"`;
        });
    }).join('\n');

    const keys = await Promise.all(Array.from(keyUrls.keys(), async (keyUrl) => {
        const response = await fetchMedia(keyUrl, {
            headers: PLAY_HEADERS, responseType: 'arraybuffer', timeout: 8000, maxContentLength: 16,
        });
        if (response.data.length !== 16) throw new Error('橙果短剧返回了无效的播放密钥');
        return Buffer.from(response.data);
    }));
    const now = Date.now();
    for (const [entryId, entry] of playlists) {
        if (entry.expiresAt <= now) playlists.delete(entryId);
    }
    if (playlists.size >= 100) playlists.delete(playlists.keys().next().value);
    playlists.set(id, { body, keys, segments, expiresAt: now + PLAYLIST_LIFETIME });
    return `${base}/playlist.m3u8`;
}

async function play(inReq, playlists) {
    const raw = String(inReq.body?.id || '');
    const direct = raw.startsWith('direct:');
    const id = direct ? raw.slice('direct:'.length) : raw;
    if (!EPISODE_ID.test(id)) return { parse: 0, url: '' };
    const $ = await fetchPage(`/play/${id}`);
    const data = nuxtData($);
    const media = data.find((item) => item && typeof item === 'object' &&
        Object.prototype.hasOwnProperty.call(item, 'source_url'));
    const url = media && typeof media.source_url === 'number' ? data[media.source_url] : '';
    if (!url || !/^https?:\/\//.test(url)) return { parse: 0, url: '' };
    let playableUrl = url;
    if (playlists && !direct && new URL(url).pathname.toLowerCase().endsWith('.m3u8')) {
        try {
            playableUrl = await compatiblePlaylist(url, inReq, playlists);
        } catch (error) {
            inReq.log.warn({ upstreamStatus: error.response?.status, networkCode: error.code },
                '橙果短剧兼容清单加载失败，使用原站播放地址');
        }
    }
    return playableUrl === url ? { parse: 0, url, header: PLAY_HEADERS } : { parse: 0, url: playableUrl };
}

async function streamSegment(request, reply, url) {
    const range = request.headers.range;
    let response;
    try {
        response = await fetchMedia(url, {
            headers: { ...PLAY_HEADERS, 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
            responseType: 'stream', timeout: 10000,
            validateStatus: (status) => status === 200 || status === 206 || status === 416,
        });
    } catch (error) {
        error.response?.data?.destroy?.();
        request.log.warn({ upstreamStatus: error.response?.status, networkCode: error.code }, '橙果短剧分片请求失败');
        return reply.code(502).send();
    }
    reply.code(response.status).header('Cache-Control', 'no-store')
        .header('Access-Control-Allow-Origin', '*')
        .header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range');
    for (const header of ['accept-ranges', 'content-length', 'content-range']) {
        if (response.headers[header] !== undefined) reply.header(header, response.headers[header]);
    }
    return reply.type('video/mp2t').send(response.data);
}

async function search(inReq) {
    const word = String(inReq.body?.wd || '').trim();
    const page = Math.max(1, Number(inReq.body?.page) || 1);
    if (!word) return { page, pagecount: page, list: [] };
    const $ = await fetchPage(`/search/${encodeURIComponent(word)}?page=${page}`);
    return { page, pagecount: pageCount($, page), list: cards($) };
}

export default {
    meta: { key: 'chengguodj', name: '橙果短剧', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify, options) => {
        const playlists = options.directPlayback ? null : new Map();
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', (request) => detail(request, options.directPlayback));
        fastify.post('/play', (request) => play(request, playlists));
        fastify.post('/search', search);
        if (!playlists) return;

        fastify.get('/hls/:id/playlist.m3u8', (request, reply) => {
            const entry = playlists.get(request.params.id);
            if (!entry || entry.expiresAt <= Date.now()) return reply.code(404).send();
            return reply.header('Cache-Control', 'no-store')
                .header('Access-Control-Allow-Origin', '*')
                .type('application/vnd.apple.mpegurl').send(entry.body);
        });
        fastify.get('/hls/:id/key/:index', (request, reply) => {
            const entry = playlists.get(request.params.id);
            const index = Number(request.params.index);
            if (!entry || entry.expiresAt <= Date.now() || !Number.isInteger(index) || !entry.keys[index]) {
                return reply.code(404).send();
            }
            return reply.header('Cache-Control', 'no-store')
                .header('Access-Control-Allow-Origin', '*')
                .type('application/octet-stream').send(entry.keys[index]);
        });
        fastify.get('/hls/:id/segment/:index.ts', (request, reply) => {
            const entry = playlists.get(request.params.id);
            const index = Number(request.params.index);
            const url = Number.isInteger(index) && entry?.segments[index];
            if (!url || entry.expiresAt <= Date.now()) return reply.code(404).send();
            return streamSegment(request, reply, url);
        });
    },
};
