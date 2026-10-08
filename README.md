# MiraPlay 橙果短剧接口

本仓库提供供 MiraPlay 使用的 CatPawOpen Node.js 接口。

## 使用地址

GitHub Pages 发布完成后，在 MiraPlay 添加 **CatPawOpen 源**，填写：

`https://jacky0725.github.io/miraplay-source/index.js.md5`

## 更新规则

修改 `nodejs/src/spider/video/chengguodj.js` 并提交到 `main`。GitHub Actions 会自动重新编译 `index.js`、生成对应的 MD5 文件并发布到 GitHub Pages。MiraPlay 中使用上面的固定地址；若重载后仍显示旧内容，先在应用内清理缓存。

主要功能：分类、首页列表、搜索、详情、选集和 HLS 播放。播放页的链接带时效参数，因此每次播放会重新读取。

同一菜单还包含 **51短剧**，对应 [51hub.com](https://51hub.com/)。它提供推荐、站点栏目、分类、搜索、详情、选集和播放。播放地址带时效参数，每次选择剧集时重新获取。网站接口或图片代理路径变化后需要同步更新规则。

## 配置中心与账号

在 MiraPlay 的站点菜单中打开 **配置|中心**，点击“配置中心”卡片，便可在应用内的本机页面填写橙果短剧用户名和密码。脚本向橙果短剧的 HTTPS 登录接口提交凭据。按用户要求，本机数据库明文保存并显示用户名、密码及登录令牌；公开 GitHub 仓库不包含这些凭据。已有登录需要重新输入密码并登录一次，才能在更新后的配置页显示密码。清理 MiraPlay 的本机数据后需要重新登录。

同一页面也可填写 **51短剧** 的用户名和密码。登录成功后，51短剧规则在请求列表、详情和播放地址时使用该站点的登录令牌。51短剧的凭据同样只保存在 MiraPlay 本机，并依照现有配置中心的方式明文保存与显示；两个站点的登录状态互不影响。

以后新增影视站点时，在 `nodejs/src/spider/video/` 增加独立规则并注册到 `nodejs/src/router.js` 的 `spiders` 数组。新增站点会显示在同一 CatPawOpen 源菜单中；需要账号的站点再为其接入配置中心。仅填写另一个网站的网址并不能自动生成该网站的解析规则。

此接口使用 [CatPawOpen](https://github.com/CatPawApp/CatPawOpen) 的 Node.js 运行结构。目标网站的页面结构变化后，规则可能需要同步调整。

完整的编译和发布约定见 [AGENTS.md](AGENTS.md)。

若要在 TVBox 上使用同一规则，见 [TVBOX.md](TVBOX.md)；TVBox 版本需要在 NAS 上运行独立的 HTTP 接口。
