import axios from 'axios';
import { createDecipheriv } from 'crypto';
import { requestYeguodj } from '../../settings/yeguodj-credentials.js';

const MODULES = [
    ['module:3', '野果原创短剧'],
    ['module:1', '热门精选短剧'],
    ['module:6', '都市情感剧场'],
    ['module:4', '逆袭重生佳作'],
    ['module:5', '古装穿越精选'],
];
const EXCLUDED = /未成年|小学生|初中|高中|学生|校园|师生|学姐|学妹|少女|萝莉|幼女|正太|继女|继子|女儿|儿子|妹妹|弟弟|妈妈|母子|乱伦|强制|强迫|监禁|凌辱|人兽|换脸/;
const IMAGE_HOSTS = new Set(['pic.wlwvch.cn', 'imgpublic.ycomesc.live']);
const MEDIA_KEY = Buffer.from('f5d965df75336270');
const MEDIA_IV = Buffer.from('97b60394abc2fbe1');
const imageCache = new Map();
const imageInflight = new Map();

function allowed(item) {
    const text = [item?.title, item?.intro, item?.description, item?.video_title, item?.drama_name,
        ...(Array.isArray(item?.tags) ? item.tags.map((tag) => typeof tag === 'string' ? tag : tag?.name) : [])]
        .filter(Boolean).join(' ');
    return !!item && !EXCLUDED.test(text);
}

function image(value, request) {
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (!IMAGE_HOSTS.has(url.hostname)) return url.href;
        const encoded = Buffer.from(url.href).toString('base64url');
        return `http://127.0.0.1:${request.server.address().port}/spider/yeguodj/3/image/${encoded}`;
    } catch { return ''; }
}

function card(item, request) {
    if (!allowed(item)) return null;
    const id = String(item?.video_id || item?.id || '');
    if (!/^\d+$/.test(id)) return null;
    return {
        vod_id: id, vod_name: String(item.title || ''),
        vod_pic: image(item.cover, request),
        vod_remarks: String(item.play_count_text || item.serialize_status_text || ''),
    };
}

function cards(items, request) {
    return (Array.isArray(items) ? items : []).map((item) => card(item, request)).filter(Boolean);
}
function imageType(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return '';
}

async function decodedImage(url) {
    if (imageCache.has(url)) return imageCache.get(url);
    if (imageInflight.has(url)) return imageInflight.get(url);
    const job = (async () => {
        const response = await axios.get(url, {
            responseType: 'arraybuffer', timeout: 15000, maxContentLength: 5 * 1024 * 1024,
            headers: { Referer: 'https://yeguodj.com/', 'User-Agent': 'Mozilla/5.0' },
        });
        let buffer = Buffer.from(response.data);
        let type = imageType(buffer);
        if (!type) {
            const decipher = createDecipheriv('aes-128-cbc', MEDIA_KEY, MEDIA_IV);
            buffer = Buffer.concat([decipher.update(buffer), decipher.final()]);
            type = imageType(buffer);
        }
        if (!type) throw new Error('封面图片格式无效');
        if (imageCache.size >= 100) imageCache.delete(imageCache.keys().next().value);
        const result = { buffer, type };
        imageCache.set(url, result);
        return result;
    })().finally(() => { imageInflight.delete(url); });
    imageInflight.set(url, job);
    return job;
}
function pagecount(data, page, limit) {
    return Math.max(page, Math.ceil((Number(data?.total) || 0) / (Number(data?.limit) || limit)));
}

async function init() { return {}; }

async function home(request) {
    const data = await requestYeguodj('/api/home/homePage');
    const featured = [...(data.top_list || []), ...(data.modules?.list || [])
        .filter((module) => MODULES.some(([id]) => id === `module:${module.id}`))
        .flatMap((module) => module.items || [])];
    const seen = new Set();
    return {
        class: [{ type_id: 'recommend', type_name: '推荐' },
            ...MODULES.map(([type_id, type_name]) => ({ type_id, type_name })),
            { type_id: 'explore', type_name: '分类' }],
        list: cards(featured, request).filter((item) => {
            if (seen.has(item.vod_id)) return false;
            seen.add(item.vod_id);
            return true;
        }),
    };
}

