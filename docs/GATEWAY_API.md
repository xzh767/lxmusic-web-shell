# Ammo Gateway HTTP API（作者私端网关）

> 本文件描述作者自维护的演示后端 `music-ammo-api-gateway.xlz767.dpdns.org` 的公开接口。
> 该网关是**私端资产**：内部 resolver、provider 列表、上游地址与凭据不公开、不上 GitHub。
> 任何人都可以按 [`AMMO_STANDARD.md`](AMMO_STANDARD.md) 自建同类网关，或直接用自己的 LX 音源脚本。

## 1. 接口一览

| 接口 | 方法 | 用途 | 状态 |
|---|---|---|---|
| `/manifest.json` | GET | Ammo 清单（平台、音质、端点） | ✅ |
| `/api/resolve.php` | POST | 解析歌曲 → 可播放直链 | ✅ |
| `/api/search.php` | GET | 搜索（服务端归一化） | ✅ 4/5 平台稳定 |
| `/api/lyric.php` | GET | 歌词（服务端归一化） | ✅ wy/tx/kg/kw |
| `/api/playlist.php` | GET | 歌单（服务端归一化） | ✅ wy/tx |

> `manifest.json` 由 `manifest.php` 输出（`.htaccess` 重写），因此带 CORS 头。
> 直接访问静态 `manifest.json` 文件在部分主机上不会带上 CORS 头，浏览器会拦截。

## 2. Manifest

```http
GET https://music-ammo-api-gateway.xlz767.dpdns.org/manifest.json
```

```json
{
  "version": 1,
  "id": "lx-unified-ammo-gateway",
  "name": "Unified Ammo Gateway",
  "versionName": "1.1.0",
  "baseUrl": "https://music-ammo-api-gateway.xlz767.dpdns.org",
  "platforms": {
    "kg": { "name": "酷狗音乐", "qualities": ["128k", "320k", "flac", "flac24bit"] },
    "tx": { "name": "腾讯音乐", "qualities": ["128k", "320k", "flac", "flac24bit"] },
    "mg": { "name": "咪咕音乐", "qualities": ["128k", "320k", "flac", "flac24bit"] },
    "wy": { "name": "网易云音乐", "qualities": ["128k", "320k", "flac", "flac24bit"] },
    "kw": { "name": "酷我音乐", "qualities": ["128k", "320k", "flac", "flac24bit"] }
  },
  "endpoints": {
    "search": "/api/search.php",
    "resolve": "/api/resolve.php"
  },
  "capabilities": { "search": false, "resolve": true }
}
```

## 3. Resolve

```http
POST https://music-ammo-api-gateway.xlz767.dpdns.org/api/resolve.php
Content-Type: application/json

{ "source": "tx", "id": "0039MnYb0qxYhV", "quality": "128k", "musicInfo": null }
```

成功：

```json
{
  "ok": true,
  "url": "https://isure6.stream.qqmusic.qq.com/....m4a?guid=cyapi&vkey=...",
  "source": "tx",
  "quality": "128k",
  "metadata": {}
}
```

失败（HTTP 502，返回 JSON 而不是 HTML 错误页）：

```json
{ "ok": false, "message": "resolver unavailable" }
```

平台 ID 字段对照：

| 平台 | `id` 取值 |
|---|---|
| 腾讯 `tx` | `strMediaMid` / `songmid` |
| 酷狗 `kg` | `hash` |
| 酷我 `kw` | `musicid`（可带 `MUSIC_` 前缀） |
| 网易云 `wy` | `songmid` / `id` |
| 咪咕 `mg` | `copyrightId` |

## 4. Search

```http
GET https://music-ammo-api-gateway.xlz767.dpdns.org/api/search.php?q=晴天&source=tx&page=1&limit=30
```

```json
{
  "ok": true,
  "results": [
    {
      "id": "0039MnYb0qxYhV",
      "source": "tx",
      "name": "晴天",
      "artist": "周杰伦",
      "album": "叶惠美",
      "duration": 269,
      "picture": null,
      "strMediaMid": "0039MnYb0qxYhV"
    }
  ],
  "errors": [],
  "cached": false
}
```

参数：`q`（或 `keyword`）、`source`（留空为全部平台聚合）、`page`、`limit`（≤30）。

> ⚠️ 海外服务器 IP 会触发平台风控：网易云返回加密内容、QQ 匿名请求返回空列表。
> 该平台搜索请在浏览器直连 `music.163.com`（国内网络可用），前端已按「浏览器直连优先」实现。

## 5. Lyric

```http
GET https://music-ammo-api-gateway.xlz767.dpdns.org/api/lyric.php?source=wy&id=3360100205
```

```json
{
  "ok": true,
  "source": "wy",
  "id": "3360100205",
  "cached": false,
  "lyric": "[00:00.00] 词 : 路夕月\n[00:01.00] 曲 : 成礼\n...",
  "lyricType": "lrc"
}
```

平台实现要点：

- **wy**：`music.163.com/api/song/lyric`
- **tx**：`i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg`（base64 解码）
- **kg**：`lyrics.kugou.com/search` → `download?id&accesskey&fmt=lrc`（需要 candidates 里的 accesskey）
- **kw**：`m.kuwo.cn/newh5/singles/songinfoandlrc`（重建 LRC）→ 公开 meting 兜底
- **mg**：公开 meting 兜底

## 6. Playlist

```http
GET https://music-ammo-api-gateway.xlz767.dpdns.org/api/playlist.php?source=wy&id=3778678
```

```json
{
  "ok": true,
  "cached": false,
  "playlist": { "id": "3778678", "source": "wy", "title": "热歌榜", "creator": "网易云音乐", "total": 200 },
  "tracks": [
    { "id": "1973665667", "source": "wy", "name": "海屿你", "artist": "马也_Crabbit", "album": "海屿你", "duration": 296, "picture": "http://p1.music.126.net/..." }
  ]
}
```

也支持直接传链接（服务端自动识别平台与歌单 ID）：

```http
GET /api/playlist.php?id=https%3A%2F%2Fmusic.163.com%2Fplaylist%3Fid%3D3778678
```

平台实现要点：

- **wy**：`music.163.com/api/playlist/detail`（或 `api/v6/playlist/detail` POST）
- **tx**：`c.y.qq.com/v8/fcg-bin/fcg_v8_playlist_cp.fcg`（旧 `qzone/fcg-bin` 端点已下线；
  返回体是 `text/html` 包 JSON，需二次解析，且 `cdlist` 位于 `data` 下）
- **kg / kw / mg**：官方端点对服务器 IP 拒绝访问；kw 走公开 meting 兜底，kg / mg 目前不可用

## 7. CORS

所有 `api/*.php` 与 `manifest.php` 返回：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Expose-Headers: Content-Type, X-Request-Id
Vary: Origin
```

## 8. 运维约定

- 部署在 serv00（FreeBSD），PHP 8.3，无数据库；缓存与审计日志写在 `state/`（Web Root 外，`.htaccess` 拒绝访问）
- 每次改动前 `.bak-时间戳` 备份，改完 `php -l` 校验
- 审计日志逐请求记录 `resolve_request` / `search_request` / `lyric_request` / `playlist_request`
  及失败原因（含 provider 名与错误信息），仅管理员视图可见
- 上游 provider 有冷却与缓存；**串行回退**，不并发轰击
- 网关只返回直链，**不代理音频流**

> **使用声明 / Usage notice**
> 这是公共演示服务，无 SLA，可能限流、冷却或随时停用。禁止批量抓取、压测与大规模自动化解析。
> 使用者需自行确认对第三方平台的授权，并遵守当地法律、版权要求与服务条款。
