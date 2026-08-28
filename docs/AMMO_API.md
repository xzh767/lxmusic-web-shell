# Ammo API Reference / Ammo API 参考

> Protocol version: `1` / 协议版本：`1`

This document is the compact HTTP reference for **Ammo**, the pluggable resolver/search backend used by LX Music Web Shell.

本文档是 LX Music Web Shell 的 **Ammo（可插拔解析后端）** 精简 HTTP 接口参考。

For architecture, LX Music source migration and implementation guidance, see [`AMMO_STANDARD.md`](AMMO_STANDARD.md).

架构、LX Music 音源移植和开发方法请参阅 [`AMMO_STANDARD.md`](AMMO_STANDARD.md)。

---

## 1. Manifest / 清单

The Shell loads one public JSON Manifest URL.

Web Shell 从一个公开 JSON Manifest URL 装载 Ammo。

```http
GET /manifest.json
```

Example / 示例：

```json
{
  "version": 1,
  "id": "example-ammo",
  "name": "Example Ammo",
  "versionName": "1.0.0",
  "baseUrl": "https://example.example",
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

### Required fields / 必需字段

| Field | English | 中文 |
|---|---|---|
| `version` | Protocol version | 协议版本 |
| `id` | Stable unique Ammo ID | 稳定唯一的 Ammo ID |
| `name` | Display name | 显示名称 |
| `versionName` | Ammo release version | Ammo 发布版本 |
| `baseUrl` | API base URL | API 根地址 |
| `platforms` | Supported platform map | 支持的平台映射 |
| `endpoints.resolve` | Resolve endpoint | 解析接口 |

`endpoints.search` is optional.

`endpoints.search` 可选。

`platforms` is a declaration for the Web Shell UI. It should match the real capabilities of the Ammo.

`platforms` 用于 Web Shell UI 展示，应与 Ammo 实际能力一致。

---

## 2. Search API / 搜索 API

Search is optional. / 搜索能力是可选的。

```http
GET /api/search
```

Query parameters / 查询参数：

```text
q        search keyword / 搜索关键词
keyword  compatibility alias / 兼容别名
source   optional platform ID / 可选的平台 ID
page     1-based page number / 从 1 开始的页码
limit    requested result count / 请求结果数量
```

Example / 示例：

```text
/api/search?q=晴天&source=tx&page=1&limit=20
```

Success / 成功：

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
      "picture": "https://example.com/cover.jpg"
    }
  ]
}
```

Recommended normalized fields / 推荐规范化字段：

- `id`: platform-specific song identity / 平台歌曲身份
- `source`: logical platform ID / 逻辑平台 ID
- `name`: title / 歌曲名
- `artist`: artist text / 歌手
- `album`: album name / 专辑
- `duration`: duration in seconds / 秒数时长
- `picture`: optional cover URL / 可选封面 URL

A search implementation may expose more fields. The Shell ignores fields it does not understand.

搜索实现可以返回更多字段；Web Shell 会忽略不认识的字段。

Failure / 失败：

```json
{
  "ok": false,
  "message": "search temporarily unavailable"
}
```

A failed Ammo should not expose private upstream details by default.

Ammo 失败时默认不应向客户端暴露私有上游细节。

---

## 3. Resolve API / 解析 API

```http
POST /api/resolve
Content-Type: application/json
```

Request / 请求：

```json
{
  "source": "tx",
  "id": "song-id",
  "quality": "320k",
  "musicInfo": null
}
```

### Request fields / 请求字段

| Field | Meaning | 含义 |
|---|---|---|
| `source` | Logical platform ID | 逻辑平台 ID |
| `id` | Platform-specific song identity | 平台歌曲身份 |
| `quality` | Requested quality | 请求音质 |
| `musicInfo` | Optional rich song object | 可选的扩展歌曲信息 |

The resolver may use `musicInfo` for richer platform identifiers, hashes, album IDs, etc.

解析器可以利用 `musicInfo` 提供更完整的平台标识，例如 hash、album ID 等。

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

`url` is required. `mime` and `metadata` are optional.

`url` 必需；`mime` 和 `metadata` 可选。

### Failure / 失败

```json
{
  "ok": false,
  "message": "resolver unavailable"
}
```

The message should be useful for users but should not leak API keys, private headers, internal stack traces, or hidden upstream endpoints.

