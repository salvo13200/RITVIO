import published from './published.json' with {type:'json'};
import {compareUpdateVersions, parseOfficialReleases, releaseRepository, type OfficialRelease, type UpdatePlatform} from '../domain/updates';

export interface DownloadRelease extends OfficialRelease { bytes: number; portableZip?: string; portableExe?: string }
export interface DownloadCatalog { verifiedAt: string; android: DownloadRelease; windows: DownloadRelease }
function object(value: unknown): value is Record<string, unknown> {return !!value && typeof value === 'object' && !Array.isArray(value);}
function optionalAsset(assets: unknown[], tag: string, filename: string): string | undefined {
  const url = `${releaseRepository}/releases/download/${tag}/${filename}`;
  return assets.some(a => object(a) && a.name === filename && a.browser_download_url === url && a.state === 'uploaded' && typeof a.size === 'number' && a.size > 0) ? url : undefined;
}
/** Prefer a stable release, using a preview only while no valid stable package exists. */
export function releaseDownload(body: string, platform: UpdatePlatform): DownloadRelease | null {
  const releases = parseOfficialReleases(body, platform).sort((a, b) => Number(a.preview) - Number(b.preview) || compareUpdateVersions(b.version, a.version));
  const chosen = releases[0];
  if (!chosen) return null;
  const raw = (JSON.parse(body) as Record<string, unknown>[]).find(r => r.tag_name === chosen.tag)!;
  const assets = raw.assets as Record<string, unknown>[], asset = assets.find(a => a.browser_download_url === chosen.download)!;
  return {...chosen, bytes: asset.size as number, ...(platform === 'windows' ? {
    portableZip: optionalAsset(assets, chosen.tag, `RITVIO-${chosen.version}-portatile.zip`),
    portableExe: optionalAsset(assets, chosen.tag, `RITVIO-${chosen.version}-portatile.exe`),
  } : {})};
}
export function readPublishedCatalog(value: unknown): DownloadCatalog {
  if (!object(value) || value.schema !== 1 || typeof value.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.verifiedAt) || !Array.isArray(value.releases)) throw Error('Invalid public download catalog');
  const body = JSON.stringify(value.releases), android = releaseDownload(body, 'android'), windows = releaseDownload(body, 'windows');
  if (!android || !windows) throw Error('Both official platform packages are required');
  return {verifiedAt: value.verifiedAt, android, windows};
}
export const publishedDownloads = readPublishedCatalog(published);
export function formatDownloadSize(bytes: number) {return `${Math.round(bytes / 1_000_000)} MB`;}
