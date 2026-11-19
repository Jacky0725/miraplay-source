import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'hls-parser';
import mux from 'mux.js';
import { fetchMedia } from './hls-proxy.js';

const LINK_LIFETIME = 60 * 60 * 1000;
const FILE_LIFETIME = 10 * 60 * 1000;
const MAX_BYTES = 384 * 1024 * 1024;

async function discard(file) {
    await unlink(file.path).catch(() => {});
    await rmdir(file.dir).catch(() => {});
}

function mediaUrl(value, base) {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('无效的下载资源地址');
    return url.href;
}

async function createMp4(getUrl, headers, signal) {
    const url = mediaUrl(await getUrl());
    const response = await fetchMedia(url, {
        headers, signal, responseType: 'text', timeout: 10000, maxContentLength: 2 * 1024 * 1024,
    });
    const manifest = response.data.trimStart();
    if (!manifest.startsWith('#EXTM3U')) throw new Error('源站返回了无效的下载清单');
    const playlist = parse(manifest);
    if (!playlist.endlist || !playlist.segments?.length || playlist.segments.some((segment) =>
        segment.map || segment.byterange || segment.discontinuity || !segment.uri)) {
        throw new Error('当前剧集的播放清单无法打包为 MP4');
    }

    const base = response.request?.res?.responseUrl || url;
    const keys = new Map();
    const getBytes = async (uri, maxContentLength) => {
        const result = await fetchMedia(uri, { headers, signal, responseType: 'arraybuffer', timeout: 12000, maxContentLength });
        return Buffer.from(result.data);
    };

    const dir = await mkdtemp(join(tmpdir(), 'miraplay-chengguo-'));
    const path = join(dir, 'episode.mp4');
    let size = 0;
    const hash = createHash('sha256');
    try {
        const file = await open(path, 'wx');
        try {
            const transmuxer = new mux.mp4.Transmuxer();
            let output;
            transmuxer.on('data', (fragment) => { output = fragment; });
            const readSegment = async (segment) => {
                const key = segment.key;
                const segmentUrl = mediaUrl(segment.uri, base);
                if (!key || key.method === 'NONE') return getBytes(segmentUrl, 16 * 1024 * 1024);
                if (key.method !== 'AES-128' || (key.format && key.format !== 'identity')) {
                    throw new Error('当前剧集的加密格式不支持 MP4 下载');
                }
                const keyUrl = mediaUrl(key.uri, base);
                if (!keys.has(keyUrl)) keys.set(keyUrl, getBytes(keyUrl, 64 * 1024));
                const [bytes, secret] = await Promise.all([
                    getBytes(segmentUrl, 16 * 1024 * 1024), keys.get(keyUrl),
                ]);
                if (secret.length !== 16) throw new Error('源站返回了无效的播放密钥');
                const iv = key.iv ? Buffer.from(key.iv) : Buffer.alloc(16);
                if (!key.iv) iv.writeBigUInt64BE(BigInt(segment.mediaSequenceNumber), 8);
                const decipher = createDecipheriv('aes-128-cbc', secret, iv);
                return Buffer.concat([decipher.update(bytes), decipher.final()]);
            };
            for (let offset = 0; offset < playlist.segments.length; offset += 3) {
                const batch = await Promise.all(playlist.segments.slice(offset, offset + 3).map(readSegment));
                for (const bytes of batch) {
                    output = null;
                    transmuxer.push(bytes);
                    transmuxer.flush();
                    if (!output?.data?.length) throw new Error('无法封装此剧集的视频分片');
                    const parts = size ? [output.data] : [output.initSegment, output.data];
                    for (const part of parts) {
                        size += part.length;
                        if (size > MAX_BYTES) throw new Error('此剧集超出本机 MP4 打包容量');
                        hash.update(part);
                        await file.writeFile(part);
                    }
                }
            }
        } finally {
            await file.close();
        }
        return { dir, path, size, etag: `"${hash.digest('hex')}"` };
    } catch (error) {
        await discard({ dir, path });
        throw error;
    }
}

