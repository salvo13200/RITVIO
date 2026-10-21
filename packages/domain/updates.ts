/** Release discovery only. Never downloads, installs or executes an update. */
export type UpdatePlatform = 'android' | 'windows';
export const releaseRepository = 'https://github.com/salvo13200/RITVIO';
export const releasesEndpoint = 'https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30';
export const updateInterval = 24 * 60 * 60 * 1000;
export interface OfficialRelease {
  version: string; tag: string; url: string; download: string; notes: string; preview: boolean;
}
export interface UpdatePreferences { autoCheck: boolean; previews: boolean; ignored: string | null }
export interface ReleaseResponse { status: number; body: string; etag?: string; retryAt?: number }
export interface UpdateHost {
  read(): Promise<{version: string; stored: string | null}>;
  write(value: string): Promise<void>;
  fetch(etag?: string): Promise<ReleaseResponse>;
  open(url: string): Promise<void>;
}
export type UpdateError = 'connection' | 'response' | 'limited' | 'storage' | 'open';
export interface UpdateSnapshot {
  version: string; ready: boolean; checking: boolean; saving: boolean;
  preferences: UpdatePreferences; release: OfficialRelease | null;
  checkedAt: number | null; retryAt: number; error: UpdateError | null; storageError: boolean;
}
type Version = {raw: string; parts: number[]; pre: string[]};
export function parseUpdateVersion(value: unknown): Version | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number), pre = match[4]?.split('.') ?? [];
  if (parts.some(n => !Number.isSafeInteger(n)) || pre.some(id => /^0\d+$/.test(id))) return null;
  return {raw: value, parts, pre};
}
export function compareUpdateVersions(a: string, b: string): number {
  const left = parseUpdateVersion(a), right = parseUpdateVersion(b);
  if (!left || !right) throw Error('Invalid version');
  for (let i = 0; i < 3; i++) if (left.parts[i] !== right.parts[i]) return Math.sign(left.parts[i] - right.parts[i]);
  if (!left.pre.length || !right.pre.length) return Math.sign(right.pre.length - left.pre.length);
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i], y = right.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return x.length !== y.length ? Math.sign(x.length - y.length) : x < y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
function identity(version: string, platform: UpdatePlatform) {
  const tag = `${platform}-v${version}`;
  const filename = platform === 'android' ? `RITVIO-Android-${version}.apk` : `RITVIO-${version}-setup.exe`;
  return {tag, url: `${releaseRepository}/releases/tag/${tag}`, download: `${releaseRepository}/releases/download/${tag}/${filename}`, filename};
}
export function isOfficialUpdateUrl(url: unknown, platform: UpdatePlatform): url is string {
  if (typeof url !== 'string' || url.length > 450) return false;
  const match = /^https:\/\/github\.com\/salvo13200\/RITVIO\/releases\/(?:tag|download)\/(android|windows)-v([^/]+)(?:\/[^/]+)?$/.exec(url);
  if (!match || match[1] !== platform || !parseUpdateVersion(match[2])) return false;
  const expected = identity(match[2], platform);
  return url === expected.url || url === expected.download;
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function cachedRelease(value: unknown, platform: UpdatePlatform): OfficialRelease | null {
  if (!record(value) || !parseUpdateVersion(value.version) || typeof value.notes !== 'string' || typeof value.preview !== 'boolean') return null;
  const version = value.version as string, expected = identity(version, platform);
  if (value.tag !== expected.tag || value.url !== expected.url || value.download !== expected.download || (parseUpdateVersion(version)!.pre.length > 0 && !value.preview)) return null;
  return {version, tag: expected.tag, url: expected.url, download: expected.download, notes: value.notes.slice(0, 700), preview: value.preview};
}
export function parseOfficialReleases(body: string, platform: UpdatePlatform): OfficialRelease[] {
  if (body.length > 2_000_000) throw Error('Invalid response');
  const data: unknown = JSON.parse(body);
  if (!Array.isArray(data) || data.length > 100) throw Error('Invalid response');
  const result: OfficialRelease[] = [];
  for (const item of data) {
    if (!record(item) || item.draft !== false || typeof item.prerelease !== 'boolean' || typeof item.tag_name !== 'string') continue;
    const prefix = `${platform}-v`, version = item.tag_name.startsWith(prefix) ? item.tag_name.slice(prefix.length) : '';
    if (!parseUpdateVersion(version)) continue;
    const expected = identity(version, platform);
    if (item.html_url !== expected.url || !Array.isArray(item.assets)) continue;
    const asset = item.assets.find(a => record(a) && a.name === expected.filename && a.browser_download_url === expected.download && a.state === 'uploaded' && typeof a.size === 'number' && a.size > 0 && a.size <= 500_000_000);
    if (!asset) continue;
    const release = cachedRelease({version, ...expected, notes: typeof item.body === 'string' ? item.body : '', preview: item.prerelease}, platform);
    if (release) result.push(release);
  }
  return result;
}
export function selectUpdate(releases: OfficialRelease[], version: string, previews: boolean): OfficialRelease | null {
  if (!parseUpdateVersion(version)) return null;
  return releases.filter(r => (previews || !r.preview) && compareUpdateVersions(r.version, version) > 0)
    .sort((a, b) => compareUpdateVersions(b.version, a.version))[0] ?? null;
}
function deadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Timeout')), milliseconds);
    promise.then(value => {clearTimeout(timer); resolve(value);}, error => {clearTimeout(timer); reject(error);});
  });
}
/** One controller per application, independent of player mounts and settings routes. */
export class UpdateController {
  private state: UpdateSnapshot = {version: '', ready: false, checking: false, saving: false, preferences: {autoCheck: false, previews: false, ignored: null}, release: null, checkedAt: null, retryAt: 0, error: null, storageError: false};
  private listeners = new Set<() => void>();
  private releases: OfficialRelease[] = [];
  private etag: string | undefined;
  private attemptedAt: number | null = null;
  private started: Promise<void> | undefined;
  private inFlight: Promise<void> | undefined;
  constructor(private platform: UpdatePlatform, private host: UpdateHost, private now: () => number = Date.now) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; };
  private publish(patch: Partial<UpdateSnapshot>) {this.state = {...this.state, ...patch}; for (const listener of this.listeners) listener();}
  private candidate() {return selectUpdate(this.releases, this.state.version, this.state.preferences.previews);}
  private timestamp(value: unknown) {return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= this.now() ? value : null;}
  initialize(): Promise<void> {return this.started ??= this.load();}
  private async load() {
    try {
      const {version, stored} = await deadline(this.host.read(), 4000);
      if (!parseUpdateVersion(version)) throw Error('Invalid installed version');
      let preferences = this.state.preferences, checkedAt: number | null = null, retryAt = 0;
      if (stored && stored.length <= 200_000) try {
        const data = JSON.parse(stored);
        if (record(data) && data.schema === 1) {
          preferences = {autoCheck: data.autoCheck === true, previews: data.previews === true, ignored: parseUpdateVersion(data.ignored) ? data.ignored as string : null};
          checkedAt = this.timestamp(data.checkedAt);
          this.attemptedAt = this.timestamp(data.attemptedAt);
          if (typeof data.retryAt === 'number' && Number.isSafeInteger(data.retryAt)) retryAt = Math.max(0, Math.min(data.retryAt, this.now() + updateInterval));
          this.releases = Array.isArray(data.releases) ? data.releases.slice(0, 100).map(r => cachedRelease(r, this.platform)).filter((r): r is OfficialRelease => r !== null) : [];
          if (typeof data.etag === 'string' && data.etag.length <= 300 && !/[\r\n]/.test(data.etag)) this.etag = data.etag;
        }
      } catch { /* Invalid optional cache does not replace a local library or block startup. */ }
      this.publish({version, preferences, checkedAt, retryAt, ready: true, error: null, storageError: false});
      this.publish({release: this.candidate()});
      if (preferences.autoCheck) void this.check(true);
    } catch {this.publish({ready: true, error: 'storage', storageError: true});}
  }
  private async persist() {
    try {
      await deadline(this.host.write(JSON.stringify({schema: 1, ...this.state.preferences, checkedAt: this.state.checkedAt, attemptedAt: this.attemptedAt, retryAt: this.state.retryAt, etag: this.etag, releases: this.releases})), 4000);
      this.publish({storageError: false}); return true;
    } catch {this.publish({storageError: true}); return false;}
  }
  async preferences(patch: Partial<UpdatePreferences>) {
    if (!this.state.version || this.state.saving) return;
    const before = this.state.preferences;
    const next = {...before, ...patch};
    this.publish({saving: true, preferences: next});
    const saved = await this.persist();
    if (!saved) this.publish({preferences: before});
    this.publish({saving: false, release: this.candidate()});
  }
  check(automatic = false): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.state.ready) return Promise.resolve();
    if (!this.state.version) {this.started = undefined; return this.initialize();}
    if (automatic && (!this.state.preferences.autoCheck || (this.attemptedAt !== null && this.now() - this.attemptedAt < updateInterval))) return Promise.resolve();
    if (this.now() < this.state.retryAt) {if (!automatic) this.publish({error: 'limited'}); return Promise.resolve();}
    this.inFlight = this.request().finally(() => {this.inFlight = undefined;});
    return this.inFlight;
  }
  private async request() {
    this.publish({checking: true, error: null});
    try {
      this.attemptedAt = this.now();
      await this.persist();
      const response = await deadline(this.host.fetch(this.etag), 25_000);
      const now = this.now();
      if (response.status === 429 || response.status === 403) {
        const retryAt = Number.isFinite(response.retryAt) ? Math.max(now + 60_000, Math.min(response.retryAt!, now + updateInterval)) : now + 15 * 60_000;
        this.publish({error: 'limited', retryAt}); await this.persist(); return;
      }
      if (response.status !== 200 && response.status !== 304) {this.publish({error: 'connection', retryAt: now + 60_000}); await this.persist(); return;}
      if (response.status === 200) {
        let parsed: OfficialRelease[];
        try {parsed = parseOfficialReleases(response.body, this.platform);} catch {this.publish({error: 'response', retryAt: now + 60_000}); return;}
        this.releases = parsed;
        this.etag = response.etag && response.etag.length <= 300 && !/[\r\n]/.test(response.etag) ? response.etag : undefined;
      } else if (this.state.checkedAt === null) {this.etag = undefined; this.publish({error: 'response', retryAt: now + 60_000}); await this.persist(); return;}
      this.publish({checkedAt: now, retryAt: now + 30_000, release: this.candidate()});
      await this.persist();
    } catch {this.publish({error: 'connection', retryAt: this.now() + 60_000}); await this.persist();}
    finally {this.publish({checking: false});}
  }
  async open(download = false) {
    const release = this.state.release;
    const url = download ? release?.download : release?.url;
    if (!url || !isOfficialUpdateUrl(url, this.platform)) return;
    try {await deadline(this.host.open(url), 8000); if (this.state.error === 'open') this.publish({error: null});}
    catch {this.publish({error: 'open'});}
  }
}
