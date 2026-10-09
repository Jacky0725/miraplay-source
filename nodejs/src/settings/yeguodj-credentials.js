import axios from 'axios';
import CryptoJS from 'crypto-js';

const SITE = 'https://yeguodj.com';
const API = 'https://www.yeguodj.com/api.php';
const DB_PATH = '/settings/yeguodj';
const KEY = CryptoJS.enc.Utf8.parse('2acf7e91e9864673');
const IV = CryptoJS.enc.Utf8.parse('1c29882d3ddfcfd6');
let database;

export function useYeguodjDatabase(db) { database = db; }

export async function savedYeguodjSession() {
    if (!database) return null;
    try { return await database.getData(DB_PATH); } catch { return null; }
}

export async function requestYeguodj(path, params = {}, token = undefined) {
    const session = token === undefined ? await savedYeguodjSession() : null;
    const body = { ...params };
    const accessToken = token === undefined ? session?.token : token;
    if (accessToken) body.token = accessToken;
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            response = await axios.post(`${API}${path}`, new URLSearchParams(body), {
                timeout: 20000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Origin: SITE,
                    Referer: `${SITE}/`,
                    'User-Agent': 'Mozilla/5.0',
                },
            });
            break;
        } catch (error) {
            if (attempt || !/^\/api\/(?:home\/|theater\/|search\/)/.test(path) ||
                ![502, 503, 504].includes(error.response?.status)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    const packet = response.data;
    if (Number(packet?.errcode) !== 0 || typeof packet?.data !== 'string') {
        throw new Error(`野果短剧接口错误: ${packet?.errcode ?? 'invalid response'}`);
    }
    const json = CryptoJS.AES.decrypt(packet.data, KEY, {
        iv: IV, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
    if (!json) throw new Error('野果短剧返回了无法解码的数据');
    const result = JSON.parse(json);
    if (Number(result?.status) !== 1) {
        const message = Number(result?.status) === -1 ? '登录已失效，请到配置中心重新登录' : result?.msg;
        throw new Error(String(message || '野果短剧请求失败'));
    }
    return result.data || {};
}

export async function loginYeguodj(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const stamp = Date.now();
    const data = await requestYeguodj('/api/account/login', {
        bundleId: 'com.pwa.mater', version: '1.3.2', oauth_type: 'web',
        oauth_id: `miraplay-${stamp}`, language: 'zh', via: 'pwa', token: '',
        trace_id: `miraplay-${stamp}`, username: account, password: String(password),
    }, '');
    const accessToken = typeof data === 'string' ? data : data?.token || data?.access_token || data?.auth_token;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('网站没有返回登录令牌');
    await database.push(DB_PATH, { username: account, token: accessToken, password: String(password) });
    return { username: account };
}

export async function logoutYeguodj() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