function byteRange(value, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || !(match[1] || match[2])) return null;
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : null;
}

export function registerChengguodjDownloads(fastify, headers) {
    const tickets = new Map();
    let busy = 0;
    const prepare = async (entry) => {
        const signal = entry.controller.signal;
        const timer = setTimeout(() => entry.controller.abort(), 180000);
        timer.unref?.();
        try {
            try { return await createMp4(entry.getUrl, headers, signal); }
            catch (error) {
                if (![502, 503, 504].includes(error.response?.status) || error.response?.headers?.['retry-after']) throw error;
                return await createMp4(entry.getUrl, headers, signal);
            }
        } finally {
            clearTimeout(timer);
        }
    };

    fastify.addHook('onClose', async () => {
        await Promise.all([...tickets.values()].map(async (entry) => {
            clearTimeout(entry.timer);
            entry.controller?.abort();
            await entry.pending?.catch(() => {});
            clearTimeout(entry.timer);
            if (entry.file) await discard(entry.file);
        }));
    });

    fastify.route({
        method: ['GET', 'HEAD'],
        url: '/download/:ticket/episode.mp4',
        exposeHeadRoute: false,
        handler: async (request, reply) => {
            const entry = tickets.get(request.params.ticket);
            if (!entry || entry.expires <= Date.now()) return reply.code(404).send();
            if (!entry.file) {
                const stored = [...tickets.values()].filter((item) => item.file).length;
                if (!entry.pending && (busy >= 2 || stored + busy >= 3)) return reply.code(503).header('Retry-After', '5').send();
                if (!entry.pending) {
                    busy++;
                    entry.controller = new AbortController();
                    entry.pending = prepare(entry).then((file) => {
                        entry.file = file;
                        const expire = () => {
                            if (entry.readers) {
                                entry.timer = setTimeout(expire, 60000);
                                entry.timer.unref?.();
                                return;
                            }
                            entry.file = null;
                            void discard(file);
                        };
                        entry.timer = setTimeout(expire, FILE_LIFETIME);
                        entry.timer.unref?.();
                    }).finally(() => { entry.pending = null; busy--; });
                }
                try { await entry.pending; }
                catch (error) {
                    request.log.warn({ upstreamStatus: error.response?.status, networkCode: error.code }, '橙果 MP4 打包失败');
                    return reply.code(502).send({ message: '橙果短剧暂时无法打包此集，请重新下载' });
                }
            }
            const { path, size, etag } = entry.file;
            reply.type('video/mp4').header('Accept-Ranges', 'bytes')
                .header('Cache-Control', 'private, no-store')
                .header('ETag', etag)
                .header('Content-Disposition', `attachment; filename="${entry.episode.replace('/', '-')}.mp4"`);
            let range;
            if (request.headers.range && (!request.headers['if-range'] || request.headers['if-range'] === etag)) {
                range = byteRange(request.headers.range, size);
                if (!range) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
                reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
            }
            reply.header('Content-Length', range ? range.end - range.start + 1 : size);
            if (request.method === 'HEAD') return reply.send();
            const stream = createReadStream(path, range);
            entry.readers = (entry.readers || 0) + 1;
            stream.once('close', () => { entry.readers--; });
            return reply.send(stream);
        },
    });

    return (episode, getUrl, request) => {
        const port = request.server.address?.()?.port || request.server.server.address()?.port || request.raw.socket.localPort;
        if (!port) return '';
        const now = Date.now();
        for (const [ticket, entry] of tickets) {
            if (entry.expires <= now && !entry.file && !entry.pending) tickets.delete(ticket);
        }
        const ticket = randomUUID();
        tickets.set(ticket, { episode, getUrl, expires: now + LINK_LIFETIME });
        return `http://127.0.0.1:${port}${request.server.prefix}/download/${ticket}/episode.mp4`;
    };
}
