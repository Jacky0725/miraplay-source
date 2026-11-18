import axios from 'axios';
import { randomUUID } from 'crypto';

const PLAYLIST_LIFETIME = 15 * 60 * 1000;

async function fetchMedia(url, options) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await axios.get(url, options);
        } catch (error) {
            const status = error.response?.status;
            const temporary = status === 408 || status >= 500 ||
                ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code);
            if (attempt > 0 || !temporary || error.response?.headers?.['retry-after']) throw error;
            error.response?.data?.destroy?.();
        }
    }
}

async function compatiblePlaylist(url, request, playlists, headers, options) {
    const { signal, stripWatermarkTag } = options;
    const port = request.server.address?.()?.port || request.server.server.address()?.port ||
        request.raw.socket.localPort;
    if (!port) return url;

    const response = await fetchMedia(url, {
        headers: { ...headers, Accept: 'application/vnd.apple.mpegurl, */*' },
        signal, responseType: 'text', timeout: 8000, maxContentLength: 2 * 1024 * 1024,
    });
    const manifest = response.data.trimStart();
    if (!manifest.startsWith('#EXTM3U')) throw new Error('源站返回了无效的播放清单');
    if (!manifest.includes('#EXTINF:') || manifest.includes('#EXT-X-STREAM-INF:')) return url;

    const manifestUrl = response.request?.res?.responseUrl || url;
    const id = randomUUID();
    const base = `http://127.0.0.1:${port}${request.server.prefix}/hls/${id}`;
    const keyUrls = new Map();
    const segments = [];
    const body = manifest.split(/\r?\n/).filter((line) => !stripWatermarkTag || !line.trimStart().startsWith('#EXT-X-WJ-T:')).map((line) => {
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
            headers, signal, responseType: 'arraybuffer', timeout: 8000, maxContentLength: 64 * 1024,
        });
        if (response.data.length !== 16) throw new Error('源站返回了无效的播放密钥');
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

async function streamSegment(request, reply, url, headers) {
    const range = request.headers.range;
    let response;
    try {
        response = await fetchMedia(url, {
            headers: { ...headers, 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
            responseType: 'stream', timeout: 10000,
            validateStatus: (status) => status === 200 || status === 206 || status === 416,
        });
    } catch (error) {
        error.response?.data?.destroy?.();
        request.log.warn({ upstreamStatus: error.response?.status, networkCode: error.code }, '视频分片请求失败');
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

export function registerHlsProxy(fastify, headers) {
    const playlists = new Map();
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
        return streamSegment(request, reply, url, headers);
    });
    return (url, request, options = {}) => compatiblePlaylist(url, request, playlists, headers, options);
}
