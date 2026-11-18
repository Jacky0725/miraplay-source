import { requestYeguodj } from '../../settings/yeguodj-credentials.js';
import { proxyCoverUrl, registerCoverProxy } from './cover-proxy.js';
import { registerHlsProxy } from './hls-proxy.js';
import { loadYeguodjCover, YEGUODJ_COVER_HOSTS } from './yeguodj-cover.js';

const SITE = 'https://yeguodj.com';
const PLAY_HEADERS = { Referer: SITE + '/', 'User-Agent': 'Mozilla/5.0' };
const COVER_ROUTE = '/thumbnail';

const MODULES = [
    ['module:3', '野果原创短剧'],
    ['module:1', '热门精选短剧'],
    ['module:6', '都市情感剧场'],
    ['module:4', '逆袭重生佳作'],
    ['module:5', '古装穿越精选'],
];
const EXCLUDED = /未成年|小学生|初中|高中|学生|校园|师生|学姐|学妹|少女|萝莉|幼女|正太|继女|继子|女儿|儿子|妹妹|弟弟|妈妈|母子|乱伦|强制|强迫|监禁|凌辱|人兽|换脸/;

function allowed(item) {
    const text = [item?.title, item?.intro, item?.description, item?.video_title, item?.drama_name,
        ...(Array.isArray(item?.tags) ? item.tags.map((tag) => typeof tag === 'string' ? tag : tag?.name) : [])]
        .filter(Boolean).join(' ');
    return !!item && !EXCLUDED.test(text);
}

function image(value, request) {
    if (!value) return '';
    try {
        const url = new URL(value, SITE);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (YEGUODJ_COVER_HOSTS.has(url.hostname)) url.protocol = 'https:';
        return proxyCoverUrl(url, request, YEGUODJ_COVER_HOSTS, COVER_ROUTE);
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
        vod_play_from: '野果短剧$$$原站直连',
        vod_play_url: ['', 'direct:'].map((prefix) => episodes.map((episode) => {
            const title = String(episode.title || `第${episode.sort}集`).replace(/[$#]/g, ' ');
            return `${title}$${prefix}${id}/${episode.id}`;
        }).join('#')).join('$$$'),
    }] };
}

async function playbackUrl(playletId, episodeId) {
    const data = await requestYeguodj('/api/playlet/play', {
        playlet_id: playletId, video_id: playletId, episode_id: episodeId,
    });
    if (data.access?.can_play === false) {
        throw Object.assign(new Error('野果短剧未授权播放该集，请检查登录或该集的观看权限'), { statusCode: 403 });
    }
    const url = [data.video_url, data.video_url_h265].find((value) => {
        if (typeof value !== 'string') return false;
        try { return ['https:', 'http:'].includes(new URL(value).protocol); }
        catch { return false; }
    })?.trim();
    if (!url) throw Object.assign(new Error('野果短剧源站未返回播放地址'), { statusCode: 502 });
    return url;
}

async function play(request, proxyHls) {
    const match = String(request.body?.id || '').match(/^(direct:)?(\d+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const [, direct, playletId, episodeId] = match;
    const detail = await requestYeguodj('/api/playlet/detail', {
        video_id: playletId, id: playletId, episode_id: 0, related_limit: 0,
    });
    if (!allowed(detail) || !Array.isArray(detail.episodes) ||
        !detail.episodes.some((episode) => String(episode.id) === episodeId)) {
        return { parse: 0, url: '' };
    }
    const url = await playbackUrl(playletId, episodeId);
    if (!direct && new URL(url).pathname.toLowerCase().endsWith('.m3u8')) {
        const compatible = await proxyHls(url, request, { refreshUrl: () => playbackUrl(playletId, episodeId) });
        if (compatible !== url) return { parse: 0, url: compatible };
    }
    return { parse: 0, url, header: PLAY_HEADERS };
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
        const proxyHls = registerHlsProxy(fastify, PLAY_HEADERS);
        fastify.post('/play', (request) => play(request, proxyHls));
        fastify.post('/search', search);
        registerCoverProxy(fastify, { hosts: YEGUODJ_COVER_HOSTS, route: COVER_ROUTE, loadCover: loadYeguodjCover });
    },
};
