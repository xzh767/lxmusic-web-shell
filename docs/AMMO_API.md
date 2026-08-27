# Ammo API specification

“Ammo” is an external resolver/search service. The Web Shell contains no third-party source implementation. An ammo backend is responsible for translating its own upstream providers into this small normalized API.

## 1. Manifest

The Web Shell loads a public JSON manifest URL supplied by the operator.

```json
{
  "version": 1,
  "id": "example-ammo",
  "name": "Example Ammo",
  "versionName": "1.0.0",
  "baseUrl": "https://example.example",
  "platforms": {
    "tx": {
      "name": "腾讯音乐",
      "qualities": ["128k", "320k", "flac"]
    }
  },
  "endpoints": {
    "search": "/api/search",
    "resolve": "/api/resolve"
  }
}
```

`baseUrl` may be an absolute URL. Endpoint paths are resolved relative to it.

## 2. Search

`GET /api/search`

Query parameters:

- `q` and `keyword`: search text
- `source`: optional platform ID
- `page`: 1-based page number
- `limit`: requested page size

Successful response:

```json
{
  "ok": true,
  "results": [
    {
      "id": "song-id",
      "source": "tx",
      "name": "Song Name",
      "artist": "Artist",
      "album": "Album",
      "duration": 225,
      "picture": "https://..."
    }
  ]
}
```

`duration` is seconds. `picture` is optional.

## 3. Resolve

`POST /api/resolve`

Request body:

```json
{
  "source": "tx",
  "id": "song-id",
  "quality": "320k",
  "musicInfo": null
}
```

The backend may ignore `musicInfo` or use it for richer platform-specific identifiers.

Successful response:

```json
{
  "ok": true,
  "url": "https://media.example/song.m4a",
  "mime": "audio/mp4",
  "metadata": {
    "title": "Song Name",
    "artist": "Artist",
    "album": "Album",
    "duration": 225,
    "codec": "AAC"
  }
}
```

Failures:

```json
{
  "ok": false,
  "message": "resolver unavailable"
}
```

## 4. Deployment requirements

The ammo service must allow browser access from the Web Shell origin with appropriate CORS headers. The Web Shell deliberately does **not** provide an audio reverse proxy.

Recommended headers:

```http
Access-Control-Allow-Origin: https://your-web-shell.example
Content-Type: application/json
```

For `POST /api/resolve`, the backend should also allow `Content-Type` in `Access-Control-Allow-Headers`.

## 5. Responsibility boundary

This interface separates implementation and traffic paths, but it does not provide legal immunity or remove responsibilities from either side. Operators should only connect resolver backends they are authorized to use and should respect upstream terms, copyright, rate limits, and abuse controls.
