import axios from 'axios';
import * as cheerio from 'cheerio';
import { request91 } from '../../settings/dj91-credentials.js';
import { allowedAdultMetadata, cleanEpisodeTitle } from './content-filter.js';

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
        vod_play_from: '91短剧',
        vod_play_url: info.episodes.map((entry) => `${entry.title}$${slug}/${entry.id}`).join('#'),
    }] };
}

async function play(request) {
    const match = String(request.body?.id || '').match(/^([a-zA-Z0-9-]+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const info = detailInfo(await page(`/detail/${match[1]}`), match[1], request);
    if (!info || !info.episodes.some((entry) => entry.id === match[2])) return { parse: 0, url: '' };
    const response = await request91(`/api/playlet/chapter/detail?chapterId=${match[2]}&playletId=${info.id}`, {
        accept: 'application/json',
    });
    const packet = response.data;
    if (Number(packet?.code) !== 200 || !packet?.data?.canWatch) {
        throw new Error(String(packet?.tip || packet?.msg || '该选集暂时无法播放'));
    }
    if (String(packet.data.playletId) !== info.id || String(packet.data.id) !== match[2] ||
        !allowedAdultMetadata(packet.data.title || info.title)) return { parse: 0, url: '' };
    const raw = String(packet.data.videoUrl || '').trim();
    if (!raw) return { parse: 0, url: '' };
    const url = /^https?:\/\//i.test(raw) ? raw : new URL(`/h5/m3u8/${raw.replace(/^\/+/, '')}`, SITE).href;
    if (!/^https?:\/\//i.test(url)) return { parse: 0, url: '' };
    return { parse: 0, url, header: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0' } };
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
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/image', async (request, reply) => {
            let url;
            try { url = new URL(Buffer.from(String(request.query?.url || ''), 'base64url').toString('utf8')); }
            catch { return reply.code(400).send(); }
            if (url.protocol !== 'https:' || url.hostname !== IMAGE_HOST) return reply.code(400).send();
            let buffer = imageCache.get(url.href);
            if (!buffer) {
                const response = await axios.get(url.href, { responseType: 'arraybuffer', timeout: 15000 });
                buffer = Buffer.from(response.data);
                for (let index = 0; index < Math.min(100, buffer.length); index++) {
                    buffer[index] ^= IMAGE_KEY[index % IMAGE_KEY.length];
                }
                if (imageCache.size >= 100) imageCache.delete(imageCache.keys().next().value);
                imageCache.set(url.href, buffer);
            }
            return reply.header('Cache-Control', 'private, max-age=3600')
                .header('Access-Control-Allow-Origin', '*').type('image/jpeg').send(buffer);
        });
    },
};
