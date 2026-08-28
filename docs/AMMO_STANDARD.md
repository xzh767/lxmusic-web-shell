# LX Music Ammo Standard / LX Music Ammo 标准

> Version 1.0 — bilingual technical guide / 中英双语技术指南

## 1. What is Ammo? / 什么是 Ammo？

**Ammo** is the pluggable backend contract used by LX Music Web Shell. An Ammo is an external service that turns normalized music requests into search results and/or playable media URLs.

**Ammo（弹药）** 是 LX Music Web Shell 的可插拔后端接口。Ammo 是一个独立服务，负责把规范化的音乐请求转换成搜索结果和/或可播放的音乐直链。

The Web Shell is the presentation and orchestration layer. It does not need to know how an Ammo talks to any upstream provider.

Web Shell 是页面展示与编排层，不需要知道某个 Ammo 如何访问自己的上游服务。

```text
Web Shell / 网页壳
        |
        | Manifest + JSON API
        v
Ammo / 弹药服务
        |
        | provider-specific implementation
        v
upstream services / 上游服务
        |
        v
final audio URL / 最终音频直链
        |
        v
browser / 浏览器
```

The standard deliberately keeps the final audio URL out of the Ammo server's streaming path. An Ammo resolves a URL; it does not have to become an audio CDN or reverse proxy.

该标准有意让 Ammo 只负责“解析出 URL”，而不是把自己变成音频 CDN 或反向代理。

---

## 2. Relationship with LX Music custom sources / 与 LX Music 音源的关系

Ammo is intentionally familiar to developers who already know LX Music Desktop custom sources.

Ammo 的设计有意让熟悉 LX Music Desktop 自定义音源的开发者能够快速上手。

### Similarities / 相似处

1. **Platform + quality + music identity remain the core inputs.**

   **平台 + 音质 + 歌曲身份**仍然是核心输入。

2. **The final resolver responsibility is the same:** turn a platform-specific song identity into a playable URL.

   最终解析职责相同：把某个平台的歌曲身份转换成可播放 URL。

3. **Quality names are intentionally close to LX conventions**, such as `128k`, `320k`, `flac`, and `flac24bit`.

   音质名称有意贴近 LX 生态，例如 `128k`、`320k`、`flac`、`flac24bit`。

4. **A richer music object may be carried through the request.**

   请求可以携带更丰富的 MusicInfo。

### Differences / 区别

1. **Runtime environment.**

   LX Music Desktop custom sources run inside the LX runtime and can use `globalThis.lx`, including its `request`, event system, and utility helpers. Ammo is an ordinary HTTP service and does not depend on the LX Electron runtime.

   LX Music Desktop 音源运行于 LX Runtime，可以直接使用 `globalThis.lx`、`request`、事件系统和工具函数；Ammo 则是普通 HTTP 服务，不依赖 LX Electron Runtime。

2. **Transport contract.**

   LX custom sources communicate through LX's internal event protocol. Ammo communicates over ordinary HTTP/JSON.

   LX 自定义音源通过 LX 内部事件协议通信；Ammo 通过标准 HTTP/JSON 通信。

3. **Deployment.**

   A custom source is a script file imported by LX. An Ammo is deployed as a standalone backend, on PHP, Node.js, Python, Go, serverless functions, or another HTTP-capable platform.

   LX 音源通常是导入客户端的脚本文件；Ammo 是独立后端，可以部署到 PHP、Node.js、Python、Go、Serverless Function 或其他 HTTP 平台。

4. **Isolation.**

   Web Shell knows only the Manifest and public endpoints. Internal resolver implementation, upstream addresses, credentials, and provider-specific logic can remain server-side.

   Web Shell 只需要知道 Manifest 和公开接口。真实解析实现、上游地址、凭据以及平台特定逻辑可以全部留在服务端。

