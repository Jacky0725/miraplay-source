import { randomBytes, timingSafeEqual } from 'crypto';
import {
    loginChengguodj, logoutChengguodj, savedSession, useCredentialsDatabase,
} from '../../settings/credentials.js';
import { login51, logout51, saved51Session, use51Database } from '../../settings/hub51-credentials.js';
import {
    loginXiangjiao, logoutXiangjiao, savedXiangjiaoSession, useXiangjiaoDatabase,
} from '../../settings/xiangjiao-credentials.js';
import {
    loginYeguodj, logoutYeguodj, savedYeguodjSession, useYeguodjDatabase,
} from '../../settings/yeguodj-credentials.js';
import { loginJavday, logoutJavday, savedJavdaySession, useJavdayDatabase } from '../../settings/javday-credentials.js';
import { login91, logout91, saved91Session, use91Database } from '../../settings/dj91-credentials.js';
import { contentFilterMode, setContentFilterMode, useContentFilterDatabase } from './content-filter.js';

const ENTRY = { vod_id: 'settings', vod_name: '配置中心', vod_pic: '', vod_remarks: '管理网站账号' };
const PATH = '/spider/baseset/3';

function page(secret) {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配置中心</title><style>
body{margin:0;background:#14171c;color:#f4f5f7;font:16px system-ui,-apple-system,sans-serif}
main{max-width:580px;margin:auto;padding:24px}h1{font-size:26px;margin:10px 0 8px}
.muted{color:#aeb8c6;font-size:14px;line-height:1.5}.card{background:#222833;border-radius:16px;padding:20px;margin-top:20px}
label{display:block;margin:14px 0 7px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #455062;
border-radius:9px;background:#151a23;color:white;font-size:16px}button{border:0;border-radius:9px;
padding:11px 17px;margin:17px 8px 0 0;background:#5df2b8;color:#12201b;font-weight:700;font-size:15px}
button.secondary{background:#444f60;color:white}button:disabled{opacity:.6}#message,#message51,#messageXj,#messageYg,#messageJd,#message91,#filterMessage{min-height:22px;white-space:pre-wrap}
</style></head><body><main><h1>配置中心</h1>
<p class="muted">此页面运行在 MiraPlay 本机。按你的设置，密码会在本机明文保存和显示；公开脚本中不包含你的账号、密码或登录令牌。</p>
<section class="card"><h2>橙果短剧</h2><p id="status" class="muted">正在读取状态…</p>
<form id="login"><label for="username">用户名</label><input id="username" autocomplete="username" required>
<label for="password">密码（明文显示）</label><input id="password" type="text" autocomplete="off" required>
<button id="submit" type="submit">登录</button><button id="logout" type="button" class="secondary">退出登录</button></form>
<p id="message" role="status"></p></section>
<section class="card"><h2>51短剧</h2><p id="status51" class="muted">正在读取状态…</p>
<form id="login51"><label for="username51">用户名</label><input id="username51" autocomplete="username" required>
<label for="password51">密码（明文显示）</label><input id="password51" type="text" autocomplete="off" required>
<button id="submit51" type="submit">登录</button><button id="logout51" type="button" class="secondary">退出登录</button></form>
<p id="message51" role="status"></p></section>
<section class="card"><h2>香蕉短剧</h2><p id="statusXj" class="muted">正在读取状态…</p>
<p class="muted">网站使用“登录或注册”入口：输入尚未注册的用户名可能创建新账号。</p>
<form id="loginXj"><label for="usernameXj">用户名</label><input id="usernameXj" autocomplete="username" required>
<label for="passwordXj">密码（明文显示）</label><input id="passwordXj" type="text" autocomplete="off" required>
<button id="submitXj" type="submit">登录或注册</button><button id="logoutXj" type="button" class="secondary">退出登录</button></form>
<p id="messageXj" role="status"></p></section>
<section class="card"><h2>野果短剧</h2><p id="statusYg" class="muted">正在读取状态…</p>
<form id="loginYg"><label for="usernameYg">用户名</label><input id="usernameYg" autocomplete="username" required>
<label for="passwordYg">密码（明文显示）</label><input id="passwordYg" type="text" autocomplete="off" required>
<button id="submitYg" type="submit">登录</button><button id="logoutYg" type="button" class="secondary">退出登录</button></form>
<p id="messageYg" role="status"></p></section>
<section class="card"><h2>JAVDAY</h2><p class="muted">公开内容无需登录，账号配置可选。</p><p id="statusJd" class="muted">正在读取状态…</p>
<form id="loginJd"><label for="usernameJd">用户名</label><input id="usernameJd" autocomplete="username" required>
<label for="passwordJd">密码（明文显示）</label><input id="passwordJd" type="text" autocomplete="off" required>
<button id="submitJd" type="submit">登录</button><button id="logoutJd" type="button" class="secondary">退出登录</button></form>
<p id="messageJd" role="status"></p></section>
<section class="card"><h2>91短剧</h2><p id="status91" class="muted">正在读取状态…</p>
<form id="login91"><label for="username91">用户名</label><input id="username91" autocomplete="username" required>
<label for="password91">密码（明文显示）</label><input id="password91" type="text" autocomplete="off" required>
<button id="submit91" type="submit">登录</button><button id="logout91" type="button" class="secondary">退出登录</button></form>
<p id="message91" role="status"></p></section>
<section class="card"><h2>内容筛选</h2><p class="muted">JAVDAY 和 91短剧可选严格筛选。开启后会额外隐藏含“学生”“校园”“制服”等泛化词的条目；关闭后仍保留明确的未成年人色情及其他高风险内容筛选。</p>
<label><input id="strictFilter" type="checkbox" style="width:auto;margin-right:8px">开启严格筛选</label>
<p id="filterMessage" role="status"></p></section>
<section class="card"><h2>其他影视源</h2><p class="muted">以后新增的站点会作为独立条目出现在同一猫源菜单中，并在此处提供各自的账号配置。</p></section>
</main><script>
const secret=${JSON.stringify(secret)};
const status=document.getElementById('status'),message=document.getElementById('message');
async function refresh(){const r=await fetch('website/api/status',{cache:'no-store',
headers:{'X-Config-Token':secret}});const d=await r.json();
if(!r.ok)throw new Error(d.message||'无法读取状态');
status.textContent=d.loggedIn?'已登录：'+d.username:'未登录';
document.getElementById('username').value=d.username||'';
document.getElementById('password').value=d.password||'';}
async function refresh51(){const r=await fetch('website/api/51/status',{cache:'no-store',
headers:{'X-Config-Token':secret}});const d=await r.json();
if(!r.ok)throw new Error(d.message||'无法读取状态');
document.getElementById('status51').textContent=d.loggedIn?'已登录：'+d.username:'未登录';
document.getElementById('username51').value=d.username||'';
document.getElementById('password51').value=d.password||'';}
async function submit(url,body){message.textContent='处理中…';const r=await fetch(url,{method:'POST',
headers:{'Content-Type':'application/json','X-Config-Token':secret},body:JSON.stringify(body)});
const d=await r.json();message.textContent=d.message||'';await refresh();}
document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();
const button=document.getElementById('submit');button.disabled=true;
try{await submit('website/api/login',{username:document.getElementById('username').value,
password:document.getElementById('password').value});}catch{message.textContent='连接失败，请稍后重试';}
finally{button.disabled=false;}});
document.getElementById('logout').addEventListener('click',async()=>{try{await submit('website/api/logout',{});}catch{
message.textContent='连接失败，请稍后重试';}});refresh().catch(()=>{status.textContent='无法读取状态';});
async function submit51(url,body){const notice=document.getElementById('message51');notice.textContent='处理中…';
const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':secret},
body:JSON.stringify(body)});const d=await r.json();notice.textContent=d.message||'';await refresh51();}
document.getElementById('login51').addEventListener('submit',async e=>{e.preventDefault();
const button=document.getElementById('submit51');button.disabled=true;
try{await submit51('website/api/51/login',{username:document.getElementById('username51').value,
password:document.getElementById('password51').value});}catch{document.getElementById('message51').textContent='连接失败，请稍后重试';}
finally{button.disabled=false;}});
document.getElementById('logout51').addEventListener('click',async()=>{try{await submit51('website/api/51/logout',{});}catch{
document.getElementById('message51').textContent='连接失败，请稍后重试';}});
refresh51().catch(()=>{document.getElementById('status51').textContent='无法读取状态';});
async function refreshXj(){const r=await fetch('website/api/xj/status',{cache:'no-store',
headers:{'X-Config-Token':secret}});const d=await r.json();
if(!r.ok)throw new Error(d.message||'无法读取状态');
document.getElementById('statusXj').textContent=d.loggedIn?'已登录：'+d.username:'未登录（可游客观看）';
document.getElementById('usernameXj').value=d.username||'';
document.getElementById('passwordXj').value=d.password||'';}
async function submitXj(url,body){const notice=document.getElementById('messageXj');notice.textContent='处理中…';
const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':secret},
body:JSON.stringify(body)});const d=await r.json();notice.textContent=d.message||'';await refreshXj();}
document.getElementById('loginXj').addEventListener('submit',async e=>{e.preventDefault();
const button=document.getElementById('submitXj');button.disabled=true;
try{await submitXj('website/api/xj/login',{username:document.getElementById('usernameXj').value,
password:document.getElementById('passwordXj').value});}catch{document.getElementById('messageXj').textContent='连接失败，请稍后重试';}
finally{button.disabled=false;}});
document.getElementById('logoutXj').addEventListener('click',async()=>{try{await submitXj('website/api/xj/logout',{});}catch{
document.getElementById('messageXj').textContent='连接失败，请稍后重试';}});
refreshXj().catch(()=>{document.getElementById('statusXj').textContent='无法读取状态';});
async function refreshYg(){const r=await fetch('website/api/yg/status',{cache:'no-store',
headers:{'X-Config-Token':secret}});const d=await r.json();
if(!r.ok)throw new Error(d.message||'无法读取状态');
document.getElementById('statusYg').textContent=d.loggedIn?'已登录：'+d.username:'未登录';
document.getElementById('usernameYg').value=d.username||'';
document.getElementById('passwordYg').value=d.password||'';}
async function submitYg(url,body){const notice=document.getElementById('messageYg');notice.textContent='处理中…';
const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':secret},
body:JSON.stringify(body)});const d=await r.json();notice.textContent=d.message||'';await refreshYg();}
document.getElementById('loginYg').addEventListener('submit',async e=>{e.preventDefault();
const button=document.getElementById('submitYg');button.disabled=true;
try{await submitYg('website/api/yg/login',{username:document.getElementById('usernameYg').value,
password:document.getElementById('passwordYg').value});}catch{document.getElementById('messageYg').textContent='连接失败，请稍后重试';}
finally{button.disabled=false;}});
document.getElementById('logoutYg').addEventListener('click',async()=>{try{await submitYg('website/api/yg/logout',{});}catch{
document.getElementById('messageYg').textContent='连接失败，请稍后重试';}});
refreshYg().catch(()=>{document.getElementById('statusYg').textContent='无法读取状态';});
function connectAccount(suffix,path){
 const status=document.getElementById('status'+suffix),notice=document.getElementById('message'+suffix);
 const username=document.getElementById('username'+suffix),password=document.getElementById('password'+suffix);
 async function refresh(){const r=await fetch('website/api/'+path+'/status',{cache:'no-store',
 headers:{'X-Config-Token':secret}});const d=await r.json();if(!r.ok)throw new Error(d.message||'无法读取状态');
 status.textContent=d.loggedIn?'已登录：'+d.username:'未登录';username.value=d.username||'';password.value=d.password||'';}
 async function submit(action,body){notice.textContent='处理中…';const r=await fetch('website/api/'+path+'/'+action,
 {method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':secret},body:JSON.stringify(body)});
 const d=await r.json();notice.textContent=d.message||'';await refresh();}
 document.getElementById('login'+suffix).addEventListener('submit',async e=>{e.preventDefault();
 const button=document.getElementById('submit'+suffix);button.disabled=true;
 try{await submit('login',{username:username.value,password:password.value});}
 catch{notice.textContent='连接失败，请稍后重试';}finally{button.disabled=false;}});
 document.getElementById('logout'+suffix).addEventListener('click',async()=>{
 try{await submit('logout',{});}catch{notice.textContent='连接失败，请稍后重试';}});
 refresh().catch(()=>{status.textContent='无法读取状态';});
}
connectAccount('Jd','jd');connectAccount('91','91');
async function refreshFilter(){const r=await fetch('website/api/filter',{cache:'no-store',headers:{'X-Config-Token':secret}});
const d=await r.json();if(!r.ok)throw new Error(d.message||'无法读取筛选设置');
document.getElementById('strictFilter').checked=d.mode==='strict';}
document.getElementById('strictFilter').addEventListener('change',async e=>{
const notice=document.getElementById('filterMessage');e.target.disabled=true;notice.textContent='保存中…';
try{const r=await fetch('website/api/filter',{method:'POST',headers:{'Content-Type':'application/json','X-Config-Token':secret},
body:JSON.stringify({mode:e.target.checked?'strict':'standard'})});const d=await r.json();
if(!r.ok)throw new Error(d.message||'保存失败');notice.textContent='已保存，请刷新相关影视源';}
catch(error){notice.textContent=error.message;await refreshFilter().catch(()=>{});}
finally{e.target.disabled=false;}});
refreshFilter().catch(()=>{document.getElementById('filterMessage').textContent='无法读取筛选设置';});
</script></body></html>`;
}

export default {
    meta: { key: 'baseset', name: '配置|中心', type: 3, searchable: 0, quickSearch: 0 },
    api: async (fastify) => {
        useCredentialsDatabase(fastify.db);
        use51Database(fastify.db);
        useXiangjiaoDatabase(fastify.db);
        useYeguodjDatabase(fastify.db);
        useJavdayDatabase(fastify.db);
        use91Database(fastify.db);
        await useContentFilterDatabase(fastify.db);
        const secret = randomBytes(32).toString('hex');
        const authorized = (request) => {
            const supplied = String(request.headers['x-config-token'] || '');
            const a = Buffer.from(supplied);
            const b = Buffer.from(secret);
            return a.length === b.length && timingSafeEqual(a, b);
        };
        fastify.post('/init', async () => ({}));
        fastify.post('/home', async () => ({
            class: [{ type_id: 'settings', type_name: '账号设置' }], list: [ENTRY],
        }));
        fastify.post('/category', async () => ({ page: 1, pagecount: 1, list: [ENTRY] }));
        fastify.post('/detail', async (request) => {
            const address = request.server.address();
            const url = `http://127.0.0.1:${address.port}${PATH}/website`;
            try {
                await request.server.messageToDart?.({ action: 'openInternalWebview', opt: { url } }, request);
            } catch { /* the detail page remains available if this client lacks the action */ }
            return { list: [{ ...ENTRY, vod_content: `在应用内打开配置中心：${url}` }] };
        });
        fastify.get('/website', async (_request, reply) => reply
            .header('Cache-Control', 'no-store')
            .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'")
            .type('text/html; charset=utf-8').send(page(secret)));
        fastify.get('/website/api/filter', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            return reply.header('Cache-Control', 'no-store').send({ mode: contentFilterMode() });
        });
        fastify.post('/website/api/filter', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            try { return reply.header('Cache-Control', 'no-store').send({ mode: await setContentFilterMode(request.body?.mode) }); }
            catch (error) { return reply.code(400).send({ message: String(error.message || '保存失败') }); }
        });
        fastify.get('/website/api/status', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            const session = await savedSession();
            return reply.header('Cache-Control', 'no-store').send({
                loggedIn: !!session?.token, username: session?.username || '',
                password: session?.password || '',
            });
        });
        fastify.post('/website/api/login', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            try {
                await loginChengguodj(request.body?.username, request.body?.password);
                return reply.header('Cache-Control', 'no-store').send({ message: '登录成功' });
            } catch (error) {
                return reply.code(400).send({ message: String(error.message || '登录失败') });
            }
        });
        fastify.post('/website/api/logout', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            await logoutChengguodj();
            return reply.header('Cache-Control', 'no-store').send({ message: '已退出登录' });
        });
        fastify.get('/website/api/51/status', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            const session = await saved51Session();
            return reply.header('Cache-Control', 'no-store').send({
                loggedIn: !!session?.token, username: session?.username || '',
                password: session?.password || '',
            });
        });
        fastify.post('/website/api/51/login', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            try {
                await login51(request.body?.username, request.body?.password);
                return reply.header('Cache-Control', 'no-store').send({ message: '登录成功' });
            } catch (error) {
                return reply.code(400).send({ message: String(error.message || '登录失败') });
            }
        });
        fastify.post('/website/api/51/logout', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            await logout51();
            return reply.header('Cache-Control', 'no-store').send({ message: '已退出登录' });
        });
        fastify.get('/website/api/xj/status', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            const session = await savedXiangjiaoSession();
            return reply.header('Cache-Control', 'no-store').send({
                loggedIn: !!session?.access_token, username: session?.username || '',
                password: session?.password || '',
            });
        });
        fastify.post('/website/api/xj/login', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            try {
                await loginXiangjiao(request.body?.username, request.body?.password);
                return reply.header('Cache-Control', 'no-store').send({ message: '登录成功' });
            } catch (error) {
                return reply.code(400).send({ message: String(error.message || '登录失败') });
            }
        });
        fastify.post('/website/api/xj/logout', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            await logoutXiangjiao();
            return reply.header('Cache-Control', 'no-store').send({ message: '已退出登录' });
        });
        fastify.get('/website/api/yg/status', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            const session = await savedYeguodjSession();
            return reply.header('Cache-Control', 'no-store').send({
                loggedIn: !!session?.token, username: session?.username || '',
                password: session?.password || '',
            });
        });
        fastify.post('/website/api/yg/login', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            try {
                await loginYeguodj(request.body?.username, request.body?.password);
                return reply.header('Cache-Control', 'no-store').send({ message: '登录成功' });
            } catch (error) {
                return reply.code(400).send({ message: String(error.message || '登录失败') });
            }
        });
        fastify.post('/website/api/yg/logout', async (request, reply) => {
            if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
            await logoutYeguodj();
            return reply.header('Cache-Control', 'no-store').send({ message: '已退出登录' });
        });
        for (const [path, saved, login, logout] of [
            ['jd', savedJavdaySession, loginJavday, logoutJavday],
            ['91', saved91Session, login91, logout91],
        ]) {
            fastify.get(`/website/api/${path}/status`, async (request, reply) => {
                if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
                const session = await saved();
                return reply.header('Cache-Control', 'no-store').send({
                    loggedIn: !!session?.cookie, username: session?.username || '', password: session?.password || '',
                });
            });
            fastify.post(`/website/api/${path}/login`, async (request, reply) => {
                if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
                try {
                    await login(request.body?.username, request.body?.password);
                    return reply.header('Cache-Control', 'no-store').send({ message: '登录成功' });
                } catch (error) {
                    return reply.code(400).send({ message: String(error.message || '登录失败') });
                }
            });
            fastify.post(`/website/api/${path}/logout`, async (request, reply) => {
                if (!authorized(request)) return reply.code(403).send({ message: '配置页面已过期，请重新打开' });
                await logout();
                return reply.header('Cache-Control', 'no-store').send({ message: '已退出登录' });
            });
        }
    },
};
