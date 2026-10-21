import {publishedDownloads, releaseDownload, formatDownloadSize, type DownloadRelease} from '../../../packages/releases/catalog';
import {releasesEndpoint} from '../../../packages/domain/updates';
import {parseTrackReference} from '../../../packages/domain/track-sharing';
import libraryImage from '../../../docs/media/mobile-library.webp';
import lyricsImage from '../../../docs/media/mobile-lyrics.webp';
import queueImage from '../../../docs/media/mobile-queue.webp';

function showSharedTrack(){
  document.getElementById('shared-song-fallback')!.hidden=true;
  const reference=parseTrackReference(location.hash),valid=reference.kind==='track';
  document.querySelector<HTMLElement>('.shared-song')!.hidden=!valid;
  document.querySelector<HTMLElement>('.hero-copy')!.hidden=valid;
  document.getElementById('shared-song-error')!.hidden=reference.kind!=='invalid';
  document.querySelector('.hero')!.setAttribute('aria-labelledby',valid?'shared-song-title':'hero-title');
  document.title='RITVIO — Your music, with you.';
  if(!valid)return;
  const {track}=reference;
  const title=track.title||'A song for you';
  document.getElementById('shared-song-title')!.textContent=title;
  const artist=document.getElementById('shared-song-artist')!;
  artist.textContent=track.artist||`Track reference: ${track.videoId}`;
  const source=document.getElementById('shared-song-source') as HTMLAnchorElement;
  source.href=`https://www.youtube.com/watch?v=${track.videoId}`;
  document.title=`${title} — RITVIO`;
}
showSharedTrack();
addEventListener('hashchange',showSharedTrack);

const features = [
  {key:'library',title:'Make it yours.',copy:'Liked tracks, personal playlists, followed artists and albums. A library kept on your device, ready for your next listening session.',image:libraryImage,alt:'Android library with personal playlists, large cover art and library categories',caption:'Android · Your library',linkLabel:'View full-size Android library screenshot'},
  {key:'lyrics',title:'Stay with the words.',copy:'Read available lyrics with the current line in focus. Adjust readability, scroll at your own pace, then return to following the song.',image:lyricsImage,alt:'Android lyrics reader with the current line highlighted and readability controls',caption:'Android · Lyrics reader',linkLabel:'View full-size Android lyrics screenshot'},
  {key:'queue',title:'Let the next song be your choice.',copy:'See what is playing and what comes next. Reorder with the grips, use the move controls, or keep listening with optional autoplay.',image:queueImage,alt:'Android queue with the playing track, upcoming songs, reorder grips and track actions',caption:'Android · Playback queue',linkLabel:'View full-size Android queue screenshot'},
];

function recommendPlatform(){
  const agent=navigator.userAgent;
  const suggested=/Android/i.test(agent)?'android':/Windows NT/i.test(agent)?'windows':null;
  if(!suggested)return;
  for(const element of document.querySelectorAll<HTMLElement>('[data-platform]')){
    const matches=element.dataset.platform===suggested;
    element.querySelector('.recommended')?.toggleAttribute('hidden',!matches);
    element.querySelector('.download-button')?.classList.toggle('primary',matches);
  }
}

const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-feature]'));
document.querySelector('.feature-tabs')?.removeAttribute('hidden');
const panel=document.getElementById('feature-panel')!;
const image=document.getElementById('feature-image') as HTMLImageElement;
let imageRevision=0;
function selectFeature(index:number){
  const feature=features[index];
  if(!feature)return;
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
  panel.setAttribute('aria-labelledby',`tab-${feature.key}`);
  document.getElementById('feature-title')!.textContent=feature.title;
  document.getElementById('feature-copy')!.textContent=feature.copy;
  document.getElementById('feature-caption')!.textContent=feature.caption;
  const link=document.getElementById('feature-fullsize') as HTMLAnchorElement;
  link.href=feature.image;link.setAttribute('aria-label',feature.linkLabel);
  image.alt=feature.alt;image.src=feature.image;
  const revision=++imageRevision;
  panel.classList.remove('is-changing');
  void image.decode().then(()=>{
    if(revision!==imageRevision||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    panel.classList.add('is-changing');
  }).catch(()=>{if(revision===imageRevision)document.getElementById('feature-caption')!.textContent='Screenshot unavailable here. Open the complete app gallery above.';});
}
tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>selectFeature(index));
  tab.addEventListener('keydown',event=>{
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();selectFeature(next);tabs[next].focus();
  });
});

function applyRelease(platform:'android'|'windows',release:DownloadRelease){
  document.querySelector<HTMLAnchorElement>(`[data-download=${platform}]`)!.href=release.download;
  document.querySelector(`[data-version=${platform}]`)!.textContent=`v${release.version}`;
  document.querySelector(`[data-channel=${platform}]`)!.textContent=release.preview?'Public preview':'Stable release';
  document.querySelector(`[data-size=${platform}]`)!.textContent=formatDownloadSize(release.bytes);
  for(const link of document.querySelectorAll<HTMLAnchorElement>(`[data-release-link=${platform}]`))link.href=release.url;
  if(platform==='windows'){
    for(const [format,url]of [['zip',release.portableZip],['exe',release.portableExe]]){
      const link=document.querySelector<HTMLAnchorElement>(`[data-portable=${format}]`);
      if(!link)continue;
      link.hidden=!url;
      if(link.nextElementSibling instanceof HTMLElement)link.nextElementSibling.hidden=!url;
      if(url)link.href=url;
    }
  }
}
const refresh=document.getElementById('refresh-releases') as HTMLButtonElement;
const status=document.getElementById('release-status')!;
let lastAttempt=0;
async function refreshReleases(){
  if(Date.now()-lastAttempt<60_000){status.textContent='Checked recently. Your download links are still available.';return;}
  lastAttempt=Date.now();refresh.disabled=true;refresh.setAttribute('aria-busy','true');status.textContent='Checking the official GitHub releases…';
  try{
    const response=await fetch(releasesEndpoint,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json'}});
    if(!response.ok||!response.body)throw Error('Unavailable');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>2_000_000)throw Error('Response too large');chunks.push(chunk.value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    const body=new TextDecoder().decode(data),android=releaseDownload(body,'android'),windows=releaseDownload(body,'windows');
    if(!android||!windows)throw Error('Incomplete release list');
    applyRelease('android',android);applyRelease('windows',windows);
    status.textContent='Official release list checked just now. Downloads open GitHub.';
  }catch{status.textContent=`Could not check GitHub right now. Keeping the verified links from ${publishedDownloads.verifiedAt}. You can still download or browse all releases.`;}
  finally{refresh.disabled=false;refresh.removeAttribute('aria-busy');}
}
recommendPlatform();
refresh.hidden=false;
refresh.addEventListener('click',()=>void refreshReleases());
