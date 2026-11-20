// Netlify Function — minimal CORS proxy
// Deploy: put this in netlify/functions/proxy.js alongside netlify.toml
// See proxy/README.md for full instructions.

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com',
  'u.y.qq.com',
  'songsearch.kugou.com',
  'www.kuwo.cn',
  'app.c.nf.migu.cn',
]);

async function proxyRequest(event, context) {
  const url = new URL(event.rawUrl || `http://local${event.path}`);
  let targetUrl = url.searchParams.get('url');

  // Path-based fallback
  if (!targetUrl) {
    const parts = url.pathname.split('/').filter(Boolean);
    const proxyIdx = parts.indexOf('proxy');
    if (proxyIdx !== -1 && parts.length > proxyIdx + 1) {
      targetUrl = decodeURIComponent(parts.slice(proxyIdx + 1).join('/'));
    }
  }

  if (!targetUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing ?url=' }) };
  }

  let parsed;
  try { parsed = new URL(targetUrl); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return { statusCode: 403, body: JSON.stringify({ error: `Host ${parsed.hostname} blocked` }) };
  }

  try {
    const resp = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: { ...event.headers, host: parsed.hostname },
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
