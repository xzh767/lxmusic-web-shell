// Netlify Function — CORS proxy
// Auto-mounted at /.netlify/functions/proxy by netlify.toml
// See proxy/README.md for details.

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com', 'music.163.com',
  'u.y.qq.com', 'c.y.qq.com',
  'songsearch.kugou.com', 'mplayer.kugou.com', 'krcs.kugou.com',
  'www2.kugou.kugou.com',        // 酷狗热门歌单列表（HTTP only — HTTPS 证书对 US IP 验证失败）
  'www.kugou.com',
  'www.kuwo.cn', 'search.kuwo.cn',  // 酷我搜索/推荐歌单
  'wapi.kuwo.cn',                // 酷我推荐歌单 API
  'mobileinterfaces.kuwo.cn',
  'app.c.nf.migu.cn', 'cscs.migu.cn',
  'music-ammo-api-gateway.xlz767.dpdns.org',  // Ammo 后端（mg 搜索等需签名的端点经代理转发）
]);

// Per-host default headers — some platforms gatekeep by Referer/User-Agent.
const DEFAULT_HEADERS = {
  'music.163.com':              { Referer: 'https://music.163.com/' },
  'interface.music.163.com':    { Referer: 'https://music.163.com/' },
  'c.y.qq.com':                 { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' },
  'u.y.qq.com':                 { Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' },
  'www.kuwo.cn':                { Referer: 'https://www.kuwo.cn/' },
  'search.kuwo.cn':             { Referer: 'https://www.kuwo.cn/' },
  'wapi.kuwo.cn':               { Referer: 'https://www.kuwo.cn/' },
  'www2.kugou.kugou.com':       { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.kugou.com/' },
  'songsearch.kugou.com':       { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.kugou.com/' },
  'app.c.nf.migu.cn':           { Referer: 'https://music.migu.cn/' },
};

async function proxyRequest(event, context) {
  const url = new URL(event.rawUrl || `http://local${event.path}`);
  let targetUrl = url.searchParams.get('url');

  // Path-based fallback: /.netlify/functions/proxy/<encoded_url>
  if (!targetUrl) {
    const parts = url.pathname.split('/').filter(Boolean);
    const proxyIdx = parts.indexOf('proxy');
    if (proxyIdx !== -1 && parts.length > proxyIdx + 1) {
      targetUrl = decodeURIComponent(parts.slice(proxyIdx + 1).join('/'));
    }
  }

  if (!targetUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing target URL' }) };
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid target URL' }) };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return { statusCode: 403, body: JSON.stringify({ error: `Host ${parsed.hostname} blocked` }) };
  }

  try {
    const hostDefaults = DEFAULT_HEADERS[parsed.hostname] || {};
    const resp = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: { ...hostDefaults, ...event.headers, host: parsed.hostname },
      body: event.httpMethod === 'POST' ? event.body : undefined,
    });
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: {
        'Content-Type': resp.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { statusCode: 502, body: JSON.stringify({ error: `Upstream: ${msg}` }) };
  }
}

exports.handler = proxyRequest;
