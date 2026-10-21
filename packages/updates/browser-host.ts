import {isOfficialUpdateUrl, releasesEndpoint, type UpdateHost, type UpdatePlatform} from '../domain/updates';
/** Development browser adapter; packaged apps use their native, persistent hosts. */
export function browserUpdateHost(platform: UpdatePlatform, version: string): UpdateHost {
  const key = `ritvio.updates.${platform}.v1`;
  return {
    async read() {return {version, stored: localStorage.getItem(key)};},
    async write(value) {localStorage.setItem(key, value);},
    async fetch(etag) {
      const response = await fetch(releasesEndpoint, {signal: AbortSignal.timeout(12_000), redirect: 'error', headers: {Accept: 'application/vnd.github+json', ...(etag ? {'If-None-Match': etag} : {})}});
      const body = response.status === 200 ? await response.text() : '';
      if (body.length > 2_000_000) throw Error('Response too large');
      return {status: response.status, body, etag: response.headers.get('etag') ?? undefined};
    },
    async open(url) {if (!isOfficialUpdateUrl(url, platform)) throw Error('Invalid update link'); const opened = window.open(url, '_blank', 'noopener,noreferrer'); void opened;},
  };
}
