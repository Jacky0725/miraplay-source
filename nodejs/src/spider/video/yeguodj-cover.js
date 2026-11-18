import axios from 'axios';
import { createDecipheriv } from 'crypto';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { ENCRYPTED_HOSTS, PLAIN_HOST, publicCover } from './cover-url.js';
import { imageType } from './cover-proxy.js';

export const YEGUODJ_COVER_HOSTS = new Set([PLAIN_HOST, ...ENCRYPTED_HOSTS]);
const SITE = 'https://yeguodj.com';
const MAX_EDGE = 480;
// Public parameters used by the site's own image decoder.
const MEDIA_KEY = Buffer.from('f5d965df75336270');
const MEDIA_IV = Buffer.from('97b60394abc2fbe1');

async function download(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer', timeout: 4500, maxContentLength: 5 * 1024 * 1024, maxRedirects: 0,
        headers: { Referer: `${SITE}/`, 'User-Agent': 'Mozilla/5.0' },
    });
    return Buffer.from(response.data);
}

async function originalCover(url) {
    const publicUrl = publicCover(url, SITE);
    try {
        const buffer = await download(publicUrl);
        if (!imageType(buffer)) throw new Error('无效的野果公开封面');
        return buffer;
    } catch (error) {
        if (publicUrl === url) throw error;
        const buffer = await download(url);
        if (imageType(buffer)) return buffer;
        const decipher = createDecipheriv('aes-128-cbc', MEDIA_KEY, MEDIA_IV);
        return Buffer.concat([decipher.update(buffer), decipher.final()]);
    }
}

export async function loadYeguodjCover(url) {
    const original = await originalCover(url);
    if (original.length <= 96 * 1024) return original;
    const type = imageType(original);
    try {
        let source;
        if (type === 'image/png' && original.length >= 24 &&
            original.readUInt32BE(16) * original.readUInt32BE(20) <= 8_000_000) {
            source = PNG.sync.read(original);
        } else if (type === 'image/jpeg') {
            source = jpeg.decode(original, { maxResolutionInMP: 8, maxMemoryUsageInMB: 48 });
        }
        if (!source) return original;

        const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));
        const data = Buffer.alloc(width * height * 4, 255);
        for (let y = 0; y < height; y++) {
            const sy = Math.floor((y + 0.5) * source.height / height);
            for (let x = 0; x < width; x++) {
                const sx = Math.floor((x + 0.5) * source.width / width);
                const i = (sy * source.width + sx) * 4;
                const j = (y * width + x) * 4;
                const alpha = source.data[i + 3] / 255;
                for (let channel = 0; channel < 3; channel++) {
                    data[j + channel] = Math.round(source.data[i + channel] * alpha + 255 * (1 - alpha));
                }
            }
        }
        const result = jpeg.encode({ width, height, data }, 78).data;
        return result.length < original.length ? result : original;
    } catch {
        return original;
    }
}
