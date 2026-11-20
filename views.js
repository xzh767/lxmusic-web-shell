/*
 * LX Music Web Shell — view logic & source management UI.
 * Depends on window.LX_APP (app.js), window.LX_AMMO (sources.js), LX_LYRICS.
 */
(() => {
  'use strict';

  const A = window.LX_APP;
  const PLATFORM_ORDER = ['wy', 'tx', 'kg', 'kw', 'mg'];
  const GATEWAY_SEARCH_API = window.LX_WEB_SHELL_SEARCH_API
    || 'https://music-ammo-api-gateway.xlz767.dpdns.org/api/search.php';
  const PLAYLIST_API = window.LX_WEB_SHELL_PLAYLIST_API
    || 'https://music-ammo-api-gateway.xlz767.dpdns.org/api/playlist.php';
  const { $, esc, showNotice, hideNotice, toast } = A;

  /* ---------------- search ---------------- */

  /**
   * Search architecture:
   *
   *   1. Ammo gateway (default)     — adds CORS headers, works everywhere
   *   2. Browser-direct (optional)  — zero-latency but requires CORS-capable API
   *
   * Configure via global config (set before scripts load):
   *   window.LX_WEB_SHELL_DIRECT_SEARCH = true   // enable direct calls (unreliable)
   *   window.LX_WEB_SHELL_CORS_PROXY  = '<url>'  // custom proxy instead of Ammo
   *
   * Most music-platform upstream APIs (NetEase eapi / QQ zzc / Kugou / Kuwo)
   * do NOT send Access-Control-Allow-Origin headers, so direct browser calls are
   * blocked by CORS. The Ammo gateway at xlz767.dpdns.org proxies these requests
   * server-side and adds the required headers, making it the reliable default path.
   */
  const USE_DIRECT_SEARCH = window.LX_WEB_SHELL_DIRECT_SEARCH === true;
  const CORS_PROXY_URL = window.LX_WEB_SHELL_CORS_PROXY || GATEWAY_SEARCH_API;

  async function searchPlatform(platform, keyword, page) {
    const params = new URLSearchParams({
      q: keyword,
      keyword,
      source: platform || '',
      page: String(page),
      limit: '30',
    });
    const searchUrl = `${CORS_PROXY_URL}?${params.toString()}`;

    // Optional: try browser-direct first (only useful where upstream allows CORS)
    if (USE_DIRECT_SEARCH) {
      const directEndpoints = {
        wy: 'https://interface.music.163.com/eapi/search/web',
        tx: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
        kg: 'https://songsearch.kugou.com/song_search_v2',
        kw: 'https://www.kuwo.cn/api/www/search/searchKey',
      };
      const directUrl = directEndpoints[platform];
      if (directUrl) {
        try {
          console.log(`%c[LX search] 直连尝试 ${platform}`, 'color:#7fd6a0');
          const resp = await fetch(`${directUrl}?${params.toString()}`, { cache: 'no-store' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const raw = await resp.json();
          const normalized = normalizeSongResult(platform, raw);
          if (normalized?.results?.length > 0) {
            console.log(`%c[LX search] ${platform} 直连成功 ${(normalized.results).length} 条`, 'color:#7aa2ff');
            return { results: normalized.results, errors: [], via: 'direct' };
          }
          throw new Error('empty results');
        } catch (err) {
          console.info(`%c[LX search] ${platform} 直连不可用，走网关 (${err.message})`, 'color:#89ddff');
        }
      }
    }

    // Main path: Ammo gateway (or configured CORS proxy)
    try {
      const data = await window.LX_AMMO.fetchJsonWithRetry(searchUrl, { cache: 'no-store' });
      if (!data?.ok) throw new Error(data?.message || '搜索失败');
      console.log(`%c[LX search] ${platform || '聚合'} 「${keyword}」→ ${(data.results || []).length} 条`, 'color:#7aa2ff');
      return { results: Array.isArray(data.results) ? data.results : [], errors: data.errors || [], via: 'gateway' };
    } catch (err) {
      throw new Error(`${platform}: ${err.message}`);
    }
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

    let payload = null;
    let via = '';

    // 1) browser direct
    if (client) {
      try {
        const result = await client.playlist(platform, id);
        if (result?.tracks?.length) {
          payload = { playlist: result.playlist, tracks: result.tracks };
          via = '浏览器直连';
        }
      } catch (error) {
        console.warn('[歌单] 浏览器直连失败，改用网关', error);
      }
    }

    // 2) gateway
    if (!payload) {
      try {
        const params = new URLSearchParams();
        params.set('source', platform);
        params.set('id', id);
        const data = await window.LX_AMMO.fetchJsonWithRetry(`${PLAYLIST_API}?${params.toString()}`, { cache: 'no-store' });
        if (!data?.ok) throw new Error(data?.message || '歌单读取失败');
        payload = { playlist: data.playlist || {}, tracks: data.tracks || [] };
        via = '网关';
      } catch (error) {
        showNotice('playlistNotice', error.message || '歌单读取失败', 'error');
        $('playlistResults').innerHTML = '';
        console.error('[歌单] 失败', error);
        $('openPlaylistButton').disabled = false;
        return;
      }
    }

    try {
      const tracks = (payload.tracks || []).map(A.normalizeSong).filter(Boolean);
      const meta = payload.playlist || {};

      $('playlistSummary').classList.remove('hidden');
      $('playlistSummary').innerHTML = `
        <div class="pl-copy">
          <strong>${esc(meta.title || id)}</strong>
          <span>${esc(meta.creator || '')}${meta.source ? ` · ${esc(A.PLATFORM_NAMES[meta.source] || meta.source)}` : ''} · ${tracks.length} 首${via ? ` · ${esc(via)}` : ''}</span>
        </div>
        <div class="head-actions">
          <button type="button" class="secondary-button" id="playlistPlayAll">▶ 全部播放</button>
          <button type="button" class="ghost-button" id="playlistSave">💾 保存</button>
        </div>`;
      $('playlistPlayAll').addEventListener('click', () => {
        A.state.queue = tracks;
        A.state.queueIndex = 0;
        A.saveQueue();
        A.renderQueue();
        if (tracks.length) A.playSong(tracks[0], { fromQueue: true });
      });
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

      A.renderResults('playlistResults', tracks, { emptyText: '该歌单没有可用的曲目。' });
      showNotice('playlistNotice', `已载入 ${tracks.length} 首${via ? ` · ${via}` : ''}`, 'success');
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
