import Fastify from 'fastify';
import chengguodj from './spider/video/chengguodj.js';

const app = Fastify({ logger: true });
const port = Number(process.env.PORT || 9988);

app.register(chengguodj.api, { prefix: '/internal/chengguodj' });

async function spiderCall(action, body = {}) {
    const response = await app.inject({
        method: 'POST',
        url: `/internal/chengguodj/${action}`,
        payload: body,
    });
    if (response.statusCode >= 400) {
        throw new Error(`${action} failed: ${response.statusCode}`);
    }
    return response.json();
}

function publicBase(request) {
    const configured = String(process.env.PUBLIC_BASE_URL || '').trim();
    return (configured || `${request.protocol}://${request.headers.host}`).replace(/\/$/, '');
}

function replyList(data) {
    const list = Array.isArray(data.list) ? data.list : [];
    const page = Number(data.page) || 1;
    const pagecount = Number(data.pagecount) || page;
    return {
        code: 1,
        msg: 'success',
        page,
        pagecount,
        limit: Number(data.limit) || list.length,
        total: Number(data.total) || list.length,
        list,
        ...(Array.isArray(data.class) ? { class: data.class } : {}),
    };
}

function rewriteEpisodes(vod, base) {
    const playUrl = String(vod.vod_play_url || '');
    const rewritten = playUrl.split('$$$').map((line) =>
        line.split('#').map((episode) => {
            const separator = episode.indexOf('$');
            if (separator < 0) return episode;
            const title = episode.slice(0, separator);
            const id = episode.slice(separator + 1);
            return `${title}$${base}/play?vid=${encodeURIComponent(id)}`;
        }).join('#')
    ).join('$$$');
    return { ...vod, vod_play_url: rewritten };
}

async function vodHandler(request) {
    const query = request.query || {};
    const ids = String(query.ids || '').trim();
    const word = String(query.wd || '').trim();
    const category = String(query.t || '').trim();
    const page = Math.max(1, Number(query.pg) || 1);

    if (ids) {
        const base = publicBase(request);
        const list = [];
        for (const id of ids.split(',').map((item) => item.trim()).filter(Boolean)) {
            const result = await spiderCall('detail', { id });
            list.push(...(result.list || []).map((vod) => rewriteEpisodes(vod, base)));
        }
        return replyList({ list, page: 1, pagecount: 1 });
    }
    if (word) return replyList(await spiderCall('search', { wd: word, page }));
    if (category) return replyList(await spiderCall('category', { id: category, page }));
    return replyList(await spiderCall('home'));
}

app.get('/api.php/provide/vod', vodHandler);
app.get('/api.php/provide/vod/', vodHandler);

app.get('/play', async (request, reply) => {
    const id = String(request.query?.vid || '');
    const result = await spiderCall('play', { id });
    if (!result.url) return reply.code(404).send({ error: 'play URL unavailable' });
    return reply.redirect(302, result.url);
});

app.get('/tvbox.json', async (request) => ({
    sites: [{
        key: 'chengguodj',
        name: '橙果短剧',
        type: 1,
        api: `${publicBase(request)}/api.php/provide/vod/`,
        searchable: 1,
        quickSearch: 1,
    }],
}));

app.listen({ port, host: '0.0.0.0' }).catch((error) => {
    app.log.error(error);
    process.exit(1);
});
