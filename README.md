# MiraPlay 橙果短剧接口

本仓库提供供 MiraPlay 使用的 CatPawOpen Node.js 接口。

## 使用地址

GitHub Pages 发布完成后，在 MiraPlay 添加 **CatPawOpen 源**，填写：

`https://jacky0725.github.io/miraplay-source/index.js.md5`

## 更新规则

修改 `nodejs/src/spider/video/chengguodj.js` 并提交到 `main`。GitHub Actions 会自动重新编译 `index.js`、生成对应的 MD5 文件并发布到 GitHub Pages。MiraPlay 中的源地址保持不变；若未立即显示新内容，在应用内重载该源。

主要功能：分类、首页列表、搜索、详情、选集和 HLS 播放。播放页的链接带时效参数，因此每次播放会重新读取。

此接口使用 [CatPawOpen](https://github.com/CatPawApp/CatPawOpen) 的 Node.js 运行结构。目标网站的页面结构变化后，规则可能需要同步调整。