5. **Search is explicit rather than implicit.**

   An Ammo may implement search, but it is not required merely to resolve a known song ID. This allows small resolve-only Ammo packages.

   Ammo 可以实现搜索，但“能解析一个已知歌曲 ID”并不要求必须实现搜索。因此可以存在很轻量的 resolve-only Ammo。

---

## 3. Public interface / 公共接口

A standard Ammo exposes a JSON Manifest and one or two HTTP APIs.

标准 Ammo 提供一个 JSON Manifest，以及一个或两个 HTTP API。

### Manifest / 清单

```http
GET /manifest.json
```

Example / 示例：

```json
{
  "version": 1,
  "id": "my-ammo",
  "name": "My Ammo",
  "versionName": "1.0.0",
  "baseUrl": "https://ammo.example",
  "platforms": {
    "tx": {
      "name": "腾讯音乐",
      "qualities": ["128k", "320k", "flac"]
    }
  },
  "endpoints": {
    "search": "/api/search",
    "resolve": "/api/resolve"
  },
  "capabilities": {
    "search": true,
    "resolve": true
  }
}
```

Required fields / 必需字段：

- `version`: protocol version / 协议版本
- `id`: stable unique Ammo identifier / 稳定且唯一的 Ammo ID
- `name`: display name / 显示名称
- `versionName`: human-readable Ammo version / 可读版本号
- `baseUrl`: API origin / API 根地址
- `platforms`: supported platform declarations / 支持的平台声明
- `endpoints.resolve`: resolver endpoint / 解析接口

`endpoints.search` may be omitted when search is not supported.

不支持搜索时可以省略 `endpoints.search`。

---

## 4. Resolve API / 解析接口

### Request / 请求

```http
POST /api/resolve
Content-Type: application/json
```

```json
{
  "source": "tx",
  "id": "song-id",
  "quality": "320k",
  "musicInfo": null
}
```

Fields / 字段：

| Field | Meaning | 含义 |
|---|---|---|
| `source` | logical platform ID | 平台逻辑 ID |
| `id` | platform-specific song identity | 平台歌曲身份 |
| `quality` | requested quality | 请求音质 |
| `musicInfo` | optional richer object | 可选的扩展歌曲信息 |

### Success / 成功

```json
{
  "ok": true,
  "url": "https://media.example/song.m4a",
  "mime": "audio/mp4",
  "metadata": {
    "title": "Song Name",
    "artist": "Artist",
    "album": "Album",
    "duration": 225,
    "codec": "AAC"
  }
}
```

`url` is mandatory. `mime` and `metadata` are optional.

`url` 必需；`mime` 和 `metadata` 可选。

### Failure / 失败

```json
{
  "ok": false,
  "message": "resolver unavailable"
}
```

An Ammo should return a useful but non-sensitive error message. Do not expose API keys, private headers, internal stack traces, or hidden upstream addresses unless the operator explicitly wants them exposed.

Ammo 应返回有用但不包含敏感信息的错误。不要暴露 API Key、私有请求头、内部堆栈或隐藏的上游地址。

### HTTP status guidance / HTTP 状态建议

- `200`: valid success response / 有效成功响应
- `400`: invalid client request / 客户端参数错误
- `404`: endpoint or resource unavailable / 接口或资源不存在
- `429`: explicit rate limit / 明确限流
- `502` or `503`: temporary upstream/resolver failure / 临时上游或解析器故障

---

## 5. Search API / 搜索接口

Search is optional.

搜索接口是可选能力。

```http
GET /api/search?q=keyword&page=1&limit=20
```

Optional query parameter:

```text
source=tx
```

用于限定平台。

Example success / 示例成功响应：

```json
{
  "ok": true,
  "results": [
    {
      "id": "song-id",
      "source": "tx",
      "name": "Song Name",
      "artist": "Artist",
      "album": "Album",
      "duration": 225,
      "picture": "https://media.example/cover.jpg"
    }
  ]
}
```

The Web Shell can aggregate multiple Ammo services. An Ammo should therefore fail independently and return a clear error instead of taking down unrelated sources.

