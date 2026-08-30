/*!
 * @name LX Music Web Shell Gateway Demo Source
 * @description LX Music Desktop custom-source bridge for the public Ammo Gateway.
 * @version 1.1.0
 * @homepage https://github.com/xzh767/lxmusic-web-shell
 *
 * Client-visible example: keep private resolver implementations, upstream URLs,
 * cookies and API keys on the server. Only the public Gateway is embedded here.
 */

'use strict'

const { EVENT_NAMES, request, on, send } = globalThis.lx

const GATEWAY = 'https://music-ammo-api-gateway.xlz767.dpdns.org'
const RESOLVE_API = `${GATEWAY}/api/resolve.php`

const MUSIC_QUALITY = {
  kg: ['128k', '320k', 'flac', 'flac24bit'],
  tx: ['128k', '320k', 'flac', 'flac24bit'],
  kw: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'],
  mg: ['128k', '320k', 'flac', 'flac24bit'],
}

const postJson = (url, body) => new Promise((resolve, reject) => {
  request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, (err, response) => {
    if (err) return reject(err)
    resolve(response?.body)
  })
})

function getSongId(source, musicInfo) {
  const info = musicInfo || {}
  switch (source) {
    case 'kg': return info.hash || info.songmid || info.id
    case 'tx': return info.strMediaMid || info.songmid || info.id
    case 'kw': return info.musicid || info.songmid || info.id
    case 'mg': return info.copyrightId || info.songmid || info.id
    case 'wy': return info.songmid || info.id
    default: return info.songmid || info.id
  }
}

on(EVENT_NAMES.request, async ({ action, source, info }) => {
  if (action !== 'musicUrl') throw new Error(`Unsupported action: ${action}`)
  if (!Object.prototype.hasOwnProperty.call(MUSIC_QUALITY, source)) {
    throw new Error(`Unsupported source: ${source}`)
  }

  const quality = info?.type
  const musicInfo = info?.musicInfo || {}
  const id = getSongId(source, musicInfo)

  if (!MUSIC_QUALITY[source].includes(quality)) {
    throw new Error(`Unsupported quality for ${source}: ${quality}`)
  }
  if (!id) throw new Error(`No usable song identity for ${source}`)

  const result = await postJson(RESOLVE_API, {
    source,
    id: String(id),
    quality,
    musicInfo,
  })

  if (!result?.ok || typeof result.url !== 'string' || !/^https?:\/\//i.test(result.url)) {
    throw new Error(result?.message || 'Ammo Gateway did not return a playable URL')
  }

  return result.url
})

send(EVENT_NAMES.inited, {
  openDevTools: false,
  sources: Object.fromEntries(
    Object.entries(MUSIC_QUALITY).map(([source, qualitys]) => [source, {
      name: source,
      type: 'music',
      actions: ['musicUrl'],
      qualitys,
    }])
  ),
})
