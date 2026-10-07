# MiraPlay 橙果短剧接口

本仓库提供供 MiraPlay 使用的 CatPawOpen Node.js 接口。

## 使用地址

GitHub Pages 发布完成后，在 MiraPlay 添加 **CatPawOpen 源**，填写：

`https://jacky0725.github.io/miraplay-source/refresh-20261007/index.js.md5`

## 更新规则

修改 `nodejs/src/spider/video/chengguodj.js` 并提交到 `main`。GitHub Actions 会自动重新编译 `index.js`、生成对应的 MD5 文件并发布到 GitHub Pages。MiraPlay 中使用上面的固定地址；若重载后仍显示旧内容，可删除旧源后用该地址重新添加。

主要功能：分类、首页列表、搜索、详情、选集和 HLS 播放。播放页的链接带时效参数，因此每次播放会重新读取。

此接口使用 [CatPawOpen](https://github.com/CatPawApp/CatPawOpen) 的 Node.js 运行结构。目标网站的页面结构变化后，规则可能需要同步调整。

完整的编译和发布约定见 [AGENTS.md](AGENTS.md)。

若要在 TVBox 上使用同一规则，见 [TVBOX.md](TVBOX.md)；TVBox 版本需要在 NAS 上运行独立的 HTTP 接口。
