# LX Music Web Shell

> **A lightweight web shell for pluggable music resolvers (Ammo).**  
> **一个面向可插拔音乐解析后端（Ammo）的轻量 Web Shell。**

[中文](#中文) · [English](#english)

---

# 中文

## 项目简介

LX Music Web Shell 是一个与具体音源实现解耦的音乐搜索、解析与播放前端。

核心思想是 **“枪弹分离”**：

```text
┌──────────────────────────────┐
│        Web Shell / 枪         │
│ UI · 搜索 · 播放器 · 装弹管理 │
│ 回退 · 重试 · 日志 · Metadata │
└──────────────┬───────────────┘
               │ HTTP / JSON
               ▼
┌──────────────────────────────┐
│         Ammo / 弹药           │
│ 可选搜索 · 解析 · 上游适配    │
│ 缓存 · 限流 · 回退             │
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

Web Shell 不包含具体第三方 resolver 实现、API Key 或私有上游配置，也不代理最终音频流。

> **免责声明 / Disclaimer**  
> 本项目只是通用前端壳和接口规范，不授予任何第三方音乐平台、API、resolver 或媒体资源的使用授权。使用者、Ammo 运营者和部署者应自行确认权限，并遵守当地法律、版权要求、第三方服务条款、速率限制和滥用政策。本项目不构成法律意见，也不是规避版权、风控或访问控制的工具。

## 在线 Demo / Live Demo

### Web Shell

**https://music.xlz767.dpdns.org/**

作者维护的 Web Shell Demo。

### Ammo Gateway

**Manifest：**  
**https://music-ammo-api-gateway.xlz767.dpdns.org/manifest.json**

这是 Ammo Gateway 的公开 Manifest 入口，而不是 Gateway 网站首页。

Gateway 根目录故意关闭目录索引，因此：

```text
https://music-ammo-api-gateway.xlz767.dpdns.org/
```

返回 `403 Forbidden` 是正常的安全配置，**不要把根目录 URL 当作 Ammo 地址**，应使用上面的 `/manifest.json`。

**Demo 使用声明 / Demo Usage Disclaimer：**

- Demo 是公共演示服务，不提供 SLA。
- 服务可能实施缓存、限流、冷却、访问控制或随时停用。
- **禁止批量抓取、压力测试、高频循环请求、大规模自动化解析或其他滥用行为。**
- 不要把 Demo 当生产后端，也不要将第三方项目的大量流量转发到 Demo。
- 作者可以在不另行通知的情况下限制、拒绝或封禁异常流量。
- Demo 不代表作者为任何第三方 Ammo、resolver、音乐平台或上游服务背书。

## 核心特性

- **可插拔 Ammo**：通过公开 `manifest.json` 装载外部后端。
- **搜索与解析解耦**：Search 不要求由 Ammo 提供；Search API 可以独立部署。
- **默认不选择搜索源**：避免页面打开后自动制造搜索流量。
- **解析回退**：多个 Ammo 可以按配置顺序逐个尝试。
- **临时失败重试**：网络错误、408、429、5xx 等临时错误默认最多重试 3 次。
- **浏览器 Console 排障**：记录请求顺序、耗时和失败原因。
- **Metadata**：支持 Ammo 返回标准化音频元数据。
- **HTTP 直链提示**：发现 HTTP 音频 URL 时提示 Mixed Content 风险，但不会改写 URL。
- **不代理音频**：最终音频由浏览器直接访问，不把 Web Shell 变成音频 CDN。
- **本地装弹配置**：Ammo Manifest 保存在浏览器 `localStorage`。
- **纯静态前端**：无需 PHP、Node.js 或构建链即可部署。

## 项目结构

```text
lxmusic-web-shell/
├── index.html
├── app.js
├── style.css
├── ammo.manifest.example.json
├── README.md
├── LICENSE
└── docs/
    ├── AMMO_API.md
    └── AMMO_STANDARD.md
```

## 快速开始

### 1. 部署 Web Shell

直接托管：

```text
index.html
app.js
style.css
```

无需构建。

### 2. 装载 Ammo

打开 **装弹管理 / Ammo Manager**，填写：

```text
https://your-ammo.example/manifest.json
```

点击“装载”。Web Shell 会从 Manifest 获取 Ammo 名称、版本、支持的平台/音质以及 Resolve API 地址。

### 3. 搜索

搜索下拉框默认保持空白：

```text
请选择搜索平台
```

不会自动聚合。

搜索结果提供标准化的 `source + id`，之后交给已装载 Ammo 做 Resolve。

### 4. 解析

多个 Ammo 时：

```text
Ammo A → 失败 → Ammo B → 成功
```

临时网络失败会自动重试，成功后立即停止继续请求其他 Ammo。

## 部署方式

### GitHub Pages

1. Fork/使用本仓库 `xzh767/lxmusic-web-shell`。
2. 打开 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**。
4. Branch 选择 `master`，目录选择 `/ (root)`。
5. 保存，等待 Pages 发布。
6. 如需自定义域名，在 Pages 设置中填写域名并按 GitHub 提示配置 DNS。

本项目不需要 Actions 构建流程。

### Netlify

推荐 Git 部署：

1. Netlify → **Add new project → Import an existing project**。
2. 连接 GitHub。
3. 选择 `xzh767/lxmusic-web-shell`。
4. Build command 留空。
5. Publish directory 使用仓库根目录。
6. Deploy。

连接 Git 后，后续 push 会自动触发新部署。

临时测试也可以使用 Netlify Drop。

### Vercel

1. Vercel → **Add New → Project**。
2. Import `xzh767/lxmusic-web-shell`。
3. Framework Preset 使用 **Other** 或自动识别。
4. Build Command 留空。
5. Root Directory 使用项目根目录。
6. Deploy。

项目是纯静态站点，不需要 Serverless Function。

### Cloudflare Pages / 其他静态托管

任何能直接提供：

```text
/index.html
/app.js
/style.css
```

的静态托管都可以。

Ammo 则可以部署在 PHP、Node.js、Python、Go、Serverless 或其他能提供 HTTP/JSON 的环境。

## Ammo / 弹药接口

最小 Resolve Ammo：

```text
GET  /manifest.json
POST /api/resolve
```

可选搜索：

```text
GET /api/search
```

Search 和 Resolve 不要求属于同一个 Ammo。

完整标准：[`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md)  
精简 API：[`docs/AMMO_API.md`](docs/AMMO_API.md)

