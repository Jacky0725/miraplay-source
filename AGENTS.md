# MiraPlay 接口编译与发布规则

本仓库的 MiraPlay 源使用 CatPawOpen 的 Node.js 运行格式。后续修改接口时，按以下规则维护。

## 源码与接口

- 站点规则在 `nodejs/src/spider/video/chengguodj.js`。不要直接编辑编译产物 `index.js`。
- `nodejs/src/router.js` 注册该规则；`meta.key` 是 `chengguodj`，`meta.type` 是 `3`。
- `nodejs/src/spider/video/hub51.js` 是 51短剧的独立站点，使用网站浏览器脚本公开的 API 参数读取 AES-CBC 响应；每次播放重新取得有时效的 HLS 地址。网站的 API 域名与协议参数变化时需更新。
- 51短剧和野果短剧的加密封面域名经 `cover-url.js` 换为站点公开的普通图片域名 `imgpublic.ycomesc.live`，保留原路径。先前生成的 `51hub.com/_img/...` 地址实测返回 404，不要恢复该代理方式。
- `nodejs/src/settings/hub51-credentials.js` 处理 51短剧用户名和密码登录，把站点返回的令牌附加在 51短剧的 API 请求体。配置中心为该站点提供独立的状态、登录和退出入口。本机数据库按用户此前要求明文保存并显示密码；不得把实际凭据或令牌提交到公开仓库。
- `nodejs/src/spider/video/xiangjiao.js` 是香蕉短剧独立站点。`nodejs/src/settings/xiangjiao-credentials.js` 管理游客会话以及本机保存的账号会话，播放时向网站申请临时播放地址。站点的 HLS 清单含 `data:` 格式的 AES-128 密钥，规则将清单和密钥暂存在本机并提供 HTTP 地址给播放器；视频片段仍直接从网站 CDN 读取。列表、分类和详情使用共同的基础内容筛选，避免泛化词导致首页全空。
- `nodejs/src/spider/video/yeguodj.js` 是野果短剧独立站点。`nodejs/src/settings/yeguodj-credentials.js` 管理本机账号，沿用站点公开的 AES-CBC 接口参数。加密封面使用 `cover-url.js` 指向普通图片域名，不依赖本机图片代理。筛除含未成年人暗示及强迫等标签的条目，正片地址在播放时重新请求。
- `nodejs/src/spider/video/javday.js` 和 `nodejs/src/spider/video/dj91.js` 是独立站点；配套登录状态在 `nodejs/src/settings/` 对应文件中。两者必须在列表、详情和播放三处应用 `content-filter.js`：单独的“学生”“校园”“少女”“制服”等泛化词不构成拦截条件；明确的未成年人指向，或学生场景与具体性行为同时出现，以及明确的乱伦和性侵内容仍须筛除。播放时只提取站点提供的 HLS 地址，不运行网页广告脚本。
- 配置中心的“严格筛选”默认关闭，可手动开启附加泛化词筛选；基础筛选始终生效。本机数据库保存模式，公开脚本不保存个人设置。
- 91短剧加密封面通过本机 `/image?url=` 路由解码；不得把长编码地址放进路径参数，Fastify 默认路径参数长度会使图片路由返回 404。
- 橙果短剧分类翻页使用 `/page-2` 等路径，不能使用 `?page=2`；搜索页封面在 Nuxt 数据中可能是字符串或带 `url` 的对象。
- JAVDAY 的剧集页有两种播放结构：短剧页面提供 `.episode-btn[data-url]`，单条视频页面仅在内联播放器配置中提供 `url: '...m3u8'`。两种结构均需读取，且只接受 `javday.homes` 的 HLS 地址。公开内容不依赖登录。
- 视频规则不调用各站的广告列表 API 或网页广告脚本，不将广告条目加入播放列表。上游若在正片 HLS 中拼接广告，不能仅凭规则可靠跳过。
- `nodejs/src/spider/video/settings.js` 注册独立的 `配置|中心` 站点，并通过 MiraPlay 的 `openInternalWebview` 动作打开本机配置页。新影视源作为独立 spider 添加到 `nodejs/src/router.js` 的 `spiders` 数组。
- `nodejs/src/settings/credentials.js` 处理橙果短剧登录。按用户明确要求，本机数据库明文保存用户名、密码和网站返回的令牌，配置页明文显示密码；公开源码只含网站自身公开发布的协议参数，不得写入用户凭据。返回密码的本机状态接口必须校验配置页令牌，并禁止缓存。
- 规则通过 Fastify 注册 `/init`、`/home`、`/category`、`/detail`、`/play`、`/search`。
- 列表项使用 `vod_id`、`vod_name`、`vod_pic`、`vod_remarks`。详情的播放线路与选集分别放在 `vod_play_from`、`vod_play_url`；选集之间用 `#`，名称与播放 ID 之间用 `$`。
- 网站的 HLS 地址带时效参数。`/detail` 保留剧集 ID，`/play` 每次请求对应播放页并取新的 `source_url`，返回 `parse: 0` 和可播放 URL。

## 本地编译

在 `nodejs` 目录执行 `npm ci`，再执行 `npm run build`。编译脚本生成：

- `dist/index.js`
- `dist/index.js.md5`
- `dist/index.config.js`
- `dist/index.config.js.md5`

两个 `.md5` 文件分别是同名 JS 文件原始字节的 32 位小写 MD5 值。修改 JS 后必须重新生成对应的校验文件。`nodejs/dist/` 是生成目录，不提交到仓库。

## GitHub Pages 发布

- `.github/workflows/pages.yml` 在提交到 `main` 后自动安装依赖、编译，并将四个 `index.*` 文件发布到 GitHub Pages。
- Pages 的发布来源保持为 **GitHub Actions**；不要切换为 **Deploy from a branch**。
- MiraPlay 中使用固定地址：`https://jacky0725.github.io/miraplay-source/index.js.md5`。用户清理 MiraPlay 缓存后已确认该地址正常。若重载后仍显示旧内容，先清理应用缓存。工作流还发布 `refresh-20261007/` 备用路径，后续更新须保持两者同步。
- 发布后确认 `index.js.md5` 可访问，并且其内容与公开 `index.js` 的 MD5 一致。

这是公开仓库。不要将 Cookie、访问令牌或其他密钥写进源码、配置或工作流。

## TVBox 适配

- `nodejs/src/tvbox-server.js` 在 NAS 上运行，将同一份 `chengguodj.js` 规则包装为 TVBox `type: 1` HTTP JSON 接口。
- `/tvbox.json` 返回 TVBox 配置，`/api.php/provide/vod/` 返回分类、列表、搜索、详情，`/play` 在播放时取得新 HLS 地址并跳转。
- GitHub Pages 只发布 MiraPlay 的静态 Node.js 包；TVBox HTTP 服务需由 NAS 的 Node.js 或 Docker 运行。TVBox 使用说明见 `TVBOX.md`。
