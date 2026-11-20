# LX Music Web Shell

A source-agnostic music search & playback web frontend. Supports **5 music platforms** (NetEase, QQ, Kugou, Kuwo, Migu) with universal audio resolution.

## ✨ Architecture Highlights

### Zero-config CORS Proxy — Works Out of the Box

Deploy anywhere and the edge proxy is **automatically configured**:

| Platform | What you push | Auto-routed at |
|----------|---------------|----------------|
| **Netlify** | `netlify.toml` + `netlify/functions/proxy.js` | `/.netlify/functions/proxy` |
| **Cloudflare Pages** | `_routes.json` + `_functions/proxy/[...proxy].ts` | `/proxy` |
| **Vercel** | `vercel.json` + `middleware.ts` | `/proxy` |

No manual setup. No environment variables. The frontend auto-discovers the local proxy on load and routes all search/lyric/playlist requests through it. Falls back to the Ammo gateway only when no proxy is found.

### Three-Tier Request Pipeline

```
Browser → Tier 1: Direct (rarely works due to CORS)
               ↓ fail
        Tier 2: Your own edge proxy (zero latency, your infra)
               ↓ not deployed
        Tier 3: Ammo Gateway (author's server, always available)
```

Only **audio streaming URLs** come from the Ammo resolver (`resolve.php`) — lyrics, search results, and playlist data are fully served by your edge node when available.

## 🎵 Supported Platforms

| Source Key | Platform | Search | Lyric | Playlist | Resolve |
|-----------|----------|--------|-------|----------|---------|
| `wy` | 网易云音乐 | ✅ | ✅ | ✅ | ✅ |
| `tx` | QQ音乐 | ✅ | ✅ | ✅ | ✅ |
| `kg` | 酷狗音乐 | ✅ | ✅ | ✅ | ✅ |
| `kw` | 酷我音乐 | ✅ | ✅ | ❌ | ✅ |
| `mg` | 咪咕音乐 | ✅ | ✅ | ✅ | ✅ |

Audio qualities: `128k`, `192k`, `320k`, `flac`, `flac24bit`.

## 🚀 Quick Start

1. **Fork or clone** this repo
2. **Push to Git** connected to Netlify / Cloudflare Pages / Vercel
3. **Done.** The proxy deploys automatically alongside the frontend.

### Manual Override (optional)

If you want to point to a custom proxy instead of the auto-detected one:

```html
<script>window.LX_WEB_SHELL_CORS_PROXY = "https://your-proxy.example.com/proxy";</script>
```
Add this before other `<script>` tags in `index.html`.

## 📂 Repository Structure

```
├── index.html              # Main entry (auto-detects proxy)
├── app.js                  # Core: state, playback, queue, favorites
├── views.js                # UI: search, playlists, sources
├── lyrics.js               # Lyrics panel with sync scroll
├── sources.js              # Resolver registry & fallback chain
├── theme.js                # Theme engine (green default)
├── style.css               # All styles
│
├── netlify/
│   └── functions/proxy.js  # Netlify Function (auto-deployed at /.netlify/functions/proxy)
├── _functions/
│   └── proxy/[...proxy].ts # Cloudflare Pages/Workers (auto-routed via _routes.json)
├── _routes.json            # CF Pages route config
├── netlify.toml            # Netlify build config
├── vercel.json             # Vercel build config
├── middleware.ts           # Vercel Edge Middleware
│
├── proxy/
│   ├── README.md           # Full proxy deployment guide
│   ├── auto-proxy.js       # Frontend auto-detection logic (loads BEFORE views.js)
│   └── proxy.mjs           # Portable Node.js proxy (generic serverless/Node hosts)
└── docs/
    └── GATEWAY_API.md      # Ammo gateway reference (for self-hosting)
```

## 🔧 How the Auto-Detection Works

On page load, `proxy/auto-proxy.js` runs immediately and probes two well-known paths:

```js
// auto-proxy.js does this internally:
const candidates = [
  `${location.origin}/.netlify/functions/proxy`,  // Netlify Functions
  `${location.origin}/proxy`,                      // CF Pages / Vercel / generic
];
```

It sends a quick HEAD request to each with a 600ms timeout. The first that responds without error becomes the active proxy base URL, cached for all subsequent search/lyric/playlist calls. If none respond, it logs "No local proxy — falling back to Ammo gateway" and everything continues working exactly as before.

This means:
- **You don't need to configure anything.** Just push the repo.
- **Existing deployments** continue working unchanged (Ammo fallback).
- **New deployments** get instant proxy support with zero extra steps.

## ⚠️ Known Limitations

- Audio streams go through Ammo's resolver (`resolve.php`) which authenticates against platform CDNs — this part requires platform-specific session tokens and cannot be fully proxy-free
- Overseas IPs may trigger platform rate-limits on NetEase/QQ searches (return empty results); recommend domestic network or self-hosted proxy
- Keyboard shortcuts: `Space`=play/pause, `ArrowLeft/Right`=seek ±5s

## 📄 License

MIT — free to fork, modify, and deploy.
