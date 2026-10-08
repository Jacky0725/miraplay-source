import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { flaggedAdultTerms } from '../src/spider/video/content-filter.js';

const categories = [
    { site: 'JAVDAY', host: 'https://javday.app', id: 'new-release', max: Number(process.env.JAVDAY_PAGE_LIMIT || 3) },
    { site: 'JAVDAY', host: 'https://javday.app', id: 'aiav', max: Number(process.env.JAVDAY_PAGE_LIMIT || 0) },
    { site: 'JAVDAY', host: 'https://javday.app', id: 'censored', max: Number(process.env.JAVDAY_PAGE_LIMIT || 3) },
    { site: 'JAVDAY', host: 'https://javday.app', id: 'uncensored-leaked', max: Number(process.env.JAVDAY_PAGE_LIMIT || 0) },
    { site: '91短剧', host: 'https://91dj66.com', id: 'chengrenduanju', max: Number(process.env.DJ91_PAGE_LIMIT || 0) },
    { site: '91短剧', host: 'https://91dj66.com', id: 'aimogai', max: Number(process.env.DJ91_PAGE_LIMIT || 0) },
    { site: '91短剧', host: 'https://91dj66.com', id: 'guzhuangguofeng', max: Number(process.env.DJ91_PAGE_LIMIT || 0) },
];
const records = new Map();
const entries = new Map();
const coverage = [];
let errors = 0;

async function html(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await axios.get(url, {
                timeout: 20000,
                headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
            });
            return cheerio.load(response.data);
        } catch (error) {
            if (attempt === 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
}

function mark(item, stage, terms) {
    if (!terms.length) return;
    const key = `${item.site}:${item.id}`;
    const record = records.get(key) || {
        site: item.site, id: item.id, categories: new Set(), pages: new Set(),
        stages: new Set(), terms: new Set(),
    };
    record.categories.add(item.category);
    record.pages.add(`${item.category}:${item.page}`);
    record.stages.add(stage);
    for (const term of terms) record.terms.add(term);
    records.set(key, record);
}

function addItem(item) {
    const key = `${item.site}:${item.id}`;
    if (!entries.has(key)) entries.set(key, item);
    mark(item, '列表', flaggedAdultTerms(...item.listText));
}

function pathFor(category, page) {
    if (category.site === 'JAVDAY') return `/category/${category.id}/page/${page}/`;
    return `/more/${category.id}${page > 1 ? `/page/${page}` : ''}`;
}

function totalPages(category, $) {
    if (category.site === '91短剧') return Number($('[data-catalog-pagination]').attr('data-total')) || 1;
    return Math.max(1, ...$('.layui-laypage a[href]').map((_index, node) =>
        Number(($(node).attr('href') || '').match(/\/page\/(\d+)\//)?.[1] || 0)).get());
}

function collect(category, page, $) {
    if (category.site === 'JAVDAY') {
        $('a.videoBox[href^="/videos/"]').each((_index, node) => {
            const item = $(node);
            const id = (item.attr('href') || '').match(/^\/videos\/([a-zA-Z0-9]+)\/?$/)?.[1];
            if (id) addItem({ site: category.site, id, category: category.id, page,
                listText: [item.find('.videoBox-info .title').text().trim()] });
        });
    } else {
        $('a[href^="/detail/"]').each((_index, node) => {
            const item = $(node);
            const id = (item.attr('href') || '').match(/^\/detail\/([a-zA-Z0-9-]+)\/?$/)?.[1];
            const title = item.find('h3').first().text().trim() || item.attr('aria-label') || '';
            const label = item.find('.home-card-meta').text().trim() || item.find('.home-reel-meta').text().trim();
            if (id) addItem({ site: category.site, id, category: category.id, page,
                listText: [title, label] });
        });
    }
}

async function inspectDetail(item) {
    const base = item.site === 'JAVDAY' ? 'https://javday.app' : 'https://91dj66.com';
    const url = item.site === 'JAVDAY' ? `${base}/videos/${item.id}/` : `${base}/detail/${item.id}`;
    const $ = await html(url);
    if (item.site === 'JAVDAY') {
        const info = [
            $('h1.video-title').first().text().trim(),
            $('meta[property="og:title"]').attr('content') || '',
            $('meta[property="og:description"]').attr('content') ||
                $('meta[name="description"]').attr('content') || '',
            $('.videoInfo, .video-detail').text().trim(),
        ];
        mark(item, '详情/播放', flaggedAdultTerms(...info));
        $('.episode-btn[data-url]').each((_index, node) => {
            mark(item, '选集', flaggedAdultTerms($(node).attr('data-name') || $(node).text().trim()));
        });
    } else {
        const info = [
            $('.detail-title').first().text().trim() || $('meta[property="og:title"]').attr('content') || '',
            $('.detail-intro').first().text().trim() || $('meta[name="description"]').attr('content') || '',
            $('.detail-tag, .detail-tags, .detail-meta').text().trim(),
        ];
        mark(item, '详情/播放', flaggedAdultTerms(...info));
        $(`a[href^="/play/${item.id}/"]`).each((_index, node) => {
            mark(item, '选集', flaggedAdultTerms($(node).text().trim()));
        });
    }
}

for (const category of categories) {
    let total = 0;
    let scanned = 0;
    try {
        const first = await html(`${category.host}${pathFor(category, 1)}`);
        total = totalPages(category, first);
        const limit = category.max > 0 ? Math.min(category.max, total) : total;
        collect(category, 1, first);
        scanned = 1;
        for (let page = 2; page <= limit; page++) {
            try {
                collect(category, page, await html(`${category.host}${pathFor(category, page)}`));
                scanned++;
            } catch { errors++; }
        }
    } catch { errors++; }
    coverage.push({ site: category.site, category: category.id, scanned, total });
    process.stdout.write(`${category.site} ${category.id}: ${scanned}/${total} pages\n`);
}

const queue = [...entries.values()];
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
    while (next < queue.length) {
        const item = queue[next++];
        try { await inspectDetail(item); } catch { errors++; }
    }
}));

const outDir = path.resolve('review-output');
await fs.mkdir(outDir, { recursive: true });
const filename = `moderation-review-${new Date().toISOString().slice(0, 10)}.csv`;
const csvPath = path.join(outDir, filename);
const escape = (value) => `"${String(value).replace(/"/g, '""')}"`;
const rows = [['站点', '条目ID', '出现分类', '扫描页码', '触发层级', '触发词'],
    ...[...records.values()].sort((a, b) => a.site.localeCompare(b.site) || a.id.localeCompare(b.id))
        .map((record) => [record.site, record.id, [...record.categories].join('、'),
            [...record.pages].join('、'), [...record.stages].join('、'), [...record.terms].join('、')])];
await fs.writeFile(csvPath, `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`);
const summaryPath = path.join(outDir, 'coverage.json');
await fs.writeFile(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(), coverage, uniqueEntries: entries.size,
    flaggedEntries: records.size, requestErrors: errors,
    note: '仅依据公开页面的文字元数据；未检查视频画面，也未扫描站点后台。',
}, null, 2));
process.stdout.write(`Flagged ${records.size}/${entries.size} entries; request errors: ${errors}\n`);
process.stdout.write(`${csvPath}\n${summaryPath}\n`);
