# LX Music Web Shell

> **A lightweight web shell for pluggable music resolvers (Ammo).**  
> **一个面向可插拔音乐解析后端（Ammo）的轻量 Web Shell。**

[中文](#中文) · [English](#english)

---

# 中文

## 项目简介

LX Music Web Shell 是一个**与具体音源实现解耦**的音乐搜索、解析与播放前端。

核心思想是 **“枪弹分离”**：

```text
┌──────────────────────────────┐
│        Web Shell / 枪         │
│                              │
│  UI · 搜索 · 播放器 · 装载管理 │
│  回退 · 日志 · Metadata       │
└──────────────┬───────────────┘
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│         Ammo / 弹药           │
│                              │
│  搜索 · 解析 · 上游适配        │
│  自己的缓存 · 限流 · 回退      │
└──────────────┬───────────────┘
               │
               ▼
          上游音乐服务
               │
               ▼
          最终音频直链
               │
               ▼
             浏览器
```

**Web Shell 不包含具体第三方音源实现、API Key、私有上游配置，也不承担音频流反向代理。**

这让前端可以长期保持稳定，而后端 Ammo 可以独立更新、替换、增加或下线。

> **免责声明 / Disclaimer**  
> 本项目只是一个通用前端壳和接口规范，不提供任何第三方音乐平台的授权，也不保证任何外部 Ammo、resolver、API 或媒体资源的合法性、可用性或长期稳定性。使用者、Ammo 运营者及部署者应自行确认其接入的服务拥有必要的授权，并遵守适用的法律、版权要求、第三方服务条款、robots/频率限制及滥用政策。本项目不构成法律意见，也不是规避版权、风控或平台限制的工具。

## 在线 Demo

### Web Shell Demo

**https://music.xlz767.dpdns.org/**

这是作者维护的演示站，用于展示 Web Shell 的实际运行方式。

### Ammo Gateway Demo

**https://music-ammo-api-gateway.xlz767.dpdns.org/**

这是作者维护的演示 Ammo Gateway，供学习和接口测试使用。

**Demo 使用声明：**

- Demo 后端是公共服务，不提供 SLA。
- 为保护服务器、上游服务和其他用户，可能实施缓存、限流、冷却、访问控制或随时停用。
- **不要进行批量抓取、压力测试、高频循环请求、自动化大规模解析或任何滥用行为。**
- 不要把 Demo 当成生产环境后端，也不要把第三方项目的大规模流量转发到 Demo。
- 作者可以在不另行通知的情况下限制或拒绝异常流量。
- Demo 的存在不代表作者为任何第三方 Ammo 或上游服务背书。

## 核心特性

- **可插拔 Ammo**：通过 `manifest.json` 装载外部解析后端。
- **单源搜索 / 聚合搜索**：可以只搜索一个 Ammo，也可以聚合已装载 Ammo。
- **默认不选择搜索源**：避免页面打开后无意义地请求服务器。
- **解析回退**：多个 Ammo 按用户配置顺序逐一尝试，失败自动切换。
- **浏览器 Console 排障**：记录搜索/解析请求顺序、耗时和失败信息。
- **Metadata 支持**：Ammo 可直接返回标准化歌曲元数据。
- **HTTP 音频提示**：发现 `http://` 直链时提醒可能存在 Mixed Content，但不会偷偷改写 URL。
- **不代理音频**：最终音频 URL 由浏览器直接请求，Web Shell 不成为音频 CDN。
- **本地 Ammo 配置**：装载信息保存在浏览器 `localStorage`。
- **纯静态前端**：无需 Node.js 构建链，可直接部署到 GitHub Pages、Netlify、Vercel 等平台。

## 项目结构

```text
lxmusic-web-shell/
├── index.html                  # 主页面 / Main page
├── app.js                      # Web Shell 主逻辑 / Core UI logic
├── style.css                   # 样式 / Styles
├── ammo.manifest.example.json  # Manifest 示例 / Example manifest
├── README.md
├── LICENSE
└── docs/
    ├── AMMO_API.md             # 精简 API 参考 / Compact API reference
    └── AMMO_STANDARD.md        # 开发标准与 LX 音源移植指南 / Developer standard
```

## 快速开始

### 1. 部署 Web Shell

这是一个静态站点。把仓库文件直接部署到静态托管服务即可：

```text
index.html
app.js
style.css
```

不需要 PHP，不需要 Node.js，不需要服务器端构建步骤。

### 2. 装载 Ammo

打开网站的 **装弹管理 / Ammo Manager**，输入某个 Ammo 的：

```text
https://your-ammo.example/manifest.json
```

点击“装载”。

Manifest 会告诉 Web Shell：

- Ammo 的名称与版本
- 支持哪些平台
- 支持哪些音质
- Search / Resolve API 在哪里

Web Shell 不需要知道 Ammo 背后的具体上游。

### 3. 搜索

搜索框默认是：

```text
请选择搜索源
```

不会默认搜索，也不会默认启用聚合搜索。

明确选择某一个 Ammo，只有它收到搜索请求；明确选择“聚合搜索”，才会请求全部已装载、支持搜索的 Ammo。

### 4. 播放 / 解析

搜索结果点击“使用”后，Web Shell 得到标准化的：

```json
{
  "source": "tx",
  "id": "song-id",
  "quality": "320k"
}
```

然后进入 Resolve 流程。

多个 Ammo 时，Shell 按配置顺序逐一尝试：

```text
Ammo A → 失败 → Ammo B → 成功
```

成功后立即停止，不继续轰击其他 Ammo。

## 完整部署指南

### A. GitHub Pages

GitHub Pages 适合这个项目，因为 Web Shell 是纯静态前端。

官方入口：

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

步骤：

1. 打开仓库 `xzh767/lxmusic-web-shell`。
2. 进入 **Settings → Pages**。
3. 在 **Build and deployment → Source** 中选择 **Deploy from a branch**。
4. Branch 选择 `master`，Folder 选择 `/ (root)`。
5. 保存。
6. 等待 GitHub Pages 完成部署。

官方文档说明，Pages 可以直接从分支根目录发布，也可以使用 `/docs` 目录；本项目推荐直接发布根目录。citeturn361198search6turn361198search5

#### GitHub Pages 自定义域名

在仓库 Pages 设置中填写你的自定义域名，然后按 DNS 提示配置。

对子域名，通常使用：

```text
CNAME
web.example.com  →  username.github.io
```

GitHub Pages 支持自定义域名，并支持 HTTPS；正式域名部署后建议打开 **Enforce HTTPS**。citeturn361198search3turn361198search1

> **注意**：GitHub Pages 是公开发布环境，不要把 API Key、私有上游地址、账号凭据等秘密放进仓库。官方文档也特别提醒 Pages 内容最终面向互联网公开。citeturn361198search7

### B. Netlify

Netlify 同样非常适合本项目。

官方文档：

- https://docs.netlify.com/start/quickstarts/deploy-from-repository/
- https://docs.netlify.com/deploy/create-deploys/

#### Git 仓库部署

1. 登录 Netlify。
2. 选择 **Add new project → Import an existing project**。
3. 连接 GitHub。
4. 选择 `xzh767/lxmusic-web-shell`。
5. Build command 留空。
6. Publish directory 使用仓库根目录（常见情况下使用 `.` 或直接使用项目根目录）。
7. Publish。

Netlify 的 Git Continuous Deployment 会在仓库 push 后自动重新部署。citeturn361198search0turn361198search2

#### Netlify Drop

本项目没有构建步骤，也可以直接将项目文件夹拖到 Netlify 的手动部署入口。

但用于长期维护时，更推荐连接 GitHub，这样每次更新代码都可以自动部署。

### C. Vercel

Vercel 同样可以把本项目当作纯静态站点部署。

步骤通常是：

1. 登录 Vercel。
2. **Add New → Project**。
3. Import Git Repository。
4. 选择 `xzh767/lxmusic-web-shell`。
5. Framework Preset 选择 **Other**（或让 Vercel 自动识别为静态项目）。
6. 不需要 Build Command。
7. Output Directory 保持项目根目录对应的默认设置。
8. Deploy。

如果后续仍保持纯静态结构，通常不需要额外的 Vercel Serverless Function。

Vercel 只负责托管 Web Shell；Ammo 仍然是外部 HTTP 服务。

### D. 任意静态主机

只要主机能正确提供：

```text
/index.html
/app.js
/style.css
```

并支持浏览器跨域访问 Ammo，就可以部署。

例如：

```text
Cloudflare Pages
对象存储静态托管
Nginx/Apache 静态目录
CDN 静态站点
```

核心要求不是平台，而是浏览器必须能够访问你的 Ammo API，并通过 CORS 检查。

## Ammo API / 弹药接口

Ammo 是本项目最重要的扩展机制。

一个最小 Ammo 至少提供：

```text
GET  /manifest.json
POST /api/resolve
```

如果还提供搜索，则增加：

```text
GET /api/search
```

完整的开发标准见：

**[`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md)**

紧凑 API 参考见：

**[`docs/AMMO_API.md`](docs/AMMO_API.md)**

## Ammo 与 LX Music Desktop 音源

对于熟悉 LX Music Desktop 自定义音源的人，Ammo 的概念非常接近：

```text
LX Music source                  Ammo
────────────────────────────    ────────────────────────────
globalThis.lx                    普通 HTTP server runtime
EVENT_NAMES.request              POST /api/resolve
EVENT_NAMES.inited               GET /manifest.json
info.musicInfo                   request.musicInfo / id
info.type                        request.quality
return playable URL              { ok: true, url: "..." }
```

不同点在于：

- LX 音源运行在 LX Desktop 的运行时环境中。
- Ammo 运行在独立服务器/Serverless/PHP/Node/Python/Go 等环境。
- LX 音源用 LX 内部事件系统通信。
- Ammo 用普通 HTTP + JSON 通信。
- Ammo 可以把复杂实现留在服务端，让 Web Shell 只看到一个 Manifest 和标准接口。

更多移植说明见 [`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md)。

## CORS

Ammo 从浏览器直接被调用，因此需要正确的 CORS。

推荐：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

如果可以明确限制站点来源，不建议长期使用：

```http
Access-Control-Allow-Origin: *
```

尤其不要让一个包含私有管理接口的 Ammo 后端无条件开放跨域访问。

## 流量与架构边界

Web Shell 的设计目标是：

```text
浏览器
  ↓
Web Shell
  ↓ 轻量 JSON
Ammo
  ↓ 轻量解析请求
上游 resolver
  ↓
音频 URL
  ↓
浏览器直接播放
```

而不是：

```text
浏览器
  ↓
Web Shell / Ammo Gateway
  ↓
整个 MP3 / FLAC / M4A 音频流
```

**默认不做音频反向代理。**

这样可以避免把 Web Shell / Ammo 主机变成音频 CDN、下载中继或大文件缓存节点。

## 生产环境建议

如果你自己运营 Ammo，建议至少加入：

- 上游超时
- 请求参数校验
- 短期结果缓存
- provider 冷却
- 串行回退
- 合理速率限制
- 日志脱敏
- 不把 API Key 返回给浏览器
- 不把内部 provider 地址写入公开 Manifest
- 不接受任意 URL 的“开放代理”请求

如果你的 Ammo 内部本身有多个上游，可以采用：

```text
Provider A
Provider B
Provider C
     ↓
random / priority
     ↓
sequential fallback
```

但不建议一次请求同时并发轰击所有上游。

## 开发 / 本地运行

没有 Node.js 构建步骤。

可以直接：

```bash
python3 -m http.server 8080
```

然后打开：

```text
http://127.0.0.1:8080/
```

由于浏览器会执行 CORS 安全检查，本地 Web Shell 调试时需要确保 Ammo 允许对应 Origin。

## 项目边界

本仓库只维护 Web Shell：

```text
✅ 页面 UI
✅ 搜索 UI
✅ Ammo 装载
✅ 搜索聚合
✅ Resolve 回退
✅ 播放器
✅ 浏览器端日志
✅ 基础 Metadata

❌ 第三方 resolver 实现
❌ 第三方 API Key
❌ 私有上游凭据
❌ 音频反向代理
❌ 大文件缓存
❌ 批量预取音乐
```

## License

MIT License.

---

# English

## Overview

LX Music Web Shell is a **decoupled web frontend** for music search, resolution and playback.

The design principle is **separation between the shell and its pluggable Ammo backends**.

The Shell owns the UI and orchestration. Ammo owns the resolver/search implementation.

```text
Web Shell
   |
   | HTTP / JSON
   v
Ammo
   |
   v
Upstream resolver/provider
   |
   v
Final audio URL
   |
   v
Browser playback
```

The Shell intentionally does not bundle third-party resolver implementations, API keys or private upstream configuration, and it does not proxy the final audio stream.

> **Disclaimer**  
> This project is a generic frontend shell and API specification. It does not grant authorization to use any third-party music platform, resolver, API, or media URL. Operators and users are responsible for verifying authorization and complying with applicable law, copyright requirements, third-party terms of service, rate limits, anti-abuse rules and other policies. This project is not legal advice and is not intended as a mechanism to bypass copyright, platform security, rate limits or abuse controls.

## Public demos

### Web Shell Demo

**https://music.xlz767.dpdns.org/**

Author-maintained demonstration of the Web Shell.

### Ammo Gateway Demo

**https://music-ammo-api-gateway.xlz767.dpdns.org/**

Author-maintained demonstration Ammo Gateway for learning and API testing.

### Demo service policy

- The demo backend is a shared public service and has no SLA.
- Caching, throttling, cooldowns, access controls, or service shutdown may be applied at any time.
- **Do not bulk scrape, stress-test, loop requests at high frequency, automate large-scale resolution, or otherwise abuse the demo backend.**
- Do not use the demo as a production dependency.
- Do not redirect large third-party traffic volumes through the demo.
- The author may rate-limit or block abnormal traffic without notice.
- Hosting a demo does not constitute endorsement of every upstream service connected to it.

## Features

- Pluggable Ammo backends
- Single-source search or aggregate search
- No default search source
- Sequential resolution fallback
- Browser-console diagnostics
- Standardized metadata support
- Mixed-content warning for HTTP media URLs
- No audio reverse proxy
- Local Ammo configuration storage
- Pure static deployment model

## Deployment platforms

### GitHub Pages

Use **Settings → Pages → Deploy from a branch**, select `master` and `/ (root)`.

Official documentation:

- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

GitHub Pages supports custom domains and HTTPS. Enable **Enforce HTTPS** after the certificate is provisioned. citeturn361198search6turn361198search3turn361198search1

### Netlify

Use **Add new project → Import an existing project**, connect GitHub and select this repository.

Because the project is static:

```text
Build command: empty
Publish directory: project root
```

Netlify can continuously deploy from Git, so pushes to the repository trigger new deployments. citeturn361198search0turn361198search2

### Vercel

Use **Add New → Project → Import Git Repository** and select this repository.

For a static deployment:

```text
Framework preset: Other / static
Build command: none
Output: project root
```

No serverless function is required for the Shell itself.

### Other hosts

Any static host can serve the project as long as browsers can reach the Ammo API and CORS is configured correctly.

## Ammo standard

A minimal Ammo provides:

```text
GET  /manifest.json
POST /api/resolve
```

Search support is optional:

```text
GET /api/search
```

Developer documentation:

- [`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md)
- [`docs/AMMO_API.md`](docs/AMMO_API.md)

`AMMO_STANDARD.md` explains the relationship to LX Music Desktop custom sources, the protocol mapping, development model, CORS, caching, fallback and security recommendations.

## CORS

Recommended response headers:

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

Restrict Origins whenever practical.

## Architecture boundary

The Shell is designed to send only lightweight control-plane traffic to Ammo:

```text
search / resolve / manifest
```

It intentionally does not proxy full MP3/FLAC/M4A streams.

The final audio URL is returned to the browser and fetched by the browser directly.

## Abuse resistance recommendations

Ammo operators should implement:

- bounded upstream timeouts
- input validation
- short-lived caching
- provider cooldowns
- sequential fallback
- reasonable rate limiting
- server-side secrets
- sanitized diagnostics
- no arbitrary URL proxying

## Local development

No Node.js build chain is required:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

## Scope

```text
Included:
  UI, search, Ammo management, fallback, player, logging, metadata

Not included:
  third-party resolver implementations,
  third-party API keys,
  private upstream credentials,
  audio reverse proxy,
  large-file caching,
  bulk prefetching
```

## License

MIT License.
