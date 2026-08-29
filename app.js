(() => {
  'use strict';

  const STORAGE_KEY = 'lx-web-shell-ammo-v1';
  const DEFAULT_LIMIT = 20;
  const DEFAULT_RETRIES = 3;
  // Set window.LX_WEB_SHELL_SEARCH_API to override this endpoint for your deployment.
  // The search service is intentionally independent from Ammo manifests.
  const SEARCH_API_URL = window.LX_WEB_SHELL_SEARCH_API || 'https://music-ammo-api-gateway.xlz767.dpdns.org/api/search.php';
  const PLATFORM_NAMES = {
    kg: '酷狗音乐',
    tx: '腾讯音乐',
    mg: '咪咕音乐',
    wy: '网易云音乐',
    kw: '酷我音乐',
  };

  const state = {
    ammo: loadAmmo(),
    activeResults: [],
    busy: false,
    platformMap: new Map(),
  };

  const $ = (id) => document.getElementById(id);

  function loadAmmo() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveAmmo() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ammo));
  }

  function normalizeBase(url) {
    return String(url).replace(/\/$/, '');
  }

  function endpoint(base, path) {
    return new URL(path || '/', `${normalizeBase(base)}/`).toString();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDuration(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return '';
    const t = Math.round(n);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function showNotice(id, message, kind = 'info') {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.className = `notice ${kind}`;
  }

  function hideNotice(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    el.className = 'notice hidden';
  }

  function log(group, ...args) {
    console.groupCollapsed(`[LX Web Shell] ${group}`);
    console.log(...args);
    console.groupEnd();
  }

  function isTransientError(error) {
    return error?.transient === true || /^(HTTP (429|408|5\d\d)|network|timeout|failed to fetch|fetch)/i.test(String(error?.message || error));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchJsonWithRetry(url, options = {}, retries = DEFAULT_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          error.transient = response.status === 408 || response.status === 429 || response.status >= 500;
          throw error;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !isTransientError(error)) throw error;
        const delay = 300 * (2 ** (attempt - 1));
        console.warn(`[重试] 第 ${attempt} 次失败，${delay}ms 后开始第 ${attempt + 1}/${retries} 次`, error);
        await sleep(delay);
      }
    }
    throw lastError || new Error('请求失败');
  }

  function validateManifest(manifest, manifestUrl) {
    if (!manifest || typeof manifest !== 'object') throw new Error('Manifest 不是 JSON 对象');
    if (!manifest.id || !manifest.name) throw new Error('Manifest 缺少 id 或 name');
    if (!manifest.baseUrl) throw new Error('Manifest 缺少 baseUrl');
    if (!manifest.endpoints?.resolve) throw new Error('Manifest 必须提供 resolve endpoint');

    const url = new URL(manifest.baseUrl, manifestUrl);
    return {
      ...manifest,
      manifestUrl,
      baseUrl: url.toString().replace(/\/$/, ''),
      platforms: manifest.platforms && typeof manifest.platforms === 'object' ? manifest.platforms : {},
    };
  }

  async function fetchManifest(url) {
    return validateManifest(await fetchJsonWithRetry(url, { cache: 'no-store' }), url);
  }

  function addOrReplaceAmmo(manifest) {
    const idx = state.ammo.findIndex((item) => item.id === manifest.id);
    if (idx >= 0) state.ammo[idx] = manifest;
    else state.ammo.push(manifest);
    saveAmmo();
    renderAmmo();
    renderPlatformOptions();
  }

  function removeAmmo(id) {
    state.ammo = state.ammo.filter((item) => item.id !== id);
    saveAmmo();
    renderAmmo();
    renderPlatformOptions();
  }

  function renderAmmo() {
    const count = $('ammoCount');
    if (count) count.textContent = `${state.ammo.length} 个弹药源`;
    const list = $('ammoList');
    const loader = $('loaderList');
    const content = state.ammo.length
      ? state.ammo.map((ammo) => `
          <div class="ammo-row">
            <div class="ammo-main">
              <strong>${escapeHtml(ammo.name)}</strong>
              <span>${escapeHtml(ammo.id)}</span>
              <small>${escapeHtml(ammo.versionName || ammo.version || '未标版本')} · ${escapeHtml(ammo.baseUrl)}</small>
            </div>
            <button type="button" class="danger-outline" data-remove-ammo="${escapeHtml(ammo.id)}">卸载</button>
          </div>`).join('')
      : '<div class="empty">尚未装载任何弹药。请先打开“装弹管理”。</div>';

    [list, loader].filter(Boolean).forEach((container) => {
      container.innerHTML = content;
      container.querySelectorAll('[data-remove-ammo]').forEach((button) => {
        button.addEventListener('click', () => removeAmmo(button.dataset.removeAmmo));
      });
    });
  }

  function renderSearchSourceOptions() {
    const select = $('ammoSelect');
    if (!select) return;
    const value = select.value;
    select.innerHTML = `
      <option value="">请选择搜索平台</option>
      <option value="__all__">聚合搜索（全部平台）</option>
      ${Object.entries(PLATFORM_NAMES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}`;
    if (value === '__all__' || PLATFORM_NAMES[value]) select.value = value;
  }

  function collectPlatforms(ammoList) {
    const map = new Map();
    for (const ammo of ammoList) {
      for (const [id, meta] of Object.entries(ammo.platforms || {})) {
        if (!map.has(id)) map.set(id, { id, name: meta?.name || PLATFORM_NAMES[id] || id, qualities: new Set(meta?.qualities || []) });
        else for (const q of (meta?.qualities || [])) map.get(id).qualities.add(q);
      }
    }
    return map;
  }

  function renderPlatformOptions() {
    const map = collectPlatforms(state.ammo);
    state.platformMap = map;
    const select = $('platformSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">请选择平台</option>' +
      [...map.values()].map((meta) => `<option value="${escapeHtml(meta.id)}">${escapeHtml(meta.name)}</option>`).join('');
    if (map.has(current)) select.value = current;
    renderQualityOptions();
  }

  function renderQualityOptions() {
    const platform = $('platformSelect')?.value;
    const select = $('qualitySelect');
    if (!select) return;
    const old = select.value;
    const qualities = platform && state.platformMap.has(platform)
      ? [...state.platformMap.get(platform).qualities]
      : [];
    select.innerHTML = '<option value="">请选择音质</option>' + qualities.map((q) => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`).join('');
    if (qualities.includes(old)) select.value = old;
  }

  function selectedAmmo() {
    // Resolve intentionally falls back to all currently loaded Ammo in load order.
    // Search source selection is independent and does not inspect Ammo manifests.
    return state.ammo.slice();
  }

  async function searchPlatform(platform, keyword, page = 1) {
    const params = new URLSearchParams({
      q: keyword,
      keyword,
      source: platform || '',
      page: String(page),
      limit: String(DEFAULT_LIMIT),
    });
    const started = performance.now();
    const data = await fetchJsonWithRetry(`${SEARCH_API_URL}?${params.toString()}`, { cache: 'no-store' });
    const elapsed = Math.round(performance.now() - started);
    if (!data?.ok) throw new Error(data?.message || '搜索失败');
    return { elapsed, results: Array.isArray(data.results) ? data.results : [], errors: data.errors || [] };
  }

  function dedupeResults(results) {
    const seen = new Set();
    return results.filter((item) => {
      const key = `${item.source || ''}|${item.id || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderResults(results, errors = []) {
    const box = $('searchResults');
    if (!box) return;
    if (!results.length) {
      box.innerHTML = '<div class="empty">没有找到结果。</div>';
      if (errors.length) showNotice('searchNotice', `部分平台搜索失败：${errors.join('；')}`, 'warning');
      return;
    }
    box.innerHTML = results.map((item, index) => `
      <article class="result-row">
        <div class="result-cover">${item.picture ? `<img src="${escapeHtml(item.picture)}" alt="">` : '🎵'}</div>
        <div class="result-copy">
          <strong>${escapeHtml(item.name || '未知歌曲')}</strong>
          <span>${escapeHtml(item.artist || item.singer || '未知歌手')}${item.album ? ` · ${escapeHtml(item.album)}` : ''}</span>
          <small>${escapeHtml(PLATFORM_NAMES[item.source] || item.source || '未知平台')}${item.duration ? ` · ${formatDuration(item.duration)}` : ''}</small>
        </div>
        <button type="button" class="use-button" data-result-index="${index}">使用</button>
      </article>`).join('');
    box.querySelectorAll('[data-result-index]').forEach((button) => {
      button.addEventListener('click', () => useResult(results[Number(button.dataset.resultIndex)]));
    });
    if (errors.length) showNotice('searchNotice', `部分平台搜索失败：${errors.join('；')}`, 'warning');
  }

  function useResult(item) {
    const platform = $('platformSelect');
    const songId = $('songId');
    if (platform) platform.value = item.source || '';
    renderQualityOptions();
    if ($('qualitySelect')) {
      $('qualitySelect').value = item.qualities?.includes('320k') ? '320k' : (item.qualities?.[0] || '128k');
    }
    if (songId) songId.value = item.id || '';
    $('nowPlaying').textContent = `${item.name || '未知歌曲'} · ${item.artist || item.singer || '未知歌手'}`;
    $('resolveButton')?.click();
    document.querySelector('.player-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function resolveWithAmmo(ammo, platform, id, quality, musicInfo) {
    const url = endpoint(ammo.baseUrl, ammo.endpoints.resolve);
    const started = performance.now();
    const data = await fetchJsonWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: platform, id, quality, musicInfo: musicInfo || null }),
      cache: 'no-store',
    });
    const elapsed = Math.round(performance.now() - started);
    if (!data?.ok || !data.url) throw new Error(data?.message || '未返回可播放 URL');
    return { data, elapsed };
  }

  async function resolveSong() {
    const ammo = selectedAmmo();
    const platform = $('platformSelect')?.value;
    const id = $('songId')?.value.trim();
    const quality = $('qualitySelect')?.value;
    if (!ammo.length) return showNotice('resolveNotice', '还没有装载任何弹药源。', 'error');
    if (!platform || !id || !quality) return showNotice('resolveNotice', '请先选择平台、歌曲 ID 和音质。', 'error');

    state.busy = true;
    hideNotice('resolveNotice');
    console.groupCollapsed(`[LX Web Shell] 解析 ${platform} / ${quality} / ${id}`);
    console.log('候选弹药顺序:', ammo.map((a) => a.name));
    try {
      for (const source of ammo) {
        try {
          const result = await resolveWithAmmo(source, platform, id, quality, null);
          console.log(`✅ ${source.name}`, result);
          $('audio').src = result.data.url;
          $('audio').load();
          $('qualityBadge').textContent = quality;
          $('httpWarning').classList.toggle('hidden', !result.data.url.startsWith('http://'));
          renderMetadata(result.data.metadata || null);
          $('nowPlaying').textContent = result.data.metadata?.title || `平台 ${platform} · ${id}`;
          return;
        } catch (error) {
          console.warn(`❌ ${source.name}: ${error.message || error}`);
        }
      }
      showNotice('resolveNotice', '所有已装载弹药源均解析失败。请稍后重试或更换弹药。', 'error');
    } finally {
      console.groupEnd();
      state.busy = false;
    }
  }

  function renderMetadata(meta) {
    const box = $('metadata');
    if (!box) return;
    if (!meta || typeof meta !== 'object') {
      box.className = 'metadata hidden';
      box.innerHTML = '';
      return;
    }
    const fields = [
      ['标题', meta.title], ['歌手', meta.artist], ['专辑', meta.album], ['时长', meta.duration ? formatDuration(meta.duration) : ''],
      ['格式', meta.codec || meta.format], ['采样率', meta.sampleRate ? `${meta.sampleRate} Hz` : ''],
      ['位深', meta.bitsPerSample ? `${meta.bitsPerSample} bit` : ''], ['码率', meta.bitrateKbps ? `${meta.bitrateKbps} kbps` : ''],
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    box.innerHTML = fields.map(([k, v]) => `<div><small>${escapeHtml(k)}</small><strong>${escapeHtml(v)}</strong></div>`).join('');
    box.className = 'metadata';
  }

  async function search() {
    const keyword = $('keyword')?.value.trim();
    const selected = $('ammoSelect')?.value;
    if (!keyword) return showNotice('searchNotice', '请输入搜索关键词。', 'error');
    if (!selected) return showNotice('searchNotice', '请选择搜索平台；默认不启用搜索。', 'error');

    hideNotice('searchNotice');
    $('searchButton').disabled = true;
    $('searchButton').textContent = '搜索中…';
    $('searchResults').innerHTML = '<div class="empty">正在搜索…</div>';
    const started = performance.now();

    try {
      let result;
      if (selected === '__all__') {
        const platforms = Object.keys(PLATFORM_NAMES);
        const settled = await Promise.allSettled(platforms.map((platform) => searchPlatform(platform, keyword)));
        const results = [];
        const errors = [];
        settled.forEach((item, index) => {
          const platform = platforms[index];
          if (item.status === 'fulfilled') results.push(...item.value.results);
          else errors.push(`${PLATFORM_NAMES[platform]}: ${item.reason?.message || item.reason}`);
        });
        result = { results, errors };
      } else {
        result = await searchPlatform(selected, keyword);
      }
      state.activeResults = dedupeResults(result.results || []);
      renderResults(state.activeResults, result.errors || []);
      showNotice('searchNotice', `找到 ${state.activeResults.length} 条结果 · ${Math.round(performance.now() - started)} ms`, result.errors?.length ? 'warning' : 'success');
    } catch (error) {
      showNotice('searchNotice', error.message || '搜索失败', 'error');
      $('searchResults').innerHTML = '';
      console.error('[LX Web Shell] 搜索失败', error);
    } finally {
      $('searchButton').disabled = false;
      $('searchButton').textContent = '搜索';
    }
  }

  async function loadAmmoFromDialog() {
    const input = $('manifestUrl');
    const url = input.value.trim();
    if (!url) {
      showNotice('loaderNotice', 'Manifest URL 不能为空。', 'error');
      return;
    }
    $('loadAmmoButton').disabled = true;
    try {
      const manifest = await fetchManifest(url);
      addOrReplaceAmmo(manifest);
      showNotice('loaderNotice', `已装载：${manifest.name}`, 'success');
      input.value = '';
    } catch (error) {
      showNotice('loaderNotice', `装载失败：${error.message || error}`, 'error');
    } finally {
      $('loadAmmoButton').disabled = false;
    }
  }

  function closeSettings() {
    $('settingsDialog')?.close();
  }

  function wireEvents() {
    $('settingsButton')?.addEventListener('click', () => $('settingsDialog')?.showModal());
    $('closeSettingsButton')?.addEventListener('click', closeSettings);
    $('loadAmmoButton')?.addEventListener('click', loadAmmoFromDialog);
    $('clearAmmoButton')?.addEventListener('click', () => {
      state.ammo = [];
      saveAmmo();
      renderAmmo();
      renderPlatformOptions();
      showNotice('loaderNotice', '已清空本地弹药。', 'success');
    });
    $('searchButton')?.addEventListener('click', search);
    $('keyword')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') search(); });
    $('platformSelect')?.addEventListener('change', renderQualityOptions);
    $('resolveButton')?.addEventListener('click', resolveSong);
    $('settingsDialog')?.addEventListener('click', (event) => {
      if (event.target === $('settingsDialog')) closeSettings();
    });
  }

  function init() {
    renderSearchSourceOptions();
    renderAmmo();
    renderPlatformOptions();
    wireEvents();
    log('初始化', {
      ammo: state.ammo.map((a) => ({ id: a.id, name: a.name })),
      searchApi: SEARCH_API_URL,
      retries: DEFAULT_RETRIES,
    });
  }

  init();
})();
