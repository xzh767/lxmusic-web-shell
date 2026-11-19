# 官方接口移植（LX Music 自有接口）

本项目**不依赖任何第三方聚合 API**。搜索、歌词、封面全部走 LX Music 官方仓库
`src/renderer/utils/musicSdk/` 里的同一套接口实现，移植到网关（PHP）。

## 为什么必须在服务端跑

这些官方接口**不返回 CORS 头**，浏览器无法直连：

```
$ curl -I -X OPTIONS https://interface.music.163.com/eapi/batch -H 'Origin: https://music.xlz767.dpdns.org'
HTTP/2 200
# 没有 access-control-allow-origin
```

因此由 `api/lx.php` 在网关代跑，前端只调 `/api/search.php`、`/api/lyric.php`。

## 已移植

| 平台 | 搜索 | 歌词 | 封面 | 实现要点 |
|---|---|---|---|---|
| 网易云 wy | eapi `/api/search/song/list/page` | eapi `/api/song/lyric/v1`（interface3 节点） | weapi `song/detail` | AES-128-ECB(`e82ckenh8dichen8`) + MD5 摘要拼串 |
| QQ tx | zzc 签名 `musics.fcg` | `fcg_query_lyric_new.fcg` | 由 album.mid 拼 `y.gtimg.cn` | SHA1 切片 + XOR 混淆 + base64 |
| 酷狗 kg | `songsearch.kugou.com/song_search_v2` | `lyrics.kugou.com/search` + `download?fmt=lrc` | — | 取 `candidates[0].accesskey` |
| 酷我 kw | `search.kuwo.cn/r.s` | `mlyric.kuwo.cn/mobi.s` | — | 响应是 Python 风格单引号 JSON |
| 咪咕 mg | `jadeite.migu.cn/music_search/v3/searchAll` | MRC 加密 | — | `searchSwitch` 必须 URL 编码 |

## eapi 加密（网易云）

```php
$text    = json_encode($payload);
$message = 'nobody' . $url . 'use' . $text . 'md5forencrypt';
$data    = $url . '-36cd479b6b5-' . $text . '-36cd479b6b5-' . md5($message);
$params  = strtoupper(bin2hex(openssl_encrypt($data, 'aes-128-ecb', 'e82ckenh8dichen8', OPENSSL_RAW_DATA)));
```

## zzc 签名（QQ 音乐）

```php
$hash = sha1($json);
$p1 = 按 [23,14,6,36,16,40,7,19] 取字符;
$p2 = 按 [16,1,32,12,19,27,8,5] 取字符;
$bytes = 20 字节常量数组逐位 XOR hash 的两位十六进制;
return strtolower('zzc' . $p1 . base64($bytes 去掉 \\/+=) . $p2);
```

## 音质

搜索只返回可用音质标记；**直链解析仍由「弹药源」（自定义源）完成**——
这正是枪弹分离：官方接口负责元数据，弹药负责播放地址。

## 不再使用的第三方源

GD Studio、tang.api.s01s.cn、oiapi.net、qijieya/injahow meting、JOOX 平台
均已从代码中移除。
