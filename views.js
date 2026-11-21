/*
 * LX Music Web Shell — view logic & source management UI.
 * Depends on window.LX_APP (app.js), window.LX_AMMO (sources.js), LX_LYRICS.
 */
(() => {
  'use strict';

  const A = window.LX_APP;
  const PLATFORM_ORDER = ['wy', 'tx', 'kg', 'kw', 'mg'];
  const AMMO_BASE = 'https://music-ammo-api-gateway.xlz767.dpdns.org';
  const { $, esc, showNotice, hideNotice, toast } = A;

  /* ── Online playlist (hot/recommend) state ─────────────────────────────── */
  // Each platform: label, whether hot playlists work, category map
  const PLAYLIST_PLATFORMS = {
    wy: { label: '网易云', ok: true, catKey: 'wyCats' },
    tx: { label: 'QQ音乐', ok: true, catKey: 'txCats' },
    kg: { label: '酷狗', ok: true,  catKey: 'kgSorts' },
    kw: { label: '酷我', ok: true,  catKey: 'kwOrders' },
    mg: { label: '咪咕', ok: true,  catKey: null     },
  };
  /** Wy category name → URL-encoded name; empty string = 全部 */
  const WY_CATS = [
    { name: '全部', cat: '' },
    { name: '流行', cat: '%E6%B5%81%E8%A1%8C' },
    { name: '华语', cat: '%E5%8D%8E%E8%AF%AD' },
    { name: '欧美', cat: '%E6%AC%A7%E7%BE%8E' },
    { name: 'ACG',  cat: 'ACG' },
    { name: '摇滚', cat: '%E6%91%87%E6%BB%9A' },
    { name: '民谣', cat: '%E6%B0%91%E4%B9%90' },
    { name: '影视原声', cat: '%E5%BD%B1%E8%A7%86%E5%8E%9F%E5%A3%B0' },
    { name: '深夜', cat: '%E6%B7%B1%E5%A4%9C' },
    { name: '清晨', cat: '%E6%B8%85%E6%99%A8' },
    { name: '怀旧', cat: '%E6%80%80%E6%97%A7' },
    { name: '清新', cat: '%E6%B8%85%E6%96%B0' },
    { name: '综艺', cat: '%E5%BA%86%E8%89%BA' },
  ];
  // QQ Music uses numeric categoryId; 10000000 = 全部
  const TX_CATS = [{ name: '全部', cat: 10000000 }];
  // KuGou sort mode IDs — matches LX Desktop sortList exactly
  const KG_SORTS = [
    { name: '推荐',  id: '5' },
    { name: '最热',  id: '6' },
    { name: '最新',  id: '7' },
    { name: '热藏',  id: '3' },
    { name: '飙升',  id: '8' },
  ];
  // KuWo: only two sort modes
  const KW_ORDERS = [
    { name: '最热', order: 'hot' },
    { name: '最新', order: 'new' },
  ];
  let _plSource = 'wy';
  let _plPage   = 0;
  let _plTag    = '';
  const PL_LIMIT = 30;

  /* ── Auto-detecting edge proxy (zero-config) ──────────────────────────────
   *
   * Auto-detection order (checked on first call):
   *   1. window.LX_WEB_SHELL_CORS_PROXY   ← manual override
   *   2. /.netlify/functions/proxy        ← Netlify Functions (auto-discovered)
   *   3. /proxy                           ← CF Pages / Vercel / generic serverless
   *
   * Once discovered, the proxy base URL is cached for all subsequent calls.
   * If no proxy is found, Tier 2 is silently skipped and Ammo becomes fallback.
   *
   * Zero-config deployment: just place proxy/netlify/functions/proxy.js (Netlify)
   * or proxy/_functions/proxy/[...proxy].ts + _routes.json (CF Pages) in your repo.
   */
  const PROXY_AUTO_DETECT = window.__LX_PROXY__; // injected by proxy/auto-proxy.js



  /**
   * Unified proxy-aware fetcher.
   * Tries: browser-direct → CORS proxy (if configured) → Ammo gateway (last resort).
   * @param {string} platform  source key ('wy'|'tx'|'kg'|'kw'|'mg')
   * @param {string} keyword
   * @param {number} page
   * @returns {{results, errors, via}}
   */
  async function searchPlatform(platform, keyword, page) {
    // ── Tier 1: browser direct ──────────────────────────────────────────────
    try {
      console.log(`%c[LX search] 直连尝试 ${platform}`, 'color:#7fd6a0');
      const raw = await fetchDirectSearch(platform, keyword, page);
      if (raw && raw.length > 0) {
        console.log(`%c[LX search] ${platform} 直连成功 ${raw.length} 条`, 'color:#7aa2ff');
        return { results: raw, errors: [], via: 'direct' };
      }
      throw new Error('empty results');
    } catch (err) {
      console.info(`%c[LX search] ${platform} 直连失败 (${err.message})`, 'color:#89ddff');
    }

    // ── Tier 2: auto-detected CORS proxy ─────────────────────────────────────
    let proxyBaseUrl = null;
    if (PROXY_AUTO_DETECT) {
      try { proxyBaseUrl = await PROXY_AUTO_DETECT.resolve(); } catch {}
    }
    if (proxyBaseUrl) {
      try {
        console.log(`%c[LX search] 经边缘代理请求 ${platform}`, 'color:#e0af68');
        const result = await fetchViaProxy(proxyBaseUrl, 'search', platform, keyword, page);
        if (result.results?.length > 0) {
          console.log(`%c[LX search] ${platform} 代理成功 ${result.results.length} 条`, 'color:#7aa2ff');
          return result;
        }
        throw new Error('empty results');
      } catch (err) {
        console.warn(`%c[LX search] ${platform} 代理失败 (${err.message})`, 'color:#ff5d73');
      }
    }

    // ── Tier 3: Ammo gateway (last resort) ──────────────────────────────────
    try {
      console.log(`%c[LX search] 最终走 Ammo 网关 ${platform}`, 'color:#c792ea');
      const data = await window.LX_AMMO.fetchJsonWithRetry(
        `${AMMO_BASE}/api/search.php?source=${encodeURIComponent(platform)}&keyword=${encodeURIComponent(keyword)}&page=${page}&limit=30`,
        { cache: 'no-store' },
      );
      if (!data?.ok) throw new Error(data?.message || '搜索失败');
      console.log(`%c[LX search] ${platform} Ammo返回 ${(data.results||[]).length} 条`, 'color:#7aa2ff');
      return {
        results: Array.isArray(data.results) ? data.results : [],
        errors: data.errors || [],
        via: 'ammo',
      };
    } catch (err) {
      throw new Error(`${platform}: ${err.message}`);
    }
  }

  /** Build the correct upstream URL per platform and attempt a direct browser call. */
  async function fetchDirectSearch(platform, keyword, page) {
    // Per-platform endpoint + params — mirrors lx-music-desktop source.
    const ENDPOINTS = {
      wy: { url: 'https://interface.music.163.com/eapi/search/web',
            buildParams: (kw, p) => new URLSearchParams({ s: kw, limit: '30', offset: String((p-1)*30), total: 'true' }).toString() },
      tx: { url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
            buildParams: (kw, p) => new URLSearchParams({
              loginUin: '0', hostUin: '0', format: 'json', inCharset: 'utf8', outCharset: 'utf-8',
              notice: '0', platform: 'yqq.json', needNewCode: '0',
              data: JSON.stringify({
                comm: { cv: 1602, ct: 20 },
                'music.search.SearchCgiService': {
                  module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop',
                  param: { grp: 1, num_per_page: 30, page_num: p, query: kw, search_type: 0 },
                },
              }),
            }).toString() },
      kg: { url: 'https://songsearch.kugou.com/song_search_v2',
            buildParams: (kw, p) => new URLSearchParams({
              keyword: kw, page: String(p), pagesize: '30', token: '',
              platform: 'web_kuqin', version: '10100100', antId: '', guid: '',
            }).toString() },
      kw: { url: 'https://search.kuwo.cn/r.s',
            buildParams: (kw, p) => new URLSearchParams({
              client: 'kt', all: kw, pn: String(p-1), rn: '30',
              uid: '794762570', ver: 'kwplayer_ar_9.2.2.1', vipver: '1',
              show_copyright_off: '1', newver: '1', ft: 'music', cluster: '0',
              strategy: '2012', encoding: 'utf8', rformat: 'json', vermerge: '1',
              mobi: '1', issubtitle: '1',
            }).toString() },
      mg: null, // 咪咕搜索需要签名，暂不支持直连/代理
    };
    const cfg = ENDPOINTS[platform];
    if (!cfg) return [];
    const qs = cfg.buildParams(keyword, page);
    const resp = await fetch(`${cfg.url}?${qs}`, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();
    return normalizeSongResult(platform, raw)?.results || [];
  }

  /** Forward a standardised internal request through the user's edge proxy. */
  async function fetchViaProxy(proxyBaseUrl, kind, ...args) {
    // Encode the target upstream URL so the proxy knows what to call.
    let targetUrl;
    if (kind === 'search') {
      const [platform, keyword, page] = args;
      // Per-platform search URL (mirrors lx-music-desktop; kw uses search.kuwo.cn/r.s)
      const mapping = {
        wy: { u: 'https://interface.music.163.com/eapi/search/web',
              qs: (kw, p) => `s=${encodeURIComponent(kw)}&limit=30&offset=${(p-1)*30}&total=true` },
        tx: { u: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
              qs: (kw, p) => `loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(JSON.stringify({comm:{cv:1602,ct:20},'music.search.SearchCgiService':{module:'music.search.SearchCgiService',method:'DoSearchForQQMusicDesktop',param:{grp:1,num_per_page:30,page_num:p,query:kw,search_type:0}}}))}` },
        kg: { u: 'https://songsearch.kugou.com/song_search_v2',
              qs: (kw, p) => `keyword=${encodeURIComponent(kw)}&page=${p}&pagesize=30&token=&platform=web_kuqin&version=10100100&antId=&guid=` },
        kw: { u: 'https://search.kuwo.cn/r.s',
              qs: (kw, p) => `client=kt&all=${encodeURIComponent(kw)}&pn=${p-1}&rn=30&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1` },
      };
      const cfg = mapping[platform];
      if (!cfg) throw new Error(`unknown platform ${platform} for proxy search`);
      targetUrl = `${cfg.u}?${cfg.qs(keyword, page)}`;
    } else if (kind === 'lyric') {
      // lyric.js passes (platform, id) — build the Ammo-compatible URL.
      const [platform, id] = args;
      targetUrl = `${AMMO_BASE}/api/lyric.php?source=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`;
    } else if (kind === 'playlist') {
      const [platform, id] = args;
      targetUrl = `${AMMO_BASE}/api/playlist.php?source=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`;
    } else {
      throw new Error(`unknown proxy kind: ${kind}`);
    }

    const proxyUrl = `${proxyBaseUrl}/${encodeURIComponent(targetUrl)}`;
    const resp = await fetch(proxyUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`proxy HTTP ${resp.status}`);
    const data = await resp.json();

    // Normalise lyric/playlist responses back to our internal shape.
    if (kind === 'lyric') return data; // already the expected format
    if (kind === 'playlist') return data;
    if (kind === 'search') {
      if (!data?.ok) throw new Error(data?.message || '搜索失败');
      return { results: Array.isArray(data.results) ? data.results : [], errors: data.errors || [], via: 'proxy' };
    }
    throw new Error('unexpected proxy response');
  }

  /** Map each platform's unique response envelope into our common song shape. */
  function normalizeSongResult(platform, raw) {
    if (platform === 'wy') {
      return {
        results: (raw?.result?.songs || []).map((s) => ({ ...s, source: 'wy' })),
        errors: [],
      };
    }
    if (platform === 'tx') {
      return {
        results: (raw?.data?.song?.list || []).map((s) => ({ ...s, source: 'tx' })),
        errors: [],
      };
    }
    if (platform === 'kg') {
      return {
        results: (raw?.data?.songlist || []).map((s) => ({ ...s, source: 'kg' })),
        errors: [],
      };
    }
    if (platform === 'kw') {
      // kw search.kuwo.cn/r.s returns {TOTAL: "...", abslist: [{MUSICRID, NAME, ARTIST, ...}]}
      const items = Array.isArray(raw) ? raw : (raw?.abslist || raw?.list || []);
      return {
        results: items.map((s) => ({
          source: 'kw',
          id: String(s.MUSICRID || s.rid || '').replace('MUSIC_', ''),
          songId: String(s.MUSICRID || s.rid || '').replace('MUSIC_', ''),
          name: s.NAME || s.songName || '',
          artist: s.ARTIST || s.artist || '',
          album: s.ALBUM || s.album || '',
          duration: Number(s.DURATION) || 0,
          strMediaMid: s.MUSICRID?.replace('MUSIC_', '') || '',
          picture: s.web_artistpic_short ? `https://img.kuwo.cn/star/${s.web_artistpic_short}` : '',
        })).filter((s) => s.id && s.name),
        errors: [],
      };
    }
    return { results: [], errors: [`${platform}: 不支持的直连响应格式`] };
  }

  function dedupe(results) {
    const seen = new Set();
    return results.filter((item) => {
      const song = A.normalizeSong(item);
      if (!song) return false;
      const key = A.songKey(song);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function runSearch(page = 1) {
    const keyword = $('keyword').value.trim();
    const platform = window.LX_APP?.state?.platform || document.querySelector('#platformTabs .tab.active')?.dataset.platform || 'wy';
    if (!keyword) return showNotice('searchNotice', '请输入搜索关键词。', 'error');
    if (!platform) return showNotice('searchNotice', '请选择搜索平台；默认不启用搜索。', 'error');

    console.log(`%c[LX search] 开始: "${keyword}" 平台=${platform} 页=${page}`, 'color:#7fd6a0;font-weight:bold');
    A.state.keyword = keyword;
    A.state.platform = platform;
    A.state.page = page;
    hideNotice('searchNotice');
    $('searchButton').disabled = true;
    $('searchButton').textContent = '搜索中…';
    $('searchResults').innerHTML = '<div class="empty">正在搜索…</div>';
    const started = performance.now();

    try {
      let results = [];
      let errors = [];
      let via = null;
      if (platform === '__all__') {
        const settled = await Promise.allSettled(
          PLATFORM_ORDER.map((p) => searchPlatform(p, keyword, page)),
        );
        settled.forEach((item, index) => {
          if (item.status === 'fulfilled') {
            console.log(`%c[LX search] ${PLATFORM_ORDER[index]}: ${item.value.results.length} 条 via ${item.value.via || '无'}`, 'color:#7fd6a0', item.value.errors?.length ? { errors: item.value.errors } : undefined);
            results.push(...item.value.results);
            errors.push(...(item.value.errors || []));
            if (!via && item.value.via) via = item.value.via;
          } else {
            console.warn(`%c[LX search] ${PLATFORM_ORDER[index]}: 整体失败`, 'color:#ff5d73', item.reason);
            errors.push(`${A.PLATFORM_NAMES[PLATFORM_ORDER[index]]}: ${item.reason?.message || item.reason}`);
          }
        });
      } else {
        const result = await searchPlatform(platform, keyword, page);
        console.log(`%c[LX search] ${platform}: ${result.results.length} 条 via ${result.via || '无'}`, 'color:#7fd6a0', result.errors?.length ? { errors: result.errors } : undefined);
        results = result.results;
        errors = result.errors;
        via = result.via;
      }
      A.state.results = dedupe(results);
      A.renderResults('searchResults', A.state.results);
      $('searchPager').classList.toggle('hidden', A.state.results.length === 0);
      $('pageInfo').textContent = `第 ${page} 页`;
      $('prevPage').disabled = page <= 1;
      const elapsed = Math.round(performance.now() - started);
      const viaLabel = via === 'client' ? '浏览器直连' : (via === 'gateway' ? '网关' : '');
      showNotice(
        'searchNotice',
        errors.length
          ? `找到 ${A.state.results.length} 条 · ${elapsed}ms${viaLabel ? ` · ${viaLabel}` : ''} · 部分来源失败：${errors.join('；')}`
          : `找到 ${A.state.results.length} 条 · ${elapsed}ms${viaLabel ? ` · ${viaLabel}` : ''}`,
        errors.length ? 'warning' : 'success',
      );
    } catch (error) {
      showNotice('searchNotice', error.message || '搜索失败', 'error');
      $('searchResults').innerHTML = '';
      console.error('[搜索] 失败', error);
    } finally {
      $('searchButton').disabled = false;
      $('searchButton').textContent = '搜索';
    }
  }

  /* ---------------- playlist ---------------- */

  /** 从歌单链接里提取平台与 ID（纯本地正则）。 */
  function identifyPlaylistUrl(url) {
    const rules = [
      [/music\.163\.com.*[?#&]id=(\d+)/i, 'wy'],
      [/y\.qq\.com\/n\/ryqq\/playlist\/(\w+)/i, 'tx'],
      [/i\.y\.qq\.com.*[?#&]id=(\d+)/i, 'tx'],
      [/kugou\.com.*(?:specialid|listid)=(\d+)/i, 'kg'],
      [/kuwo\.cn\/playlist_detail\/(\d+)/i, 'kw'],
      [/music\.migu\.cn.*playlist\/(\d+)/i, 'mg'],
    ];
    for (const [re, source] of rules) {
      const m = re.exec(url);
      if (m) return { source, id: m[1] };
    }
    return null;
  }

  async function openPlaylist() {
    const raw = $('playlistInput').value.trim();
    let platform = $('playlistPlatform').value;
    let id = raw;

    // 本地正则识别歌单链接，无需网络往返。
    if (/^https?:\/\//i.test(raw)) {
      const identified = identifyPlaylistUrl(raw);
      if (identified) {
        platform = identified.source;
        id = identified.id;
        $('playlistPlatform').value = platform;
      }
    }

    if (!id) return showNotice('playlistNotice', '请输入歌单链接或歌单 ID。', 'error');
    if (!platform) return showNotice('playlistNotice', '请选择平台，或直接粘贴完整歌单链接（可自动识别）。', 'error');

    $('openPlaylistButton').disabled = true;
    hideNotice('playlistNotice');
    $('playlistResults').innerHTML = '<div class="empty">正在读取歌单…</div>';
    $('playlistSummary').classList.add('hidden');

    try {
      const params = new URLSearchParams();
      params.set('source', platform);
      params.set('id', id);
      const data = await window.LX_AMMO.fetchJsonWithRetry(
        `${AMMO_BASE}/api/playlist.php?${params.toString()}`,
        { cache: 'no-store' },
      );
      if (!data?.ok) throw new Error(data?.message || '歌单读取失败');
      const tracks = (data.tracks || []).map(A.normalizeSong).filter(Boolean);
      const meta = data.playlist || {};

      $('playlistSummary').classList.remove('hidden');
      $('playlistSummary').innerHTML = `
        <div class="pl-copy">
          <strong>${esc(meta.title || id)}</strong>
          <span>${esc(meta.creator || '')}${meta.source ? ` · ${esc(A.PLATFORM_NAMES[meta.source] || meta.source)}` : ''} · ${tracks.length} 首</span>
        </div>
        <div class="head-actions">
          <button type="button" class="secondary-button" id="playlistPlayAll">▶ 全部播放</button>
          <button type="button" class="ghost-button" id="playlistPushAll">➕ 推送到队列</button>
          <button type="button" class="ghost-button" id="playlistSave">💾 保存</button>
        </div>`;

      // ▶ 全部播放：直接入队并开始播放（歌曲需先解析音频）
      $('playlistPlayAll').addEventListener('click', async () => {
        if (!tracks.length) return toast('歌单为空', 'warn');
        A.state.queue = [...tracks];
        A.state.queueIndex = 0;
        A.saveQueue();
        A.renderQueue();
        toast(`已加入队列 ${tracks.length} 首，开始播放`, 'ok');
        if (tracks.length) A.playSong(tracks[0], { fromQueue: true });
      });

      // ➕ 推送到队列：将所有曲目推入队列（逐首解析）
      $('playlistPushAll').addEventListener('click', async () => {
        if (!tracks.length) return toast('歌单为空', 'warn');
        const btn = $('playlistPushAll');
        btn.disabled = true;
        btn.textContent = '⏳ 推送中…';
        let ok = 0, fail = 0;
        for (const song of tracks) {
          try {
            await A.resolveAndPush(song);
            ok++;
          } catch {
            fail++;
          }
        }
        btn.disabled = false;
        btn.textContent = '➕ 推送到队列';
        toast(fail ? `推送完成：✅ ${ok} 首 · ❌ ${fail} 首失败` : `已推送 ${ok} 首到队列`, fail ? 'warning' : 'ok');
        A.renderQueue();
      });

      // 💾 保存歌单
      $('playlistSave').addEventListener('click', () => {
        const entry = { id: meta.id || id, source: meta.source || platform, title: meta.title || id, url: raw };
        if (!A.state.savedPlaylists.some((item) => item.id === entry.id && item.source === entry.source)) {
          A.state.savedPlaylists.unshift(entry);
          A.savePlaylists();
          renderSavedPlaylists();
          toast('歌单已保存', 'ok');
        } else {
          toast('歌单已在列表中');
        }
      });

      A.renderResults('playlistResults', tracks, { emptyText: '该歌单没有可用的曲目。', showPushButton: true });
      showNotice('playlistNotice', `已载入 ${tracks.length} 首`, 'success');
    } catch (error) {
      showNotice('playlistNotice', error.message || '歌单读取失败', 'error');
      $('playlistResults').innerHTML = '';
      console.error('[歌单] 失败', error);
    } finally {
      $('openPlaylistButton').disabled = false;
    }
  }

  function renderSavedPlaylists() {
    const box = $('savedPlaylists');
    if (!box) return;
    if (!A.state.savedPlaylists.length) {
      box.innerHTML = '<div class="empty">还没有保存的歌单。打开歌单后可保存以便快速访问。</div>';
      return;
    }
    box.innerHTML = A.state.savedPlaylists.map((item, index) => `
      <div class="saved-pl">
        <span title="${esc(item.title || item.id)}">${esc(item.title || item.id)}</span>
        <button type="button" class="mini-button" data-saved-open="${index}">打开</button>
        <button type="button" class="mini-button" data-saved-del="${index}">删除</button>
      </div>`).join('');
    box.querySelectorAll('[data-saved-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = A.state.savedPlaylists[Number(button.dataset.savedOpen)];
        if (!item) return;
        $('playlistPlatform').value = item.source || '';
        $('playlistInput').value = item.id;
        openPlaylist();
      });
    });
    box.querySelectorAll('[data-saved-del]').forEach((button) => {
      button.addEventListener('click', () => {
        A.state.savedPlaylists.splice(Number(button.dataset.savedDel), 1);
        A.savePlaylists();
        renderSavedPlaylists();
      });
    });
  }

  /* ---------------- source management ---------------- */

  function renderAmmoList() {
    const list = $('ammoList');
    if (!list) return;
    const sources = window.LX_AMMO?.registry.sources || [];
    if (!sources.length) {
      list.innerHTML = '<div class="empty">尚未装载任何弹药。请在上面的三个标签页里添加源。</div>';
      A.renderAmmoBadge();
      return;
    }
    list.innerHTML = sources.map((source) => {
      const platforms = Object.entries(source.platforms || {})
        .map(([id, meta]) => `${A.PLATFORM_NAMES[id] || id}(${(meta.qualities || []).length ? meta.qualities.join('/') : '?'})`)
        .join(' · ');
      return `
        <div class="ammo-row ${source.enabled === false ? 'disabled' : ''}">
          <div class="ammo-main">
            <strong>${esc(source.name)}</strong>
            <span>${esc(source.kind === 'manifest' ? 'Manifest Ammo' : source.kind === 'lxjs' ? 'LX 脚本' : 'HTTP 端点')} · ${esc(source.versionName || '')}</span>
            <small>${esc(source.baseUrl || '')}${platforms ? ` | ${esc(platforms)}` : ''}</small>
          </div>
          <button type="button" class="mini-button" data-ammo-toggle="${esc(source.id)}">${source.enabled === false ? '启用' : '停用'}</button>
          <button type="button" class="mini-button" data-ammo-test="${esc(source.id)}">测试</button>
          <button type="button" class="danger-outline" data-ammo-remove="${esc(source.id)}">卸载</button>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-ammo-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        window.LX_AMMO.registry.remove(button.dataset.ammoRemove);
        renderAmmoList();
        toast('已卸载');
      });
    });
    list.querySelectorAll('[data-ammo-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const source = sources.find((item) => item.id === button.dataset.ammoToggle);
        if (!source) return;
        window.LX_AMMO.registry.setEnabled(source.id, source.enabled === false);
        renderAmmoList();
      });
    });
    list.querySelectorAll('[data-ammo-test]').forEach((button) => {
      button.addEventListener('click', () => testAmmo(button.dataset.ammoTest, button));
    });
    A.renderAmmoBadge();
  }

  async function testAmmo(id, button) {
    const source = window.LX_AMMO?.registry.sources.find((item) => item.id === id);
    if (!source) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '测试中…';
    const started = performance.now();
    try {
      if (source.kind === 'lxjs') {
        await source.init();
        const platforms = Object.keys(source.platforms || {});
        toast(`${source.name} 加载成功 · 平台 ${platforms.join('/') || '未声明'} · ${Math.round(performance.now() - started)}ms`, 'ok');
      } else {
        const result = await source.resolve('tx', '04Z8Ihr0JIu5s', '128k', null);
        toast(`${source.name} 解析成功 · ${Math.round(performance.now() - started)}ms`, 'ok');
        console.log('[测试] 解析结果', result);
      }
    } catch (error) {
      toast(`${source.name} 失败：${error.message || error}`, 'err');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function loadManifest() {
    const url = $('manifestUrl').value.trim();
    if (!url) return showNotice('loaderNotice', 'Manifest URL 不能为空。', 'error');
    $('loadAmmoButton').disabled = true;
    hideNotice('loaderNotice');
    try {
      const source = await window.LX_AMMO.registry.loadManifest(url);
      renderAmmoList();
      showNotice('loaderNotice', `已装载：${source.name}`, 'success');
      toast(`已装载 ${source.name}`, 'ok');
      $('manifestUrl').value = '';
    } catch (error) {
      showNotice('loaderNotice', `装载失败：${error.message || error}`, 'error');
    } finally {
      $('loadAmmoButton').disabled = false;
    }
  }

  async function loadLxScriptFromFile(file) {
    if (!file) return showNotice('loaderNotice', '请先选择脚本文件。', 'error');
    try {
      const code = await file.text();
      const source = await window.LX_AMMO.registry.loadLxScript(code, file.name.replace(/\.js$/i, ''));
      renderAmmoList();
      showNotice('loaderNotice', `已装载 LX 脚本：${source.name}`, 'success');
      toast(`已装载 ${source.name}`, 'ok');
    } catch (error) {
      showNotice('loaderNotice', `装载失败：${error.message || error}`, 'error');
    }
  }

  async function loadLxScriptFromUrl() {
    const url = $('lxSourceUrl').value.trim();
    if (!url) return showNotice('loaderNotice', '脚本 URL 不能为空。', 'error');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const code = await response.text();
      const name = url.split('/').pop().replace(/\.js$/i, '') || 'LX 脚本';
      const source = await window.LX_AMMO.registry.loadLxScript(code, name);
      renderAmmoList();
      showNotice('loaderNotice', `已装载 LX 脚本：${source.name}`, 'success');
      $('lxSourceUrl').value = '';
    } catch (error) {
      showNotice('loaderNotice', `装载失败：${error.message || error}`, 'error');
    }
  }

  function loadHttpSource() {
    const baseUrl = $('httpBaseUrl').value.trim();
    const resolvePath = $('httpResolvePath').value.trim();
    const searchPath = $('httpSearchPath').value.trim();
    const name = $('httpName').value.trim();
    if (!baseUrl) return showNotice('loaderNotice', '请填写 Base URL。', 'error');
    if (!resolvePath) return showNotice('loaderNotice', '请填写 Resolve 路径。', 'error');
    try {
      const source = window.LX_AMMO.registry.loadHttp({
        id: `http:${baseUrl}`,
        name: name || baseUrl,
        baseUrl,
        resolvePath,
        searchPath,
        platforms: {},
      });
      renderAmmoList();
      showNotice('loaderNotice', `已装载 HTTP 端点：${source.name}`, 'success');
      toast('已装载 HTTP 端点', 'ok');
    } catch (error) {
      showNotice('loaderNotice', `装载失败：${error.message || error}`, 'error');
    }
  }

  /* ---------------- favorites import/export ---------------- */

  function exportFavorites() {
    const blob = new Blob([JSON.stringify(A.state.favorites, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lx-web-shell-favorites.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importFavorites(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('JSON 必须是数组');
      let added = 0;
      for (const item of data) {
        const song = A.normalizeSong(item);
        if (!song) continue;
        if (!A.state.favorites.some((f) => A.songKey(f) === A.songKey(song))) {
          A.state.favorites.push(song);
          added += 1;
        }
      }
      A.saveFavorites();
      A.renderFavorites();
      toast(`导入完成，新增 ${added} 首`, 'ok');
    } catch (error) {
      toast(`导入失败：${error.message || error}`, 'err');
    }
  }

  /* ---------------- wiring ---------------- */

  function wireEvents() {
    // Both the desktop icon rail and the mobile bottom tabs share .nav-item.
    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        A.switchView(button.dataset.view);
        if (button.dataset.view === 'sources') renderAmmoList();
      });
    });

    // Theme picker
    const themeMenu = $('themeMenu');
    const themeButton = $('themeButton');
    if (themeMenu && themeButton) {
      const renderMenu = () => {
        const current = window.LX_THEME?.current?.id;
        themeMenu.innerHTML = (window.LX_THEME?.THEMES || []).map((theme) => `
          <button type="button" data-theme-id="${theme.id}" class="${theme.id === current ? 'current' : ''}">
            <span class="swatch" style="background:${theme.isDark ? '#333' : theme.primary}"></span>${theme.name}
          </button>`).join('');
        themeMenu.querySelectorAll('[data-theme-id]').forEach((button) => {
          button.addEventListener('click', () => {
            const theme = window.LX_THEME.applyTheme(button.dataset.themeId);
            renderMenu();
            console.log(`%c[LX theme] 已切换到「${theme.name}」`, 'color:#c792ea;font-weight:bold');
          });
        });
      };
      renderMenu();
      themeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        themeMenu.classList.toggle('hidden');
        renderMenu();
      });
      document.addEventListener('click', (event) => {
        if (!themeMenu.classList.contains('hidden') && !themeMenu.contains(event.target)) {
          themeMenu.classList.add('hidden');
        }
      });
    }

    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
        document.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.tab === button.dataset.tab);
        });
      });
    });

    document.querySelectorAll('#platformTabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#platformTabs .tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        if (window.LX_APP) window.LX_APP.state.platform = tab.dataset.platform;
        console.log(`%c[LX search] 平台切换 → ${tab.dataset.platform}`, 'color:#c792ea');
      });
    });
    $('searchButton').addEventListener('click', () => runSearch(1));
    $('keyword').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch(1);
    });
    $('prevPage').addEventListener('click', () => runSearch(Math.max(1, A.state.page - 1)));
    $('nextPage').addEventListener('click', () => runSearch(A.state.page + 1));

    $('openPlaylistButton').addEventListener('click', openPlaylist);
    $('playlistInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') openPlaylist();
    });

    // ── Online playlist (hot/recommend) ──────────────────────────────────────
    function renderPlatformTabs() {
      const row = $('playlistPlatformRow');
      row.innerHTML = '';
      for (const [key, cfg] of Object.entries(PLAYLIST_PLATFORMS)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pl-plat-btn'
          + (key === _plSource ? ' active' : '')
          + (cfg.ok ? '' : ' unsupported');
        btn.textContent = cfg.label;
        if (cfg.ok) {
          btn.addEventListener('click', () => {
            _plSource = key; _plPage = 0; _plTag = '';
            renderPlatformTabs();
            renderTagChips();
            loadPlaylistPage();
          });
        }
        row.appendChild(btn);
      }
    }

    function renderTagChips() {
      const row = $('playlistTagRow');
      const cfg = PLAYLIST_PLATFORMS[_plSource];
      if (!cfg || !cfg.ok) { row.classList.add('hidden'); return; }
      row.classList.remove('hidden');
      let items;
      if (_plSource === 'wy')  items = WY_CATS;
      else if (_plSource === 'tx') items = TX_CATS;
      else if (_plSource === 'kg') items = KG_SORTS;
      else if (_plSource === 'kw') items = KW_ORDERS;
      else items = []; // mg has no tags
      row.innerHTML = '';
      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = _plSource === 'kg' ? item.id === _plTag
                       : _plSource === 'kw' ? item.order === _plTag
                       : (! _plTag && item.name === '全部');
        btn.className = 'cat-tab' + (isActive ? ' active' : '');
        btn.textContent = item.name;
        btn.addEventListener('click', () => {
          row.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          _plTag = _plSource === 'kg' ? item.id : item.order ?? String(item.cat ?? item.id ?? '');
          _plPage = 0;
          loadPlaylistPage();
        });
        row.appendChild(btn);
      });
      if (_plSource === 'mg') row.classList.add('hidden');
    }

    async function loadPlaylistPage() {
      const grid = $('playlistGrid');
      const moreBtn = $('plMoreBtn');
      const cfg = PLAYLIST_PLATFORMS[_plSource];
      if (!cfg || !cfg.ok) {
        grid.innerHTML = '<div class="empty" style="grid-column:1/-1">该平台暂不支持在线歌单推荐</div>';
        moreBtn.classList.add('hidden');
        showNotice('plNotice', `${cfg?.label || _plSource} 的热门歌单功能尚未接入`, 'warning');
        return;
      }
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">加载中…</div>';
      moreBtn.classList.add('hidden');
      hideNotice('plNotice');

      // Tier 1: browser direct
      let data = null;
      let via = '';
      try {
        console.log(`%c[LX playlist] 直连尝试 ${_plSource}`, 'color:#7fd6a0');
        data = await fetchDirectHotPlaylist(_plSource, _plTag, _plPage);
        if (data && data.playlists?.length) {
          via = 'direct';
          console.log(`%c[LX playlist] ${_plSource} 直连成功 ${data.playlists.length} 条`, 'color:#7aa2ff');
        }
      } catch (err) {
        console.info(`%c[LX playlist] ${_plSource} 直连失败 (${err.message})`, 'color:#89ddff');
      }

      // Tier 2: edge proxy
      if (!data) {
        let proxyBaseUrl = null;
        if (PROXY_AUTO_DETECT) {
          try { proxyBaseUrl = await PROXY_AUTO_DETECT.resolve(); } catch {}
        }
        if (proxyBaseUrl) {
          try {
            console.log(`%c[LX playlist] 经边缘代理请求 ${_plSource}`, 'color:#e0af68');
            const proxyUrl = buildHotPlaylistProxyUrl(proxyBaseUrl, _plSource, _plTag, _plPage);
            const resp = await fetch(proxyUrl, { cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            if (json?.ok && json?.playlists?.length) {
              data = json;
              via = 'proxy';
              console.log(`%c[LX playlist] ${_plSource} 代理成功 ${data.playlists.length} 条`, 'color:#7aa2ff');
            } else throw new Error(json?.message || 'proxy returned no playlists');
          } catch (err) {
            console.warn(`%c[LX playlist] ${_plSource} 代理失败 (${err.message})`, 'color:#ff5d73');
          }
        }
      }

      // Tier 3: Ammo gateway (last resort — keeps returning correct data for now)
      if (!data) {
        try {
          console.log(`%c[LX playlist] 最终走 Ammo 网关 ${_plSource}`, 'color:#c792ea');
          const ammoData = await window.LX_AMMO.fetchJsonWithRetry(
            buildAmmoHotPlaylistUrl(_plSource, _plTag, _plPage),
            { cache: 'no-store' },
          );
          if (ammoData?.ok && ammoData?.playlists?.length) {
            data = ammoData;
            via = 'ammo';
          } else throw new Error(ammoData?.message || 'Ammo returned no playlists');
        } catch (err) {
          console.error(`%c[LX playlist] ${_plSource} Ammo失败 (${err.message})`, 'color:#ff5d73');
        }
      }

      if (!data?.playlists?.length) {
        grid.innerHTML = '<div class="empty">暂无歌单</div>';
        if (!via) showNotice('plNotice', '加载失败，请稍后重试', 'error');
        return;
      }

      grid.innerHTML = '';
      for (const pl of data.playlists) {
        const card = document.createElement('div');
        card.className = 'pl-card';
        const thumb = (pl.cover || '').replace(/^http:/, 'https:');
        card.innerHTML = `
          <img class="pl-card-cover" src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="pl-card-info">
            <div class="pl-card-title">${esc(pl.title)}</div>
            <div class="pl-card-meta">${esc(pl.creator || '')} · ${pl.trackCount ?? '?'} 首</div>
          </div>`;
        card.addEventListener('click', () => openPlaylistById(pl.source, pl.id));
        grid.appendChild(card);
      }
      if ((_plPage + 1) * PL_LIMIT < (data.total || 0)) {
        moreBtn.classList.remove('hidden');
        moreBtn.disabled = false;
        moreBtn.textContent = '加载更多';
        moreBtn.onclick = () => { _plPage++; loadPlaylistPage(); };
      }
      showNotice('plNotice', `共 ${data.total || '?'} 个歌单（${via || 'Ammo'}）`, 'success');
    }

    /** Build the upstream URL for direct browser calls (tier 1). */
    function buildDirectHotPlaylistUrl(platform, catParam, page) {
      const offset = page * PL_LIMIT;
      if (platform === 'wy') {
        // Netease unauthenticated playlist list endpoint (works without login)
        const qs = new URLSearchParams({
          cat: catParam || '全部',
          order: 'hot',
          limit: String(PL_LIMIT),
          offset: String(offset),
          total: 'false',
        });
        return `https://music.163.com/api/playlist/list?${qs.toString()}`;
      }
      if (platform === 'tx') {
        // QQ Music fcg endpoint; categoryId defaults to 10000000 (全部)
        const categoryId = catParam ? Number(catParam) : 10000000;
        const qs = new URLSearchParams({
          picmid: '1', rnd: Math.random().toString(), g_tk: '732560869',
          loginUin: '0', hostUin: '0', format: 'json', inCharset: 'utf8',
          outCharset: 'utf-8', notice: '0', platform: 'yqq.json', needNewCode: '0',
          categoryId: String(categoryId), sortId: '5',
          sin: String(offset), ein: String(offset + PL_LIMIT),
        });
        return `https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg?${qs.toString()}`;
      }
      if (platform === 'kg') {
        // KuGou special list — no auth needed; sortId defaults to '5' (推荐)
        const qs = new URLSearchParams({
          is_ajax: '1', cdn: 'cdn', t: catParam || '5', c: '', p: String(page + 1),
        });
        return `https://www2.kugou.kugou.com/yueku/v9/special/getSpecial?${qs.toString()}`;
      }
      if (platform === 'kw') {
        // KuWo recommendation API — no auth needed
        const order = catParam || 'hot';
        const qs = new URLSearchParams({
          loginUid: '0', loginSid: '0', appUid: '76039576',
          pn: String(page + 1), rn: String(PL_LIMIT), order,
        });
        return `https://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?${qs.toString()}`;
      }
      if (platform === 'mg') {
        // Migu playlist square recommend — nested tree; pageNo = page+1
        return `https://app.c.nf.migu.cn/pc/bmw/page-data/playlist-square-recommend/v1.0?templateVersion=2&pageNo=${page + 1}`;
      }
      throw new Error(`unsupported platform for hot playlists: ${platform}`);
    }

    /** Parse the upstream response body into our internal shape. */
    function parseHotPlaylistResponse(platform, raw) {
      if (platform === 'wy') {
        const items = Array.isArray(raw?.playlists) ? raw.playlists : [];
        return { ok: true, total: raw?.total ?? items.length, playlists: items.map((p) => ({
          id: String(p.id ?? ''), source: 'wy', title: p.name ?? '',
          creator: p.creator?.nickname ?? '', cover: p.coverImgUrl ?? p.picUrl ?? '',
          trackCount: p.trackCount ?? 0,
        })).filter((p) => p.id && p.title) };
      }
      if (platform === 'tx') {
        const items = Array.isArray(raw?.data?.list) ? raw.data.list : [];
        return { ok: true, total: raw?.data?.sum ?? items.length, playlists: items.map((item) => ({
          id: String(item.dissid ?? ''), source: 'tx', title: item.dissname ?? '',
          creator: item.nick ?? item.creator ?? '', cover: item.imgurl ?? '', trackCount: 0,
        })).filter((p) => p.id && p.title) };
      }
      if (platform === 'kg') {
        // Ammo returns {ok:true, playlists:[...]} with standard fields
        // Raw endpoint returns {special_db:[{specialid,specialname,nickname,img,song_count,...}]}
        const rawItems = Array.isArray(raw?.special_db) ? raw.special_db
                        : Array.isArray(raw?.playlists) ? raw.playlists : [];
        return { ok: true, total: rawItems.length, playlists: rawItems.map((item) => ({
          id: String(item.specialid ?? item.id ?? ''), source: 'kg',
          title: item.specialname ?? item.name ?? '',
          creator: item.nickname ?? '',
          cover: (item.img ?? '').replace(/^http:/, 'https:'),
          trackCount: parseInt(item.song_count ?? item.total ?? 0, 10) || 0,
        })).filter((p) => p.id && p.title) };
      }
      if (platform === 'kw') {
        const data = raw?.data ?? {};
        const items = Array.isArray(data.data) ? data.data
                      : Array.isArray(raw?.playlists) ? raw.playlists : [];
        return { ok: true, total: data.total ?? items.length, playlists: items.map((item) => ({
          id: String(item.id ?? ''), source: 'kw', title: item.name ?? '',
          creator: item.uname ?? '', cover: (item.img ?? '').replace(/^http:/, 'https:'),
          trackCount: parseInt(item.total ?? 0, 10) || 0,
        })).filter((p) => p.id && p.title) };
      }
      if (platform === 'mg') {
        // Ammo returns {ok:true, playlists:[...]}; raw nested tree flattened by pl_hot_mg
        const items = Array.isArray(raw?.playlists) ? raw.playlists
                      : Array.isArray(raw?.contents) ? flattenMgTree(raw.contents) : [];
        return { ok: true, total: items.length, playlists: items.map((p) => ({
          id: String(p.id ?? ''), source: 'mg', title: p.title ?? '',
          creator: p.creator ?? '', cover: (p.cover ?? '').replace(/^http:/, 'https:'),
          trackCount: 0,
        })).filter((p) => p.id && p.title) };
      }
      throw new Error('unknown platform');
    }

    /** Recursively flatten Migu's nested content tree to extract resourceType=2021 items. */
    function flattenMgTree(obj, results = []) {
      if (!obj) return results;
      if (Array.isArray(obj)) { obj.forEach((i) => flattenMgTree(i, results)); return results; }
      if (typeof obj !== 'object') return results;
      const resType = String(obj.resourceType ?? '');
      if (resType === '2021' && obj.resId) {
        results.push({ id: String(obj.resId), title: obj.txt || obj.contentName || '', cover: obj.img || obj.img2 || '' });
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') flattenMgTree(v, results);
      }
      return results;
    }

    /** Tier 1: attempt direct browser call (may fail due to CORS). */
    async function fetchDirectHotPlaylist(platform, catParam, page) {
      const url = buildDirectHotPlaylistUrl(platform, catParam, page);
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.json();
      return parseHotPlaylistResponse(platform, raw);
    }

    /** Tier 2: build the proxy-forwarded URL. */
    function buildHotPlaylistProxyUrl(proxyBaseUrl, platform, catParam, page) {
      const upstream = buildDirectHotPlaylistUrl(platform, catParam, page);
      return `${proxyBaseUrl}/${encodeURIComponent(upstream)}`;
    }

    /** Tier 3: build the Ammo fallback URL. */
    function buildAmmoHotPlaylistUrl(platform, catParam, page) {
      const params = new URLSearchParams();
      params.set('type', 'hot');
      params.set('source', platform);
      params.set('page', String(page));
      params.set('limit', String(PL_LIMIT));
      if (platform === 'wy' && catParam) params.set('cat', catParam);
      else if (platform === 'tx' && catParam) params.set('cat', catParam);
      return `${AMMO_BASE}/api/playlist.php?${params.toString()}`;
    }

    function openPlaylistById(source, id) {
      $('playlistPlatform').value = source;
      $('playlistInput').value = id;
      openPlaylist();
    }

    renderPlatformTabs();
    renderTagChips();
    loadPlaylistPage();
    $('loadAmmoButton').addEventListener('click', loadManifest);
    $('lxLoadButton').addEventListener('click', () => loadLxScriptFromFile($('lxSourceFile').files[0]));
    $('lxLoadUrlButton').addEventListener('click', loadLxScriptFromUrl);
    $('httpLoadButton').addEventListener('click', loadHttpSource);
    $('clearAmmoButton').addEventListener('click', () => {
      window.LX_AMMO.registry.sources = [];
      window.LX_AMMO.registry.persist();
      renderAmmoList();
      toast('已清空本地弹药');
    });
    $('testAllButton').addEventListener('click', async () => {
      const sources = window.LX_AMMO?.registry.active() || [];
      if (!sources.length) return toast('没有启用的弹药', 'warn');
      for (const source of sources) {
        const row = $('ammoList').querySelector(`[data-ammo-test="${source.id}"]`);
        await testAmmo(source.id, row);
      }
    });

    $('clearQueueButton').addEventListener('click', () => {
      A.state.queue = [];
      A.state.queueIndex = -1;
      A.saveQueue();
      A.renderQueue();
    });
    $('favPlayAllButton').addEventListener('click', () => {
      if (!A.state.favorites.length) return toast('收藏为空', 'warn');
      A.state.queue = [...A.state.favorites];
      A.state.queueIndex = 0;
      A.saveQueue();
      A.renderQueue();
      A.playSong(A.state.queue[0], { fromQueue: true });
    });
    $('exportFavButton').addEventListener('click', exportFavorites);
    $('importFavButton').addEventListener('click', () => $('importFavInput').click());
    $('importFavInput').addEventListener('change', () => importFavorites($('importFavInput').files[0]));

    // Player bar
    $('playButton').addEventListener('click', () => {
      const audio = $('audio');
      if (!audio.src) {
        if (A.state.current) A.playSong(A.state.current, { fromQueue: true });
        return;
      }
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });
    $('nextButton').addEventListener('click', () => A.nextSong(false));
    $('prevButton').addEventListener('click', () => A.prevSong());
    $('playModeButton').addEventListener('click', () => A.cyclePlayMode());
    $('lyricsButton').addEventListener('click', () => {
      if (A.state.current) A.enterPlayerDetail(A.state.current);
      else toast('还没有播放歌曲', 'warn');
    });
    $('pdBackBtn').addEventListener('click', () => A.exitPlayerDetail());

    $('pbCover').addEventListener('click', () => {
      if (A.state.current) A.enterPlayerDetail(A.state.current);
      else toast('还没有播放歌曲', 'warn');
    });
    $('favToggleButton').addEventListener('click', () => {
      if (!A.state.current) return toast('还没有播放歌曲', 'warn');
      A.toggleFavorite(A.state.current);
    });

    $('downloadButton').addEventListener('click', () => {
      if (!A.state.current) return toast('还没有播放歌曲', 'warn');
      const song = A.state.current;
      const quality = $('qualitySelect').value;
      toast(`正在解析 ${quality} 直链…`, 'ok');
      window.LX_AMMO.registry.resolveWithFallback(song.source, song.id, quality, {
        id: song.id, source: song.source, name: song.name, artist: song.artist,
        songmid: song.id, strMediaMid: song.strMediaMid || song.id, hash: song.id, type: quality,
      }).then((result) => {
        console.log('%c[LX download] 解析成功', 'color:#7fd6a0', { quality, url: result.url?.slice(0, 80) });
        const a = document.createElement('a');
        a.href = result.url;
        a.download = `${song.name} - ${song.artist}.${quality.startsWith('flac') ? 'flac' : 'mp3'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }).catch((error) => {
        console.warn('%c[LX download] 解析失败', 'color:#e0af68', error.details || error.message);
        toast(`下载解析失败：${error.message || error}`, 'err');
      });
    });

    $('qualitySelect').addEventListener('change', () => {
      const q = $('qualitySelect').value;
      A.state.lastQuality = q;
      console.log(`%c[LX play] 音质切换 → ${q}（下一首生效，或点封面旁重播）`, 'color:#c792ea');
    });

    const audio = $('audio');
    audio.addEventListener('timeupdate', A.updateProgress);
    audio.addEventListener('loadedmetadata', A.updateProgress);
    audio.addEventListener('play', A.syncPlayButton);
    audio.addEventListener('pause', A.syncPlayButton);
    audio.addEventListener('ended', () => A.nextSong(true));
    audio.addEventListener('error', () => {
      console.warn(`%c[LX play] audio 元素加载失败`, 'color:#ff5d73;font-weight:bold', { src: A.state.currentUrl.slice(0, 120), readyState: audio.readyState, networkState: audio.networkState, errorCode: audio.error?.code, errorMessage: audio.error?.message });
      toast('音频加载失败，尝试下一首', 'err');
      if (A.state.queue.length > 1) A.nextSong(true);
    });
    $('pdSeek').addEventListener('input', () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (dur) audio.currentTime = (Number($('pdSeek').value) / 100) * dur;
    });
    $('seekBar').addEventListener('input', () => {
      const audio = $('audio');
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      if (dur) audio.currentTime = (Number($('seekBar').value) / 100) * dur;
    });
    $('volumeBar').addEventListener('input', () => {
      A.state.volume = Number($('volumeBar').value);
      $('audio').volume = A.state.volume;
      A.saveSettings();
    });

    // Media session buttons (lock screen / OS media controls)
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => $('audio').play());
        navigator.mediaSession.setActionHandler('pause', () => $('audio').pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => A.prevSong());
        navigator.mediaSession.setActionHandler('nexttrack', () => A.nextSong(false));
      } catch {
        /* not supported */
      }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space') {
        event.preventDefault();
        $('playButton').click();
      } else if (event.key === 'ArrowRight' && event.shiftKey) {
        A.nextSong(false);
      } else if (event.key === 'ArrowLeft' && event.shiftKey) {
        A.prevSong();
      }
    });
  }

  /* ---------------- init ---------------- */

  async function init() {
    wireEvents();

    // Restore persisted state
    const queueStore = A.readStore(A.KEYS.queue, null);
    if (queueStore?.items?.length) {
      A.state.queue = queueStore.items.map(A.normalizeSong).filter(Boolean);
      A.state.queueIndex = queueStore.index >= 0 ? Math.min(queueStore.index, A.state.queue.length - 1) : 0;
    }
    A.state.favorites = (A.readStore(A.KEYS.favorites, []) || []).map(A.normalizeSong).filter(Boolean);
    A.state.savedPlaylists = A.readStore(A.KEYS.playlists, []) || [];
    const settings = A.readStore(A.KEYS.settings, {}) || {};
    if (settings.mode) A.setPlayMode(settings.mode);
    if (typeof settings.volume === 'number') {
      A.state.volume = settings.volume;
      $('volumeBar').value = String(settings.volume);
      $('audio').volume = settings.volume;
    }
    if (settings.lastQuality) A.state.lastQuality = settings.lastQuality;

    A.renderQueueBadge();
    A.renderFavBadge();
    A.renderQueue();
    A.renderFavorites();
    renderSavedPlaylists();
    A.syncPlayButton();
    A.switchView('search');

    // First visit with zero ammo: load the demo gateway automatically so the
    // shell plays out of the box (removable in 源管理; removal is remembered).
    window.LX_AMMO.ensureDefaultAmmo().then(() => {
      renderAmmoList();
      A.renderAmmoBadge();
    });

    // v1 ammo key migration (old single-page shell stored manifests here)
    try {
      const legacy = JSON.parse(localStorage.getItem('lx-web-shell-ammo-v1') || '[]');
      if (Array.isArray(legacy) && legacy.length && !window.LX_AMMO.registry.sources.length) {
        for (const manifest of legacy) {
          try {
            await window.LX_AMMO.registry.loadManifest(manifest.manifestUrl || manifest.baseUrl);
          } catch (error) {
            console.warn('[迁移] v1 弹药装载失败', error);
          }
        }
        renderAmmoList();
        toast(`已迁移 ${legacy.length} 个旧版弹药`, 'ok');
      }
    } catch {
      /* no legacy data */
    }

    renderAmmoList();

    console.groupCollapsed('[LX Web Shell] 初始化');
    console.log('弹药:', window.LX_AMMO.registry.sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind })));
    console.log('队列:', A.state.queue.length, '收藏:', A.state.favorites.length);
    console.groupEnd();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