Web Shell 可以聚合多个 Ammo。因此一个 Ammo 应该能够独立失败，并返回明确错误，而不应该影响其他 Ammo。

---

## 6. CORS / 跨域

Because the Web Shell calls Ammo directly from the browser, the Ammo must configure CORS.

由于 Web Shell 会从浏览器直接调用 Ammo，因此 Ammo 必须正确配置 CORS。

Recommended / 推荐：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

Avoid `Access-Control-Allow-Origin: *` when the service can safely restrict origins.

如果可以限定来源，尽量不要使用 `Access-Control-Allow-Origin: *`。

The endpoint should answer CORS preflight requests:

接口还应正确响应 OPTIONS 预检请求。

---

## 7. Development model / 开发方式

### A. Resolve-only Ammo / 仅解析型 Ammo

The smallest implementation is a resolver only:

最小实现就是只写解析：

```text
Manifest
   ↓
POST /api/resolve
   ↓
source + id + quality
   ↓
provider-specific code
   ↓
url
```

This is useful when you already have a trusted search source or want the Web Shell to accept manually supplied IDs.

适合已经有可信搜索源，或者希望 Web Shell 先支持手动输入 ID 的情况。

### B. Search + Resolve Ammo / 搜索 + 解析型 Ammo

A full Ammo adds:

完整 Ammo 再增加：

```text
GET /api/search
```

Search results should already contain the normalized information that the Web Shell needs to call `/api/resolve`.

搜索结果应直接提供 Web Shell 调用 `/api/resolve` 所需的规范化信息。

### C. Multi-upstream Ammo / 多上游 Ammo

An Ammo can itself contain multiple upstream providers:

一个 Ammo 自己内部也可以包含多个上游：

```text
Ammo
 ├─ upstream A
 ├─ upstream B
 └─ upstream C
```

Recommended behavior / 推荐行为：

- maintain an explicit compatibility matrix / 维护明确的平台×音质支持矩阵
- try only compatible providers / 只尝试兼容的 provider
- prefer sequential fallback over parallel fan-out / 优先串行回退而不是并发轰击
- cache short-lived successful resolutions / 对成功解析做短期缓存
- apply provider cooldown after repeated failures / 连续失败后短暂冷却 provider
- never proxy the final audio stream unless you have a strong operational reason / 除非有充分运维理由，不要代理最终音频流

---

## 8. Porting an LX Music source / 把 LX Music 音源移植成 Ammo

Developers familiar with LX custom sources can usually map the concepts as follows:

熟悉 LX 自定义音源的开发者，可以按以下方式映射：

| LX Music | Ammo |
|---|---|
| `globalThis.lx` | ordinary HTTP server runtime / 普通 HTTP 服务运行时 |
| `on(EVENT_NAMES.request, ...)` | `POST /api/resolve` / 解析 HTTP 接口 |
| `send(EVENT_NAMES.inited, ...)` | `GET /manifest.json` / Manifest |
| `musicInfo.songmid` / `hash` / platform IDs | `id` + `source` / `id` + `source` |
| `info.type` | `quality` |
| return a playable URL | return `{ "ok": true, "url": "..." }` |
| `request(url, options, cb)` | server-side HTTP client such as cURL/fetch/requests |

Example conceptual port / 概念移植示例：

LX-style logic:

```js
on(EVENT_NAMES.request, async ({ source, info }) => {
  const id = source === 'kg'
    ? info.musicInfo.hash
    : info.musicInfo.songmid;

  return fetchProvider(source, id, info.type);
});
```

Ammo-style endpoint:

```js
app.post('/api/resolve', async (req, res) => {
  const { source, id, quality } = req.body;
  const url = await fetchProvider(source, id, quality);
  res.json({ ok: true, url });
});
```

The provider-specific algorithm is conceptually the same; only the runtime envelope changes.

平台特定的解析算法通常可以保持相同；主要变化只是运行时外壳从 LX Event API 变成 HTTP API。

---

## 9. Private gateway pattern / 私有聚合网关模式

