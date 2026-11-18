/*
 * LX Music Web Shell — Ammo (source) runtime.
 *
 * Three source kinds are supported behind one interface:
 *
 *   1. manifest  — HTTP Ammo described by /manifest.json (the recommended way;
 *                  the browser talks JSON to the backend, no upstream secrets).
 *   2. lxjs      — an LX Music Desktop custom source script executed in a
 *                  browser sandbox that emulates the LX runtime
 *                  (globalThis.lx / EVENT_NAMES / request()).
 *   3. http      — a plain JSON endpoint described by hand (base + paths).
 *
 * Every source exposes the same shape:
 *   {
 *     id, name, kind, platforms: { tx: {name, qualities[]} },
 *     enabled,
 *     search(keyword, platform, page, limit) -> {results[], errors[]},
 *     resolve(source, id, quality, musicInfo) -> {url, mime?, metadata?}
 *   }
 */
(() => {
  'use strict';

  const LX_EVENTS = {
    request: 'lx_request',
    inited: 'lx_inited',
    action: 'lx_action',
    playerAction: 'lx_player_action',
  };

  const $ = (id) => document.getElementById(id);

  function log(group, ...args) {
    console.groupCollapsed(`[Ammo] ${group}`);
    console.log(...args);
    console.groupEnd();
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function fetchJsonWithRetry(url, options = {}, retries = 3) {
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
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          // Some fcg-style endpoints answer text/html wrapping JSON.
          const trimmed = text.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
          throw new Error('响应不是 JSON');
        }
      } catch (error) {
        lastError = error;
        const transient = error?.transient === true
          || /HTTP (429|408|5\d\d)/i.test(String(error?.message || ''))
          || /network|timeout|failed to fetch/i.test(String(error?.message || ''));
        if (attempt >= retries || !transient) throw error;
        const delay = 300 * (2 ** (attempt - 1));
        console.warn(`[重试] ${attempt}/${retries} 失败，${delay}ms 后重试`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError || new Error('请求失败');
  }

  function joinUrl(base, path) {
    if (!path) return base;
    if (/^https?:\/\//i.test(path)) return path;
    return new URL(path.replace(/^\//, ''), `${base.replace(/\/$/, '')}/`).toString();
  }

  function normalizeQuality(q) {
    return String(q || '').trim();
  }

  /* ------------------------------------------------------------------ */
  /* Manifest Ammo                                                       */
  /* ------------------------------------------------------------------ */

  function createManifestSource(manifest, manifestUrl) {
    const baseUrl = new URL(manifest.baseUrl, manifestUrl).toString().replace(/\/$/, '');
    const platforms = {};
    for (const [id, meta] of Object.entries(manifest.platforms || {})) {
      platforms[id] = {
        name: meta?.name || id,
        qualities: Array.isArray(meta?.qualities) ? meta.qualities.map(normalizeQuality) : [],
      };
    }

    return {
      id: manifest.id,
      name: manifest.name || manifest.id,
      kind: 'manifest',
      versionName: manifest.versionName || manifest.version || '',
      baseUrl,
      manifestUrl,
      platforms,
      enabled: true,
      source: manifest,
      async search(keyword, platform, page, limit) {
        if (!manifest.endpoints?.search) throw new Error('该弹药未提供搜索接口');
        const url = joinUrl(baseUrl, manifest.endpoints.search);
        const params = new URLSearchParams({ q: keyword, keyword, source: platform || '', page: String(page), limit: String(limit) });
        const data = await fetchJsonWithRetry(`${url}?${params.toString()}`, { cache: 'no-store' });
        if (!data?.ok) throw new Error(data?.message || '搜索失败');
        return { results: Array.isArray(data.results) ? data.results : [], errors: data.errors || [] };
      },
      async resolve(platform, id, quality, musicInfo) {
        if (!manifest.endpoints?.resolve) throw new Error('该弹药未提供解析接口');
        const url = joinUrl(baseUrl, manifest.endpoints.resolve);
        const data = await fetchJsonWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: platform, id, quality, musicInfo: musicInfo || null }),
          cache: 'no-store',
        });
        if (!data?.ok || !data.url) throw new Error(data?.message || '未返回可播放 URL');
        return { url: data.url, mime: data.mime, metadata: data.metadata || null };
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* LX Music custom source script (browser sandbox)                      */
  /* ------------------------------------------------------------------ */

  /**
   * Execute an LX source script inside a sandbox-ish scope and emulate the
   * LX runtime API it expects.
   *
   * The script is user supplied code running in this tab. It is isolated from
   * the page scope as far as reasonably possible in a browser: it only gets
   * the `lx` API object, `console`, `setTimeout`, `URL`, `fetch` and
   * `TextEncoder`. Nothing is uploaded anywhere; requests go to whatever the
   * script itself asks for (subject to the browser's CORS rules).
   *
   * The script is executed with `globalThis.lx` bound to the runtime object,
   * because real LX sources destructure it at the top level:
   *   const { EVENT_NAMES, request, on, send } = globalThis.lx
   */
  async function runLxScript(code, sourceName) {
    const handlers = { request: [], inited: [] };

    const request = (url, options = {}, callback) => {
      const opts = typeof options === 'string' ? { url: options } : (options || {});
      const target = opts.url || url;
      const init = {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.body,
      };
      fetch(target, init)
        .then(async (res) => {
          const raw = await res.text();
          let body = raw;
          // The real LX runtime parses JSON bodies for the script, so
          // JSON.stringify'd payloads arrive as objects, not strings.
          try {
            const trimmed = raw.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) body = JSON.parse(trimmed);
          } catch {
            /* keep the raw text */
          }
          const response = {
            statusCode: res.status,
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
            body,
          };
          if (typeof callback === 'function') callback(null, response);
        })
        .catch((error) => {
          if (typeof callback === 'function') callback(error, null);
        });
    };

    const lx = {
      version: 'web-shell',
      env: 'web',
      isInited: false,
      EVENT_NAMES: LX_EVENTS,
      on(event, handler) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      send(event, data) {
        if (event === LX_EVENTS.inited) {
          lx.isInited = true;
          // Capture the declaration immediately: scripts usually call send()
          // once during evaluation, before any listener can be attached.
          lx.initedPayload = data;
          (handlers.inited || []).forEach((h) => {
            try { h(data); } catch (error) { console.warn('[LX 源] inited 处理器异常', error); }
          });
        }
      },
      initedPayload: null,
      request,
      utils: {
        buffer: new Uint8Array(0),
        crypto: {
          md5: async () => '',
          sha1: async () => '',
          sha256: async () => '',
          randomBytes: (size = 16) => {
            const out = new Uint8Array(size);
            crypto.getRandomValues(out);
            return Array.from(out);
          },
        },
        bufferToHex: (buf) => Array.from(buf || []).map((b) => b.toString(16).padStart(2, '0')).join(''),
        hexToBuffer: (hex) => Uint8Array.from((hex || '').match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) || []),
        formatMusicInfo: (info) => info || {},
      },
      log: {
        info: (...args) => console.info('[LX 源]', ...args),
        warn: (...args) => console.warn('[LX 源]', ...args),
        error: (...args) => console.error('[LX 源]', ...args),
      },
      currentScriptInfo: { name: sourceName, version: '1.0.0' },
      playerAction: { play: () => {}, pause: () => {}, stop: () => {} },
      action: { showNotice: (text) => console.info('[LX 源]', text) },
    };

    // Bind globalThis.lx so scripts can destructure it at the top level.
    // The runtime stays bound while the source is active: LX scripts may call
    // globalThis.lx lazily long after their evaluation finished.
    const previousLx = globalThis.lx;
    globalThis.lx = lx;

    const wrapped = `(function(globalThis){\n${code}\n})(globalThis);`;

    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function('globalThis', 'lx', 'request', 'console', 'setTimeout', 'clearTimeout', 'fetch', 'URL', 'TextDecoder', 'TextEncoder', 'crypto', wrapped);
      factory(globalThis, lx, request, console, setTimeout, clearTimeout, fetch, URL, TextDecoder, TextEncoder, crypto);
    } finally {
      // Restore only if another source did not install its own runtime.
      setTimeout(() => {
        if (globalThis.lx === lx) globalThis.lx = previousLx;
      }, 30000);
    }

    // Give the script a tick to emit its inited payload.
    await new Promise((resolve) => setTimeout(resolve, 60));

    return { lx, handlers };
  }

  function createLxSource(code, sourceName) {
    const runtime = { lx: null, handlers: null };

    const source = {
      id: `lxjs:${sourceName}`,
      name: sourceName,
      kind: 'lxjs',
      versionName: 'LX 脚本',
      baseUrl: '',
      platforms: {},
      enabled: true,
      code,
      async init() {
        if (runtime.lx) return runtime;
        const started = await runLxScript(code, sourceName);
        runtime.lx = started.lx;
        runtime.handlers = started.handlers;

        // Real LX sources declare their capabilities through
        // send(EVENT_NAMES.inited, { sources: { tx: { qualitys: [...] } } }).
        const declared = {};
        const capture = (payload) => {
          if (!payload || typeof payload !== 'object') return;
          const sources = payload.sources || payload.platform || {};
          for (const [id, meta] of Object.entries(sources)) {
            const qualities = meta?.qualitys || meta?.qualities || [];
            const name = meta?.name || id;
            declared[id] = {
              name: String(name),
              qualities: Array.isArray(qualities) ? qualities.map(normalizeQuality) : [],
            };
          }
        };

        // The payload captured during script evaluation is the primary source.
        capture(runtime.lx.initedPayload);

        // Keep intercepting later send() calls as well.
        const originalSend = runtime.lx.send;
        runtime.lx.send = (event, payload) => {
          if (event === LX_EVENTS.inited) capture(payload);
          return originalSend(event, payload);
        };

        // Give the script a moment to declare asynchronously.
        await new Promise((resolve) => setTimeout(resolve, 120));
        capture(runtime.lx.initedPayload);

        const platforms = {};
        for (const [id, meta] of Object.entries(declared)) {
          platforms[id] = { name: meta.name, qualities: meta.qualities };
        }
        source.platforms = platforms;
        return runtime;
      },
      async search() {
        throw new Error('LX 脚本弹药不支持搜索');
      },
      async resolve(platform, id, quality, musicInfo) {
        const runtimeState = await source.init();
        // Handlers are keyed by the runtime's event-name constants
        // ('lx_request'), not by the literal string 'request'.
        const handlers = (runtimeState.handlers?.[runtimeState.lx.EVENT_NAMES.request] || []);
        if (!handlers.length) throw new Error('LX 脚本未注册 request 处理器');
        // LX request event payload shape.
        const payload = {
          action: 'musicUrl',
          source: platform,
          quality,
          type: quality,
          id,
          musicInfo: {
            ...(musicInfo || {}),
            id,
            source: platform,
            songmid: id,
            strMediaMid: (musicInfo && musicInfo.strMediaMid) || id,
            musicid: id,
            hash: id,
            copyrightId: id,
            type: quality,
          },
          info: {
            type: quality,
            musicInfo: {
              ...(musicInfo || {}),
              id,
              source: platform,
              songmid: id,
              strMediaMid: (musicInfo && musicInfo.strMediaMid) || id,
              musicid: id,
              hash: id,
              copyrightId: id,
            },
          },
        };
        for (const handler of handlers) {
          const url = await handler(payload);
          if (typeof url === 'string' && url) return { url, metadata: null };
          if (url && typeof url === 'object' && url.url) return { url: url.url, metadata: url.metadata || null };
        }
        throw new Error('LX 脚本未返回可播放 URL');
      },
    };

    return source;
  }

  /* ------------------------------------------------------------------ */
  /* Generic HTTP endpoint                                               */
  /* ------------------------------------------------------------------ */

  function createHttpSource(config) {
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const platforms = {};
    for (const [id, meta] of Object.entries(config.platforms || {})) {
      platforms[id] = { name: meta?.name || id, qualities: meta?.qualities || [] };
    }
    return {
      id: config.id,
      name: config.name || config.baseUrl,
      kind: 'http',
      versionName: 'HTTP',
      baseUrl,
      platforms,
      enabled: true,
      async search(keyword, platform, page, limit) {
        if (!config.searchPath) throw new Error('未配置搜索路径');
        const url = joinUrl(baseUrl, config.searchPath);
        const params = new URLSearchParams({ q: keyword, keyword, source: platform || '', page: String(page), limit: String(limit) });
        const data = await fetchJsonWithRetry(`${url}?${params.toString()}`, { cache: 'no-store' });
        if (!data?.ok) throw new Error(data?.message || '搜索失败');
        return { results: Array.isArray(data.results) ? data.results : [], errors: data.errors || [] };
      },
      async resolve(platform, id, quality, musicInfo) {
        if (!config.resolvePath) throw new Error('未配置解析路径');
        const url = joinUrl(baseUrl, config.resolvePath);
        const data = await fetchJsonWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: platform, id, quality, musicInfo: musicInfo || null }),
          cache: 'no-store',
        });
        if (!data?.ok || !data.url) throw new Error(data?.message || '未返回可播放 URL');
        return { url: data.url, mime: data.mime, metadata: data.metadata || null };
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Storage + registry                                                  */
  /* ------------------------------------------------------------------ */

  const STORAGE_KEY = 'lx-web-shell-sources-v2';

  function loadStored() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveStored(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  const registry = {
    sources: [],

    restore() {
      this.sources = loadStored().map((entry) => {
        try {
          if (entry.kind === 'manifest') return createManifestSource(entry.manifest, entry.manifestUrl);
          if (entry.kind === 'http') return createHttpSource(entry.config);
          if (entry.kind === 'lxjs') return createLxSource(entry.code, entry.name);
        } catch (error) {
          console.warn('[Ammo] 恢复失败', entry.id, error);
        }
        return null;
      }).filter(Boolean);
      return this.sources;
    },

    persist() {
      saveStored(this.sources.map((source) => {
        if (source.kind === 'manifest') {
          return { kind: 'manifest', manifest: source.source, manifestUrl: source.manifestUrl };
        }
        if (source.kind === 'http') {
          return {
            kind: 'http',
            config: {
              id: source.id,
              name: source.name,
              baseUrl: source.baseUrl,
              resolvePath: source.source?.resolvePath,
              searchPath: source.source?.searchPath,
              platforms: source.platforms,
            },
          };
        }
        return { kind: 'lxjs', name: source.name, code: source.code };
      }));
    },

    add(source) {
      const index = this.sources.findIndex((item) => item.id === source.id);
      if (index >= 0) this.sources[index] = source;
      else this.sources.push(source);
      this.persist();
      return source;
    },

    remove(id) {
      this.sources = this.sources.filter((item) => item.id !== id);
      this.persist();
    },

    setEnabled(id, enabled) {
      const item = this.sources.find((s) => s.id === id);
      if (item) {
        item.enabled = enabled;
        this.persist();
      }
    },

    active() {
      return this.sources.filter((item) => item.enabled !== false);
    },

    /** Resolve through every enabled source, first success wins. */
    async resolveWithFallback(platform, id, quality, musicInfo) {
      const candidates = this.active();
      if (!candidates.length) throw new Error('还没有装载任何弹药源。');
      const errors = [];
      for (const source of candidates) {
        try {
          const result = await source.resolve(platform, id, quality, musicInfo);
          console.log(`✅ [Ammo] ${source.name} 解析成功`, result);
          return { ...result, source: source.name };
        } catch (error) {
          console.warn(`❌ [Ammo] ${source.name}: ${error.message || error}`);
          errors.push(`${source.name}: ${error.message || error}`);
        }
      }
      const error = new Error('所有已装载弹药源均解析失败');
      error.details = errors;
      throw error;
    },

    async loadManifest(url) {
      const manifest = await fetchJsonWithRetry(url, { cache: 'no-store' });
      if (!manifest || typeof manifest !== 'object') throw new Error('Manifest 不是 JSON 对象');
      if (!manifest.id || !manifest.name) throw new Error('Manifest 缺少 id 或 name');
      if (!manifest.baseUrl) throw new Error('Manifest 缺少 baseUrl');
      if (!manifest.endpoints?.resolve) throw new Error('Manifest 必须提供 resolve endpoint');
      return this.add(createManifestSource(manifest, url));
    },

    async loadLxScript(code, name) {
      const source = createLxSource(code, name);
      await source.init();
      return this.add(source);
    },

    loadHttp(config) {
      if (!config.baseUrl) throw new Error('请填写 Base URL');
      if (!config.resolvePath) throw new Error('请填写 Resolve 路径');
      return this.add(createHttpSource(config));
    },
  };

  window.LX_AMMO = {
    registry,
    fetchJsonWithRetry,
    joinUrl,
    esc,
    PLATFORM_NAMES: {
      wy: '网易云音乐',
      tx: '腾讯音乐',
      kg: '酷狗音乐',
      kw: '酷我音乐',
      mg: '咪咕音乐',
      bd: '百度音乐',
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => registry.restore(), { once: true });
  } else {
    registry.restore();
  }
})();