## 与 LX Music Desktop 音源的关系

熟悉 LX Music Desktop 音源的开发者可以这样理解：

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

区别：

- LX 音源运行在 LX Music Desktop Runtime 中；Ammo 是独立 HTTP 服务。
- LX 音源使用内部事件协议；Ammo 使用普通 JSON/HTTP。
- Ammo 不限定语言：PHP、Node、Python、Go 等均可。
- Ammo 可以把上游地址、凭据、复杂回退逻辑留在服务端。

熟悉 LX 音源的人通常只需把“事件回调”改成 HTTP handler，并按照标准字段返回结果即可。

## CORS

由于 Web Shell 在浏览器中直接调用 Ammo，Ammo 必须正确提供 CORS。

推荐：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

能够限定 Origin 时，优先不要使用：

```http
Access-Control-Allow-Origin: *
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

因此 Web Shell 不应该被改造成音频反向代理或大文件缓存节点。

## 运营 Ammo 的建议

如果 Ammo 自己有多个上游，推荐：

```text
Provider A
Provider B
Provider C
    ↓
random / priority
    ↓
sequential fallback
```

并加入：

- 超时
- 参数校验
- 短缓存
- provider cooldown
- 合理速率限制
- 审计日志与脱敏
- 私有 API Key 隔离
- 禁止任意 URL 开放代理

**不要并行轰击所有上游。**

## 隐私与日志

Ammo 运营者可能根据自己的实现记录 IP、平台、歌曲 ID、缓存命中、上游错误等信息。

因此敏感日志应：

- 不暴露成静态网页资源；
- 放到 Web Root 外，或显式禁止 HTTP 访问；
- 不把 API Key、账号凭据和内部上游地址返回给浏览器；
- 仅保留排障所需的信息。

---

# English

## Overview

LX Music Web Shell is a source-agnostic frontend for music search, resolving and playback.

Its core design is **“gun / ammo separation”**:

- **Web Shell (gun):** UI, player, search, Ammo management, retries, fallback and client-side diagnostics.
- **Ammo:** an external HTTP backend that can provide Resolve and optionally Search.

The Web Shell does not bundle third-party resolver implementations, private API keys or private upstream configuration, and it does not proxy final audio streams.

> **Disclaimer**  
> This project is a generic frontend and interface specification. It does not grant authorization to use any third-party music service, API, resolver or media resource. Operators and users are responsible for authorization, copyright, applicable law, third-party terms, rate limits and abuse policies. This project is not legal advice and is not intended to circumvent copyright, access controls or platform restrictions.

## Live Demo

### Web Shell

**https://music.xlz767.dpdns.org/**

### Ammo Gateway

**Manifest:**  
**https://music-ammo-api-gateway.xlz767.dpdns.org/manifest.json**

This is the public Ammo Manifest entrypoint. It is **not** the gateway homepage.

The gateway root intentionally has directory indexing disabled, so:

```text
https://music-ammo-api-gateway.xlz767.dpdns.org/
```

may return `403 Forbidden`. This is expected. Use `/manifest.json` when loading the Demo Ammo.

### Demo usage disclaimer

- Public demonstration service; no SLA.
- Caching, rate limiting, cooldowns and access controls may be enabled or changed.
- **No bulk scraping, stress testing, high-frequency loops or large-scale automated resolving.**
- Do not treat the Demo as a production backend or relay large volumes of third-party traffic through it.
- Abnormal traffic may be throttled, rejected or blocked without notice.

## Core features

- Pluggable Ammo via `manifest.json`.
- Search independent from installed Ammo.
- Empty search-source selection by default.
- Sequential Ammo fallback and three retries for transient request failures.
- Browser-console diagnostics.
- Optional normalized metadata.
- HTTP audio URL warning without rewriting.
- No audio reverse proxy.
- Local Ammo configuration.
- Pure static frontend with no build step.

## Deployment

### GitHub Pages

Use **Settings → Pages → Deploy from a branch**, select branch `master` and `/ (root)`. No build command is required.

### Netlify

Import `xzh767/lxmusic-web-shell` as an existing Git repository. Leave Build Command empty and publish the repository root. Git pushes can trigger automatic redeploys. Netlify Drop is suitable for temporary manual deployment.

### Vercel

Import the repository, use **Other**/automatic framework detection, leave Build Command empty, keep the root directory, and deploy.

### Cloudflare Pages / other static hosts

Any host capable of serving `index.html`, `app.js` and `style.css` can host the Web Shell.

## Ammo protocol

Minimal Resolve Ammo:

```text
GET  /manifest.json
POST /api/resolve
```

Optional Search:

```text
GET /api/search
```

Search and Resolve may be separate services.

See [`docs/AMMO_STANDARD.md`](docs/AMMO_STANDARD.md) for the developer standard and [`docs/AMMO_API.md`](docs/AMMO_API.md) for the compact API reference.

## LX Music Desktop source comparison

The conceptual mapping is:

```text
LX Music source                  Ammo
────────────────────────────    ────────────────────────────
globalThis.lx                    HTTP server runtime
request event                    POST /api/resolve
inited event                     GET /manifest.json
musicInfo                        request.musicInfo / id
type                             request.quality
playable URL                     { "ok": true, "url": "..." }
```

LX sources run inside LX Music Desktop's runtime; Ammo backends are standalone HTTP services and can be written in PHP, Node.js, Python, Go or another suitable language.

## CORS

Recommended:

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

Prefer an explicit Web Shell Origin over `*` when possible.

## Traffic boundary

Intended path:

```text
Browser → Web Shell → light JSON → Ammo → audio URL → Browser
```

The Web Shell/Ammo host should not become an audio reverse proxy or bulk media cache.

## Production recommendations

Use timeouts, validation, short caching, provider cooldowns, sequential fallback, rate limiting, secret isolation and audit logging. Do not expose arbitrary-URL proxy functionality.

Sensitive logs should never be directly exposed as static web resources; keep them outside the Web Root when possible or explicitly deny HTTP access.

## License

MIT License.
