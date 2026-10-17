import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
export type Config = {
  root: string; database: string; token: string;
  python: string; node: string; timeoutMs: number; searchTtlMs: number;
  catalogScript?: string; playbackScript?:string; electronNode?: boolean;
};
type RuntimePaths = { dataDirectory: string; python: string; node: string; catalogScript: string; electronNode: boolean };
export function loadConfig(root = process.cwd(), runtime?: RuntimePaths): Config {
  if(!runtime)dotenv.config({ path: path.join(root, '.env'), quiet: true });
  const venv = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(process.env[key] ?? fallback);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  return {
    root, database: path.join(runtime?.dataDirectory ?? path.join(root,'data'), 'mvp.sqlite'), token: randomBytes(32).toString('hex'),
    python: runtime?.python ?? (process.env.YOUTUBE_RESOLVER_PYTHON || (existsSync(venv) ? venv : 'python')),
    node: runtime?.node ?? (process.env.RITVIO_NODE_PATH || process.execPath),
    catalogScript: runtime?.catalogScript ?? path.join(root,'scripts/music-catalog.py'), electronNode: runtime?.electronNode ?? false,
    timeoutMs: number('YOUTUBE_RESOLVER_TIMEOUT_SECONDS', 30, 5, 90) * 1000,
    searchTtlMs: number('SEARCH_CACHE_TTL_SECONDS', 21600, 60, 86400) * 1000,
  };
}
