# RITVIO desktop API

This guide describes the local desktop service and links to runtime implementations shipped in the public source. It replaces the historical endpoint register, whose private phase notes are not part of a clean checkout. See [Architecture](ARCHITECTURE.md), [Quality status](QUALITY_STATUS.md) and [Testing](TESTING.md) for platform ownership and evidence.

## Scope and authentication

Electron starts Fastify on `127.0.0.1` with a dynamically assigned port. Routes use the `/v1` prefix. This is an app-owned local service, not a hosted public API or an online account system. Android uses its native bridge and Media3 service; the desktop HTTP service is not the Android playback backend.

- `GET /v1/health` is a local process-health check.
- Other ordinary routes require the local session's `Authorization: Bearer ...` token. A supplied Origin must also be allowed.
- `GET /v1/stream/{ticket}` uses an expiring opaque ticket issued by authenticated playback, rather than a Bearer header on the audio element. The ticket is a temporary playback capability and must not be shared.
- Library ownership comes from the server-side identity provider, not a caller-supplied owner field. The default identity is local; online login and collaboration are not implemented.

Authentication, origin checks, registration and errors are implemented in [server.ts](../apps/api/server.ts). Native desktop configuration and file operations use the restricted [preload bridge](../apps/desktop/preload.cjs), not arbitrary renderer filesystem access.

## Search and playback

| Method and path | Behavior |
| --- | --- |
| `GET /v1/runtime` | Reports catalogue/playback providers and embedded resolver availability. |
| `GET /v1/search` | Track search with validated parameters, cached results and signed pagination cursors. |
| `GET /v1/media/{mediaId}` | Returns known media metadata or `MEDIA_NOT_FOUND`. |
| `POST /v1/links/resolve` | Resolves a validated video ID into catalogue metadata. |
| `POST /v1/media/{mediaId}/playback` | Returns an expiring descriptor with a local stream ticket. `fresh=true` refreshes resolution; `prepare=true` requests speculative preparation. |
| `GET /v1/stream/{ticket}` | Relays validated media bytes with byte ranges and bounded RAM buffering; this does not add offline audio downloads. |
| `GET /v1/playback/diagnostics` | Local resolver/buffer diagnostics without signed upstream URLs or track titles. |

The current runtime uses unofficial catalogue/stream resolvers and requires no YouTube Data API key. Metadata and descriptors are separate: descriptors and signed upstream URLs are not library records. Track IDs and queue-entry IDs are also separate, allowing intentional duplicate queue entries.

See [catalog.ts](../apps/api/catalog.ts), [resolver.ts](../apps/api/resolver.ts), [audio-stream.ts](../apps/api/audio-stream.ts) and [audio-range-buffer.ts](../apps/api/audio-range-buffer.ts) for the implementations. Provider availability and rate limits remain external dependencies.

## Library and feature routes

Use the linked route modules for exact schemas, responses and current limits. All these links are included in the public source export.

| Area | Runtime implementation |
| --- | --- |
| Local profile, likes, history, playlist CRUD, ordering and queue-to-playlist creation | [library-routes.ts](../apps/api/library-routes.ts), [library-store.ts](../apps/api/library-store.ts) and [identity.ts](../apps/api/identity.ts). |
| Playlist-file export/import | [sharing.ts](../apps/api/sharing.ts). Files carry playlist metadata, not audio, session tokens or personal listening history. |
| Provider playlist import with preview | [playlist-import.ts](../apps/api/playlist-import.ts), separate from playlist-file import. |
| Artist/album search, details, releases, following and artist-scoped search | [catalog-pages.ts](../apps/api/catalog-pages.ts). |
| Lyrics lookup, version selection and personal text/LRC import | [lyrics.ts](../apps/api/lyrics.ts); availability and content-rights limits are described in [Features](FEATURES.md). |
| Measured listening sessions, checkpoints, privacy and retention | [activity.ts](../apps/api/activity.ts). |
| Optional iTunes metadata, confirmed associations and personal genres | [metadata.ts](../apps/api/metadata.ts). Metadata matching does not supply playback audio. |
| Local taste settings, feedback, mixes and explicit discovery | [taste.ts](../apps/api/taste.ts). |
| Home collections, cached editions and refresh | [home.ts](../apps/api/home.ts). |
| Mood/activity catalogue and category playlists | [situations.ts](../apps/api/situations.ts). |
| Validated cover delivery for share-image rendering | [story-artwork.ts](../apps/api/story-artwork.ts). Image rendering/export is separate from playback. |

Existing playlist mutations use `If-Match` revision checks. Missing/stale revisions must not silently overwrite another edit. Schemas and stores enforce body sizes, item limits and identities. Imported files do not grant another profile's access or accept arbitrary playback URLs. A stored visibility field does not imply a publicly hosted playlist page.

## Errors and request budgets

Errors use `{error: {code, message, requestId, retryAt?}}`. Branch on stable error codes; messages are user-facing, not machine identifiers. Retry timing may accompany transient or rate-limit failures. Ordinary errors do not expose raw provider exceptions, credentials or signed upstream URLs.

The API distinguishes essential transport operations, local work and provider work. Limits/exemptions are defined in [request-budget.ts](../apps/api/request-budget.ts) and applied in [server.ts](../apps/api/server.ts); they are not YouTube Data API quota units. Recovery and preparation must preserve backoff and the user's pause/current-track intent.

## Generated OpenAPI and historical proposals

[openapi.json](openapi.json) is generated by [api-contract.mjs](../scripts/api-contract.mjs). Operations marked `x-implemented: false` are historical proposals, including online-account/social routes; they are not available features or setup requirements. For an implemented route's current validation and limits, consult its runtime module above. No fixed historical endpoint count is used as a current coverage claim.

Regenerate and validate the contract when changing it:

```powershell
node scripts/api-contract.mjs
pnpm check:architecture
```

Do not regenerate or change the contract solely to reclassify an unfinished feature as implemented. Public documentation must work without private phase notes.
