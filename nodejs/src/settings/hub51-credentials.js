import axios from 'axios';
import CryptoJS from 'crypto-js';

const SITE = 'https://51hub.com';
const API = 'https://api.51dj1.com/api.php';
const DB_PATH = '/settings/hub51';
// Public protocol values from the site's browser JavaScript.
const KEY = CryptoJS.enc.Utf8.parse('2acf7e91e9864673');
const IV = CryptoJS.enc.Utf8.parse('1c29882d3ddfcfd6');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

let database;

export function use51Database(db) {
    database = db;
}

export async function saved51Session() {
    if (!database) return null;
    try { return await database.getData(DB_PATH); } catch { return null; }
}

export async function request51(path, params = {}, token = undefined) {
    const session = token === undefined ? await saved51Session() : null;
    const accessToken = token === undefined ? session?.token : token;
    const body = { ...params };
    if (accessToken) body.token = accessToken;
    const response = await axios.post(`${API}${path}`, new URLSearchParams(body), {
        timeout: 20000,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
            Origin: SITE,
            Referer: `${SITE}/`,
        },
    });
    const envelope = response.data;
    if (Number(envelope?.errcode) !== 0 || typeof envelope?.data !== 'string') {
        throw new Error(`51短剧接口错误: ${envelope?.errcode ?? 'invalid response'}`);
    }
    const json = CryptoJS.AES.decrypt(envelope.data, KEY, {
        iv: IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error('51短剧返回了无法解码的数据');
    const result = JSON.parse(json);
    if (Number(result?.status) !== 1) {
        const message = Number(result?.status) === -1 ? '登录已失效，请到配置中心重新登录' : result?.msg;
        throw new Error(String(message || '51短剧请求失败'));
    }
    return result.data || {};
}

export async function login51(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const stamp = Date.now();
    const data = await request51('/api/account/login', {
        bundleId: 'com.pwa.mater', version: '1.3.2', oauth_type: 'web',
        oauth_id: `miraplay-${stamp}`, language: 'zh', via: 'pwa', token: '',
        trace_id: `miraplay-${stamp}`, username: account, password: String(password),
    }, '');
    const accessToken = typeof data === 'string' ? data : data?.token || data?.access_token || data?.auth_token;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('网站没有返回登录令牌');
    await database.push(DB_PATH, { username: account, token: accessToken, password: String(password) });
    return { username: account };
}

export async function logout51() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
