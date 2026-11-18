import { createHash } from 'crypto';
import { fetchMedia } from './hls-proxy.js';

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_AGE = 24 * 60 * 60;

export function imageType(buffer) {
    if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
    if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'image/gif';
    return '';
}

function eligible(url, hosts) {
    return url.protocol === 'https:' && hosts.has(url.hostname) && !url.port && !url.username && !url.password;
}

export function proxyCoverUrl(value, request, hosts, route = '/image') {
    if (!value) return '';
    const url = new URL(value);
    if (!eligible(url, hosts)) return url.href;
    const port = request.server.address?.()?.port || request.server.server?.address()?.port ||
        request.raw.socket.localPort;
    if (!port) return url.href;
    const encoded = Buffer.from(url.href).toString('base64url');
    return `http://127.0.0.1:${port}${request.server.prefix}${route}?url=${encoded}`;
}

export async function fetchCover(url, headers, timeout = 8000) {
    const result = await fetchMedia(url, {
        headers, responseType: 'arraybuffer', timeout, maxContentLength: 5 * 1024 * 1024, maxRedirects: 0,
    });
    return Buffer.from(result.data);
}

export function registerCoverProxy(fastify, { hosts, route = '/image', loadCover }) {
    const cache = new Map();
    const pending = new Map();
    let totalBytes = 0;

    function forget(key) {
        totalBytes -= cache.get(key).buffer.length;
        cache.delete(key);
    }

    async function load(url) {
        const cached = cache.get(url);
        if (cached?.expiresAt > Date.now()) return cached;
        if (cached) forget(url);
        if (pending.has(url)) return pending.get(url);

        const task = (async () => {
            const buffer = await loadCover(url);
            const type = imageType(buffer);
            if (!type) throw new Error('无效的封面图片');
            while (totalBytes + buffer.length > MAX_BYTES) forget(cache.keys().next().value);

            const etag = '"' + createHash('sha256').update(buffer).digest('hex') + '"';
            const image = { buffer, type, etag, expiresAt: Date.now() + MAX_AGE * 1000 };
            cache.set(url, image);
            totalBytes += buffer.length;
            return image;
        })().finally(() => pending.delete(url));
        pending.set(url, task);
        return task;
    }

    fastify.get(route, async (request, reply) => {
        let url;
        try { url = new URL(Buffer.from(String(request.query?.url || ''), 'base64url').toString('utf8')); }
        catch { return reply.code(400).send(); }
        if (!eligible(url, hosts)) return reply.code(400).send();

        let image;
        try { image = await load(url.href); }
        catch { return reply.code(502).send(); }
        reply.header('Cache-Control', `public, max-age=${MAX_AGE}`)
            .header('Access-Control-Allow-Origin', '*').header('ETag', image.etag);
        if (request.headers['if-none-match'] === image.etag) return reply.code(304).send();
        return reply.type(image.type).send(image.buffer);
    });
}
