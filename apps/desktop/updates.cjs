const fs = require('node:fs/promises');
const path = require('node:path');
const endpoint = 'https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30';
const versionPattern = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
function officialWindowsUrl(value) {
  if (typeof value !== 'string' || value.length > 450) return false;
  const match = new RegExp(`^https://github\\.com/salvo13200/RITVIO/releases/(tag|download)/windows-v(${versionPattern})(?:/([^/]+))?$`).exec(value);
  return !!match && (match[1] === 'tag' ? match[3] === undefined : match[3] === `RITVIO-${match[2]}-setup.exe`);
}
function createUpdateAccess(directory, version, {fetchImpl = fetch, openExternal, now = Date.now} = {}) {
  const file = path.join(directory, 'updates-v1.json');
  let pending, saving = Promise.resolve();
  return {
    async read() {
      let stored = null;
      try {if ((await fs.stat(file)).size > 200_000) throw Error('Update settings too large'); stored = await fs.readFile(file, 'utf8');}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
      return {version, stored};
    },
    async write(value) {
      if (typeof value !== 'string' || Buffer.byteLength(value) > 200_000 || JSON.parse(value)?.schema !== 1) throw Error('Invalid update settings');
      saving = saving.catch(() => {}).then(async () => {
        await fs.mkdir(directory, {recursive: true});
        await fs.writeFile(file + '.tmp', value, {encoding: 'utf8', mode: 0o600});
        await fs.rename(file + '.tmp', file);
      });
      await saving;
    },
    async fetch(etag) {
      if (pending) return pending;
      if (etag !== undefined && (typeof etag !== 'string' || etag.length > 300 || /[\r\n]/.test(etag))) throw Error('Invalid entity tag');
      pending = (async () => {
        const response = await fetchImpl(endpoint, {redirect: 'error', signal: AbortSignal.timeout(12_000), headers: {Accept: 'application/vnd.github+json', 'User-Agent': 'RITVIO-update-check', ...(etag ? {'If-None-Match': etag} : {})}});
        let body = '';
        if (response.status === 200) {
          const chunks = []; let bytes = 0;
          if (!response.body) throw Error('Missing response');
          for await (const chunk of response.body) {bytes += chunk.length; if (bytes > 2_000_000) throw Error('Response too large'); chunks.push(chunk);}
          body = Buffer.concat(chunks).toString('utf8');
        } else await response.body?.cancel();
        const delay = response.headers.get('retry-after'), reset = response.headers.get('x-ratelimit-reset');
        const retryAt = delay ? (/^\d+$/.test(delay) ? now() + Number(delay) * 1000 : Date.parse(delay)) : reset ? Number(reset) * 1000 : undefined;
        return {status: response.status, body, etag: response.headers.get('etag') ?? undefined, ...(Number.isFinite(retryAt) ? {retryAt} : {})};
      })().finally(() => {pending = undefined;});
      return pending;
    },
    async open(url) {if (!officialWindowsUrl(url)) throw Error('Invalid update link'); await openExternal(url);},
  };
}
module.exports = {createUpdateAccess, officialWindowsUrl};
