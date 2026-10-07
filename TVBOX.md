# 在 TVBox 中使用橙果短剧接口

MiraPlay 使用的 `index.js.md5` 是 CatPawOpen 运行包，TVBox 不能直接加载它。本仓库另提供一个适合在 NAS 上运行的 TVBox HTTP 接口。它复用同一份橙果短剧规则，向 TVBox 输出 `type: 1` 的 JSON 源。

## NAS 有 Docker Compose

在 NAS 上获取本仓库，然后在仓库目录运行：

```sh
docker compose up -d --build
```

让电视与 NAS 处于同一局域网。在 TVBox 的“设置 → 配置地址”中填写：

```text
http://NAS的局域网IP:9988/tvbox.json
```

例如 NAS 地址为 `192.168.1.20`，就填写 `http://192.168.1.20:9988/tvbox.json`。打开这个地址应能看到包含 `sites` 的 JSON；其中的 `api` 会自动使用该 NAS 地址。

## NAS 已安装 Node.js 20

在仓库的 `nodejs` 目录运行：

```sh
npm ci
npm run start:tvbox
```

同样使用 `http://NAS的局域网IP:9988/tvbox.json` 作为 TVBox 配置地址。若端口 9988 已占用，可通过环境变量 `PORT` 修改；填写地址时使用修改后的端口。

## 外网使用

若 TVBox 不在家中局域网，需让 NAS 提供可访问的 HTTPS 地址，并设置 `PUBLIC_BASE_URL` 为该地址。例如 `https://tvbox.example.com`。这能让配置里的 `api` 和选集播放链接使用正确的外网地址。不要将 NAS 的管理页面直接暴露到公网。

播放链接含时效参数。TVBox 请求一集时，NAS 服务会重新读取该集的 HLS 地址并通过 HTTP 302 跳转。部分 TVBox 分支的播放器对跳转或请求头处理不同；如果能看到列表却无法播放，需要针对实际客户端调整播放出口。
