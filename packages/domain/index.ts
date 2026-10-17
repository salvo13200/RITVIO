export type Track = {
  id: string; videoId: string; title: string; artist: string;
  thumbnail: string; duration: number; canonicalUrl: string;
  artists?: MusicResource[]; album?: MusicResource;
};
export type MusicResource = {id:string;name:string};
export type Profile = {id:string;mode:'local'|'online';displayName:string;avatar:string|null};
export type PlaylistVisibility = 'private'|'public';
export type PlaylistSummary = {id:string;name:string;description:string;visibility:PlaylistVisibility;cover:string|null;artwork:string[];count:number;revision:number;updatedAt:string;durationSeconds?:number|null};
export type PlaylistItem = {id:string;track:Track};
export type PersonalPlaylist = PlaylistSummary & {items:PlaylistItem[];undo?:{count:number;kind:'remove'|'move';targetName:string|null}|null};
export type FollowedResource = MusicResource & {kind:'artist'|'album';artwork:string|null;url:string};
export type HistoryEntry = {id:string;track:Track;playedAt:string};
export type PersonalLibrary = {profile:Profile;likes:Track[];playlists:PlaylistSummary[];follows:FollowedResource[];history:HistoryEntry[]};
export type QueueItem = Track & { queueId: string;source?:'manual'|'collection'|'radio'|'autoplay';suggestedFrom?:Pick<Track,'videoId'|'title'|'artist'> };
export type RepeatMode = 'off' | 'playlist' | 'track';
export type SearchResponse = {
  items: Track[]; nextCursor: string | null;
  priorityArtist?: MusicResource; truncated?: boolean;
  cache: { hit: boolean; degraded: boolean; fetchedAt: string; expiresAt: string };
};
export type Playback = {
  mode: 'youtube-audio-resolver'; accessMethod: 'unofficial-extraction';
  provider: 'youtube'; videoId: string; url: string; expiresAt: string;
  capabilities: { background: boolean; seek: boolean; volume: boolean; equalizer: boolean; offline: false };
};
export type ApiConfiguration = { baseUrl: string; token: string };
export type RuntimeStatus = { catalogProvider: 'youtube-music'; playbackProvider: 'youtube'; resolverInstalled: boolean; globalMediaKeys?: boolean };
export const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export function videoIdFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (videoIdPattern.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if(url.username || url.password)return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com'].includes(host)) {
      id = url.searchParams.get('v');
      if (!id && /^\/(shorts|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && videoIdPattern.test(id) ? id : null;
  } catch { return null; }
}
export function nextIndex(length: number, current: number, repeat: RepeatMode, shuffle: boolean, random = Math.random): number {
  if (!length) return -1;
  if (repeat === 'track') return current >= 0 ? current : 0;
  if (shuffle && length > 1) {
    const choice = Math.floor(Math.max(0, Math.min(0.999999, random())) * (length - 1));
    return choice >= current ? choice + 1 : choice;
  }
  if (current + 1 < length) return current + 1;
  return repeat === 'playlist' ? 0 : -1;
}
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result;
}
export function formatTime(seconds: number): string {
  const n = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
