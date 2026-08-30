(() => {
  'use strict';

  /*
   * Optional feature layer for LX Music Web Shell.
   *
   * This module intentionally stays outside the core Ammo/search/resolve
   * orchestration. It adds:
   *   - song + playlist link recognition
   *   - six-platform playlist UI through an independent playlist API
   *   - native + server-side audio metadata enrichment
   */

  const PLAYLIST_API_URL =
    window.LX_WEB_SHELL_PLAYLIST_API ||
    'https://music-ammo-api-gateway.xlz767.dpdns.org/api/playlist.php';

  const METADATA_API_URL =
    window.LX_WEB_SHELL_METADATA_API ||
    'https://music.xlz767.dpdns.org/metadata.php';

  const PLATFORM_NAMES = {
    wy: '网易云音乐',
    tx: '腾讯音乐',
    kg: '酷狗音乐',
    kw: '酷我音乐',
    mg: '咪咕音乐',
    bd: '百度音乐',
  };

  const PLATFORM_ORDER = ['wy', 'tx', 'kg', 'kw', 'mg', 'bd'];
  const $ = (id) => document.getElementById(id);

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmt(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n < 0) return '';
    const t = Math.round(n);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function notice(id, message, kind = 'info') {
    const el = $(id);
    if (!el) return;
    el.textContent = message || '';
    el.className = message ? `notice ${kind}` : 'notice hidden';
  }

  function normalizeUrl(raw) {
    let value = String(raw || '').trim();
    if (!value) throw new Error('链接不能为空');
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    return new URL(value);
  }

  function idFromQuery(url, keys) {
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    return '';
  }

  function identify(raw) {
    const u = normalizeUrl(raw);
    const host = u.hostname.toLowerCase();
    const path = `${u.pathname}${u.search}${u.hash}`;

    if (host === 'music.163.com' || host.endsWith('.music.163.com')) {
      const playlist =
        path.match(/(?:playlist\?id=|#\/playlist\?id=)(\d+)/i)?.[1] ||
        idFromQuery(u, ['playlistId']);
      if (playlist && /playlist/i.test(path)) {
        return { type: 'playlist', source: 'wy', id: playlist, url: u.toString() };
      }
      const song =
        path.match(/(?:song\?id=|#\/song\?id=)(\d+)/i)?.[1] ||
        idFromQuery(u, ['id']);
      if (song) return { type: 'song', source: 'wy', id: song, url: u.toString() };
    }

    if (host === 'y.qq.com' || host.endsWith('.y.qq.com') || host === 'c.y.qq.com') {
      const playlist =
        path.match(/(?:playlist|dissdetail)\/(\d+)/i)?.[1] ||
        idFromQuery(u, ['disstid', 'playlistId']);
      if (playlist && /playlist|dissdetail/i.test(path)) {
        return { type: 'playlist', source: 'tx', id: playlist, url: u.toString() };
      }
      const song =
        path.match(/(?:songDetail|song)\/([A-Za-z0-9_-]+)/i)?.[1] ||
        idFromQuery(u, ['songmid', 'mid']);
      if (song) return { type: 'song', source: 'tx', id: song, url: u.toString() };
    }

    if (host.includes('kugou.com')) {
      const playlist =
        path.match(/(?:special|plist|playlist|mixsong)\/(?:single\/)?([A-Za-z0-9_-]+)/i)?.[1] ||
        idFromQuery(u, ['specialid', 'specialId']);
      if (playlist && /special|plist|playlist|mixsong/i.test(path)) {
        return { type: 'playlist', source: 'kg', id: playlist, url: u.toString() };
      }
      const hash = path.match(/(?:hash|song)\/([A-Fa-f0-9]{20,})/i)?.[1];
      if (hash) return { type: 'song', source: 'kg', id: hash, url: u.toString() };
    }

    if (host.includes('kuwo.cn')) {
      const playlist =
        path.match(/(?:playlist_detail|playlist)\/(?:\w+\/)?(\d+)/i)?.[1] ||
        idFromQuery(u, ['pid', 'playlistId']);
      if (playlist && /playlist/i.test(path)) {
        return { type: 'playlist', source: 'kw', id: playlist, url: u.toString() };
      }
      const song =
        path.match(/(?:play_detail)\/(\d+)/i)?.[1] ||
        idFromQuery(u, ['mid', 'musicid']);
      if (song) return { type: 'song', source: 'kw', id: song, url: u.toString() };
    }

    if (host === 'music.migu.cn' || host.endsWith('.migu.cn')) {
      const playlist =
        path.match(/(?:playlist|list)\/([A-Za-z0-9_-]+)/i)?.[1] ||
        idFromQuery(u, ['playlistId', 'playlist', 'id']);
      if (playlist && /playlist|list/i.test(path)) {
        return { type: 'playlist', source: 'mg', id: playlist, url: u.toString() };
      }
      const song =
        path.match(/(?:detail|song)\/([A-Za-z0-9_-]+)/i)?.[1] ||
        idFromQuery(u, ['copyrightId', 'contentId', 'id']);
      if (song) return { type: 'song', source: 'mg', id: song, url: u.toString() };
    }

    if (host.includes('music.baidu.com')) {
      const playlist =
        path.match(/(?:songlist|playlist)\/(?:list\/)?(\d+)/i)?.[1] ||
        idFromQuery(u, ['songlistId', 'playlistId', 'listId']);
      if (playlist && /songlist|playlist/i.test(path)) {
        return { type: 'playlist', source: 'bd', id: playlist, url: u.toString() };
      }
      const song =
        path.match(/song\/(\d+)/i)?.[1] ||
        idFromQuery(u, ['songid']);
      if (song) return { type: 'song', source: 'bd', id: song, url: u.toString() };
    }

    throw new Error('暂不支持该链接格式');
  }

  function renderSearchPlatformOptions() {
    const select = $('ammoSelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = [
      '<option value="">请选择搜索平台</option>',
      '<option value="__all__">聚合搜索（全部平台）</option>',
      ...['wy', 'tx', 'kg', 'kw', 'mg'].map((source) =>
        `<option value="${source}">${PLATFORM_NAMES[source]}</option>`
      ),
    ].join('');
    if (current === '__all__' || ['wy', 'tx', 'kg', 'kw', 'mg'].includes(current)) {
      select.value = current;
    }
  }

  async function recognizeLink() {
    try {
      const info = identify($('linkInput')?.value || '');
      if (info.type === 'song') {
        if ($('platformSelect')) {
          $('platformSelect').value = info.source;
          $('platformSelect').dispatchEvent(new Event('change'));
        }
        if ($('songId')) $('songId').value = info.id;
        notice('linkNotice', `识别成功：${PLATFORM_NAMES[info.source] || info.source} · 歌曲 ID ${info.id}`, 'success');
        $('resolveButton')?.click();
        document.querySelector('.player-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if ($('playlistPlatform')) $('playlistPlatform').value = info.source;
      if ($('playlistInput')) $('playlistInput').value = info.url || info.id;
      await openPlaylist(info);
    } catch (error) {
      notice('linkNotice', error.message || String(error), 'error');
    }
  }

  async function openPlaylist(preidentified = null) {
    let info = preidentified;
    try {
      if (!info) {
        const raw = $('playlistInput')?.value.trim();
        if (!raw) throw new Error('请输入歌单链接或歌单 ID');

        const selected = $('playlistPlatform')?.value;
        if (/^https?:\/\//i.test(raw)) {
          info = identify(raw);
          if (info.type !== 'playlist') throw new Error('该链接不是歌单链接');
          if (selected && selected !== info.source) throw new Error('所选平台与歌单链接平台不一致');
        } else {
          if (!selected) throw new Error('请输入完整歌单链接，或先选择平台后输入歌单 ID');
          info = { type: 'playlist', source: selected, id: raw, url: raw };
        }
      }

      if (!PLAYLIST_API_URL) throw new Error('未配置歌单接口');
      if ($('openPlaylistButton')) $('openPlaylistButton').disabled = true;
      if ($('playlistResults')) $('playlistResults').innerHTML = '<div class="empty">正在读取歌单…</div>';
      notice('playlistNotice', `正在打开 ${PLATFORM_NAMES[info.source] || info.source} 歌单…`, 'info');

      const query = new URLSearchParams({
        source: info.source,
        id: String(info.id || ''),
        url: String(info.url || ''),
        limit: '100',
      });

      const response = await fetch(`${PLAYLIST_API_URL}?${query.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`歌单接口 HTTP ${response.status}`);
      const data = await response.json();
      if (!data?.ok) throw new Error(data?.message || '歌单解析失败');

      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      const title = data.playlist?.title || data.title || `${PLATFORM_NAMES[info.source]} 歌单`;
      if ($('playlistSummary')) {
        $('playlistSummary').className = 'playlist-summary';
        $('playlistSummary').textContent = `${title} · ${tracks.length} 首`;
      }
      renderPlaylistTracks(tracks);
      notice('playlistNotice', `歌单加载完成：${tracks.length} 首`, 'success');

      console.groupCollapsed('[LX Web Shell] 歌单');
      console.log({ source: info.source, id: info.id, title, count: tracks.length });
      console.groupEnd();
    } catch (error) {
      if ($('playlistResults')) $('playlistResults').innerHTML = '';
      if ($('playlistSummary')) $('playlistSummary').className = 'playlist-summary hidden';
      notice('playlistNotice', error.message || String(error), 'error');
      console.error('[LX Web Shell] 歌单失败', error);
    } finally {
      if ($('openPlaylistButton')) $('openPlaylistButton').disabled = false;
    }
  }

  function renderPlaylistTracks(tracks) {
    const box = $('playlistResults');
    if (!box) return;
    box.innerHTML = tracks.length
      ? tracks.map((track, index) => `
          <article class="result-row">
            <div class="result-cover">${track.picture ? `<img src="${esc(track.picture)}" alt="">` : '🎵'}</div>
            <div class="result-copy">
              <strong>${index + 1}. ${esc(track.name || '未知歌曲')}</strong>
              <span>${esc(track.artist || track.singer || '未知歌手')}${track.album ? ` · ${esc(track.album)}` : ''}</span>
              <small>${esc(PLATFORM_NAMES[track.source] || track.source || '未知平台')}${track.duration ? ` · ${fmt(track.duration)}` : ''}</small>
            </div>
            <button type="button" class="use-button" data-play-index="${index}">使用</button>
          </article>
        `).join('')
      : '<div class="empty">歌单为空。</div>';

    box.querySelectorAll('[data-play-index]').forEach((button, index) => {
      button.addEventListener('click', () => {
        const track = tracks[index];
        if ($('platformSelect')) {
          $('platformSelect').value = track.source || '';
          $('platformSelect').dispatchEvent(new Event('change'));
        }
        if ($('songId')) $('songId').value = track.id || '';
        if ($('nowPlaying')) $('nowPlaying').textContent = `${track.name || '未知歌曲'} · ${track.artist || track.singer || '未知歌手'}`;
        $('resolveButton')?.click();
        document.querySelector('.player-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function currentAudioUrl() {
    const audio = $('audio');
    if (!audio) return '';
    return audio.currentSrc || audio.querySelector('source')?.src || audio.src || '';
  }

  function renderNativeMetadata() {
    const audio = $('audio');
    if (!audio) return;
    const url = currentAudioUrl();
    const native = {};
    if (Number.isFinite(audio.duration) && audio.duration > 0) native.duration = audio.duration;
    if (url) {
      try {
        const path = new URL(url).pathname;
        native.format = path.split('.').pop()?.toUpperCase() || '';
      } catch { /* ignore malformed URL */ }
    }
    if (Object.keys(native).length) renderMetadata(native, false);
  }

  let metadataGeneration = 0;
  let lastMetadataUrl = '';
  let metadataTimer = 0;

  function requestFullMetadataSoon() {
    window.clearTimeout(metadataTimer);
    metadataTimer = window.setTimeout(requestFullMetadata, 80);
  }

  async function requestFullMetadata() {
    const url = currentAudioUrl();
    if (!url || !METADATA_API_URL) return;
    if (url === lastMetadataUrl && $('metadata')?.dataset?.metadataUrl === url) return;

    const generation = ++metadataGeneration;
    renderNativeMetadata();

    try {
      const endpoint = `${METADATA_API_URL}${METADATA_API_URL.includes('?') ? '&' : '?'}action=metadata&url=${encodeURIComponent(url)}`;
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (generation !== metadataGeneration) return;

      const meta = data?.metadata;
      const ok = data?.success === true || data?.ok === true;
      if (ok && meta && typeof meta === 'object') {
        lastMetadataUrl = url;
        renderMetadata(meta, true);
        const box = $('metadata');
        if (box) box.dataset.metadataUrl = url;
        console.groupCollapsed('[音频 Metadata] 成功');
        console.table(meta);
        console.groupEnd();
      }
    } catch (error) {
      console.warn('[音频 Metadata] 读取失败，不影响播放：', error.message || error);
    }
  }

  function renderMetadata(meta, full) {
    const box = $('metadata');
    if (!box || !meta) return;
    const fields = [
      ['歌曲', meta.title],
      ['歌手', meta.artist],
      ['专辑', meta.album],
      ['年份', meta.year],
      ['音频格式', meta.codec || meta.format],
      ['采样率', meta.sampleRate ? `${meta.sampleRate} Hz` : ''],
      ['位深', meta.bitsPerSample ? `${meta.bitsPerSample} bit` : ''],
      ['声道', meta.channels ? (Number(meta.channels) === 1 ? '单声道' : `${meta.channels} 声道`) : ''],
      ['码率', meta.bitrateKbps ? `${meta.bitrateKbps} kbps` : ''],
      ['时长', meta.durationSec ? fmt(meta.durationSec) : (meta.duration ? fmt(meta.duration) : '')],
    ].filter(([, value]) => value !== undefined && value !== null && String(value) !== '');
    if (!fields.length) return;
    box.className = 'metadata';
    box.innerHTML = fields.map(([k, v]) => `<div><small>${esc(k)}</small><strong>${esc(String(v))}</strong></div>`).join('');
    if (!full) {
      box.insertAdjacentHTML('beforeend', '<div><small>说明</small><strong>当前仅有浏览器原生媒体信息</strong></div>');
    }
  }

  function init() {
    renderSearchPlatformOptions();

    $('recognizeLinkButton')?.addEventListener('click', recognizeLink);
    $('linkInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') recognizeLink(); });

    $('openPlaylistButton')?.addEventListener('click', () => openPlaylist());
    $('playlistInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') openPlaylist(); });

    const audio = $('audio');
    if (audio) {
      audio.addEventListener('loadedmetadata', renderNativeMetadata);
      audio.addEventListener('loadeddata', requestFullMetadataSoon);
      audio.addEventListener('canplay', requestFullMetadataSoon);
      const observer = new MutationObserver(requestFullMetadataSoon);
      observer.observe(audio, { attributes: true, attributeFilter: ['src'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
