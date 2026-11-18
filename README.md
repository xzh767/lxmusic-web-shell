# LX Music Web Shell

> **A source-agnostic web player for LX Music-compatible search, playback and pluggable resolver backends.**
> **一个面向可插拔音乐解析后端（Ammo）的 LX Music 风格 Web 播放器。**

[中文](#中文) · [English](#english)

---

# 中文

## 项目简介

LX Music Web Shell 是一个与具体音源实现解耦的音乐搜索、解析与播放前端，界面与交互对标 **LX Music Desktop**：左侧导航、常驻播放栏、播放队列、收藏、歌单与歌词面板。

核心思想是 **"枪弹分离"**：页面本体（枪）只负责界面、队列、歌词、收藏、歌单与源管理；解析（弹药）由外部 Ammo 后端完成。Web Shell 不包含具体第三方 resolver 实现、API Key 或私有上游配置，**也不代理音频流**。

```text
┌──────────────────────────────┐
│        Web Shell / 枪         │
│ UI · 搜索 · 队列 · 播放栏     │
│ 歌词 · 收藏 · 歌单 · 源管理   │
│ 回退 · 重试 · 浏览器直连      │
└──────────────┬───────────────┘
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│         Ammo / 弹药           │
│ 可选搜索 · 解析 · 上游适配    │
│ 缓存 · 限流 · 回退            │
└──────────────┬───────────────┘
               ▼
          上游音乐服务 → 最终音频直链 → 浏览器
```

> **免责声明 / Disclaimer**
> 本项目只是通用前端壳和接口规范，不授予任何第三方音乐平台、API、resolver 或媒体资源的使用授权。使用者、Ammo 运营者和部署者应自行确认权限，并遵守当地法律、版权要求、第三方服务条款、速率限制和滥用政策。本项目不构成法律意见，也不是规避版权、风控或访问控制的工具。

## 在线 Demo / Live Demo

### Web Shell

**https://lxmusic-webshell.netlify.app/**

### Ammo Gateway（作者维护的演示后端）

**Manifest：** https://music-ammo-api-gateway.xlz767.dpdns.org/manifest.json

这是 Ammo Gateway 的公开 Manifest 入口，而不是 Gateway 网站首页。Gateway 根目录故意关闭目录索引，因此返回 `403 Forbidden` 是正常的安全配置。

**Demo 使用声明 / Demo Usage Disclaimer：**

- Demo 是公共演示服务，不提供 SLA。
- 服务可能实施缓存、限流、冷却、访问控制或随时停用。
- **禁止批量抓取、压力测试、高频循环请求、大规模自动化解析或其他滥用行为。**
- 不要把 Demo 当生产后端，也不要将第三方项目的大量流量转发到 Demo。
- 作者可以在不另行通知的情况下限制、拒绝或封禁异常流量。

## 界面与功能

| 模块 | 说明 |
|---|---|
| **搜索** | 五平台单搜 / 聚合搜索、分页、平台独立失败不阻塞其它平台 |
| **播放队列** | 队列持久化到 localStorage、列表循环 / 单曲循环 / 随机播放、上下曲、移除 |
| **播放栏** | 常驻播放条、进度拖拽、音量、HTTP 直链提示、MediaSession（锁屏控制） |
| **歌词** | LRC 解析、逐行高亮自动滚动、点击歌词跳转、面板可开合 |
| **收藏** | 单曲收藏、导入 / 导出 JSON 备份 |
| **歌单** | 粘贴歌单链接或「平台 + 歌单 ID」打开，保存常用歌单 |
| **源管理** | 三种弹药：Manifest Ammo、LX 音源脚本（浏览器沙箱）、通用 HTTP 端点；可停用 / 卸载 / 连通性测试 |
| **快捷键** | `Space` 播放/暂停，`Shift+←/→` 上下曲 |
| **移动端** | 底部导航 + 紧凑播放栏，触屏可用 |

## 架构要点：浏览器直连优先

上游音乐平台普遍对**海外服务器 IP** 风控极严，因此本前端采用「浏览器直连优先，网关兜底」的策略：

```text
搜索 / 歌词 / 歌单
   ↓ 先走浏览器直连
   ├─ QQ      tang.api.s01s.cn        （开放 CORS）
   ├─ 酷我    oiapi.net               （开放 CORS）
   ├─ 酷狗    songsearch.kugou.com
   ├─ 咪咕    pd.musicapp.migu.cn
   └─ 网易云  music.163.com           （国内浏览器直连可用）
   ↓ 直连失败（无 CORS / 风控）时
   ↓ 改走 Ammo Gateway 归一化接口
解析（Resolve）
   ↓ 始终由 Ammo 完成
   └─ 需要服务端凭据、私有上游与串行回退，不应放在浏览器
```

也就是说：**除 Ammo 解析请求外，前端尽量不经过任何自建服务器**。这意味着：

- 你的浏览器在哪个网络，搜索结果就取决于哪个网络的风控情况；
- 网关只做轻量 JSON 归一化，不缓存、不代理音频；
- 任何人都可以把自己的 Ammo 接进这个壳里，不必依赖作者的服务。

## 支持的自定义源（Ammo）

源管理页支持三类弹药，共用一套调用约定：

### 1. Manifest Ammo（推荐）

填写 `manifest.json` 地址即可：

```json
{
  "version": 1,
  "id": "my-ammo",
  "name": "My Ammo",
  "versionName": "1.0.0",
  "baseUrl": "https://ammo.example",
  "platforms": {
    "tx": { "name": "腾讯音乐", "qualities": ["128k", "320k", "flac"] }
  },
  "endpoints": {
    "search": "/api/search",
    "resolve": "/api/resolve"
  }
}
```

### 2. LX 音源脚本（浏览器沙箱）

直接导入 LX Music Desktop 的自定义源 `.js`，前端在浏览器里模拟 LX Runtime：

```js
const { EVENT_NAMES, request, on, send } = globalThis.lx

on(EVENT_NAMES.request, async ({ source, info }) => {
  const url = await fetchSomeUpstream(source, info.musicInfo, info.type)
  return url
})

send(EVENT_NAMES.inited, {
  sources: {
    tx: { name: 'tx', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k'] },
  },
})
```

已实现的 LX Runtime 子集：`globalThis.lx`、`EVENT_NAMES`、`on`、`send`、`request`（自动解析 JSON 响应）、`utils`、`log`、`action.showNotice`。

> ⚠️ 脚本直连上游，上游若无 CORS 头浏览器会拦截。脚本仅在本机浏览器运行，不会上传到任何服务器。

### 3. 通用 HTTP 端点

手填 `Base URL` + `Resolve 路径`（可选 `Search 路径`），适合任何返回 `{ "ok": true, "url": "..." }` 的接口。

## 项目结构

```text
lxmusic-web-shell/
├── index.html            应用壳布局（侧栏 / 视图 / 播放栏）
├── style.css             深色主题
├── app.js                核心状态、存储、播放、队列、收藏
├── views.js              各视图逻辑与源管理 UI
├── client-api.js         浏览器直连的搜索 / 歌词 / 歌单适配器
├── sources.js            Ammo 运行时（Manifest / LX 脚本 / HTTP）
├── lyrics.js             歌词面板与 LRC 解析
├── ammo.manifest.example.json
├── README.md
├── LICENSE
└── docs/
    ├── AMMO_API.md
    ├── AMMO_STANDARD.md
    ├── LX_SOURCE_PORTING_EXAMPLE.md
    └── examples/lx-gateway-source.js
```

## 快速开始

### 部署

纯静态站点，无需构建。直接托管仓库根目录即可：

```text
index.html
style.css
app.js
views.js
client-api.js
sources.js
lyrics.js
```

- **GitHub Pages**：Settings → Pages → Deploy from a branch → 选 `main` 分支、目录 `/ (root)`。
- **Netlify**：导入仓库，Build command 留空，Publish directory 填仓库根目录。
- **Vercel**：Framework Preset 用 `Other`，Build Command 留空，Root Directory 用仓库根目录。
- **Cloudflare Pages / 其它静态托管**：能提供上面几个文件即可。

### 使用

1. 打开页面 → 左侧「源管理」。
2. 「Manifest Ammo」标签填入 Manifest URL → 「装载」。
3. 回到「搜索」，选择平台或聚合搜索，输入关键词。
4. 点击结果「播放」，底部播放栏开始播放；点「词」打开歌词面板。
5. 「队列」管理播放顺序，「收藏」保存喜欢的歌。

### 可选配置

在 `index.html` 的 `<script>` 之前加入即可覆盖默认端点：

```html
<script>
  window.LX_WEB_SHELL_SEARCH_API = 'https://your-host/api/search.php'
  window.LX_WEB_SHELL_PLAYLIST_API = 'https://your-host/api/playlist.php'
  window.LX_WEB_SHELL_LYRIC_API = 'https://your-host/api/lyric.php'
</script>
```

## Ammo / 弹药接口

最小 Resolve Ammo：

```text
GET  /manifest.json
POST /api/resolve
```

可选搜索 / 歌词 / 歌单：

```text
GET  /api/search
GET  /api/lyric
GET  /api/playlist
```

完整标准：[`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md)
精简 API：[`docs/AMMO_API.md`](docs/AMMO_API.md)

## 与 LX Music Desktop 音源的关系

```text
LX Music source                  Ammo
────────────────────────────    ────────────────────────────
globalThis.lx                    HTTP server runtime
event: request                   POST /api/resolve
inited event                     GET /manifest.json
info.musicInfo                   request.musicInfo / id
info.type                        request.quality
return playable URL              { "ok": true, "url": "..." }
```

## CORS

由于 Web Shell 在浏览器中直接调用 Ammo 与部分上游，Ammo 必须正确提供 CORS：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

## 流量边界

设计目标：

```text
Browser → Web Shell → light JSON → Ammo → audio URL → Browser
```

而不是：

```text
Browser → Web Shell/Ammo → entire MP3/FLAC/M4A stream
```

Web Shell 不会被改造成音频反向代理或大文件缓存节点。

## 隐私与日志

Ammo 运营者可能根据自己的实现记录 IP、平台、歌曲 ID、缓存命中、上游错误等信息。因此敏感日志应：

- 不暴露成静态网页资源；
- 放到 Web Root 外，或显式禁止 HTTP 访问；
- 不把 API Key、账号凭据和内部上游地址返回给浏览器；
- 仅保留排障所需的信息。

---

# English

## Overview

LX Music Web Shell is a source-agnostic frontend for music search, resolving and playback, with an LX Music Desktop–style layout: side navigation, a persistent player bar, play queue, favorites, playlists and a lyrics panel.

Its core design is **"gun / ammo separation"**:

- **Web Shell (gun):** UI, player, queue, search, lyrics, favorites, playlist and source management.
- **Ammo:** an external HTTP backend that resolves a song identity into a playable URL.

The shell never proxies audio and bundles no third-party resolver implementation.

## Live Demo

- Web Shell: **https://lxmusic-webshell.netlify.app/**
- Ammo manifest: **https://music-ammo-api-gateway.xlz767.dpdns.org/manifest.json**

> **Disclaimer**
> This project is a generic frontend and interface specification. It does not grant authorization to use any third-party music service, API, resolver or media resource. Operators and users are responsible for authorization, copyright, applicable law, third-party terms, rate limits and abuse policies.

## Core features

- Five-platform search (single or aggregated) with pagination and per-platform failure isolation.
- Persistent play queue with list-loop / single-loop / shuffle, previous / next and removal.
- Persistent player bar: progress seeking, volume, HTTP-direct-link warning, MediaSession integration.
- LRC lyrics with per-line highlighting, auto-scroll and click-to-seek.
- Favorites with JSON import / export.
- Playlist opening by link or by platform + id, with saved playlists.
- Three source kinds: Manifest Ammo, LX custom-source scripts (browser sandbox) and plain HTTP endpoints.
- Keyboard shortcuts, mobile layout, browser-console diagnostics.

## Browser-first data flow

Upstream music platforms rate-limit overseas hosting IPs aggressively, so search, lyrics and playlists are fetched **from the browser first** and only fall back to the Ammo gateway when the browser cannot reach the upstream (CORS / geo-blocking). Resolve always goes through Ammo, because it needs server-side credentials and sequential fallback.

## Deployment

Static site, no build step. Serve the repository root:

- **GitHub Pages** — Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- **Netlify** — import the repository, leave Build command empty, publish the repository root.
- **Vercel** — Framework Preset `Other`, Build Command empty, Root Directory = repository root.
- **Cloudflare Pages / any static host** — anything that serves `index.html`, `app.js`, `views.js`, `client-api.js`, `sources.js`, `lyrics.js` and `style.css`.

## Ammo protocol

```text
GET  /manifest.json
POST /api/resolve          { "source": "tx", "id": "...", "quality": "320k" }
GET  /api/search           optional
GET  /api/lyric            optional
GET  /api/playlist         optional
```

See [`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md) and [`docs/AMMO_API.md`](docs/AMMO_API.md).

## License

MIT License.
