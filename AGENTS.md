# MiraPlay 接口编译与发布规则

本仓库的 MiraPlay 源使用 CatPawOpen 的 Node.js 运行格式。后续修改接口时，按以下规则维护。

## 源码与接口

- 站点规则在 `nodejs/src/spider/video/chengguodj.js`。不要直接编辑编译产物 `index.js`。
- `nodejs/src/router.js` 注册该规则；`meta.key` 是 `chengguodj`，`meta.type` 是 `3`。
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