Ammo also supports a gateway architecture:

Ammo 也支持聚合网关架构：

```text
Web Shell
    |
    v
Public Manifest
    |
    v
Your Ammo Gateway
    |
    +---- resolver A
    +---- resolver B
    +---- resolver C
    +---- ...
```

The public Manifest can expose only your gateway's origin while the gateway keeps internal implementation details private.

公开 Manifest 可以只暴露你自己的网关地址，而把内部实现细节留在服务器端。

However, this does **not** make upstream traffic anonymous or invisible. Upstream services still see the network identity of the gateway when the gateway makes requests.

但这**不会让上游流量匿名或不可见**。网关向上游发请求时，上游仍然能够看到网关的网络身份。

For this reason, implement:

因此应实现：

- per-provider cooldown / provider 冷却
- short result caching / 短期结果缓存
- sequential fallback / 串行回退
- request validation / 请求参数校验
- sensible rate limiting / 合理限流
- no audio-stream proxy by default / 默认不代理音频流

---

## 10. Versioning / 版本管理

Keep `version` for the protocol version and `versionName` for your Ammo release.

`version` 用于协议版本，`versionName` 用于 Ammo 自己的发行版本。

A backward-compatible Ammo update should normally keep the same protocol `version`.

向后兼容的 Ammo 更新通常不应修改协议 `version`。

When a breaking protocol change is necessary, increment the protocol version and document the migration path.

发生破坏性协议变化时，应提升协议版本并记录迁移方式。

---

## 11. Security and abuse resistance / 安全与滥用防护

An Ammo is an Internet-facing API. Treat every browser request as untrusted input.

Ammo 是面向互联网的 API，所有浏览器请求都应视为不可信输入。

Recommended / 推荐：

1. Validate `source`, `id`, `quality`, page and limit. / 校验 `source`、`id`、`quality`、分页参数。
2. Set timeouts on all upstream requests. / 所有上游请求设置超时。
3. Limit request concurrency. / 限制并发请求。
4. Cache repeated identical requests where safe. / 对安全的重复请求进行缓存。
5. Return generic public errors and keep diagnostics server-side. / 对外返回概括性错误，把诊断留在服务器日志。
6. Never publish private API keys in the Manifest or Web Shell. / 不要把私有 API Key 放进 Manifest 或 Web Shell。
7. Do not turn the Ammo into a general-purpose open proxy. / 不要把 Ammo 做成通用开放代理。

The standard does not provide a legal exemption. Operators remain responsible for the APIs they operate, the upstreams they access, and the content they expose.

该标准不构成法律免责。运营者仍需对自己运行的 API、访问的上游以及向用户提供的内容承担相应责任。

---

## 12. Minimal checklist / 最小开发检查清单

Before publishing an Ammo, verify:

发布 Ammo 前至少确认：

```text
[ ] GET /manifest.json works / Manifest 可访问
[ ] JSON is valid / JSON 有效
[ ] baseUrl is correct / baseUrl 正确
[ ] platform IDs are stable / 平台 ID 稳定
[ ] declared qualities match reality / 声明的音质与实际一致
[ ] POST /api/resolve works / 解析接口正常
[ ] failure response is JSON / 失败也返回 JSON
[ ] CORS preflight works / CORS 预检正常
[ ] upstream timeout is bounded / 上游有超时
[ ] rate limiting/cooldown exists / 有限流或冷却
[ ] audio is returned as a URL, not proxied / 返回音频 URL 而非音频代理
[ ] secrets remain server-side / 密钥留在服务端
```

## 13. Compatibility reference / 兼容参考

The Web Shell's current documented contract is also described in [`AMMO_API.md`](AMMO_API.md). This document is the developer-oriented standard and migration guide; `AMMO_API.md` is the compact API reference.

Web Shell 当前的接口约定也记录在 [`AMMO_API.md`](AMMO_API.md)。本文档偏向开发者标准和移植指南；`AMMO_API.md` 是精简 API 参考。
