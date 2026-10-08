import axios from 'axios';
import * as cheerio from 'cheerio';

const SITE = 'https://javday.app';
const DB_PATH = '/settings/javday';
let database;

export function useJavdayDatabase(db) { database = db; }

export async function savedJavdaySession() {
    if (!database) return null;
    try { return await database.getData(DB_PATH); } catch { return null; }
}

export async function requestJavday(path) {
    const session = await savedJavdaySession();
    return axios.get(new URL(path, SITE).href, {
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: `${SITE}/`,
            Accept: 'text/html',
            ...(session?.cookie ? { Cookie: session.cookie } : {}),
        },
    });
}

export async function loginJavday(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const loginPage = await axios.get(`${SITE}/user/login/`, {
        timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${SITE}/` },
    });
    const $ = cheerio.load(loginPage.data);
    if ($('#verify').length) throw new Error('网站要求验证码，请先在网站登录；当前配置中心无法完成验证码');
    const initialCookies = (loginPage.headers['set-cookie'] || []).map((value) => value.split(';')[0]);
    const response = await axios.post(`${SITE}/user/login/`, new URLSearchParams({
        user_name: account, user_pwd: String(password),
    }), {
        timeout: 20000,
        validateStatus: () => true,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0',
            'X-Requested-With': 'XMLHttpRequest',
            Origin: SITE,
            Referer: `${SITE}/user/login/`,
            ...(initialCookies.length ? { Cookie: initialCookies.join('; ') } : {}),
        },
    });
    if (response.status !== 200 || Number(response.data?.code) !== 1) {
        throw new Error(String(response.data?.msg || '登录失败'));
    }
    const cookieMap = new Map();
    for (const value of [...initialCookies, ...(response.headers['set-cookie'] || []).map((x) => x.split(';')[0])]) {
        const cut = value.indexOf('=');
        if (cut > 0) cookieMap.set(value.slice(0, cut), value.slice(cut + 1));
    }
    if (!cookieMap.size) throw new Error('网站未返回可保存的登录会话');
    const cookie = [...cookieMap].map(([key, value]) => `${key}=${value}`).join('; ');
    await database.push(DB_PATH, { username: account, password: String(password), cookie });
    return { username: account };
}

export async function logoutJavday() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
