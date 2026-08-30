# Playlist Architecture / 六平台歌单架构

> Bilingual design note / 中英双语设计说明

## 1. Two entry points / 两个入口

The Web Shell uses one shared `identify()` parser in both places:

Web Shell 两处共用同一个 `identify()` 链接识别器：

```text
Paste URL
  ↓
identify()
  ├─ song     → existing Resolve flow
  └─ playlist → Playlist API

Open Playlist UI
  ↓
URL OR platform + playlist ID
  ↓
Playlist API
  ↓
normalized tracks[]
  ↓
existing Resolve flow
```

This prevents two separate URL parsers from drifting apart.

这样不会出现两套链接解析逻辑逐渐不一致的问题。

## 2. Six platforms / 六个平台

The frontend vocabulary is:

```text
wy  NetEase Cloud Music / 网易云音乐
tx  QQ Music / 腾讯音乐
kg  Kugou Music / 酷狗音乐
kw  Kuwo Music / 酷我音乐
mg  Migu Music / 咪咕音乐
bd  Baidu Music / 百度音乐（实验性）
```

`bd` is deliberately experimental. Recent LX Music Open API work documents five online search sources (`kw/kg/mg/tx/wy`), while `bd` also appears in LX source/UI vocabulary. Treat BD as an independent adapter capability rather than assuming stock LX currently provides production-grade BD online playlist support.

`bd` 有意标记为实验性。LX 近期 Open API 工作明确覆盖五个在线搜索源（`kw/kg/mg/tx/wy`），而 `bd` 也出现在 LX 的源/UI 词汇中，因此这里只把百度作为独立适配器能力，不声称官方 LX 当前提供生产级百度在线歌单能力。

References / 参考：
- https://github.com/lyswhut/lx-music-desktop/issues/2874
- https://github.com/lyswhut/lx-music-desktop/blob/master/src/lang/en-us.json

## 3. Why playlist is separate / 为什么歌单独立

The resolver only needs to turn a known song identity into a playable URL. Current LX development treats playlist management as a separate API concern, so the Web Shell does the same.

解析器只需要完成“已知歌曲身份 → 播放 URL”。LX 当前的 Open API 扩展也将歌单管理作为独立能力，因此 Web Shell 同样保持分层。

```text
Playlist adapter
      ↓
MusicInfo[]
      ↓
existing Ammo Resolver
      ↓
Audio URL
```

No second resolver implementation is necessary.

无需复制第二套解析器。

Reference / 参考：https://github.com/lyswhut/lx-music-desktop/issues/2874

## 4. Backend contract / 后端接口

Recommended:

推荐：

```http
GET /api/playlist?source=tx&id=123
```

or:

```http
GET /api/playlist?source=tx&url=<encoded-url>
```

Response:

响应：

```json
{
  "ok": true,
  "playlist": {
    "id": "123",
    "source": "tx",
    "title": "Example Playlist",
    "creator": "Example"
  },
  "tracks": [
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

The browser sees only normalized playlist data. Platform-specific API details stay inside the adapter.

浏览器只看到规范化歌单数据；平台特定 API 细节留在后端 adapter。

## 5. Adapter responsibilities / Adapter 职责

Each platform adapter should handle:

每个平台 adapter 应负责：

- playlist ID/link parsing / 歌单 ID/链接解析
- platform API/page retrieval / 平台 API 或页面读取
- pagination / 分页
- normalized song identities / 规范化歌曲身份
- title/artist/album/duration/cover / 歌名、歌手、专辑、时长、封面
- independent error handling / 独立错误处理
- rate limits and timeouts / 限流和超时

Do not return raw upstream responses, credentials or private implementation details.

不要返回上游原始响应、凭据或私有实现细节。

## 6. Reliability / 稳定性

Playlist loading can create many upstream requests. Prefer short caching and bounded concurrency:

歌单一次可能包含大量曲目，建议短缓存和有界并发：

```text
same playlist/page
       ↓
short cache
       ↓
bounded adapter requests
```

Do not prefetch an entire huge playlist when the UI only needs the first page.

UI 只需要第一页时，不要预取整个超大歌单。

## 7. Security / 安全

Do not turn `/api/playlist` into an arbitrary URL fetcher.

不要把 `/api/playlist` 做成任意 URL 抓取器。

Prefer:

推荐：

```text
source ∈ known adapters
        ↓
adapter controls allowed host/path
```

The server should validate platform IDs, constrain accepted hosts, use timeouts, rate-limit requests, and keep internal logs private.

服务端应校验平台 ID、限制允许的域名、设置超时和限流，并保证内部日志不可从 HTTP 直接访问。

## 8. Current Web Shell implementation / 当前 Web Shell 实现

The repository frontend now contains:

仓库前端现在包含：

- reusable six-platform link recognition / 可复用六平台链接识别
- song/playlist branching / 歌曲与歌单分流
- dedicated Open Playlist UI / 独立打开歌单入口
- normalized track rendering / 规范化曲目渲染
- track → existing Resolve handoff / 曲目交给既有 Resolve
- independent Metadata enrichment / 独立 Metadata 增强

The actual `/api/playlist` implementation is intentionally a backend adapter concern. It should be added and tested separately for each platform rather than pretending that a single generic scraper is reliable for all six.

实际 `/api/playlist` 有意作为后端 adapter 层。六个平台应分别实现和测试，不应假装一个通用抓取器可以稳定处理全部平台。

## 9. Operational boundary / 运维边界

Playlist support reads playlist metadata and normalized identities. It should not turn the Web Shell or Gateway into an audio-stream proxy or bulk downloader.

歌单功能负责读取歌单元数据和规范化歌曲身份，不应把 Web Shell 或 Gateway 变成音频流代理或批量下载器。
