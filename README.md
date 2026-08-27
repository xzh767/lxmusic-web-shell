# LX Music Web Shell

一个与具体音源实现解耦的音乐搜索/播放 Web 前端。

核心思路是 **“枪弹分离”**：

- **Web Shell（枪）**：只负责页面、搜索 UI、播放器、弹药选择、失败回退、日志和基础元数据显示。
- **Ammo（弹药）**：由外部服务提供搜索与解析能力。Web Shell 不捆绑第三方音源脚本、API Key 或上游实现。
- **不做音频反向代理**：解析得到的音频 URL 由浏览器直接访问，Web Shell 不中转音频流。

> 这种架构降低组件耦合和集中式流量压力，但不是法律免责机制。使用者仍需确保所接入的 resolver 合法、获得授权，并遵守第三方服务的版权、速率限制、滥用和使用条款。

## Features

- 搜索单个已装载 Ammo
- 可选的聚合搜索
- 搜索源默认空白，不主动请求任何平台
- 解析时按已选 Ammo 顺序逐个回退
- 浏览器 Console 记录请求顺序与失败原因
- 支持手工 `平台 + ID + 音质` 解析
- 支持 Ammo 返回标准化歌曲元数据
- HTTP 音频直链提示，但**不代理音频流**
- Ammo Manifest 本地保存到 `localStorage`
- 纯静态前端，可部署到 GitHub Pages / Netlify / Vercel / 任意静态站点

## Quick Start

### 1. 部署 Web Shell

把以下文件放到任意静态网站根目录：

```text
index.html
app.js
style.css
```

例如 GitHub Pages：

```text
Repository → Settings → Pages → Deploy from branch
```

也可以直接拖到 Netlify/Vercel 等静态托管平台。

### 2. 准备 Ammo

Ammo 是独立的 resolver/search backend，需要实现本项目定义的标准 HTTP API：

```text
GET  /manifest.json
GET  /api/search?q=...
POST /api/resolve
```

完整协议见 [`docs/AMMO_API.md`](docs/AMMO_API.md)。

项目提供了一个无实际后端地址的示例 Manifest：

```text
ammo.manifest.example.json
```

### 3. 装弹

打开网站 → **⚙️ 装弹管理** → 输入 Ammo 的 Manifest URL → **装载**。

装载后，Ammo 会保存在当前浏览器的 `localStorage` 中。

可以重复装载多个 Ammo。相同 `id` 会更新原配置。

### 4. 搜索

搜索下拉框默认显示：

```text
请选择搜索源
```

不会默认选择单源，也不会默认启用聚合搜索。

明确选择：

```text
聚合搜索（全部已装载源）
```

才会并发请求全部已装载 Ammo。

### 5. 播放 / 解析

搜索结果点击 **使用** 后，页面填入平台、ID、音质并调用解析。

解析时按 Ammo 顺序逐个尝试：

```text
Ammo A → 失败 → Ammo B → 成功
```

如果全部失败，页面只显示总失败结果；详细请求过程写入浏览器 Console。

## CORS

因为 Web Shell 是浏览器端直接调用 Ammo，因此 Ammo 必须允许 Web Shell 的 Origin。

例如：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Headers: Content-Type
```

**请优先使用明确的站点 Origin，而不是 `*`。**

## Traffic / architecture boundary

Web Shell 只发送：

```text
搜索请求
解析请求
Manifest 请求
```

它不会把 MP3/FLAC/M4A 等音频再转发到自己的服务器。

播放链路保持：

```text
浏览器
   ↓ HTTPS/HTTP
外部音频 URL
```

而不是：

```text
浏览器
   ↓
Web Shell
   ↓
外部音频 URL
```

这样不会把 Web Shell 主机变成音频 CDN 或反向代理。

## HTTP 音频

如果 Ammo 返回：

```text
http://...
```

Web Shell 会提示浏览器可能受到 HTTPS Mixed Content 限制，但不会强行改写 URL，也不会自动做代理。

## Security model

不要装载不可信的 Ammo 后端或 Manifest。Manifest 本身只是一份配置，但它指向的 API 可以接收搜索词和歌曲 ID。

建议：

- 只连接自己信任的 Ammo 服务。
- Ammo API 不要要求浏览器发送敏感凭据。
- 不要把第三方 API Key 写入 Web Shell。
- 不要在 Web Shell 中保存上游平台账号凭证。
- 为 Ammo 自己设置合理的频率限制和缓存策略。

## Project scope

本仓库只维护 Web Shell：

```text
✅ 页面 UI
✅ 搜索 UI
✅ 播放器
✅ Ammo 装载管理
✅ Ammo 顺序回退
✅ 浏览器端日志
✅ 基础 Metadata 展示

❌ 第三方音源脚本
❌ 第三方 API Key
❌ 音频反向代理
❌ 大文件缓存
❌ 批量抓取/预取音乐
```

## Development

本项目无需 Node.js 构建步骤，直接修改静态文件即可。

本地测试：

```bash
python3 -m http.server 8080
```

然后访问：

```text
http://127.0.0.1:8080/
```

## License

MIT License.

See [`LICENSE`](LICENSE).
