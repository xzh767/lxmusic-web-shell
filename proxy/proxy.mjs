#!/usr/bin/env node
/**
 * Minimal CORS Proxy — runs on any Node.js host (Cloudflare Workers,
 * Deno Deploy, Railway, etc.).
 *
 * Usage: place this file as the sole handler of your serverless function
 * and set the CORS_PROXY_URL environment variable to the proxy's origin.
 *
 * Frontend activates it by setting before script tags load:
 *   window.LX_WEB_SHELL_CORS_PROXY = "https://your-proxy.example.com/proxy";
 *
 * Security: allows only whitelisted upstream hosts (music platforms).
 */

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com',     // 网易云
  'music.163.com',               // 网易云（歌单等公开接口）
  'u.y.qq.com',                  // QQ音乐
  'c.y.qq.com',                  // QQ音乐 fcg
  'songsearch.kugou.com',        // 酷狗
  'www2.kugou.kugou.com',        // 酷狗歌单列表
  'www.kuwo.cn',                 // 酷我
  'search.kuwo.cn',             // 酷我搜索
  'wapi.kuwo.cn',                // 酷我推荐歌单 API
  'mplayer.kugou.com',           // 酷狗播放器
  'krcs.kugou.com',              // 酷狗歌词
  'cscs.migu.cn',                // 咪咕
  'app.c.nf.migu.cn',            // 咪咕新版
]);

// Per-host default headers — some platforms gatekeep by Referer/User-Agent.
const DEFAULT_HEADERS = {
  'music.163.com':       { Referer: 'https://music.163.com/' },
  'interface.music.163.com': { Referer: 'https://music.163.com/' },
  'c.y.qq.com':          { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' },
  'u.y.qq.com':          { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' },
  'www.kuwo.cn':         { Referer: 'https://www.kuwo.cn/' },
  'search.kuwo.cn':      { Referer: 'https://www.kuwo.cn/' },
  'wapi.kuwo.cn':        { Referer: 'https://www.kuwo.cn/' },
  'www2.kugou.kugou.com':{ 'User-Agent': 'Mozilla/5.0' },
  'app.c.nf.migu.cn':    { Referer: 'https://music.migu.cn/' },
};

// Map source key → {host, pathTemplate} so we can rewrite URLs correctly
const SOURCE_CONFIG = {
  wy: {
    host: 'interface.music.163.com',
    buildPath(params) {
      const url = new URL('/eapi/search/web', `https://${params.get('source') || 'interface.music.163.com'}`);
      return url.pathname + '?' + params.toString();
    },
  },
  tx: {
    host: 'u.y.qq.com',
    buildPath(params) {
      return `/cgi-bin/musicu.fcg?${params.toString()}`;
    },
  },
  kg: {
    host: 'songsearch.kugou.com',
    buildPath(params) {
      return `/song_search_v2?${params.toString()}`;
    },
  },
  kw: {
    host: 'www.kuwo.cn',
    buildPath(params) {
      return `/api/www/search/searchKey?key=${encodeURIComponent(params.get('keyword') || '')}&pn=1&rn=${params.get('limit') || 30}`;
    },
  },
  mg: {
    host: 'app.c.nf.migu.cn',
    buildPath(params) {
      return `/resource/open/api/musci.music.cloud/cdn/down.url?url=${encodeURIComponent(params.get('url') || '')}`;
    },
  },
};

export async function proxyRequest(req, res) {
  const url = new URL(req.url);
  let targetUrl = url.searchParams.get('url');

  // Path-based fallback: /proxy/<encoded_url>
  if (!targetUrl) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    const proxyIdx = pathParts.findIndex(p => p === 'proxy');
    if (proxyIdx !== -1 && pathParts.length > proxyIdx + 1) {
      targetUrl = decodeURIComponent(pathParts.slice(proxyIdx + 1).join('/'));
    }
  }

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Missing target URL. Use ?url= or /proxy/<url>' }));
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Invalid URL' }));
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: `Host ${parsed.hostname} not allowed` }));
  }

  // Build correct request options
  const target = new URL(targetUrl);
  const options = {
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers },
  };

  // Rewrite Host header to target
  options.headers.host = target.hostname;
  delete options.headers['host']; // will be set by http/https module

  const httpMod = target.protocol === 'https:' ? await import('https') : await import('http');

  const hostDefaults = DEFAULT_HEADERS[parsed.hostname] || {};
  return new Promise((resolve) => {
    const proxyReq = httpMod.request({ ...options, headers: { ...hostDefaults, ...options.headers } }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      });
      proxyRes.pipe(res);
      resolve();
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
      resolve();
    });

    if (req.method === 'POST') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  });
}
