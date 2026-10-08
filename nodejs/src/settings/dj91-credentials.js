import axios from 'axios';
import { randomBytes } from 'crypto';

const SITE = 'https://91dj66.com';
const DB_PATH = '/settings/dj91';
let database;

export function use91Database(db) { database = db; }

export async function saved91Session() {
    if (!database) return null;
    try { return await database.getData(DB_PATH); } catch { return null; }
}

export async function request91(path, options = {}) {
    const session = await saved91Session();
    return axios({
        url: new URL(path, SITE).href,
        method: options.method || 'GET',
        data: options.data,
        timeout: 20000,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: `${SITE}/`,
            Accept: options.accept || 'text/html,application/json',
            ...(session?.cookie ? { Cookie: session.cookie } : {}),
            ...(options.data ? { 'Content-Type': 'application/json' } : {}),
        },
    });
}

export async function login91(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const devID = `${randomBytes(8).toString('hex')}${Date.now()}`;
    const response = await axios.post(`${SITE}/api/auth/login`, {
        account, password: String(password), devID, channel: '',
    }, {
        timeout: 20000,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: `${SITE}/` },
    });
    if (response.status !== 200 || Number(response.data?.code) !== 200 || !response.data?.data?.token) {
        throw new Error(String(response.data?.tip || response.data?.msg || '登录失败'));
    }
    const token = String(response.data.data.token);
    const setCookies = (response.headers['set-cookie'] || []).map((value) => value.split(';')[0]);
    const cookie = [...setCookies.filter((value) => !value.startsWith('token=')),
        `token=${encodeURIComponent(token)}`].join('; ');
    await database.push(DB_PATH, { username: account, password: String(password), cookie });
    return { username: account };
}

export async function logout91() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
