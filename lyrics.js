/*
 * LX Music Web Shell — lyrics panel.
 *
 * Fetches LRC text from the gateway lyric API, parses it, highlights the
 * current line while playing and lets the user click a line to seek.
 */
(() => {
  'use strict';

  const LYRIC_API = window.LX_WEB_SHELL_LYRIC_API
    || 'https://music-ammo-api-gateway.xlz767.dpdns.org/api/lyric.php';

  const $ = (id) => document.getElementById(id);
  const state = { lines: [], activeIndex: -1, url: '', currentSongKey: '' };
  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /** Parse LRC text into [{time, text}]. Supports [mm:ss.xx] and [mm:ss:xx]. */
  function parseLrc(raw) {
    const text = String(raw || '');
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

  /**
   * 歌词统一走网关：LX 官方接口（网易云 eapi / QQ fcgi / 酷狗 / 酷我）没有 CORS 头，
   * 浏览器无法直连，由网关代跑。
   */
  async function fetchLyric(source, id) {
    const url = `${LYRIC_API}${LYRIC_API.includes('?') ? '&' : '?'}source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`;
    console.log(`%c[LX lyric] GET 网关 ${source}/${id}`, 'color:#89ddff');
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!data?.ok) throw new Error(data?.message || '歌词暂不可用');
    return data.lyric || '';
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
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
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
