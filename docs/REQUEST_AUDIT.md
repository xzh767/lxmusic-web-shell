# 全站请求审计 v=20261120t

> 审计时间：2026-11-21
> 原则：**官方直连 → 边缘代理 → Ammo 兜底**（弹药分离架构）

---

## 一、热歌单（歌单首页）

| 层级 | 平台 | 端点 | 触发条件 | 备注 |
|------|------|------|---------|------|
| 直连 | wy | `music.163.com/api/playlist/list` | 浏览器直接 fetch | ✅ 无 CORS 限制（公开接口） |
| 直连 | tx | `c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg` | 浏览器直接 fetch | 需 `Referer: https://y.qq.com/`，代理层注入 |
| 直连 | kg | `www2.kugou.kugou.com/yueku/v9/special/getSpecial` | 浏览器直接 fetch | 需 `Referer: https://www.kugou.com/` |
| 直连 | kw | `wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList` | 浏览器直接 fetch | 需 `Referer: https://www.kuwo.cn/` |
| 直连 | mg | `app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0` | 浏览器直接 fetch | 需 `templateVersion=2` |
| 代理 | wy/tx/kw/mg | 同上，经 Netlify Function 转发 | 直连 CORS 失败时自动切换 | ✅ 已验证 wy/tx/kw/mg 均 200 |
| 代理 | kg | 同上 | 直连 CORS 失败时 | ❌ Netlify US 节点无法连通 `www2.kugou.kugou.com`，返回 502，属预期降级 |
| Ammo | 所有平台 | `music-ammo-api-gateway.xlz767.dpdns.org/api/playlist.php?type=hot&source={wy|tx|kg|kw|mg}` | 代理也失败时 | 最终兜底，`pl_hot_*` 全部已实现 |

---

## 二、歌曲搜索

| 层级 | 平台 | 端点 | 说明 |
|------|------|------|------|
| 直连 | wy | `interface.music.163.com/eapi/search/web?s=&limit=&offset=&total=true` | EAPI 接口，浏览器直连通常被 CORS 拦截 |
| 直连 | tx | `u.y.qq.com/cgi-bin/musicu.fcg?loginUin=0&...&data={JSON}` | 浏览器直连被 CORS 拦截 |
| 直连 | kg | `songsearch.kugou.com/song_search_v2?keyword=&page=&pagesize=30` | 浏览器直连被 CORS 拦截 |
| 直连 | kw | `search.kuwo.cn/r.s?client=kt&all=&pn=0&rn=30&uid=...&ver=...` | 浏览器直连被 CORS 拦截 |
| 直连 | mg | 不支持（需签名） | 跳过 Tier 1/2，直接走 Ammo |
| 代理 | wy/tx/kg/kw | 同上，经 Netlify 边缘代理转发 | ✅ 已验证 kw 返回 `周杰伦` 3条；tx/wy/kg 需直连测试 |
| Ammo | 所有平台 | `music-ammo-api-gateway.xlz767.dpdns.org/api/search.php?source=&keyword=&page=&limit=30` | 最终兜底，全平台支持 |

> 注：搜索的 Tier 1（直连）实际成功率较低（各平台 API 普遍无 CORS 头），主要靠代理和 Ammo。
> mg 搜索必须走 Ammo（签名复杂，无法代理转发）。

---

## 三、歌词

| 层级 | 端点 | 说明 |
|------|------|------|
| 直连 | 各平台 lyrics API（lx-source 提供） | `lyrics.js` Tier 1 |
| 代理 | 经边缘代理转发 | `lyrics.js` Tier 2，`fetchViaProxy(proxy, 'lyric', platform, id)` |
| Ammo | `music-ammo-api-gateway.xlz767.dpdns.org/api/lyric.php?source=&id=` | `lyrics.js` Tier 3 |

---

## 四、音频直链解析（fetchProvider）

| 层级 | 说明 |
|------|------|
| LX source（本地） | 用户上传的 lx-music-source 包，本地执行，不走网络 |
| Ammo resolve | `LX_AMMO.registry.resolve(url, source, id, quality)` → 走 `music-ammo-api-gateway/api/resolve.php`，解析 128k/320k/flac 直链 |

