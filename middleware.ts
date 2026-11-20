// Vercel Edge Middleware — CORS proxy
// See proxy/README.md for full deployment guide.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'interface.music.163.com', 'music.163.com',
  'u.y.qq.com', 'c.y.qq.com',
  'songsearch.kugou.com', 'mplayer.kugou.com', 'krcs.kugou.com',
  'www.kuwo.cn',
  'app.c.nf.migu.cn', 'cscs.migu.cn',
]);

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  let targetUrl: string | null = null;

  // Try ?url= query param first
  if (url.searchParams.has('url')) {
    targetUrl = url.searchParams.get('url');
  } else {
    // Path-based: /proxy/<encoded_url>
    const pathParts = url.pathname.split('/').filter(Boolean);
    const proxyIdx = pathParts.indexOf('proxy');
    if (proxyIdx !== -1 && pathParts.length > proxyIdx + 1) {
      targetUrl = decodeURIComponent(pathParts.slice(proxyIdx + 1).join('/'));
    }
  }

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing target URL' }, { status: 400 });
  }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch {
    return NextResponse.json({ error: 'Invalid target URL' }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: `Host ${parsed.hostname} blocked` }, { status: 403 });
  }

  return NextResponse.fetch(new URL(targetUrl), {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

export const config = {
  matcher: ['/proxy/:path*'],
};