错误信息应足够用于用户判断情况，但不应泄露 API Key、私有请求头、内部堆栈或隐藏的上游地址。

---

## 4. Metadata / 元数据

Metadata is optional. / 元数据是可选能力。

Recommended fields / 推荐字段：

```json
{
  "title": "Song Name",
  "artist": "Artist",
  "album": "Album",
  "albumArtist": "Album Artist",
  "duration": 225,
  "codec": "AAC",
  "sampleRate": 44100,
  "bitsPerSample": 16,
  "bitrateKbps": 320
}
```

The Shell may display or use these fields for player metadata.

Web Shell 可以使用这些字段显示播放器元数据。

---

## 5. CORS / 跨域

Ammo is called directly by the browser, so CORS must be configured.

Ammo 是由浏览器直接调用，因此必须正确配置 CORS。

Recommended / 推荐：

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Vary: Origin
```

Answer OPTIONS preflight requests.

必须正确处理 OPTIONS 预检请求。

When possible, restrict the allowed Origin instead of using `*`.

如果条件允许，应限制允许的 Origin，而不是长期使用 `*`。

---

## 6. Status codes / 状态码

Recommended semantics / 推荐语义：

```text
200  success
400  invalid request
404  endpoint/resource unavailable
429  rate limited
502  upstream/resolver failure
503  temporary service unavailable
```

The Web Shell treats non-2xx responses as failures and can fall back to another Ammo.

Web Shell 会将非 2xx 响应视为失败，并可以回退到其他 Ammo。

---

## 7. No audio reverse proxy / 不代理音频

The normal resolve flow is:

正常解析链路是：

```text
Browser
  ↓ JSON
Ammo
  ↓ JSON
Audio URL
  ↓
Browser directly fetches audio
```

An Ammo should not become a general-purpose file proxy.

Ammo 不应成为通用文件代理。

In particular, avoid accepting arbitrary `url=` parameters and downloading or forwarding arbitrary remote content.

尤其不要提供任意 `url=` 参数，把任意远程内容下载或转发出去。

---

## 8. Gateway Ammo / 聚合网关型 Ammo

A gateway may front several private resolver implementations while exposing only one public Manifest.

一个 Gateway 型 Ammo 可以在内部汇聚多个私有解析器，但对外只暴露一个 Manifest。

```text
Shell
  ↓
Public Manifest
  ↓
Ammo Gateway
  ├── Resolver A
  ├── Resolver B
  └── Resolver C
```

The public Manifest should contain only the gateway's public information. Internal resolver names, private configuration and upstream endpoints can remain server-side.

公开 Manifest 应只包含网关公开信息。内部 resolver 名称、私有配置和上游地址可以全部留在服务端。

This hides implementation details from Web Shell users, but it does not make upstream traffic anonymous. Upstreams can still see the gateway making the request.

这种方式可以隐藏实现细节，但并不会让上游流量匿名；上游仍然可以看到网关发起请求的网络身份。

Recommended gateway controls / 推荐网关控制：

- short successful-result caching / 短期成功缓存
- provider cooldown / provider 失败冷却
- sequential fallback / 串行回退
- bounded concurrency / 限制并发
- rate limiting / 限流
- request validation / 请求校验
- sanitized logs / 日志脱敏

---

## 9. Versioning / 版本管理

`version` identifies the protocol version. `versionName` identifies the Ammo release.

`version` 表示协议版本；`versionName` 表示 Ammo 自身发行版本。

Keep the protocol version when changes are backward compatible. Increase it when a breaking change is introduced.

向后兼容更新保持协议版本不变；出现破坏性变化时才提高协议版本。

---

## 10. Security / 安全

Ammo is an Internet-facing service.

Ammo 是一个面向互联网的服务。

At minimum:

至少应做到：

```text
- validate all input / 校验所有输入
- set upstream timeouts / 设置上游超时
- limit request rates / 限制请求频率
- keep secrets server-side / 密钥只放服务端
- do not expose private upstreams / 不暴露私有上游
- do not implement open proxy behavior / 不提供开放代理行为
- cache repeated requests when safe / 安全时缓存重复请求
```

The API specification does not grant legal immunity or permission to access any third-party service.

该接口规范不构成法律免责，也不授予访问任何第三方服务的权限。
