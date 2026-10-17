import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Track,MusicResource } from '../../packages/domain/index';
import {LibraryStore} from './library-store';

export function mediaId(videoId: string): string {
  const h = createHash('sha256').update(`youtube:${videoId}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export class Store {
  db: DatabaseSync;
  library: LibraryStore;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tracks (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS search_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched INTEGER NOT NULL, expires INTEGER NOT NULL);

      DELETE FROM tracks WHERE expires < unixepoch()*1000;
      DELETE FROM search_cache WHERE fetched < (unixepoch()-2592000)*1000;`);
    this.library=new LibraryStore(this.db);
  }
  saveTrack(track: Track) {
    this.db.prepare('INSERT OR REPLACE INTO tracks VALUES (?, ?, ?)').run(track.id, JSON.stringify(track), Date.now() + 30*86400000);
  }
  getTrack(id: string): Track | undefined {
    const row = this.db.prepare('SELECT data FROM tracks WHERE id=? AND expires>?').get(id, Date.now());
    return row ? JSON.parse(row.data as string) : this.library.getTrack(id);
  }
  cached(key: string): { data: { items: Track[]; nextCursor: string | null;priorityArtist?:MusicResource;truncated?:boolean }; fetched: number; expires: number } | undefined {
    const row = this.db.prepare('SELECT * FROM search_cache WHERE key=? AND fetched>?').get(key, Date.now() - 30*86400000);
    return row ? { data: JSON.parse(row.data as string), fetched: Number(row.fetched), expires: Number(row.expires) } : undefined;
  }
  cache(key: string, data: unknown, ttl: number) {
    const previous=this.db.prepare('SELECT fetched FROM search_cache WHERE key=?').get(key);
    // A refreshed snapshot must invalidate older signed cursors even if two
    // refreshes finish in the same millisecond.
    const now = Math.max(Date.now(),Number(previous?.fetched??0)+1);
    this.db.prepare('INSERT OR REPLACE INTO search_cache VALUES (?, ?, ?, ?)').run(key, JSON.stringify(data), now, now + ttl);
  }
  close() { this.db.close(); }
}
export function asMedia(track: Track) {
  return { id: track.id, provider: 'youtube', externalId: track.videoId, kind: 'track', title: track.title,
    creatorName: track.artist, artworkUrl: track.thumbnail, canonicalUrl: track.canonicalUrl,
    durationSeconds: track.duration || null, artists:track.artists,album:track.album,license: { name: null, url: null, attribution: null },
    expiresAt: new Date(Date.now() + 86400000).toISOString() };
}
