// Cloudflare Pages / Workers — minimal CORS proxy
// Auto-routed via _routes.json (see repo root)
// Deployed automatically when pushed to a CF Pages project.
import type { PagesFunction } from '@cloudflare/workers-types';

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com', 'music.163.com',
  'u.y.qq.com', 'c.y.qq.com',
  'songsearch.kugou.com', 'mplayer.kugou.com', 'krcs.kugou.com',
  'www2.kugou.kugou.com',
  'www.kuwo.cn', 'search.kuwo.cn', 'wapi.kuwo.cn',
  'app.c.nf.migu.cn', 'cscs.migu.cn',
]);

export const onRequest: PagesFunction = async ({ request }) => {
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
    return Response.json({ error: 'Missing target URL' }, { status: 400 });
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch {
    return Response.json({ error: 'Invalid target URL' }, { status: 400 });
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
    return new Response(response.body, { status: response.status, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: `Upstream: ${message}` }, { status: 502 });
  }
};
