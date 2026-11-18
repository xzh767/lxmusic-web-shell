/*
 * LX Music Web Shell — client-side search / lyric adapters.
 *
 * Design rule: the browser talks to upstream music APIs directly whenever
 * possible. The gateway (serv00) is only used for Resolve, because resolving
 * needs the private provider fleet and credentials.
 *
 * Every adapter is tried in order; the first one that returns results wins.
 * Adapters that need CORS headers that upstream does not send simply fail
 * fast and the chain continues.
 */
(() => {
  'use strict';

  const PLATFORM_NAMES = {
    wy: '网易云音乐',
    tx: '腾讯音乐',
    kg: '酷狗音乐',
    kw: '酷我音乐',
    mg: '咪咕音乐',
    bd: '百度音乐',
  };

  const TIMEOUT = 9000;

  async function fetchText(url, options = {}, timeout = TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, options = {}, timeout = TIMEOUT) {
    const text = await fetchText(url, options, timeout);
    try {
      return JSON.parse(text.trim());
    } catch {
      throw new Error('响应不是 JSON');
    }
  }

  function stripHtml(value) {
    return String(value ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /* ------------------------------------------------------------------ */
  /* Search adapters                                                     */
  /* ------------------------------------------------------------------ */

  /** QQ Music — tang.api.s01s.cn (public, CORS enabled). */
  async function searchTx(keyword, page, limit) {
    const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(keyword)}&type=json&page=${page}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!Array.isArray(data)) throw new Error('TX 源返回格式异常');
    return data.slice(0, limit).map((item) => ({
      id: String(item.song_mid || ''),
      source: 'tx',
      name: stripHtml(item.song_title || ''),
      artist: stripHtml(item.singer_name || ''),
      album: stripHtml(item.album_name || ''),
      duration: 0,
      picture: '',
      strMediaMid: String(item.song_mid || ''),
      qualities: ['128k', '320k', 'flac', 'flac24bit'],
    })).filter((item) => item.id);
  }

  /** Kuwo — oiapi.net (public). */
  async function searchKw(keyword, page, limit) {
    const url = `https://oiapi.net/api/Kuwo?msg=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const items = data?.data?.items;
    if (!Array.isArray(items)) throw new Error('KW 源返回格式异常');
    return items.map((item) => ({
      id: String(item.rid || item.music_id || '').replace(/^MUSIC_?/i, ''),
      source: 'kw',
      name: stripHtml(item.song || item.name || ''),
      artist: stripHtml(item.singer || item.artist || ''),
      album: stripHtml(item.album || ''),
      duration: Number(item.time || item.duration || 0),
      picture: item.picture || '',
      qualities: ['128k', '320k', 'flac'],
    })).filter((item) => item.id);
  }

  /** Kugou — songsearch.kugou.com (public JSON). */
  async function searchKg(keyword, page, limit) {
    const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=0&clientver=0&tag=1&filter=1&iscorrection=1&privilegefilter=0`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const list = data?.data?.lists || data?.data?.info || [];
    if (!Array.isArray(list)) throw new Error('KG 源返回格式异常');
    return list.map((item) => ({
      id: String(item.Hash || item.HQFileHash || item.SQFileHash || ''),
      source: 'kg',
      name: stripHtml(item.SongName || item.FileName || ''),
      artist: stripHtml(item.SingerName || ''),
      album: stripHtml(item.AlbumName || ''),
      duration: Number(item.Duration || 0),
      picture: '',
      qualities: ['128k', '320k', 'flac', 'flac24bit'],
    })).filter((item) => item.id);
  }

  /** Migu — pd.musicapp.migu.cn (public JSON). */
  async function searchMg(keyword, page, limit) {
    const switchParam = encodeURIComponent(JSON.stringify({
      song: 1, album: 0, singer: 0, tagSong: 0, mvSong: 0, songlist: 0, bestShow: 1,
    }));
    const url = `https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?ua=Android_migu&version=5.0.1&text=${encodeURIComponent(keyword)}&pageNo=${page}&pageSize=${limit}&searchSwitch=${switchParam}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const list = data?.songResultData?.result || [];
    if (!Array.isArray(list)) throw new Error('MG 源返回格式异常');
    return list.map((item) => ({
      id: String(item.copyrightId || item.contentId || ''),
      source: 'mg',
      name: stripHtml(item.name || ''),
      artist: (item.singers || []).map((s) => stripHtml(s?.name || '')).filter(Boolean).join(' / '),
      album: (item.albums || []).map((s) => stripHtml(s?.name || '')).filter(Boolean).join(' / '),
      duration: Number(item.duration || 0),
      picture: item.picUrl || '',
      qualities: ['128k', '320k', 'flac'],
    })).filter((item) => item.id);
  }

  /**
   * NetEase Cloud Music — the official web API.
   * Works from a domestic browser without CORS restrictions being an issue in
   * practice; overseas hosting IPs receive an encrypted blob instead of JSON,
   * so this adapter is expected to work only from the user's own network.
   */
  async function searchWy(keyword, page, limit) {
    const offset = (page - 1) * limit;
    const url = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&total=true&limit=${limit}`;
    const text = await fetchText(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
    });
    let data;
    try {
      data = JSON.parse(text.trim());
    } catch {
      throw new Error('网易云返回了加密内容（可能当前网络受限）');
    }
    const list = data?.result?.songs;
    if (!Array.isArray(list)) throw new Error('网易云返回格式异常');
    return list.map((item) => ({
      id: String(item.id || ''),
      source: 'wy',
      name: stripHtml(item.name || ''),
      artist: (item.artists || []).map((a) => stripHtml(a?.name || '')).filter(Boolean).join(' / '),
      album: stripHtml(item.album?.name || ''),
      duration: Math.round(Number(item.duration || 0) / 1000),
      picture: item.album?.picUrl || '',
      qualities: ['128k', '320k', 'flac', 'flac24bit'],
    })).filter((item) => item.id);
  }

  /**
   * GD Studio 聚合源 — music-api.gdstudio.xyz
   *
   * 公益 API、CORS 全开、海外可达。netease（真网易镜像）和 joox 两个源
   * 直连可用，是 CORS 受限平台（wy）的主力浏览器直连来源。
   */
  async function searchGd(source, keyword, page, limit) {
    const url = `https://music-api.gdstudio.xyz/api.php?types=search&source=${source}&name=${encodeURIComponent(keyword)}&count=${limit}&pages=${page}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!Array.isArray(data)) throw new Error('GD 源返回格式异常');
    return data.map((item) => ({
      id: String(item.id || ''),
      source: SOURCE_MAP_GD[source] || source,
      name: stripHtml(item.name || ''),
      artist: (item.artist || []).map((a) => stripHtml(a)).filter(Boolean).join(' / '),
      album: stripHtml(item.album || ''),
      duration: 0,
      picture: '',
      qualities: ['128k', '192k', '320k', 'flac', 'flac24bit'],
      _gd: { picId: item.pic_id, lyricId: item.lyric_id, gdSource: source },
    })).filter((item) => item.id);
  }

  async function searchGdWy(keyword, page, limit) {
    return searchGd('netease', keyword, page, limit);
  }

  async function searchGdJoox(keyword, page, limit) {
    return searchGd('joox', keyword, page, limit);
  }

  /** GD Studio 直链（真正可用音质），作为 resolve 的浏览器直连兜底。 */
  async function gdUrl(gdSource, id, br) {
    const url = `https://music-api.gdstudio.xyz/api.php?types=url&source=${gdSource}&id=${encodeURIComponent(id)}&br=${br}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!data?.url) throw new Error('GD 源未返回直链');
    return { url: data.url, mime: undefined, metadata: null };
  }

  /** GD Studio 歌词。 */
  async function gdLyric(gdSource, id) {
    const url = `https://music-api.gdstudio.xyz/api.php?types=lyric&source=${gdSource}&id=${encodeURIComponent(id)}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const lrc = data?.lyric || '';
    if (!lrc.trim()) throw new Error('无歌词');
    return lrc;
  }

  /** GD Studio 封面。 */
  async function gdPic(gdSource, picId, size = 300) {
    const url = `https://music-api.gdstudio.xyz/api.php?types=pic&source=${gdSource}&id=${encodeURIComponent(picId)}&size=${size}`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!data?.url) throw new Error('无封面');
    return data.url;
  }

  const SOURCE_MAP_GD = { netease: 'wy', joox: 'joox' };

  const SEARCH_ADAPTERS = {
    wy: [searchGdWy, searchWy],
    tx: [searchTx],
    kg: [searchKg],
    kw: [searchKw],
    mg: [searchMg],
    joox: [searchGdJoox],
  };

  /**
   * Run the adapter chain for one platform.
   * Returns {results, errors, adapter} — never throws for upstream failures.
   */
  async function search(platform, keyword, page = 1, limit = 30) {
    const adapters = SEARCH_ADAPTERS[platform] || [];
    const errors = [];
    for (const adapter of adapters) {
      try {
        const results = await adapter(keyword, page, limit);
        if (results.length) {
          return { results, errors, adapter: adapter.name };
        }
        errors.push(`${adapter.name}: 无结果`);
      } catch (error) {
        errors.push(`${adapter.name}: ${error.message || error}`);
      }
    }
    return { results: [], errors, adapter: null };
  }

  /* ------------------------------------------------------------------ */
  /* Lyric adapters                                                      */
  /* ------------------------------------------------------------------ */

  async function lyricTx(id) {
    const url = `https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(id)}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://y.qq.com/' } });
    const raw = data?.lyric || '';
    const decoded = raw ? decodeURIComponent(escape(raw)) : '';
    if (!decoded.trim()) throw new Error('无歌词');
    return decoded;
  }

  async function lyricWy(id) {
    const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=1&kv=1&tv=-1`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } });
    const raw = data?.lrc?.lyric || '';
    if (!raw.trim()) throw new Error('无歌词');
    return raw;
  }

  async function lyricKg(id) {
    const searchUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${encodeURIComponent(id)}`;
    const searchData = await fetchJson(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const candidate = searchData?.candidates?.[0];
    if (!candidate?.id || !candidate?.accesskey) throw new Error('未找到歌词');
    const url = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(candidate.id)}&accesskey=${encodeURIComponent(candidate.accesskey)}&fmt=lrc&charset=utf8`;
    const data = await fetchJson(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const content = data?.content || '';
    if (!content) throw new Error('无歌词');
    return decodeBase64Utf8(content);
  }

  async function lyricKw(id) {
    const url = `https://api.qijieya.cn/meting/?server=kuwo&type=lrc&id=${encodeURIComponent(id)}`;
    const text = await fetchText(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const lines = text.split(/\r?\n/).filter((line) => /^\[\d+:\d+/.test(line) || /^\[(ti|ar|al|by|offset):/.test(line));
    const lrc = lines.join('\n');
    if (!lrc.trim() || lrc.includes('暂无歌词')) throw new Error('无歌词');
    return lrc;
  }

  async function lyricMg(id) {
    const url = `https://api.qijieya.cn/meting/?server=migu&type=lrc&id=${encodeURIComponent(id)}`;
    const text = await fetchText(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const lines = text.split(/\r?\n/).filter((line) => /^\[\d+:\d+/.test(line) || /^\[(ti|ar|al|by|offset):/.test(line));
    const lrc = lines.join('\n');
    if (!lrc.trim() || lrc.includes('暂无歌词')) throw new Error('无歌词');
    return lrc;
  }

  function decodeBase64Utf8(value) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  const LYRIC_ADAPTERS = {
    wy: [lyricWy],
    tx: [lyricTx],
    kg: [lyricKg],
    kw: [lyricKw],
    mg: [lyricMg],
  };
  async function lyric(platform, id, gdSource) {
    const adapters = LYRIC_ADAPTERS[platform] || [];
    const errors = [];
    // GD Studio（netease 镜像）CORS 友好，放在最前面；其余平台上游多被 CORS 挡住。
    if (gdSource) {
      try {
        const lrc = await gdLyric(gdSource, id);
        if (lrc && lrc.trim()) return { lyric: lrc, errors };
      } catch (error) {
        errors.push(`gd-${gdSource}: ${error.message || error}`);
      }
    }
    for (const adapter of adapters) {
      try {
        const lrc = await adapter(id);
        if (lrc && lrc.trim()) return { lyric: lrc, errors };
      } catch (error) {
        errors.push(`${adapter.name}: ${error.message || error}`);
      }
    }
    throw new Error(errors.join('；') || '歌词不可用');
  }

  /* ------------------------------------------------------------------ */
  /* Playlist adapters                                                   */
  /* ------------------------------------------------------------------ */

  function identifyPlaylistUrl(raw) {
    if (!/^https?:\/\//i.test(raw)) return null;
    let host = '';
    let all = '';
    try {
      const u = new URL(raw);
      host = u.hostname.toLowerCase();
      all = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
    if (host === 'music.163.com' || host.endsWith('.music.163.com')) {
      const match = all.match(/playlist\?id=(\d+)/);
      return match ? { source: 'wy', id: match[1] } : null;
    }
    if (host === 'y.qq.com' || host.endsWith('.y.qq.com')) {
      const match = all.match(/(?:playlist|dissdetail)\/(\d+)/) || all.match(/(?:disstid|playlistId)=(\d+)/);
      return match ? { source: 'tx', id: match[1] } : null;
    }
    if (host.includes('kugou.com')) {
      const match = all.match(/(?:special|plist|playlist)\/(?:single\/)?([A-Za-z0-9_-]+)/);
      return match ? { source: 'kg', id: match[1] } : null;
    }
    if (host.includes('kuwo.cn')) {
      const match = all.match(/(?:playlist_detail|playlist)\/(?:\w+\/)?(\d+)/) || all.match(/(?:pid|playlistId)=(\d+)/);
      return match ? { source: 'kw', id: match[1] } : null;
    }
    if (host.includes('migu.cn')) {
      const match = all.match(/(?:playlist|songlist|list)\/([A-Za-z0-9_-]+)/) || all.match(/(?:songlistId|playlistId)=(\d+)/);
      return match ? { source: 'mg', id: match[1] } : null;
    }
    return null;
  }

  async function playlistWy(id) {
    const attempts = [
      { url: `https://music.163.com/api/playlist/detail?id=${encodeURIComponent(id)}`, method: 'GET' },
      { url: 'https://music.163.com/api/v6/playlist/detail', method: 'POST', body: JSON.stringify({ id, n: 1000 }) },
    ];
    for (const attempt of attempts) {
      try {
        const data = await fetchJson(attempt.url, {
          method: attempt.method,
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/', 'Content-Type': 'application/json' },
          body: attempt.body,
        });
        const pl = data?.playlist || data?.result || {};
        const list = pl.tracks || [];
        if (!Array.isArray(list) || !list.length) continue;
        return {
          playlist: {
            id,
            source: 'wy',
            title: pl.name || '',
            creator: pl.creator?.nickname || '',
          },
          tracks: list.map((s) => ({
            id: String(s.id || ''),
            source: 'wy',
            name: stripHtml(s.name || ''),
            artist: (s.artists || s.ar || []).map((a) => stripHtml(a?.name || '')).filter(Boolean).join(' / '),
            album: stripHtml(s.album?.name || ''),
            duration: Math.round(Number(s.duration || s.dt || 0) / 1000),
            picture: s.album?.picUrl || '',
            qualities: ['128k', '320k', 'flac', 'flac24bit'],
          })).filter((t) => t.id && t.name),
        };
      } catch {
        continue;
      }
    }
    throw new Error('网易云歌单不可用');
  }

  async function playlistTx(id) {
    const url = `https://tang.api.s01s.cn/music_open_api.php?msg=${encodeURIComponent(id)}&type=playlist`;
    // tang does not expose playlists; fall through to the gateway adapter.
    throw new Error('QQ 歌单浏览器直连不可用');
  }

  async function playlistGenericUnsupported(id) {
    throw new Error('该平台歌单不支持浏览器直连');
  }

  const PLAYLIST_ADAPTERS = {
    wy: [playlistWy],
    tx: [playlistTx],
    kg: [playlistGenericUnsupported],
    kw: [playlistGenericUnsupported],
    mg: [playlistGenericUnsupported],
  };

  /**
   * Client-side playlist loading. Returns {playlist, tracks, via} or throws.
   * The caller is expected to fall back to the gateway playlist API.
   */
  async function playlist(platform, id) {
    const adapters = PLAYLIST_ADAPTERS[platform] || [];
    const errors = [];
    for (const adapter of adapters) {
      try {
        const result = await adapter(id);
        if (result?.tracks?.length) return { ...result, errors };
      } catch (error) {
        errors.push(error.message || String(error));
      }
    }
    throw new Error(errors.join('；') || '歌单不可用');
  }

  window.LX_CLIENT_API = {
    search,
    lyric,
    playlist,
    identifyPlaylistUrl,
    gdUrl,
    gdLyric,
    gdPic,
    PLATFORM_NAMES,
    SEARCH_ADAPTERS,
    LYRIC_ADAPTERS,
    PLAYLIST_ADAPTERS,
  };
})();
