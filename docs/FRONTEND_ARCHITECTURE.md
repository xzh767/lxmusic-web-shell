# Web Shell 架构 / Front-end Architecture

> Bilingual-ish technical notes for the shell itself.
> 本文说明前端各文件的职责、数据流向与「浏览器直连优先」的设计取舍。

## 1. 文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 应用壳骨架：侧栏导航、五个视图容器、常驻播放栏、歌词面板、Toast |
| `style.css` | 深色主题（CSS 变量），桌面网格布局 + ≤860px 移动端重排 |
| `app.js` | 核心状态机与持久化：队列、收藏、歌单收藏、播放模式、音量、播放控制 |
| `views.js` | 视图逻辑：搜索、歌单、源管理 UI、收藏导入导出、事件绑定与初始化 |
| `client-api.js` | 浏览器直连适配器：搜索 / 歌词 / 歌单（上游 API 直接请求） |
| `sources.js` | Ammo 运行时：Manifest / LX 脚本沙箱 / HTTP 端点，统一 resolve 接口与回退 |
| `lyrics.js` | 歌词面板：LRC 解析、逐行高亮、点击跳转 |

加载顺序：`client-api.js` → `sources.js` → `lyrics.js` → `app.js` → `views.js`（全部 `defer`）。

## 2. 数据流

```text
                 ┌────────────────────────────┐
用户操作 ───────▶ │ views.js（视图层）        │
                 └───────────┬────────────────┘
                             │ window.LX_APP.*
              ┌──────────────┴───────────────┐
              ▼                              ▼
   ┌────────────────────┐        ┌─────────────────────┐
   │ client-api.js      │        │ sources.js (Ammo)   │
   │ 搜索/歌词/歌单      │        │ Manifest / LX 脚本  │
   │ 浏览器直连上游      │        │ / HTTP 端点         │
   └─────────┬──────────┘        └──────────┬──────────┘
             │ 直连失败时兜底                 │ 始终由服务端完成
             ▼                              ▼
   ┌────────────────────┐        ┌─────────────────────┐
   │ Ammo Gateway       │        │ Ammo Gateway        │
   │ /api/search.php    │        │ /api/resolve.php    │
   │ /api/lyric.php     │        │ （需凭据与串行回退）│
   │ /api/playlist.php  │        └─────────────────────┘
   └────────────────────┘
```

### 为什么这样切分

1. **上游平台对海外 IP 风控极严**（网易云加密、QQ 空列表、酷狗证书错配、酷我 407）。
   浏览器在用户自己的国内网络上直连上游，成功率远高于海外服务器中转。
2. **解析必须留在服务端**：需要私有 provider 集群、密钥、串行回退与冷却；放在浏览器会泄露实现。
3. 因此形成「**客户端优先 → 网关兜底**」：前端先试直连，全部失败才问网关；
   界面会明确标注结果来自「浏览器直连」还是「网关」。

## 3. Ammo 运行时（sources.js）

三种弹药实现同一个接口：

```js
{
  id, name, kind, platforms, enabled,
  async search(keyword, platform, page, limit) -> { results[], errors[] }
  async resolve(source, id, quality, musicInfo) -> { url, mime?, metadata? }
}
```

`registry.resolveWithFallback()` 依次尝试所有 `enabled` 的弹药，第一个成功者胜出；
失败信息记入 Console（不进 UI），与既有排障习惯一致。

### LX 脚本沙箱

在浏览器里模拟 LX Music Desktop 的自定义源运行时：

```js
globalThis.lx = {
  EVENT_NAMES: { request, inited, action, playerAction },
  on(event, handler), send(event, payload),
  request(url, options, callback),   // 自动解析 JSON 响应
  utils, log, action.showNotice,
}
```

要点：

- `globalThis.lx` 在脚本执行期间绑定，脚本才能 `const { EVENT_NAMES, request, on, send } = globalThis.lx`
- `send(EVENT_NAMES.inited, { sources: { tx: { qualitys: [...] } } })` 的载荷在**执行期间**即被捕获
  （脚本通常只调用一次 `send`），据此解析平台与音质声明
- `request()` 回调的 `response.body` 对 JSON 响应自动反序列化为对象，与真实 LX 运行时一致
- 脚本只在本机浏览器运行，**不上传到任何服务器**

## 4. 播放与队列

- 队列、收藏、已保存歌单、播放模式与音量写入 `localStorage`（键前缀 `lx-web-shell-` v2）
- 播放模式：列表循环 / 单曲循环 / 随机播放
- `MediaSession` 接入系统媒体控制（锁屏播放、上下曲）
- 播放结束（`ended`）或音频错误时自动切下一首
- HTTP 直链会提示混合内容风险，但**不代理、不改写 URL**

## 5. 排障约定

- 所有解析链路（请求了谁、谁失败、失败原因、最终由谁成功）输出到浏览器 Console
- 搜索/歌单/歌词会在 UI 上标注来源（浏览器直连 / 网关），便于判断风控位置
- 弹窗只承载面向用户的信息，细节留在 Console

## 6. 已知限制（需本地网络验证）

| 限制 | 说明 |
|---|---|
| 网易云搜索 | 海外 IP 返回加密内容；需在**国内网络的浏览器**中直连验证 |
| 网易云歌单 | 同上，`playlistWy` 直连在海外环境失败时走网关兜底 |
| 酷狗 / 酷我歌单 | 官方端点拒绝服务器访问；需在浏览器直连场景验证或换公开源 |
| 咪咕歌单 | 官方歌单接口已下线，目前无来源 |
| CORS 限制 | 浏览器无法绕过上游缺失的 CORS 头；这是浏览器策略，不是代码缺陷 |

> 上表项目无法在海外服务器上完整验证，请在你的本地网络逐项确认。
