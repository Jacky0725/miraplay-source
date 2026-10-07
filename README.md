# MiraPlay 橙果短剧接口

本仓库提供供 MiraPlay 使用的 CatPawOpen Node.js 接口。

## 使用地址

GitHub Pages 发布完成后，在 MiraPlay 添加 **CatPawOpen 源**，填写：

`https://jacky0725.github.io/miraplay-source/index.js.md5`

## 更新规则

修改 `nodejs/src/spider/video/chengguodj.js` 并提交到 `main`。GitHub Actions 会自动重新编译 `index.js`、生成对应的 MD5 文件并发布到 GitHub Pages。MiraPlay 中使用上面的固定地址；若重载后仍显示旧内容，先在应用内清理缓存。

主要功能：分类、首页列表、搜索、详情、选集和 HLS 播放。播放页的链接带时效参数，因此每次播放会重新读取。

同一猫源菜单还包含 **影探**。它由用户提供的 Python 规则改写为 CatPawOpen Node.js 规则，使用影探站点的 JSON 接口提供分类、筛选、首页、搜索、详情和播放；部分线路依赖原脚本使用的第三方解析接口，第三方接口失效时这些线路可能无法播放。

## 配置中心与账号

在 MiraPlay 的站点菜单中打开 **配置|中心**，点击“配置中心”卡片，便可在应用内的本机页面填写橙果短剧用户名和密码。脚本向橙果短剧的 HTTPS 登录接口提交凭据。按用户要求，本机数据库明文保存并显示用户名、密码及登录令牌；公开 GitHub 仓库不包含这些凭据。已有登录需要重新输入密码并登录一次，才能在更新后的配置页显示密码。清理 MiraPlay 的本机数据后需要重新登录。

以后新增影视站点时，在 `nodejs/src/spider/video/` 增加独立规则并注册到 `nodejs/src/router.js` 的 `spiders` 数组。新增站点会显示在同一 CatPawOpen 源菜单中；需要账号的站点再为其接入配置中心。仅填写另一个网站的网址并不能自动生成该网站的解析规则。

此接口使用 [CatPawOpen](https://github.com/CatPawApp/CatPawOpen) 的 Node.js 运行结构。目标网站的页面结构变化后，规则可能需要同步调整。

完整的编译和发布约定见 [AGENTS.md](AGENTS.md)。

若要在 TVBox 上使用同一规则，见 [TVBOX.md](TVBOX.md)；TVBox 版本需要在 NAS 上运行独立的 HTTP 接口。
