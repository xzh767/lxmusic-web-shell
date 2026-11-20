# LX Music Web Shell — Edge CORS Proxy

一个极简 CORS 代理模块，为每个部署了本项目的用户提供属于自己的边缘节点。
用户设置一个变量即可让所有搜索/歌词/歌单请求走自己的代理，不再依赖作者的 Ammo 网关。

## 🏗️ 三级架构

| 层级 | 路径 | 触发条件 | 延迟 | 依赖 |
|------|------|---------|------|------|
| Tier 1 | 浏览器直连 | 平台原生支持 CORS（极少） | ~0ms | 用户网络 |
| Tier 2 | **用户边缘代理** | `window.LX_WEB_SHELL_CORS_PROXY` 已设置 | 低 | 用户部署的代理 |
| Tier 3 | Ammo 网关 | 前两层均失败 | 高 | 作者服务器（最后兜底） |

**默认行为：** 直连被 CORS 拦截 → 没有配置代理 → 全部走 Ammo（现有体验不变）。
**升级路径：** 部署一个代理 + 一行 JS 配置，Tier 2 成为主力，Ammo 完全退居幕后。

---

## 🔧 前端配置（一行搞定）

在 `index.html` 所有 `<script>` 标签**之前**添加：

```html
<script>window.LX_WEB_SHELL_CORS_PROXY = "https://your-proxy.example.com/proxy";</script>
```

注释掉的示例已在 `index.html` 中预留，取消注释填入你的代理地址即可启用。

---

## 📦 三种部署方式

### 方案 A：Cloudflare Pages Functions（推荐 · 免费·全球CDN）

```bash
# 1. 在你的 Pages 项目根目录创建以下结构
mkdir -p _functions/proxy

# 2. 复制 TypeScript 处理程序（见下方文件内容）
cp proxy/_functions/proxy/\[...proxy\].ts _functions/proxy/\[...proxy\].ts

# 3. 创建路由配置文件
echo '[{"path":"/proxy/*","function":"proxy"}]' > _routes.json

# 4. 连接 GitHub → Cloudflare Dashboard → Pages → Connect
#    Netlify 风格：自动构建部署，无需额外操作
```

**部署后的代理地址：** `https://your-project.pages.dev/proxy`

---

### 方案 B：Netlify Functions（最简单）

```bash
# 1. 创建函数目录和文件
mkdir -p netlify/functions
cp proxy/netlify/functions/proxy.js netlify/functions/proxy.js

# 2. （可选）如需自定义域名重定向，添加 netlify.toml
cat > netlify.toml << 'EOF'
[[redirects]]
  from = "/.netlify/functions/proxy/*"
  to = "/.netlify/functions/proxy/:splat"
  status = 200
EOF

# 3. push 到 Git → Netlify 自动检测并部署函数
```

**部署后的代理地址：** `https://your-site.netlify.app/.netlify/functions/proxy`

---

### 方案 C：Vercel Edge Middleware

```bash
# 1. 将代理代码放到项目根目录
cp proxy/proxy.mjs middleware.mjs

# 2. 创建 Next.js 中间件（需要 next.config.js 或 app/router）
#    参考 Vercel 文档：https://vercel.com/docs/edge-middleware
```

**部署后的代理地址：** `https://your-project.vercel.app/proxy`

---

## 🛡️ 安全白名单

代理只转发以下上游主机的请求（防滥用）：

- `interface.music.163.com` / `music.163.com` — 网易云音乐
- `u.y.qq.com` / `c.y.qq.com` — QQ 音乐
- `songsearch.kugou.com` / `mplayer.kugou.com` / `krcs.kugou.com` — 酷狗音乐
- `www.kuwo.cn` — 酷我音乐
- `app.c.nf.migu.cn` / `cscs.migu.cn` — 咪咕音乐

任何非白名单主机的请求会被拒绝（HTTP 403）。

---

## 📂 仓库中的代理文件

| 文件 | 说明 |
|------|------|
| `proxy/README.md` | 本文档 |
| `proxy/proxy.mjs` | Node.js 通用实现（支持 `?url=` 和 `/proxy/<url>` 两种调用方式） |
| `proxy/_functions/proxy/[...proxy].ts` | Cloudflare Pages / Workers 专用 |
| `proxy/netlify/functions/proxy.js` | Netlify Functions 专用 |
| `proxy/_routes.json` | CF Pages 路由配置 |

---

## 💡 使用场景举例

**场景 1：普通用户（不部署代理）**
```
搜索结果 → 直连 CORS 失败 → 无代理配置 → Ammo 网关 ✅
```
体验与修改前完全相同，零成本。

**场景 2：技术用户在自有 VPS 上部署代理**
```
VPS 部署 proxy.mjs → CORS_PROXY = "https://music-proxy.yourdomain.com/proxy"
搜索结果 → 直连 CORS 失败 → 经自己代理 → CORS 通过 ✅（无需经过 Ammo）
```
读操作流量完全不经过作者服务器。

**场景 3：音频流**
```
resolve.php 返回原始 CDN 直链（如 qqmusic.qq.com/xxx.mp3）→ 浏览器直接播放 ✅
```
音频本身不需要代理，所有 CDN 均支持跨域播放。
