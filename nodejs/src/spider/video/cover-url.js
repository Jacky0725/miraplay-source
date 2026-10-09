const PLAIN_HOST = 'imgpublic.ycomesc.live';
const ENCRYPTED_HOSTS = new Set(['pic.wlwvch.cn', 'pic.wvxrrip.cn']);

export function publicCover(value, base) {
    if (!value) return '';
    try {
        const url = new URL(String(value), base);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        if (ENCRYPTED_HOSTS.has(url.hostname)) url.hostname = PLAIN_HOST;
        return url.href;
    } catch { return ''; }
}
