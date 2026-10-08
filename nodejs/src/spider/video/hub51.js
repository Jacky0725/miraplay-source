import axios from 'axios';
import CryptoJS from 'crypto-js';

const SITE = 'https://51hub.com';
const API = 'https://api.51dj1.com/api.php';
// These values are published in the site's browser JavaScript and describe its API format.
const KEY = CryptoJS.enc.Utf8.parse('2acf7e91e9864673');
const IV = CryptoJS.enc.Utf8.parse('1c29882d3ddfcfd6');
const MODULES = [
    ['module:1', '本周精选'],
    ['module:4', '本周更新'],
    ['module:2', '51原创'],
    ['module:3', 'AI成人'],
    ['module:6', 'AI魔改'],
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

async function api(path, params = {}) {
    const response = await axios.post(`${API}${path}`, new URLSearchParams(params), {
        timeout: 20000,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
            Origin: SITE,
            Referer: `${SITE}/`,
        },
    });
    const envelope = response.data;
    if (Number(envelope?.errcode) !== 0 || typeof envelope?.data !== 'string') {
        throw new Error(`51短剧接口错误: ${envelope?.errcode ?? 'invalid response'}`);
    }
    const json = CryptoJS.AES.decrypt(envelope.data, KEY, {
        iv: IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    const result = JSON.parse(json);
    if (Number(result?.status) !== 1) throw new Error(`51短剧: ${result?.msg || 'request failed'}`);
    return result.data || {};
}

function image(value) {
    if (!value) return '';
    try {
        const url = new URL(String(value), SITE);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (url.origin === SITE && url.pathname.startsWith('/_img/')) return url.href;
        const extension = url.pathname.match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1] || 'jpeg';
        return `${SITE}/_img/${Buffer.from(url.href).toString('base64url')}.${extension}`;
    } catch { return ''; }
}

function card(item) {
    return {
        vod_id: String(item?.video_id || item?.id || ''),
        vod_name: String(item?.title || ''),
        vod_pic: image(item?.cover || item?.cover_img),
        vod_remarks: String(item?.play_count_text || item?.serialize_status_text || ''),
    };
}

function cards(items) {
    return (Array.isArray(items) ? items : []).map(card)
        .filter((item) => /^\d+$/.test(item.vod_id) && item.vod_name);
}

function pages(data, page, limit) {
    return Math.max(page, Math.ceil((Number(data?.total) || 0) / (Number(data?.limit) || limit)));
}

async function init() { return {}; }

async function home() {
    const data = await api('/api/home/homePage');
    const featured = [...(data.top_list || []), ...((data.modules?.list || []).flatMap((module) => module.items || []))];
    const seen = new Set();
    return {
        class: [
            { type_id: 'recommend', type_name: '推荐' },
            ...MODULES.map(([type_id, type_name]) => ({ type_id, type_name })),
            { type_id: 'explore', type_name: '分类' },
        ],
        list: cards(featured).filter((item) => {
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
        const data = await api('/api/home/homePage');
        return { page, pagecount: 1, list: page === 1 ? cards(data.top_list) : [] };
    }
    if (id === 'explore') {
        const data = await api('/api/theater/exploreList', { page, limit: 20 });
        return { page, pagecount: pages(data, page, 20), list: cards(data.list) };
    }
    const moduleId = id.match(/^module:(\d+)$/)?.[1];
    if (!moduleId || !MODULES.some(([key]) => key === id)) {
        return { page, pagecount: 1, list: [] };
    }
    const data = await api('/api/home/recommendDetail', { module_id: moduleId, page, pageSize: 20 });
    return { page, pagecount: pages(data, page, 20), list: cards(data.list) };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const id = String(raw || '');
    if (!/^\d+$/.test(id)) return { list: [] };
    const data = await api('/api/playlet/detail', { video_id: id, id, episode_id: 0, related_limit: 0 });
    const episodes = (Array.isArray(data.episodes) ? data.episodes : [])
        .filter((episode) => /^\d+$/.test(String(episode?.id || '')))
        .sort((a, b) => Number(a.sort) - Number(b.sort));
    return {
        list: [{
            vod_id: id,
            vod_name: String(data.title || ''),
            vod_pic: image(data.cover),
            vod_content: String(data.description || ''),
            vod_remarks: `共${episodes.length}集`,
            vod_play_from: '51短剧',
            vod_play_url: episodes.map((episode) => {
                const title = String(episode.title || `第${episode.sort}集`).replace(/[$#]/g, ' ');
                return `${title}$${id}/${episode.id}`;
            }).join('#'),
        }],
    };
}

async function play(request) {
    const match = String(request.body?.id || '').match(/^(\d+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const data = await api('/api/playlet/play', {
        playlet_id: match[1], video_id: match[1], episode_id: match[2],
    });
    const url = String(data.video_url || '');
    if (!/^https?:\/\//i.test(url)) return { parse: 0, url: '' };
    return { parse: 0, url, header: { Referer: `${SITE}/`, 'User-Agent': UA } };
}

async function search(request) {
    const keyword = String(request.body?.wd || '').trim();
    const page = Math.max(1, Number(request.body?.page) || 1);
    if (!keyword) return { page, pagecount: 1, list: [] };
    const data = await api('/api/search/result', { keyword, tab: 'video', page, limit: 20 });
    return { page, pagecount: pages(data, page, 20), list: cards(data.list) };
}

export default {
    meta: { key: 'hub51', name: '51短剧', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
