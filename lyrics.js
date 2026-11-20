/*
 * LX Music Web Shell — lyrics panel.
 *
 * Fetches LRC text from the gateway lyric API, parses it, highlights the
 * current line while playing and lets the user click a line to seek.
 */
(() => {
  'use strict';

  const AMMO_BASE = 'https://music-ammo-api-gateway.xlz767.dpdns.org';
  const LX_APP = window.LX_APP;
  const $ = (id) => LX_APP ? LX_APP.$(id) : document.getElementById(id);

  /* ── Auto-detecting edge proxy (zero-config) ──────────────────────────────
   * Mirror of views.js proxy system — shared PROXY_AUTO_DETECT singleton.
   */
  const PROXY_AUTO_DETECT = window.__LX_PROXY__;

  const state = { lines: [], activeIndex: -1, url: '', currentSongKey: '' };
  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /** Parse lyric text into [{time, text}].
   *  Supports two formats:
   *    1. Standard LRC: [mm:ss.xx]text or [mm:ss:xx]text
   *    2. NetEase JSON Lines: {"t":ms,"c":[{tx:"text"},...]} per line
   */
  function parseLrc(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];

    // Detect JSON format (first non-empty line starts with '{')
    const firstLine = text.split(/\r?\n/).find(l => l.trim());
    if (firstLine && firstLine.startsWith('{')) {
      return parseJsonLyrics(text);
    }
    return parseLrcStandard(text);
  }

  function parseLrcStandard(text) {
    const lines = [];
    const tagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const rawLine of text.split(/\r?\n/)) {
      tagRe.lastIndex = 0;
      const stamps = [];
      let match;
      while ((match = tagRe.exec(rawLine)) !== null) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const frac = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0;
        stamps.push(minutes * 60 + seconds + frac);
      }
      if (!stamps.length) continue;
      const content = rawLine.replace(tagRe, '').trim();
      for (const time of stamps) lines.push({ time, text: content });
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  function parseJsonLyrics(text) {
    const lines = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const obj = JSON.parse(trimmed);
        const timeSec = (obj.t || 0) / 1000;
        const texts = (obj.c || [])
          .map(item => item.tx || '')
          .filter(Boolean)
          .join('');
        if (texts) lines.push({ time: timeSec, text: texts });
      } catch { /* skip malformed lines */ }
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  /** Fetch LRC text using 3-tier architecture: direct → proxy → Ammo fallback. */
  async function fetchLyric(source, id) {
    // ── Tier 1: browser direct ──────────────────────────────────────────────
    try {
      console.log(`%c[LX lyric] 直连尝试 ${source}/${id}`, 'color:#7fd6a0');
      const urls = {
        wy: `https://music.163.com/api/song/lyric?id=${id}&lv=1`,
        tx: `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${id}&format=json`,
      };
      const directUrl = urls[source];
      if (directUrl) {
        const resp = await fetch(directUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.text();
        return parseDirectLyric(raw, source);
      }
    } catch (err) {
      console.info(`%c[LX lyric] 直连失败 ${source} (${err.message})`, 'color:#89ddff');
    }

    // ── Tier 2: auto-detected CORS proxy ─────────────────────────────────────
    let proxyBaseUrl = null;
    if (PROXY_AUTO_DETECT) {
      try { proxyBaseUrl = await PROXY_AUTO_DETECT.resolve(); } catch {}
    }
    if (proxyBaseUrl) {
      try {
        console.log(`%c[LX lyric] 经边缘代理获取 ${source}/${id}`, 'color:#e0af68');
        const targetUrl = `${AMMO_BASE}/api/lyric.php?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`;
        const proxyUrl = `${proxyBaseUrl}/${encodeURIComponent(targetUrl)}`;
        const resp = await fetch(proxyUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`proxy HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data?.ok) throw new Error(data?.message || '歌词暂不可用');
        console.log(`%c[LX lyric] 代理成功 ${source}/${id}`, 'color:#7aa2ff');
        return data.lyric || '';
      } catch (err) {
        console.warn(`%c[LX lyric] 代理失败 ${source} (${err.message})`, 'color:#ff5d73');
      }
    }

    // ── Tier 3: Ammo gateway (last resort) ──────────────────────────────────
    try {
      console.log(`%c[LX lyric] 最终走 Ammo 网关 ${source}/${id}`, 'color:#c792ea');
      const url = `${AMMO_BASE}/api/lyric.php?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!data?.ok) throw new Error(data?.message || '歌词暂不可用');
      return data.lyric || '';
    } catch (err) {
      throw new Error(`${source}: ${err.message}`);
    }
  }

  /** Parse platform-specific raw lyric response into normalised LRC string. */
  function parseDirectLyric(raw, source) {
    if (source === 'wy') {
      // NetEase returns JSON with lrc.line or lyric field
      let obj;
      try { obj = JSON.parse(raw); } catch { return raw; }
      return obj.lrc?.lyric || obj.klyric?.lyric || obj.lyric || '';
    }
    if (source === 'tx') {
      // QQ Music returns JSON-like string with lyric key
      let obj;
      try {
        // Strip potential callback wrapper: func({...})
        const jsonPart = raw.replace(/^\w+\(/, '').replace(/\);\s*$/, '');
        obj = JSON.parse(jsonPart);
      } catch { return raw; }
      return obj?.lyric?.lyric || obj?.lyric || '';
    }
    return raw;
  }

  /** Highlight the lyric line closest to currentTime.
   *  Only scrolls inside .pdLyricsContent — never affects parent scroll containers. */
  function highlight(currentTime) {
    if (!state.lines.length) return;
    let index = -1;
    for (let i = 0; i < state.lines.length; i += 1) {
      if (state.lines[i].time <= currentTime + 0.25) index = i;
      else break;
    }
    if (index === state.activeIndex) return;
    state.activeIndex = index;
    const box = $('pdLyricsContent');
    if (!box) return;
    box.querySelectorAll('.lyric-line.active').forEach((el) => el.classList.remove('active'));
    const el = box.querySelector(`.lyric-line[data-index="${index}"]`);
    if (el) {
      el.classList.add('active');
      // Manual scrollTop on the lyric box only — independent of any ancestor scroll
      const lineHeight = el.offsetHeight || 36;
      const desiredScroll = el.offsetTop - Math.floor(box.clientHeight / 2) + Math.floor(lineHeight / 2);
      box.scrollTo({ top: Math.max(0, desiredScroll), behavior: 'smooth' });
    }
  }

  function render(lines, title) {
    const box = $('pdLyricsContent');
    if (!box) return;
    $('pdTopTitle').textContent = title || '歌词';
    if (!lines.length) {
      box.innerHTML = '<div class="lyric-empty">暂无歌词</div>';
      return;
    }
    box.innerHTML = lines.map((line, index) => `
      <div class="lyric-line" data-index="${index}" data-time="${line.time}">
        ${esc(line.text || '♪')}
      </div>`).join('');
    box.querySelectorAll('.lyric-line').forEach((el) => {
      el.addEventListener('click', () => {
        const time = Number(el.dataset.time);
        const audio = $('audio');
        if (audio && Number.isFinite(time)) {
          audio.currentTime = time;
          audio.play().catch(() => {});
        }
      });
    });
  }

  function open() {
    const pd = $('playerDetail');
    if (!pd) return;
    pd.classList.add('active');
    pd.removeAttribute('aria-hidden');
  }

  function close() {
    const pd = $('playerDetail');
    if (!pd) return;
    pd.classList.remove('active');
    pd.setAttribute('aria-hidden', 'true');
  }

  function isOpen() {
    const pd = $('playerDetail');
    return pd?.classList.contains('active');
  }

  /**
   * Load lyrics for the given song; source/id come from the app layer.
   * autoOpen=false keeps the panel closed (used when a track starts playing).
   */
  async function load(source, id, title, autoOpen = true) {
    const key = `${source}:${id}`;
    if (key === state.currentSongKey) {
      if (autoOpen) open();
      return;
    }
    state.currentSongKey = key;
    state.lines = [];
    state.activeIndex = -1;
    if (autoOpen) open();
    render([], title || '加载中…');
    try {
      const raw = await fetchLyric(source, id);
      state.lines = parseLrc(raw);
      console.log(`%c[LX lyric] 解析出 ${state.lines.length} 行`, 'color:#e0af68');
      render(state.lines, title);
    } catch (error) {
      console.warn('[歌词] 读取失败', error);
      render([], title);
      const box = $('pdLyricsContent');
      if (box) box.innerHTML = `<div class="lyric-empty">${esc(error.message || '歌词不可用')}</div>`;
    }
  }

  function init() {
    $('pdBackBtn')?.addEventListener('click', close);
    $('playerDetail')?.addEventListener('click', (event) => {
      if (event.target === $('playerDetail')) close();
    });
    const audio = $('audio');
    if (audio) {
      audio.addEventListener('timeupdate', () => {
        if (isOpen()) highlight(audio.currentTime);
      });
    }
  }

  window.LX_LYRICS = { load, open, close, isOpen, parseLrc };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