> 音频直链解析**不经过直连/代理体系**，直接走 Ammo（因为音频 URL 是各平台私有格式，需后端解密/签名）。

---

## 五、Ammo 注册表（ammo registry）

| 请求 | 说明 |
|------|------|
| `fetchJsonWithRetry(ammoManifestUrl)` | 拉取 Ammo manifest（可用源列表） |
| 用户手动加载 LX 脚本（`loadLxScriptFromUrl`） | 从用户指定 URL fetch 脚本内容，本地执行 |
| 用户手动配置 HTTP source（`loadHttpSource`） | 用户自行填入 Base URL + resolve path，本地注册 |

---

## 六、CORS 代理（CORSAIR_API）

| 请求 | 说明 |
|------|------|
| `corsProxyFetch(url)` → `CORSAIR_API?url=...` | `music-ammo-api-gateway.xlz767.dpdns.org/api/corsproxy.php` — Ammo 自带的 CORS 代理，用于兜底直连失败的请求 |

> 与 Netlify 边缘代理是**并行**关系：`corsProxyFetch` 在 `app.js` 中定义，用于歌词/音频解析等场景；Netlify 代理用于搜索/歌单等场景。

---

## 七、各文件 fetch 调用清单

| 文件 | 行号 | 调用 | 类型 |
|------|------|------|------|
| `views.js` | L87 | `fetchDirectSearch` | 直连搜索 Tier 1 |
| `views.js` | L105 | `fetchViaProxy(proxy,'search',...)` | 代理搜索 Tier 2 |
| `views.js` | L171 | `fetch(cfg.url)` | 直连搜索实际请求 |
| `views.js` | L209 | `fetch(proxyUrl)` | 代理转发请求 |
| `views.js` | L604 | `fetch(lxSourceUrl)` | 用户手动加载 LX 脚本 |
| `views.js` | L820 | `fetchDirectHotPlaylist` | 直连热歌单 Tier 1 |
| `views.js` | L839 | `fetch(proxyUrl)` | 代理热歌单 Tier 2 |
| `views.js` | L1019 | `fetch(buildDirectHotPlaylistUrl)` | 直连热歌单实际请求 |
| `lyrics.js` | L97 | `fetch(directUrl)` | 歌词直连 Tier 1 |
| `lyrics.js` | L116 | `fetch(proxyUrl)` | 歌词代理 Tier 2 |
| `lyrics.js` | L131 | `fetch(ammoUrl)` | 歌词 Ammo Tier 3 |
| `app.js` | L635 | `fetch(url)` | CORS 代理直连（CORSAIR_API 自身） |
| `app.js` | L639 | `fetch(proxyUrl)` | CORS 代理（Ammo corsproxy.php） |
| `sources.js` | L54,136,143,412,419,541,570 | `fetch`/`fetchJsonWithRetry` | Ammo registry / manifest / 用户自定义源 |
| `proxy/auto-proxy.js` | L49 | `fetch(testUrl)` | 代理可用性探测 |

---

## 八、已知降级路径

| 场景 | 降级行为 | 是否预期 |
|------|---------|---------|
| kg 热歌单代理 | 502（Netlify US 无法连通 kg 服务器）→ 回落 Ammo | ✅ 预期 |
| mg 搜索 | 无 Tier 1/2 → 直接 Ammo | ✅ 预期（需签名） |
| 直连被 CORS 拦截 | Tier 1 静默失败 → Tier 2 | ✅ 预期 |
| 代理上游 502 | Tier 2 失败 → Tier 3 Ammo | ✅ 预期 |
| `platform=yqq.json` 返回 JSONP | tx 热歌单经代理返回 JSONP 包装 | ⚠️ 需确认（见下方） |

### 附：tx 热歌单 JSONP 问题

`c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg` 在带 `platform=yqq.json` 参数时返回 JSONP（`MusicJsonCallback(...)`），不带该参数时返回纯 JSON。当前 `buildDirectHotPlaylistUrl` 保留了 `platform=yqq.json`，经代理返回 JSONP，`resp.json()` 会失败。

**修复建议**：在 `buildDirectHotPlaylistUrl` 的 tx 分支删除 `platform` 参数（该参数仅影响返回格式，不影响数据内容），或改为 `platform=`（空值返回纯 JSON）。