async function category(request) {
    const id = String(request.body?.id || '');
    const page = Math.max(1, Number(request.body?.page) || 1);
    if (id === 'recommend') {
        const data = await requestYeguodj('/api/home/homePage');
        return { page, pagecount: 1, list: page === 1 ? cards(data.top_list, request) : [] };
    }
    if (id === 'explore') {
        const data = await requestYeguodj('/api/theater/exploreList', { page, limit: 20 });
        return { page, pagecount: pagecount(data, page, 20), list: cards(data.list, request) };
    }
    const moduleId = id.match(/^module:(\d+)$/)?.[1];
    if (!moduleId || !MODULES.some(([key]) => key === id)) return { page, pagecount: 1, list: [] };
    const data = await requestYeguodj('/api/home/recommendDetail', {
        module_id: moduleId, page, pageSize: 20,
    });
    return { page, pagecount: pagecount(data, page, 20), list: cards(data.list, request) };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const id = String(raw || '');
    if (!/^\d+$/.test(id)) return { list: [] };
    const data = await requestYeguodj('/api/playlet/detail', {
        video_id: id, id, episode_id: 0, related_limit: 0,
    });
    if (!allowed(data)) return { list: [] };
    const episodes = (Array.isArray(data.episodes) ? data.episodes : [])
        .filter((episode) => /^\d+$/.test(String(episode?.id || '')))
        .sort((a, b) => Number(a.sort) - Number(b.sort));
    return { list: [{
        vod_id: id, vod_name: String(data.title || ''), vod_pic: image(data.cover, request),
        vod_content: `共${episodes.length}集`, vod_remarks: `共${episodes.length}集`,
        vod_play_from: '野果短剧',
        vod_play_url: episodes.map((episode) => {
            const title = String(episode.title || `第${episode.sort}集`).replace(/[$#]/g, ' ');
            return `${title}$${id}/${episode.id}`;
        }).join('#'),
    }] };
}

async function play(request) {
    const match = String(request.body?.id || '').match(/^(\d+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const detail = await requestYeguodj('/api/playlet/detail', {
        video_id: match[1], id: match[1], episode_id: 0, related_limit: 0,
    });
    if (!allowed(detail) || !(detail.episodes || []).some((episode) => String(episode.id) === match[2])) {
        return { parse: 0, url: '' };
    }
    const data = await requestYeguodj('/api/playlet/play', {
        playlet_id: match[1], video_id: match[1], episode_id: match[2],
    });
    const url = String(data.video_url || '');
    if (!/^https?:\/\//i.test(url)) return { parse: 0, url: '' };
    return { parse: 0, url, header: { Referer: 'https://yeguodj.com/', 'User-Agent': 'Mozilla/5.0' } };
}

async function search(request) {
    const keyword = String(request.body?.wd || '').trim();
    const page = Math.max(1, Number(request.body?.page) || 1);
    if (!keyword || EXCLUDED.test(keyword)) return { page, pagecount: 1, list: [] };
    const data = await requestYeguodj('/api/search/result', {
        keyword, tab: 'video', page, limit: 20,
    });
    return { page, pagecount: pagecount(data, page, 20), list: cards(data.list, request) };
}

export default {
    meta: { key: 'yeguodj', name: '野果短剧', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/image/:encoded', async (request, reply) => {
            let url;
            try { url = new URL(Buffer.from(request.params.encoded, 'base64url').toString('utf8')); }
            catch { return reply.code(400).send(); }
            if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) return reply.code(400).send();
            try {
                const { buffer, type } = await decodedImage(url.href);
                return reply.header('Cache-Control', 'private, max-age=3600')
                    .header('Access-Control-Allow-Origin', '*').type(type).send(buffer);
            } catch { return reply.code(502).send(); }
        });
    },
};
