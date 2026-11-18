import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { request91, saved91Session } from '../../settings/dj91-credentials.js';
import { allowedAdultMetadata, cleanEpisodeTitle } from './content-filter.js';
import { fetchMedia, registerHlsProxy, retryMedia } from './hls-proxy.js';

const SITE = 'https://91dj66.com';
const CHANNELS = [
    ['recommend', '推荐'],
    ['chengrenduanju', '成人短剧'],
    ['aimogai', 'AI魔改'],
    ['guzhuangguofeng', '古装国风'],
];
const IMAGE_HOST = 'd3n8qx4rvy4vol.cloudfront.net';
const IMAGE_KEY = Buffer.from('2019ysapp7527');
const imageCache = new Map();
const IMAGE_CACHE_LIMIT = 24 * 1024 * 1024;
let imageCacheBytes = 0;
const PLAY_HEADERS = { Referer: SITE + '/', 'User-Agent': 'Mozilla/5.0' };

function coverType(buffer) {
    if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
    if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return '';
}

async function page(path) {
    return cheerio.load((await request91(path)).data);
}

function image(value, request) {
    try {
        const url = new URL(value, SITE);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (url.hostname !== IMAGE_HOST) return url.href;
        const encoded = Buffer.from(url.href).toString('base64url');
        const port = request.server.address?.()?.port || request.server.server?.address()?.port ||
            request.raw.socket.localPort;
        if (!port) return '';
        return `http://127.0.0.1:${port}/spider/dj91/3/image?url=${encoded}`;
    } catch { return ''; }
}

function cards($, request) {
    const seen = new Set();
    const result = [];
    $('a[href^="/detail/"]').each((_index, node) => {
        const item = $(node);
        const slug = (item.attr('href') || '').match(/^\/detail\/([a-zA-Z0-9-]+)\/?$/)?.[1];
        const title = item.find('h3').first().text().trim() || item.attr('aria-label') || '';
        const label = item.find('.home-card-meta').text().trim() || item.find('.home-reel-meta').text().trim();
        if (!slug || seen.has(slug) || !allowedAdultMetadata(title, label)) return;
        seen.add(slug);
        result.push({
            vod_id: slug,
            vod_name: title,
            vod_pic: image(item.find('img').first().attr('data-src') || item.find('img').first().attr('src'), request),
            vod_remarks: label,
        });
    });
    return result;
}

function pagecount($, current) {
    return Math.max(current, Number($('[data-catalog-pagination]').attr('data-total')) || current);
}

function detailInfo($, slug, request) {
    const title = $('.detail-title').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    const description = $('.detail-intro').first().text().trim() || $('meta[name="description"]').attr('content') || '';
    const tags = $('.detail-tag, .detail-tags, .detail-meta').text().trim();
    if (!allowedAdultMetadata(title, description, tags)) return null;
    const id = String($('[data-playlet-id]').first().attr('data-playlet-id') || '');
    if (!/^\d+$/.test(id)) return null;
    const episodes = [];
    $(`a[href^="/play/${slug}/"]`).each((_index, node) => {
        const chapterId = ($(node).attr('href') || '').match(/\/(\d+)\/?$/)?.[1];
        const episodeTitle = $(node).text().trim();
        if (chapterId && !episodes.some((entry) => entry.id === chapterId) &&
            allowedAdultMetadata(episodeTitle || `第${episodes.length + 1}集`)) {
            episodes.push({ id: chapterId, title: cleanEpisodeTitle(episodeTitle, `第${episodes.length + 1}集`) });
        }
    });
    return { id, title, description, episodes,
        cover: image($('meta[property="og:image"]').attr('content'), request) };
}

async function init() { return {}; }

async function home(request) {
    const $ = await page('/');
    return {
        class: CHANNELS.map(([type_id, type_name]) => ({ type_id, type_name })),
        list: cards($, request),
    };
}

async function category(request) {
    const id = String(request.body?.id || '');
    const current = Math.max(1, Number(request.body?.page) || 1);
    if (!CHANNELS.some(([key]) => key === id)) return { page: current, pagecount: 1, list: [] };
    if (id === 'recommend' && current > 1) return { page: current, pagecount: 1, list: [] };
    const path = id === 'recommend' ? '/' : `/more/${id}${current > 1 ? `/page/${current}` : ''}`;
    const $ = await page(path);
    return { page: current, pagecount: id === 'recommend' ? 1 : pagecount($, current), list: cards($, request) };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const slug = String(raw || '');
    if (!/^[a-zA-Z0-9-]+$/.test(slug)) return { list: [] };
    const info = detailInfo(await page(`/detail/${slug}`), slug, request);
    if (!info) return { list: [] };
    return { list: [{
        vod_id: slug, vod_name: info.title, vod_pic: info.cover,
        vod_content: info.description, vod_remarks: `共${info.episodes.length}集`,
        vod_play_from: '91短剧$$$原站直连',
        vod_play_url: ['', 'direct:'].map((prefix) => info.episodes.map(({ title, id }) =>
            `${title}$${prefix}${slug}/${id}`).join('#')).join('$$$'),
    }] };
}

