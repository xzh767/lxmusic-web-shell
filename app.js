/*
 * LX Music Web Shell — application core.
 *
 * Owns: state, persistence, playback, queue, favorites.
 * Views/search/playlist/source-management UI live in views.js.
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
  const QUALITY_ORDER = ['128k', '320k', 'flac', 'flac24bit'];
  const QUALITY_LABELS = { '128k': '128k', '320k': '320k', flac: 'FLAC', flac24bit: 'FLAC 24bit' };
  const PLAY_MODES = [
    { id: 'list', icon: '🔁', label: '列表循环' },
    { id: 'single', icon: '🔂', label: '单曲循环' },
    { id: 'shuffle', icon: '🔀', label: '随机播放' },
  ];

  const KEYS = {
    queue: 'lx-web-shell-queue-v2',
    favorites: 'lx-web-shell-favorites-v2',
    playlists: 'lx-web-shell-playlists-v2',
    settings: 'lx-web-shell-settings-v2',
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => (window.LX_AMMO ? window.LX_AMMO.esc(v) : String(v ?? ''));

  const state = {
    view: 'search',
    queue: [],
    queueIndex: -1,
    favorites: [],
    savedPlaylists: [],
    results: [],
    page: 1,
    keyword: '',
    platform: '',
    playMode: 'list',
    volume: 1,
    lastQuality: '320k',
    current: null,
    currentUrl: '',
    busy: false,
  };

  /* ---------------- storage ---------------- */

  function readStore(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[存储] 写入失败', error);
    }
  }

  const saveQueue = () => {
    writeStore(KEYS.queue, { items: state.queue, index: state.queueIndex, mode: state.playMode });
    renderQueueBadge();
  };
  const saveFavorites = () => {
    writeStore(KEYS.favorites, state.favorites);
    renderFavBadge();
  };
  const savePlaylists = () => writeStore(KEYS.playlists, state.savedPlaylists);
  const saveSettings = () => writeStore(KEYS.settings, {
    volume: state.volume,
    mode: state.playMode,
    lastQuality: state.lastQuality,
  });

  /* ---------------- helpers ---------------- */

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
    el.textContent = message || '';
    el.className = message ? `notice ${kind}` : 'notice hidden';
  }

  function hideNotice(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    el.className = 'notice hidden';
  }

  function toast(message, kind = '') {
    const box = $('toastBox');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function songKey(song) {
    return `${song?.source || ''}|${song?.id || ''}`;
  }

  function normalizeSong(raw) {
    if (!raw) return null;
    const source = raw.source || raw.platform || '';
    const id = String(raw.id ?? raw.songId ?? raw.musicid ?? '');
    if (!source || !id) return null;
    return {
      id,
      source,
      name: raw.name || raw.title || raw.songname || '未知歌曲',
      artist: raw.artist || raw.singer || raw.singerName || '未知歌手',
      album: raw.album || raw.albumName || '',
      duration: Number(raw.duration) || 0,
      picture: raw.picture || raw.picUrl || raw.cover || '',
      strMediaMid: raw.strMediaMid || '',
      songId: raw.songId ?? null,
      qualities: Array.isArray(raw.qualities) ? raw.qualities : [],
    };
  }

  /* ---------------- playback ---------------- */

  function pickQuality(song) {
    const available = song?.qualities || [];
    const preferred = QUALITY_ORDER.filter((q) => available.includes(q));
    if (preferred.length) return preferred[preferred.length - 1];
    return state.lastQuality || '320k';
  }

  async function playSong(song, options = {}) {
    if (!song) return;
    state.current = song;
    state.lastQuality = pickQuality(song);
    updatePlayerBar(song);
    showNotice('searchNotice', `正在解析：${song.name} · ${PLATFORM_NAMES[song.source] || song.source} · ${state.lastQuality}`, 'info');

    const registry = window.LX_AMMO?.registry;
    if (!registry) return;
    try {
      const result = await registry.resolveWithFallback(
        song.source,
        song.id,
        state.lastQuality,
        {
          id: song.id,
          source: song.source,
          name: song.name,
          artist: song.artist,
          album: song.album,
          songmid: song.id,
          strMediaMid: song.strMediaMid || song.id,
          musicid: song.id,
          hash: song.id,
          copyrightId: song.id,
          type: state.lastQuality,
        },
      );
      state.currentUrl = result.url;
      const audio = $('audio');
      audio.src = result.url;
      audio.volume = state.volume;
      audio.play().catch((error) => {
        console.warn('[播放] 自动播放被阻止', error);
        toast('浏览器阻止了自动播放，点击 ▶ 手动播放', 'warn');
      });
      $('httpWarning').classList.toggle('hidden', !result.url.startsWith('http://'));
      $('qualityBadge').textContent = QUALITY_LABELS[state.lastQuality] || state.lastQuality;
      $('qualityBadge').classList.remove('hidden');
      showNotice('searchNotice', `✅ ${song.name} · 来自 ${result.source}`, 'success');
      if (window.LX_LYRICS) {
        // Load lyrics in the background; the panel only opens on user request.
        window.LX_LYRICS.load(song.source, song.id, `${song.name} · ${song.artist}`, false).catch(() => {});
      }
      updateMediaSession(song);
      if (options.queue && !options.fromQueue) {
        state.queue = options.queue;
        state.queueIndex = options.queue.findIndex((item) => songKey(item) === songKey(song));
        saveQueue();
        renderQueue();
      }
    } catch (error) {
      console.error('[播放] 解析失败', error);
      showNotice('searchNotice', `解析失败：${error.message || error}`, 'error');
      toast('解析失败，已尝试所有弹药源', 'err');
    }
  }

  function updatePlayerBar(song) {
    $('pbTitle').textContent = song.name;
    $('pbArtist').textContent = song.artist + (song.album ? ` · ${song.album}` : '');
    const cover = $('pbCover');
    cover.innerHTML = song.picture ? `<img src="${esc(song.picture)}" alt="" onerror="this.parentNode.textContent='🎵'">` : '🎵';
    const faved = state.favorites.some((f) => songKey(f) === songKey(song));
    const btn = $('favToggleButton');
    if (btn) {
      btn.textContent = faved ? '★' : '☆';
      btn.classList.toggle('active', faved);
    }
  }

  function updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.name,
        artist: song.artist,
        album: song.album || '',
        artwork: song.picture ? [{ src: song.picture, sizes: '256x256' }] : [],
      });
    } catch {
      /* best effort */
    }
  }

  function nextSong(auto = false) {
    if (!state.queue.length) return;
    let next;
    if (state.playMode === 'single' && auto) {
      next = state.queueIndex;
    } else if (state.playMode === 'shuffle') {
      if (state.queue.length === 1) next = 0;
      else {
        let candidate = state.queueIndex;
        while (candidate === state.queueIndex) candidate = Math.floor(Math.random() * state.queue.length);
        next = candidate;
      }
    } else {
      next = state.queueIndex + 1;
      if (next >= state.queue.length) {
        if (!auto) return;
        next = 0;
      }
    }
    if (next < 0 || next >= state.queue.length) return;
    state.queueIndex = next;
    saveQueue();
    playSong(state.queue[next], { fromQueue: true });
    renderQueue();
  }

  function prevSong() {
    if (!state.queue.length) return;
    let prev;
    if (state.playMode === 'shuffle') {
      prev = Math.floor(Math.random() * state.queue.length);
    } else {
      prev = state.queueIndex - 1;
      if (prev < 0) prev = state.queue.length - 1;
    }
    state.queueIndex = prev;
    saveQueue();
    playSong(state.queue[prev], { fromQueue: true });
    renderQueue();
  }

  /* ---------------- favorites ---------------- */

  function toggleFavorite(song) {
    const key = songKey(song);
    const index = state.favorites.findIndex((item) => songKey(item) === key);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      toast('已取消收藏');
    } else {
      state.favorites.unshift(song);
      toast('已收藏', 'ok');
    }
    saveFavorites();
    renderFavorites();
    if (state.current) updatePlayerBar(state.current);
  }

  /* ---------------- rendering ---------------- */

  function renderResults(containerId, items, options = {}) {
    const box = $(containerId);
    if (!box) return;
    if (!items.length) {
      box.innerHTML = `<div class="empty">${options.emptyText || '没有找到结果。'}</div>`;
      return;
    }
    box.innerHTML = items.map((item, index) => {
      const song = normalizeSong(item) || {};
      const key = songKey(song);
      const isPlaying = state.current && songKey(state.current) === key;
      const faved = state.favorites.some((f) => songKey(f) === key);
      const cover = song.picture
        ? `<img src="${esc(song.picture)}" alt="" loading="lazy" onerror="this.parentNode.textContent='🎵'">`
        : '🎵';
      return `
        <article class="result-row ${isPlaying ? 'playing' : ''}">
          <div class="result-cover">${cover}</div>
          <div class="result-copy">
            <strong>${esc(song.name || '未知歌曲')}</strong>
            <span>${esc(song.artist || '未知歌手')}${song.album ? ` · ${esc(song.album)}` : ''}</span>
            <small>${esc(PLATFORM_NAMES[song.source] || song.source)}${song.duration ? ` · ${formatDuration(song.duration)}` : ''}</small>
          </div>
          <div class="result-actions">
            <button type="button" class="mini-button ${faved ? 'fav-on' : ''}" data-fav-index="${index}">${faved ? '★' : '☆'}</button>
            <button type="button" class="use-button" data-play-index="${index}">${isPlaying ? '播放中' : '播放'}</button>
          </div>
        </article>`;
    }).join('');

    box.querySelectorAll('[data-play-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const song = normalizeSong(items[Number(button.dataset.playIndex)]);
        if (song) playSong(song, { queue: items.map(normalizeSong).filter(Boolean) });
      });
    });
    box.querySelectorAll('[data-fav-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const song = normalizeSong(items[Number(button.dataset.favIndex)]);
        if (song) toggleFavorite(song);
      });
    });
  }

  function renderQueueBadge() {
    const badge = $('queueBadge');
    if (!badge) return;
    badge.textContent = String(state.queue.length);
    badge.classList.toggle('hidden', state.queue.length === 0);
  }

  function renderFavBadge() {
    const badge = $('favBadge');
    if (!badge) return;
    badge.textContent = String(state.favorites.length);
    badge.classList.toggle('hidden', state.favorites.length === 0);
  }

  function renderAmmoBadge() {
    const badge = $('ammoBadge');
    if (!badge) return;
    const count = window.LX_AMMO ? window.LX_AMMO.registry.active().length : 0;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
  }

  function renderQueue() {
    const box = $('queueResults');
    if (!box) return;
    $('queueSummary').textContent = state.queue.length
      ? `共 ${state.queue.length} 首 · 当前第 ${state.queueIndex + 1} 首`
      : '队列为空。';
    if (!state.queue.length) {
      box.innerHTML = '<div class="empty">队列为空。搜索或打开歌单后点击“播放”即可加入队列。</div>';
      return;
    }
    box.innerHTML = state.queue.map((song, index) => `
      <article class="result-row ${index === state.queueIndex ? 'playing' : ''}">
        <div class="result-cover">${song.picture ? `<img src="${esc(song.picture)}" alt="" loading="lazy">` : '🎵'}</div>
        <div class="result-copy">
          <strong>${index + 1}. ${esc(song.name)}</strong>
          <span>${esc(song.artist)}${song.album ? ` · ${esc(song.album)}` : ''}</span>
          <small>${esc(PLATFORM_NAMES[song.source] || song.source)}${song.duration ? ` · ${formatDuration(song.duration)}` : ''}</small>
        </div>
        <div class="result-actions">
          <button type="button" class="mini-button" data-queue-remove="${index}">移除</button>
          <button type="button" class="use-button" data-queue-play="${index}">播放</button>
        </div>
      </article>`).join('');

    box.querySelectorAll('[data-queue-play]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.queuePlay);
        state.queueIndex = index;
        saveQueue();
        playSong(state.queue[index], { fromQueue: true });
        renderQueue();
      });
    });
    box.querySelectorAll('[data-queue-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.queueRemove);
        state.queue.splice(index, 1);
        if (state.queueIndex > index) state.queueIndex -= 1;
        else if (state.queueIndex === index) state.queueIndex = Math.min(state.queueIndex, state.queue.length - 1);
        saveQueue();
        renderQueue();
      });
    });
  }

  function renderFavorites() {
    renderResults('favResults', state.favorites, { emptyText: '还没有收藏。播放时点击 ☆ 收藏当前歌曲。' });
  }

  /* ---------------- player controls ---------------- */

  function setPlayMode(mode) {
    state.playMode = mode;
    const config = PLAY_MODES.find((item) => item.id === mode) || PLAY_MODES[0];
    const button = $('playModeButton');
    if (button) {
      button.textContent = config.icon;
      button.title = `播放模式：${config.label}`;
      button.classList.toggle('active', mode !== 'list');
    }
    saveSettings();
  }

  function cyclePlayMode() {
    const index = PLAY_MODES.findIndex((item) => item.id === state.playMode);
    setPlayMode(PLAY_MODES[(index + 1) % PLAY_MODES.length].id);
  }

  function updateProgress() {
    const audio = $('audio');
    const seek = $('seekBar');
    const current = $('pbCurrent');
    const duration = $('pbDuration');
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (seek && dur) seek.value = String((audio.currentTime / dur) * 100);
    if (current) current.textContent = formatDuration(audio.currentTime) || '0:00';
    if (duration) duration.textContent = formatDuration(dur) || '0:00';
  }

  function syncPlayButton() {
    const audio = $('audio');
    const button = $('playButton');
    if (!audio || !button) return;
    button.textContent = audio.paused ? '▶' : '⏸';
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === view);
    });
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === view);
    });
    $('main').scrollTop = 0;
  }

  /* ---------------- export for views.js ---------------- */

  window.LX_APP = {
    state,
    $,
    esc,
    formatDuration,
    showNotice,
    hideNotice,
    toast,
    songKey,
    normalizeSong,
    playSong,
    nextSong,
    prevSong,
    toggleFavorite,
    renderResults,
    renderQueue,
    renderFavorites,
    renderQueueBadge,
    renderFavBadge,
    renderAmmoBadge,
    setPlayMode,
    cyclePlayMode,
    switchView,
    updateProgress,
    syncPlayButton,
    saveQueue,
    saveFavorites,
    savePlaylists,
    saveSettings,
    readStore,
    writeStore,
    KEYS,
    PLATFORM_NAMES,
    PLAY_MODES,
  };
})();
