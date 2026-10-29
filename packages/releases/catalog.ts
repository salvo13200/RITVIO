import published from './published.json' with {type:'json'};
import {compareUpdateVersions, parseOfficialReleases, parseUpdateVersion, releaseRepository, type OfficialRelease, type UpdatePlatform} from '../domain/updates';

export interface DownloadRelease extends OfficialRelease { bytes: number; portableZip?: string; portableExe?: string }
export interface DownloadCatalog { verifiedAt: string; android: DownloadRelease; windows: DownloadRelease; ios?: DownloadRelease }
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
/** iOS betas use independent tags; never pass them to desktop/Android update discovery. */
export function iosBetaDownload(body: string): DownloadRelease | null {
  if(body.length>2_000_000)throw Error('Invalid response');
  const data:unknown=JSON.parse(body);
  if(!Array.isArray(data)||data.length>100)throw Error('Invalid response');
  const releases:DownloadRelease[]=[];
  for(const item of data){
    if(!object(item)||item.draft!==false||item.prerelease!==true||typeof item.tag_name!=='string')continue;
    const match=/^ios-v(\d+\.\d+\.\d+)-beta\.([1-9]\d*)$/.exec(item.tag_name);
    if(!match||!parseUpdateVersion(match[1])||!Number.isSafeInteger(Number(match[2])))continue;
    const version=`${match[1]}-beta.${match[2]}`,tag=item.tag_name,url=`${releaseRepository}/releases/tag/${tag}`;
    if(!parseUpdateVersion(version)||item.html_url!==url||!Array.isArray(item.assets))continue;
    const filename=`RITVIO-iOS-${match[1]}-beta.ipa`,download=`${releaseRepository}/releases/download/${tag}/${filename}`;
    const asset=item.assets.find(a=>object(a)&&a.name===filename&&a.browser_download_url===download&&a.state==='uploaded'&&typeof a.size==='number'&&Number.isSafeInteger(a.size)&&a.size>0&&a.size<=500_000_000);
    if(!asset)continue;
    releases.push({version,tag,url,download,preview:true,bytes:asset.size as number,notes:typeof item.body==='string'?item.body.slice(0,700):''});
  }
  return releases.sort((a,b)=>compareUpdateVersions(b.version,a.version))[0]??null;
}
export function readPublishedCatalog(value: unknown): DownloadCatalog {
  if (!object(value) || value.schema !== 1 || typeof value.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.verifiedAt) || !Array.isArray(value.releases)) throw Error('Invalid public download catalog');
  const body = JSON.stringify(value.releases), android = releaseDownload(body, 'android'), windows = releaseDownload(body, 'windows');
  if (!android || !windows) throw Error('Both official platform packages are required');
  const ios=iosBetaDownload(body);
  return {verifiedAt: value.verifiedAt, android, windows,...(ios?{ios}:{})};
}
export const publishedDownloads = readPublishedCatalog(published);
export function formatDownloadSize(bytes: number) {return `${Math.round(bytes / 1_000_000)} MB`;}