async function play(request, proxyHls) {
    const rawId = String(request.body?.id || '');
    const direct = rawId.startsWith('direct:');
    const match = rawId.replace(/^(?:proxy:|direct:)/, '').match(/^([a-zA-Z0-9-]+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const info = detailInfo(await page(`/detail/${match[1]}`), match[1], request);
    if (!info || !info.episodes.some((entry) => entry.id === match[2])) return { parse: 0, url: '' };
    const referer = new URL('/play/' + match[1] + '/' + match[2], SITE).href;
    let cookie = (await saved91Session())?.cookie;
    if (!cookie && !direct) {
        const guest = await request91(referer, { cookie: '' });
        cookie = (guest.headers['set-cookie'] || []).map((value) => value.split(';')[0])
            .filter((value) => /^(?:token|guest_dev_id)=/.test(value)).join('; ');
    }

    const session = { cookie, referer };
    const response = await request91('/api/playlet/chapter/detail?chapterId=' + match[2] + '&playletId=' + info.id, {
        ...session, accept: 'application/json',
    });
    const packet = response.data;
    if (Number(packet?.code) !== 200 || !packet?.data?.canWatch) {
        throw new Error(String(packet?.tip || packet?.msg || '该选集暂时无法播放'));
    }
    if (String(packet.data.playletId) !== info.id || String(packet.data.id) !== match[2] ||
        !allowedAdultMetadata(packet.data.title || info.title)) return { parse: 0, url: '' };
    const raw = String(packet.data.videoUrl || '').trim().replace(/^\/+/, '');
    if (!raw) return { parse: 0, url: '' };
    const path = raw.startsWith('h5/m3u8/') ? '/' + raw : '/h5/m3u8/' + raw;
    const manifest = new URL(/^https?:\/\//i.test(raw) ? raw : path, SITE);
    if (direct || manifest.origin !== SITE) return { parse: 0, url: manifest.href, header: PLAY_HEADERS };

    const backedOffKeys = new Map();
    for (let attempt = 0; attempt < 3; attempt++) {
        let failedKey;
        try {
            const url = await proxyHls(manifest.href, request, {
                keyOrigin: SITE,
                fetchManifest: (path) => retryMedia(() => request91(path, {
                    ...session, accept: 'application/vnd.apple.mpegurl', responseType: 'text',
                    timeout: 8000, maxContentLength: 2 * 1024 * 1024,
                })),
                fetchKey: async (path) => {
                    try {
                        if (backedOffKeys.has(path)) throw backedOffKeys.get(path);
                        return await request91(path, {
                            ...session, accept: 'application/octet-stream, */*', responseType: 'arraybuffer',
                            timeout: 8000, maxContentLength: 64 * 1024,
                        });
                    } catch (error) {
                        failedKey = error.response?.status;
                        if (error.response?.headers?.['retry-after']) backedOffKeys.set(path, error);
                        throw error;
                    }
                },
            });
            return url === manifest.href ? { parse: 0, url, header: PLAY_HEADERS } : { parse: 0, url };
        } catch (error) {
            // The website can issue a different key ticket when it serves the playlist again.
            if ([502, 503, 504].includes(failedKey) && attempt < 2) continue;
            const upstreamStatus = error.response?.status;
            if (failedKey === 401 || failedKey === 403) {
                throw Object.assign(new Error('91短剧拒绝了播放密钥请求，请确认该集的站点登录和观看权限'), { statusCode: 403 });
            }
            const resource = failedKey ? '播放密钥' : '播放清单';
            const status = upstreamStatus ? `（HTTP ${upstreamStatus}）` : '';
            throw Object.assign(new Error(`91短剧源站${resource}暂时不可用${status}`), { statusCode: 502 });
        }
    }
}

async function search(request) {
    const keyword = String(request.body?.wd || '').trim();
    const current = Math.max(1, Number(request.body?.page) || 1);
    if (!keyword || !allowedAdultMetadata(keyword)) return { page: current, pagecount: 1, list: [] };
    const path = `/search/${encodeURIComponent(keyword)}${current > 1 ? `/page/${current}` : ''}`;
    const $ = await page(path);
    return { page: current, pagecount: pagecount($, current), list: cards($, request) };
}

export default {
    meta: { key: 'dj91', name: '91短剧', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        const proxyHls = registerHlsProxy(fastify, PLAY_HEADERS);
        fastify.post('/play', (request) => play(request, proxyHls));
        fastify.post('/search', search);
        fastify.get('/image', async (request, reply) => {
            let url;
            try { url = new URL(Buffer.from(String(request.query?.url || ''), 'base64url').toString('utf8')); }
            catch { return reply.code(400).send(); }
            if (url.protocol !== 'https:' || url.hostname !== IMAGE_HOST) return reply.code(400).send();
            let image = imageCache.get(url.href);
            if (!image) {
                let response;
                try {
                    response = await fetchMedia(url.href, {
                        responseType: 'arraybuffer', timeout: 8000, maxContentLength: 4 * 1024 * 1024,
                    });
                } catch {
                    return reply.code(502).send();
                }
                const buffer = Buffer.from(response.data);
                for (let index = 0; index < Math.min(100, buffer.length); index++) {
                    buffer[index] ^= IMAGE_KEY[index % IMAGE_KEY.length];
                }
                const type = coverType(buffer);
                if (!type) return reply.code(502).send();
                const etag = '"' + createHash('sha256').update(buffer).digest('hex') + '"';
                image = { buffer, type, etag };
                const existing = imageCache.get(url.href);
                if (existing) {
                    imageCacheBytes -= existing.buffer.length;
                    imageCache.delete(url.href);
                }
                while (imageCache.size && imageCacheBytes + buffer.length > IMAGE_CACHE_LIMIT) {
                    const oldest = imageCache.keys().next().value;
                    imageCacheBytes -= imageCache.get(oldest).buffer.length;
                    imageCache.delete(oldest);
                }
                imageCache.set(url.href, image);
                imageCacheBytes += buffer.length;
            }
            reply.header('Cache-Control', 'public, max-age=86400')
                .header('Access-Control-Allow-Origin', '*').header('ETag', image.etag);
            if (request.headers['if-none-match'] === image.etag) return reply.code(304).send();
            return reply.type(image.type).send(image.buffer);
        });
    },
};
