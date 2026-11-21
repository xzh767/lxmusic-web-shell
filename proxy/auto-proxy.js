/**
 * LX_WEB_SHELL_PROXY — Auto-detect & manage the edge CORS proxy.
 *
 * Auto-detection rules (checked in order):
 *   1. window.LX_WEB_SHELL_CORS_PROXY     ← manual override (highest priority)
 *   2. /.netlify/functions/proxy         ← Netlify Functions auto-discovered
 *   3. /proxy                            ← CF Pages / Vercel / generic serverless
 *
 * Once a working proxy is found, ALL search/lyric/playlist requests automatically
 * route through it. No user action required — just deploy the proxy files alongside
 * index.html and everything "just works".
 *
 * Deployment is fully zero-config:
 *   Netlify  → put proxy/netlify/functions/proxy.js in your repo root
 *   CF Pages → put proxy/_functions/proxy/[...proxy].ts + _routes.json in your repo root
 *   Vercel   → put proxy/proxy.mjs as middleware.mjs or enable Vercel Edge Middleware
 *
 * Fallback: if no proxy is reachable, all requests silently degrade to the Ammo gateway.
 */
(() => {
  'use strict';

  let _proxyUrl = null;
  let _resolvePromise = null;

  async function resolveProxy() {
    if (_proxyUrl !== null) return _proxyUrl;

    // Priority 1: manual override (set via <script> before this file loads)
    const manual = window.LX_WEB_SHELL_CORS_PROXY;
    if (manual) {
      console.log('[LX proxy] Manual config:', manual);
      return ( _proxyUrl = manual );
    }

    // Priority 2 & 3: auto-discover from well-known deployment paths.
    // Use a GET with a minimal test URL to verify the proxy actually works
    // (a bare HEAD with no-cors can't distinguish 200 from 404).
    const candidates = [
      `${location.origin}/.netlify/functions/proxy`,   // Netlify default
      `${location.origin}/proxy`,                       // CF Pages / Vercel / generic
    ];
    const testTarget = encodeURIComponent('https://music.163.com/api/playlist/list?offset=0&limit=1');

    for (const url of candidates) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 800);
        const resp = await fetch(`${url}?url=${testTarget}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (resp.ok) {
          const json = await resp.json();
          // Accept any JSON with a recognised field (playlists, code, success, etc.)
          if (json && typeof json === 'object') {
            console.log(`[LX proxy] Discovered & verified at ${url}`);
            return (_proxyUrl = url);
          }
        }
        // Non-ok or non-JSON → next candidate
      } catch {
        // Network error or abort → next candidate
      }
    }

    console.log('[LX proxy] No local proxy — falling back to Ammo gateway');
    return (_proxyUrl = null);
  }

  /** Exposed globals (read-only after first resolution). */
  window.__LX_PROXY__ = {
    /** Resolve the proxy URL; returns the base URL string or null. */
    resolve: () => (_resolvePromise || (_resolvePromise = resolveProxy())),
    /** Returns true if a usable proxy was discovered. */
    hasProxy: () => window.__LX_PROXY__.resolve().then((u) => u !== null),
    /** Build full proxied request URL from a base + upstream target. */
    buildUrl: (base, target) => `${base}/${encodeURIComponent(target)}`,
  };
})();
