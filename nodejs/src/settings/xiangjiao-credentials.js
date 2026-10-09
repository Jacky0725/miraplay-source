import axios from 'axios';
import { randomUUID } from 'crypto';

const SITE = 'https://xiangjiaoai.ai';
const DB_PATH = '/settings/xiangjiao';
let database;
let guestSession;
let guestPromise;

export function useXiangjiaoDatabase(db) { database = db; }

export async function savedXiangjiaoSession() {
    if (!database) return null;
    try { return await database.getData(DB_PATH); } catch { return null; }
}

function headers(token = '') {
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
        Origin: SITE,
        Referer: `${SITE}/`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

function message(response, fallback) {
    return response?.data?.error?.message || response?.data?.message || fallback;
}

async function refresh(session) {
    const response = await axios.post(`${SITE}/api/auth/refresh`, {
        refresh_token: session.refresh_token,
    }, { timeout: 15000, headers: headers(), validateStatus: () => true });
    if (response.status !== 200 || !response.data?.data?.access_token) {
        throw new Error(message(response, '登录已失效，请到配置中心重新登录'));
    }
    const updated = { ...session, ...response.data.data };
    if (session.username && database) await database.push(DB_PATH, updated);
    else guestSession = updated;
    return updated;
}

function fresh(session) {
    return session?.access_token && Date.parse(session.expires_at || '') > Date.now() + 30000;
}

async function guest() {
    if (fresh(guestSession)) return guestSession;
    if (guestSession?.refresh_token) {
        try { return await refresh(guestSession); } catch { guestSession = null; }
    }
    if (!guestPromise) {
        guestPromise = axios.post(`${SITE}/api/guest-sessions`, {
            device_id: randomUUID(),
        }, { timeout: 15000, headers: headers() }).then((response) => {
            const session = response.data?.data;
            if (!session?.access_token || !session?.refresh_token) throw new Error('无法创建香蕉短剧游客会话');
            guestSession = session;
            return session;
        }).finally(() => { guestPromise = null; });
    }
    return guestPromise;
}

async function access() {
    const stored = await savedXiangjiaoSession();
    if (stored) return fresh(stored) ? stored : refresh(stored);
    return guest();
}

export async function getXiangjiao(path) {
    const stored = await savedXiangjiaoSession();
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await axios.get(`${SITE}${path}`, {
                timeout: 15000,
                headers: { Accept: 'application/json', ...(fresh(stored) ? { Authorization: `Bearer ${stored.access_token}` } : {}) },
            });
            return response.data?.data;
        } catch (error) {
            if (attempt || ![502, 503, 504].includes(error.response?.status)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
}

export async function playXiangjiao(episodeId) {
    let session = await access();
    const call = (token) => axios.post(`${SITE}/api/playback/sessions`, {
        episode_id: episodeId,
    }, { timeout: 15000, headers: headers(token), validateStatus: () => true });
    let response = await call(session.access_token);
    if (response.status === 401 && session.refresh_token) {
        session = await refresh(session);
        response = await call(session.access_token);
    }
    if (response.status !== 201 || !response.data?.data?.media?.manifest_url) {
        throw new Error(message(response, '无法取得播放地址'));
    }
    return response.data.data.media.manifest_url;
}

export async function loginXiangjiao(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const response = await axios.post(`${SITE}/api/auth/login-or-register`, {
        username: account, password: String(password),
    }, { timeout: 15000, headers: headers(), validateStatus: () => true });
    const session = response.data?.data;
    if (![200, 201].includes(response.status) || !session?.access_token || !session?.refresh_token) {
        throw new Error(message(response, '登录失败'));
    }
    await database.push(DB_PATH, { ...session, username: account, password: String(password) });
    return { username: account };
}

export async function logoutXiangjiao() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
