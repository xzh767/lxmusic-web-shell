# LX Music Web Shell

> 面向可插拔音乐解析后端的 LX Music 风格 Web 播放器。零配置边缘代理，部署即生效。

[English](#english) · **中文**

---

## 🎯 一句话说明

纯前端音乐播放器壳（枪弹分离），支持网易云/QQ/酷狗/酷我/咪咕五平台搜索、歌词、歌单；音频解析由外部 Ammo 后端提供。**核心改动**：仓库自带 CORS 代理模块，推送到 Netlify / Cloudflare Pages / Vercel 后自动在同一个边缘节点上运行，无需任何手动配置。

## ✨ 架构亮点

### 零配置边缘代理 — 部署即工作

把仓库推送到任意边缘平台，代理函数**自动随前端一起部署**：

| 平台 | 需推送的文件 | 自动暴露地址 |
|------|------------|-------------|
| **Netlify** | `netlify.toml` + `netlify/functions/proxy.js` | `/.netlify/functions/proxy` |
| **Cloudflare Pages** | `_routes.json` + `_functions/proxy/[...proxy].ts` | `/proxy` |
| **Vercel** | `vercel.json` + `middleware.ts` | `/proxy` |

无需写配置、无需环境变量。前端加载时自动探测同站代理是否存在，找到即用，找不到静默降级 Ammo 网关，行为与之前完全兼容。

### 三级请求管道

```
浏览器 → Tier 1: 官方 API 直连（极少平台有 CORS，通常失败）
            ↓ 失败
        Tier 2: 你的边缘代理（零延迟，你自己的基础设施）
            ↓ 未部署
        Tier 3: Ammo 网关（作者服务器，始终可用作为兜底）
```

**只有音频直链解析**通过 Ammo 的 `resolve.php` 完成（需要服务端凭据鉴权），搜索/歌词/歌单数据在有了本地代理时完全由你自己节点提供服务。

## 🎵 支持的平台

| 标识符 | 平台 | 搜索 | 歌词 | 歌单 | 音频解析 |
|-------|------|------|------|------|---------|
| `wy` | 网易云音乐 | ✅ | ✅ | ✅ | ✅ |
| `tx` | QQ音乐 | ✅ | ✅ | ✅ | ✅ |
| `kg` | 酷狗音乐 | ✅ | ✅ | ✅ | ✅ |
| `kw` | 酷我音乐 | ✅ | ✅ | ❌ | ✅ |
| `mg` | 咪咕音乐 | ✅ | ✅ | ✅ | ✅ |

音质支持：`128k` / `192k` / `320k` / `flac` / `flac24bit`。

## 🚀 快速开始

### 1. Fork 或克隆本仓库

### 2. 推送到 Git 并连接部署平台

```bash
git remote add origin https://github.com/<你>/lxmusic-web-shell.git
git push -u origin master
```

然后去 Netlify / Cloudflare Pages / Vercel 导入这个仓库即可。**什么都不用配**。

### 3. 在线体验

👉 https://lxmusic-webshell.netlify.app/

### 可选：手动指定代理地址

如果你想用自己的代理而不是自动探测的：

```html
<!-- 放在 index.html 所有 <script> 标签之前 -->
<script>window.LX_WEB_SHELL_CORS_PROXY = "https://your-proxy.example.com/proxy";</script>
```

## 📂 仓库结构

```
├── index.html              # 主入口（先加载 auto-proxy.js 再加载业务脚本）
├── app.js                  # 核心：状态管理、播放控制、队列、收藏
├── views.js                # UI：搜索、歌单、源管理
├── lyrics.js               # 歌词面板（LRC + JSON Lines 双格式解析）
├── sources.js              # Resolver 注册表与回退链
├── theme.js                # 主题引擎（默认绿意盎然）
├── style.css               # 全部样式
│
├── netlify/
│   └── functions/proxy.js  # Netlify Function（推送后自动挂载到 /.netlify/functions/proxy）
├── _functions/
│   └── proxy/
│       └── [...proxy].ts   # Cloudflare Pages/Workers（_routes.json 自动路由）
├── _routes.json            # CF Pages 路由配置
├── netlify.toml            # Netlify 构建配置
├── vercel.json             # Vercel 构建配置
├── middleware.ts           # Vercel Edge Middleware
│
├── proxy/
│   ├── README.md           # 代理部署完整指南
│   ├── auto-proxy.js       # 前端自动探测逻辑（在 views.js 之前加载）
│   └── proxy.mjs           # 通用 Node.js 代理（供 Deno/Railway 等）
└── docs/
    └── GATEWAY_API.md      # Ammo 网关接口参考（自建时用）
```

## 🔍 自动探测原理

页面上电后，`proxy/auto-proxy.js` 立即执行一次快速探测：

```js
const candidates = [
  `${location.origin}/.netlify/functions/proxy`,  // Netlify Functions
  `${location.origin}/proxy`,                      // CF Pages / Vercel / 通用 serverless
];
for (const url of candidates) {
  try { await fetch(url, { method: 'HEAD', mode: 'no-cors' }); return url; }
  catch {}
}
// 都没响应 → 返回 null → 后续请求直接走 Ammo 兜底
```

用 HEAD 请求打两个路径，600ms 超时，第一个成功响应的就作为活跃代理基址，缓存在内存中供所有后续搜索/歌词/歌单调用使用。

**这意味着：**
- 你已经部署过的前端（Ammo 兜底模式）**不受任何影响**，继续正常工作
- 新推送带有代理函数的仓库，第一次访问会自动启用代理
- 用户不需要做任何额外操作

## ⌨️ 快捷键

- `Space`：播放 / 暂停
- `Shift + ← / →`：上一首 / 下一首
- `← / →`：快退 / 快进 5s

## ⚠️ 已知限制

- 音频流经过 Ammo 解析器（`resolve.php`），需要各平台 CDN 认证凭据，无法完全绕过
- 海外 IP 搜索网易云/QQ 可能触发平台风控返回空结果；建议在国内网络或自有代理节点下使用
- 酷我（`kw`）暂无歌单接口

---

<a name="english"></a>
## English

### Overview

A source-agnostic web player for music search, playback and pluggable resolver backends — an LX Music Desktop-style frontend. The key feature is a **zero-config edge CORS proxy** that deploys automatically alongside your frontend on Netlify, Cloudflare Pages, or Vercel.

### How It Works

1. Push this repo to any supported platform
2. The proxy function auto-deploys at a well-known path (`/.netlify/functions/proxy`, `/proxy`, etc.)
3. On page load, `auto-proxy.js` probes those paths — if one responds, all subsequent search/lyric/playlist requests route through it
4. If no proxy is found, everything falls back to the Ammo gateway exactly as before

### Five Platforms Supported

| Key | Platform | Search | Lyric | Playlist | Resolve |
|-----|----------|--------|-------|----------|---------|
| `wy` | NetEase Music | ✅ | ✅ | ✅ | ✅ |
| `tx` | QQ Music | ✅ | ✅ | ✅ | ✅ |
| `kg` | Kugou | ✅ | ✅ | ✅ | ✅ |
| `kw` | Kuwo | ✅ | ✅ | ❌ | ✅ |
| `mg` | Migu | ✅ | ✅ | ✅ | ✅ |

### License

MIT
