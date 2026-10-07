import axios from 'axios';
import CryptoJS from 'crypto-js';

const SITE = 'https://chengguodj.com';
const API = 'https://api2.chengguodj.com';
const DB_PATH = '/settings/chengguodj';
// These are public values shipped in the website's JavaScript, not user secrets.
const CRYPT_KEY = '2acf7e91e9864673';
const CRYPT_IV = '1c29882d3ddfcfd6';

let database;

export function useCredentialsDatabase(db) {
    database = db;
}

export async function savedSession() {
    if (!database) return null;
    try {
        return await database.getData(DB_PATH);
    } catch {
        return null;
    }
}

function decodePacket(packet) {
    if (typeof packet?.success === 'boolean') {
        return { status: packet.success ? 1 : 0, data: packet.data, msg: packet.error?.message || packet.message };
    }
    if (typeof packet?.data === 'string') {
        const value = CryptoJS.AES.decrypt(packet.data.replace(/ /g, '+'),
            CryptoJS.enc.Utf8.parse(CRYPT_KEY), {
                iv: CryptoJS.enc.Utf8.parse(CRYPT_IV),
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            }).toString(CryptoJS.enc.Utf8);
        if (!value) throw new Error('网站返回了无法解码的登录响应');
        return decodePacket(JSON.parse(value));
    }
    return packet;
}

export async function loginChengguodj(username, password) {
    if (!database) throw new Error('本机配置存储尚未初始化');
    const account = String(username || '').trim();
    if (!account || !password) throw new Error('请输入用户名和密码');
    const response = await axios.post(`${API}/api/v1/auth/login`, {
        bundleId: 'com.pwa.mater', version: '1.3.2', oauth_type: 'web',
        oauth_id: `miraplay-${Date.now()}`, language: 'zh', via: 'pwa',
        token: '', trace_id: `miraplay-${Date.now()}`,
        username: account, password: String(password),
    }, {
        timeout: 15000,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json', Origin: SITE, Referer: `${SITE}/` },
    });
    const result = decodePacket(response.data);
    const token = result?.data?.token;
    if (Number(result?.status) !== 1 || typeof token !== 'string' || !token) {
        throw new Error(String(result?.msg || '登录失败'));
    }
    await database.push(DB_PATH, { username: account, token, password: String(password) });
    return { username: account };
}

export async function logoutChengguodj() {
    if (!database) return;
    try { await database.delete(DB_PATH); } catch { /* already signed out */ }
}
