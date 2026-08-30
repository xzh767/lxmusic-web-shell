# LX Music Source ↔ Ammo Porting Example / LX Music 音源 ↔ Ammo 移植典例

> Bilingual reference / 中英双语参考

## 1. Architecture / 架构

The original Web project has several server-side resolvers. The clean LX Music migration is a small client-visible bridge source that calls one public Gateway; resolver implementation stays server-side.

原 Web 项目包含多个服务端解析器。最干净的 LX Music 移植方式，是做一个客户端可见的桥接源，只调用一个公开 Gateway，实际解析实现继续留在服务器。

```text
LX Music Desktop
      ↓
LX custom source (*.js)
      ↓ HTTP/JSON
Public Ammo Gateway
      ↓
private resolver A/B/C/...
      ↓
playable URL
```

LX Music's project README describes the custom-source model as passing song information to a selected custom source and using the returned online URL for playback.

Reference / 参考：https://github.com/lyswhut/lx-music-desktop#readme

## 2. Why keep the resolver private? / 为什么把解析器留在服务端？

An LX source is client-visible code. Anyone who imports it can inspect its JavaScript. Therefore it should contain only the public Gateway contract, never private upstream URLs, cookies, API keys or secret configuration.

LX 音源脚本属于客户端可见代码，因此不应包含私有上游 URL、Cookie、API Key 或秘密配置，只应包含公开 Gateway 契约。

Use:

```text
LX source → Gateway → private resolvers
```

## 3. Platform-specific identities / 平台身份字段

LX Music keeps platform-specific music identifiers. Typical mappings are:

| Platform / 平台 | Preferred field / 优先字段 |
|---|---|
| Kugou / 酷狗 | `musicInfo.hash` |
| Tencent / 腾讯 | `musicInfo.strMediaMid` |
| Kuwo / 酷我 | `musicInfo.musicid` |
| NetEase / 网易云 | `musicInfo.songmid` |
| Migu / 咪咕 | `musicInfo.copyrightId` |

Reference / 参考：https://github.com/lyswhut/lx-music-desktop/blob/master/src/common/types/music.d.ts

Do not assume every platform has one universal ID field.

不要假设所有平台都存在一个统一 ID 字段。

## 4. Runtime mapping / 运行时映射

| LX Music custom source | Ammo Gateway |
|---|---|
| `globalThis.lx` | ordinary HTTP server runtime |
| `EVENT_NAMES.request` | `POST /api/resolve.php` |
| `action: musicUrl` | resolve operation |
| `info.musicInfo` | `musicInfo` / normalized ID |
| `info.type` | `quality` |
| returned URL string | `{ ok: true, url: "..." }` |

The current LX custom-source runtime uses `globalThis.lx` and the `musicUrl` operation. Runtime APIs can evolve, so verify against the current LX source documentation before publishing a new source.

当前 LX 自定义源运行于 `globalThis.lx`，核心解析操作是 `musicUrl`。运行时接口可能演进，因此发布前应检查当前 LX 源码/文档。

## 5. Full migration steps / 完整移植步骤

### Step 1 — write the input contract / 第一步：定义输入

```text
source + song identity + quality + optional musicInfo
```

Example / 示例：

```text
source = tx
id = strMediaMid
quality = 320k
```

### Step 2 — move upstream implementation server-side / 第二步：把上游实现移到服务端

Before:

```text
LX source
 ├─ upstream endpoint
 ├─ credentials
 └─ resolver algorithm
```

After:

```text
LX source → Gateway → resolver
```

### Step 3 — wrap LX request() / 第三步：封装 request()

```js
const postJson = (url, body) => new Promise((resolve, reject) => {
  request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, (err, response) => {
    if (err) return reject(err)
    resolve(response?.body)
  })
})
```

### Step 4 — map the platform ID / 第四步：取得平台 ID

```js
function getSongId(source, info) {
  switch (source) {
    case 'kg': return info.hash || info.songmid || info.id
    case 'tx': return info.strMediaMid || info.songmid || info.id
    case 'kw': return info.musicid || info.songmid || info.id
    case 'mg': return info.copyrightId || info.songmid || info.id
    case 'wy': return info.songmid || info.id
    default: return info.songmid || info.id
  }
}
```

### Step 5 — call the Gateway / 第五步：调用 Gateway

```js
const result = await postJson(RESOLVE_API, {
  source,
  id: String(id),
  quality,
  musicInfo,
})

if (!result?.ok || typeof result.url !== 'string') {
  throw new Error(result?.message || 'Resolver unavailable')
}

return result.url
```

### Step 6 — advertise real capabilities / 第六步：声明真实能力

`EVENT_NAMES.inited` should expose only platform/quality combinations actually supported by the backend.

`EVENT_NAMES.inited` 只应声明后端真实支持的平台和音质。

## 6. Complete demo / 完整 Demo

See [`examples/lx-gateway-source.js`](examples/lx-gateway-source.js).

The demo uses only:

```text
https://music-ammo-api-gateway.xlz767.dpdns.org/api/resolve.php
```

It does not contain the private resolver fleet.

Demo 只知道公开 Gateway，不包含内部解析器集群。

## 7. Error handling / 错误处理

A failed resolver should reject the request; it should never fabricate a URL.

解析失败应直接拒绝当前请求，不得伪造 URL。

Keep detailed stack traces, keys and private upstream information in backend logs only.

详细堆栈、密钥和私有上游信息只应保留在服务端日志。

## 8. Where fallback belongs / 回退应该放在哪里

```text
LX source
   ↓
Gateway
   ↓
Resolver A → fail
   ↓
Resolver B → fail
   ↓
Resolver C → success
   ↓
URL
```

The client does not need to know how many resolvers exist.

客户端不需要知道服务端到底有多少个解析器。

## 9. Source vs Ammo / LX 音源与 Ammo

The conceptual job is the same:

核心职责相同：

```text
source + musicInfo + quality
          ↓
resolve
          ↓
playable URL
```

The difference is the transport/runtime boundary: LX sources use LX's internal runtime; Ammo uses HTTP/JSON.

区别主要在运行时边界：LX 源使用 LX Runtime；Ammo 使用 HTTP/JSON。

## 10. Testing checklist / 测试清单

- Import successfully / 成功导入
- Verify platform declarations / 检查平台声明
- Verify quality declarations / 检查音质声明
- Test `musicUrl` / 测试 `musicUrl`
- Test timeout/failure behavior / 测试超时和失败
- Confirm no secrets are client-visible / 确认客户端无秘密信息
- Confirm final audio is not proxied / 确认最终音频不经过反向代理

## 11. Legal and operational note / 法律与运维说明

This is a technical interoperability example. It does not grant permission to access third-party services or media. Operators must comply with applicable law, copyright obligations, service terms, rate limits and abuse controls.

本文档只是技术互操作示例，不授予访问第三方服务或媒体资源的权限。运营者需自行遵守法律、版权义务、服务条款、速率限制和滥用控制。
