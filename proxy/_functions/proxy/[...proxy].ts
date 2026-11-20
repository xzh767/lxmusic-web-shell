// Cloudflare Pages Function — minimal CORS proxy
// Deploy: copy this file to _functions/proxy/[...proxy].ts
// Then add _routes.json: [{"path":"/proxy/*","function":"proxy"}]

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com',
  'u.y.qq.com',
  'songsearch.kugou.com',
  'www.kuwo.cn',
  'app.c.nf.migu.cn',
]);

export const onRequest: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  let targetUrl = url.searchParams.get('url');

  // Path-based fallback: /proxy/<encoded_url>
  if (!targetUrl) {
    const parts = url.pathname.split('/').filter(Boolean);
    const proxyIdx = parts.indexOf('proxy');
    if (proxyIdx !== -1 && parts.length > proxyIdx + 1) {
      targetUrl = decodeURIComponent(parts.slice(proxyIdx + 1).join('/'));
    }
  }

  if (!targetUrl) {
    return Response.json({ error: 'Missing ?url=' }, { status: 400 });
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return Response.json({ error: `Host ${parsed.hostname} blocked` }, { status: 403 });
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method === 'POST' ? await request.text() : undefined,
    });

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-cache');

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: `Upstream error: ${message}` }, { status: 502 });
  }
};
