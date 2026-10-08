import * as cheerio from 'cheerio';
import { requestJavday } from '../../settings/javday-credentials.js';
import { allowedAdultMetadata, cleanEpisodeTitle } from './content-filter.js';

const SITE = 'https://javday.app';
const CHANNELS = [
    ['recommend', '推荐'],
    ['new-release', '最近更新'],
    ['aiav', 'AI短剧'],
    ['censored', '有码'],
    ['uncensored-leaked', '无码'],
];

async function page(path) { return cheerio.load((await requestJavday(path)).data); }

function image(value) {
    try {
        const url = new URL(value, SITE);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
}

function cards($) {
    const seen = new Set();
    const result = [];
    $('a.videoBox[href^="/videos/"]').each((_index, node) => {
        const item = $(node);
        const id = (item.attr('href') || '').match(/^\/videos\/([a-zA-Z0-9]+)\/?$/)?.[1];
        const title = item.find('.videoBox-info .title').text().trim();
        if (!id || seen.has(id) || !allowedAdultMetadata(title)) return;
        seen.add(id);
        const style = item.find('.videoBox-cover').attr('style') || '';
        const cover = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/i)?.[1] || '';
        result.push({ vod_id: id, vod_name: title, vod_pic: image(cover), vod_remarks: '' });
    });
    return result;
}

function pagecount($, current) {
    let max = current;
    $('.layui-laypage a[href]').each((_index, node) => {
        const path = $(node).attr('href') || '';
        const number = Number(path.match(/\/page\/(\d+)\//)?.[1]);
        if (Number.isFinite(number)) max = Math.max(max, number);
    });
    return max;
}

function detailInfo($) {
    const title = $('h1.video-title').first().text().trim();
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') || '';
    const category = $('.videoInfo, .video-detail').text().trim();
    if (!allowedAdultMetadata(title, ogTitle, description, category)) return null;
    const episodes = [];
    $('.episode-btn[data-url]').each((_index, node) => {
        const raw = $(node).attr('data-url') || '';
        let url;
        try { url = new URL(raw); } catch { return; }
        if (url.protocol !== 'https:' || !/(^|\.)javday\.homes$/i.test(url.hostname)) return;
        const name = $(node).attr('data-name') || $(node).text().trim();
        if (!allowedAdultMetadata(name || '正片')) return;
        episodes.push({ title: cleanEpisodeTitle(name, `第${episodes.length + 1}集`), url: url.href });
    });
    return { title, description, episodes,
        cover: image($('meta[property="og:image"]').attr('content')) };
}

async function init() { return {}; }

async function home() {
    const $ = await page('/');
    return { class: CHANNELS.map(([type_id, type_name]) => ({ type_id, type_name })), list: cards($) };
}

async function category(request) {
    const id = String(request.body?.id || '');
    const current = Math.max(1, Number(request.body?.page) || 1);
    if (!CHANNELS.some(([key]) => key === id)) return { page: current, pagecount: 1, list: [] };
    if (id === 'recommend' && current > 1) return { page: current, pagecount: 1, list: [] };
    const path = id === 'recommend' ? '/' : `/category/${id}/page/${current}/`;
    const $ = await page(path);
    return { page: current, pagecount: id === 'recommend' ? 1 : pagecount($, current), list: cards($) };
}

async function detail(request) {
    const raw = Array.isArray(request.body?.id) ? request.body.id[0] : request.body?.id;
    const id = String(raw || '');
    if (!/^[a-zA-Z0-9]+$/.test(id)) return { list: [] };
    const info = detailInfo(await page(`/videos/${id}/`));
    if (!info) return { list: [] };
    return { list: [{
        vod_id: id, vod_name: info.title, vod_pic: info.cover,
        vod_content: info.description, vod_remarks: `共${info.episodes.length}段`,
        vod_play_from: 'JAVDAY',
        vod_play_url: info.episodes.map((entry, index) => `${entry.title}$${id}/${index}`).join('#'),
    }] };
}

async function play(request) {
    const match = String(request.body?.id || '').match(/^([a-zA-Z0-9]+)\/(\d+)$/);
    if (!match) return { parse: 0, url: '' };
    const info = detailInfo(await page(`/videos/${match[1]}/`));
    const episode = info?.episodes[Number(match[2])];
    if (!episode) return { parse: 0, url: '' };
    return { parse: 0, url: episode.url, header: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0' } };
}

async function search(request) {
    const keyword = String(request.body?.wd || '').trim();
    const current = Math.max(1, Number(request.body?.page) || 1);
    if (!keyword || !allowedAdultMetadata(keyword)) return { page: current, pagecount: 1, list: [] };
    const $ = await page(`/search/page/${current}/wd/${encodeURIComponent(keyword)}/`);
    return { page: current, pagecount: pagecount($, current), list: cards($) };
}

export default {
    meta: { key: 'javday', name: 'JAVDAY', type: 3, searchable: 1, quickSearch: 1 },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
    },
};
