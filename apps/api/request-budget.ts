/** Playback has its own concurrency/cancellation bounds, not a per-minute UI quota. */
export function requestBudget(method:string,url:string):'essential'|'catalog'|'artwork'|'lyrics'|'metadata'|'local'{
  const path=url.split('?',1)[0],media='/v1/media/';
  if(method==='GET'&&(/^\/v1\/stream\/[a-f0-9]{64}$/.test(path)||path=== '/v1/runtime'||path==='/v1/playback/diagnostics'||new RegExp(`^${media}[a-f0-9-]{36}$`,'i').test(path)))return 'essential';
  if(method==='POST'&&(path==='/v1/links/resolve'||path==='/v1/me/listening/checkpoints'||path==='/v1/me/history'||new RegExp(`^${media}[a-f0-9-]{36}/playback$`,'i').test(path)))return 'essential';
  if(path==='/v1/search'||path.startsWith('/v1/catalog/')||path.startsWith('/v1/me/playlist-imports'))return 'catalog';
  if(/^\/v1\/me\/catalog\/artist\/[A-Za-z0-9_-]+\/artwork$/.test(path)||/^\/v1\/media\/[a-f0-9-]{36}\/artwork$/i.test(path))return 'artwork';
  if(path.startsWith('/v1/me/lyrics/'))return 'lyrics';
  if(path.startsWith('/v1/me/metadata/'))return 'metadata';
  return 'local';
}
