/** Public static-page contract. Deploy and verify this URL before shipping A5 binaries. */
export const ritvioSite = 'https://salvo13200.github.io/RITVIO/';
export type SharedTrack = {videoId:string;title?:string;artist?:string};
const videoIdPattern=/^[A-Za-z0-9_-]{11}$/;
/** Strip line/control/bidi separators so metadata cannot forge a second message or link. */
export function shareLabel(value:unknown,limit:number):string{
  return typeof value==='string'?Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim()).slice(0,limit).join(''):'';
}
export function ritvioTrackLink(track:SharedTrack):string{
  if(!videoIdPattern.test(track.videoId))throw Error('Invalid track identifier');
  const params=new URLSearchParams({track:track.videoId});
  const title=shareLabel(track.title,160),artist=shareLabel(track.artist,96);
  if(title)params.set('title',title);if(artist)params.set('artist',artist);
  // Fragment metadata is not sent to the static host or in HTTP referrers.
  return `${ritvioSite}#${params}`;
}
export function sharedTrackMessage(track:SharedTrack,credit='Shared with RITVIO'):string{
  const label=[shareLabel(track.title,160),shareLabel(track.artist,96)].filter(Boolean).join(' — ');
  return [label,shareLabel(credit,80),ritvioTrackLink(track)].filter(Boolean).join('\n');
}
export type TrackReference={kind:'none'}|{kind:'invalid'}|{kind:'track';track:SharedTrack};
export function parseTrackReference(hash:string):TrackReference{
  if(!/^#?track(?:=|&|$)/.test(hash))return {kind:'none'};
  if(hash.length>4000||/%(?![a-f\d]{2})/i.test(hash))return {kind:'invalid'};
  const params=new URLSearchParams(hash.replace(/^#/,''));
  if([...params.keys()].some(key=>!['track','title','artist'].includes(key))||[...params.keys()].some(key=>params.getAll(key).length!==1))return {kind:'invalid'};
  const videoId=params.get('track')??'';
  if(!videoIdPattern.test(videoId))return {kind:'invalid'};
  return {kind:'track',track:{videoId,title:shareLabel(params.get('title'),160),artist:shareLabel(params.get('artist'),96)}};
}
