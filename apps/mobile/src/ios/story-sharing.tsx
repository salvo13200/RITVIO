import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft,Download,LoaderCircle,Music2,Quote,RotateCcw,Share2} from 'lucide-react';
import type {NativeTrack} from '../../../../packages/domain/mobile';
import type {LyricsDocument} from '../../../../packages/domain/lyrics';
import {chooseExcerpt,excerptRows,excerptRange,selectedExcerpt,type ExcerptProblem,type ExcerptSelection} from '../../../../packages/domain/story-sharing';
import {renderStory,storyBlob,type StoryMode} from '../../../../packages/browser/story-canvas';
import {artworkSources} from '../artwork';
import {Artwork,Empty,IconButton,ScrollText,Sheet} from './components';
import {foundationBridge as bridge} from './native';
import {iosLyrics} from './lyrics-client';
import type {IOSStoryCopy} from './story-copy';

function requestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}
function imageFromData(dataUrl:string):Promise<HTMLImageElement>{
 if(!/^data:image\/(?:jpeg|png|webp);base64,/.test(dataUrl)||dataUrl.length>1_500_000)return Promise.reject(Error('STORY_ARTWORK_INVALID'));
 return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{image.onload=null;image.onerror=null;if(image.naturalWidth>0&&image.naturalHeight>0)resolve(image);else reject(Error('STORY_ARTWORK_INVALID'));};image.onerror=()=>reject(Error('STORY_ARTWORK_INVALID'));image.src=dataUrl;});
}
function base64(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('STORY_INVALID_IMAGE'));reader.readAsDataURL(blob);});}

/** Track/document props are frozen at opening; this workspace has no transport API. */
export function IOSStoryComposer({track,initialMode='track',initialDocument,t,onClose}:{track:NativeTrack;initialMode?:StoryMode;initialDocument?:LyricsDocument;t:IOSStoryCopy;onClose:()=>void}){
 const [mode,setMode]=useState<StoryMode>(initialMode),[preview,setPreview]=useState(initialMode==='track');
 const [rows,setRows]=useState<string[]|null>(()=>initialDocument&&!initialDocument.instrumental?excerptRows(initialDocument):null),[lyricsBusy,setLyricsBusy]=useState(false),[lyricsError,setLyricsError]=useState(initialDocument?.instrumental?t.instrumental:''),[lyricsAttempt,setLyricsAttempt]=useState(0);
 const [choice,setChoice]=useState<{selection:ExcerptSelection|null;problem:ExcerptProblem|null}>({selection:null,problem:null});
 const [art,setArt]=useState<'loading'|'ready'|'missing'>('loading'),[fallback,setFallback]=useState(false),[artAttempt,setArtAttempt]=useState(0);
 const [painted,setPainted]=useState(''),[paintError,setPaintError]=useState(''),[metadataTruncated,setMetadataTruncated]=useState(false),[renderAttempt,setRenderAttempt]=useState(0);
 const [busy,setBusy]=useState<'save'|'share'|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState<{text:string;permission:boolean}|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null),picture=useRef<HTMLImageElement|null>(null),alive=useRef(true),locked=useRef(false),list=useRef<HTMLOListElement>(null),listScroll=useRef(0),previousPreview=useRef(preview),cancelArtwork=useRef<()=>void>(()=>{}),loadedLyrics=useRef(Boolean(initialDocument));
 const range=excerptRange(choice.selection),excerpt=selectedExcerpt(rows??[],range),problem=choice.problem??(range?excerpt.problem:null);
 const key=JSON.stringify([mode,excerpt.text,excerpt.problem,art,fallback,artAttempt,renderAttempt]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;cancelArtwork.current();if(picture.current)picture.current.src='';picture.current=null;};},[]);
 useLayoutEffect(()=>{if(previousPreview.current&&!preview&&list.current){list.current.scrollTop=listScroll.current;list.current.querySelector<HTMLButtonElement>(`li:nth-child(${(choice.selection?.focus??0)+1}) button`)?.focus({preventScroll:true});}previousPreview.current=preview;},[preview]);
 useEffect(()=>{
  let cancelled=false,id:string|null=null;setArt('loading');setFallback(false);
  if(picture.current)picture.current.src='';picture.current=null;
  const cancel=()=>{cancelled=true;if(id)void bridge.cancelStoryArtwork({requestId:id}).catch(()=>{});};cancelArtwork.current=cancel;
  void (async()=>{
   for(const thumbnail of artworkSources(track.thumbnail,true)){
    if(cancelled)return;
    try{
     id=requestId();const response=await bridge.storyArtwork({requestId:id,thumbnail});const image=await imageFromData(response.dataUrl);
     if(cancelled){image.src='';return;}picture.current=image;setArt('ready');return;
    }catch{/* Try the original provider thumbnail once after a failed larger variant. */}
   }
   if(!cancelled)setArt('missing');
  })();return cancel;
 },[track.videoId,track.thumbnail,artAttempt]);
 useEffect(()=>{
  if(mode!=='lyrics'||loadedLyrics.current&&lyricsAttempt===0)return;
  const controller=new AbortController();let active=true;setLyricsBusy(true);setLyricsError('');
  void iosLyrics.lookup(track,{signal:controller.signal,fresh:lyricsAttempt>0}).then(result=>{
   if(!active)return;loadedLyrics.current=true;
   if(result.status==='instrumental'){setRows([]);setLyricsError(t.instrumental);}
   else if(!result.document){setRows([]);setLyricsError('');}
   else setRows(excerptRows(result.document));
  }).catch(failure=>{if(active){setRows(null);setLyricsError(failure?.code==='LYRICS_RATE_LIMIT'?t.rate:t.sourceError);}}).finally(()=>{if(active)setLyricsBusy(false);});
  return()=>{active=false;controller.abort();};
 },[mode,lyricsAttempt,track,t]);
 useEffect(()=>{
  let cancelled=false;setPainted('');setPaintError('');
  const target=canvas.current;if(!preview||!target||art==='loading'&&!fallback)return;
  if(mode==='lyrics'&&excerpt.problem)return;
  const work=document.createElement('canvas');
  void renderStory(work,track,fallback?null:picture.current,mode,mode==='lyrics'?excerpt.text:'').then(result=>{
   if(cancelled)return;target.width=work.width;target.height=work.height;target.getContext('2d')!.drawImage(work,0,0);setMetadataTruncated(result.metadataTruncated);setPainted(key);
  }).catch(failure=>{if(!cancelled)setPaintError(failure instanceof Error&&failure.message==='STORY_TEXT_DOES_NOT_FIT'?t.fitError:t.renderError);});
  return()=>{cancelled=true;};
 },[key,preview,track,t]);
 const available=painted===key&&(art==='ready'||fallback)&&(mode==='track'||!excerpt.problem)&&!busy;
 function changeMode(value:StoryMode){if(busy)return;setMode(value);setPreview(value==='track');setNotice('');setError(null);}
 function close(){if(!locked.current)onClose();}
 function beginPreview(){listScroll.current=list.current?.scrollTop??0;setPreview(true);setNotice('');setError(null);}
 function colors(){cancelArtwork.current();setArt('missing');setFallback(true);}
 async function send(save:boolean){
  if(!available||!canvas.current||locked.current)return;locked.current=true;setBusy(save?'save':'share');setNotice('');setError(null);
  try{
   const blob=await storyBlob(canvas.current);if(blob.size>8*1024*1024)throw Error('STORY_INVALID_IMAGE');
   const encoded=await base64(blob);if(!alive.current)return;
   const result=await bridge.exportStory({base64:encoded,save});
   if(alive.current)setNotice(result.status==='saved'?t.saved:result.status==='shared'?t.shared:t.cancelled);
  }catch(failure){
   const code=String((failure as {code?:string})?.code??'');
   if(alive.current)setError({text:code==='STORY_PHOTOS_DENIED'?t.permission:code==='STORY_BUSY'?t.busy:save?t.saveError:t.shareError,permission:code==='STORY_PHOTOS_DENIED'});
  }finally{locked.current=false;if(alive.current)setBusy(null);}
 }
 const problemText=problem==='lines'?t.limit:problem==='whole'?t.whole:problem==='empty'?t.empty:'';
 const title=mode==='lyrics'?(preview?t.preview:t.select):t.title;
 return <Sheet title={title} closeLabel={t.close} onClose={close} className={`ios-story${preview?' is-previewing':' is-selecting'}${preview&&mode==='lyrics'?' is-lyrics-preview':''}`}>
  {mode==='lyrics'&&preview&&<button className="ios-story-back" disabled={Boolean(busy)} onClick={()=>setPreview(false)}><ChevronLeft size={20}/>{t.back}</button>}
  <div className="ios-story-identity"><Artwork src={track.thumbnail} eager/><div className="ios-identity"><strong><ScrollText>{track.title}</ScrollText></strong><span><ScrollText>{track.artist}</ScrollText></span></div></div>
  {(!preview||mode==='track')&&<div className="ios-story-modes" role="group" aria-label={t.content}><button aria-pressed={mode==='track'} disabled={Boolean(busy)} onClick={()=>changeMode('track')}><Music2 size={18}/>{t.song}</button><button aria-pressed={mode==='lyrics'} disabled={Boolean(busy)} onClick={()=>changeMode('lyrics')}><Quote size={18}/>{t.lyrics}</button></div>}
  {!preview?<>
   <div className="ios-story-selection">
    {lyricsBusy?<div role="status" aria-label={t.loading} className="ios-story-loading"><LoaderCircle className="ios-spinner"/></div>:rows?.length?<ol ref={list} aria-label={t.select}>{rows.map((row,index)=>{const selected=Boolean(range&&index>=range.start&&index<=range.end);return <li key={index} className={`${selected?'is-selected':''}${range?.start===index?' is-first':''}${range?.end===index?' is-last':''}`}><button type="button" aria-pressed={selected} onClick={()=>setChoice(previous=>chooseExcerpt(rows,previous.selection,index))}>{row||<span className="ios-story-blank">{t.blank}</span>}</button></li>;})}</ol>:<Empty title={t.missing} body={lyricsError||t.missingBody}><button className="ios-text" onClick={()=>{loadedLyrics.current=false;setLyricsAttempt(value=>value+1);}}>{t.retry}</button></Empty>}
   </div>
   <footer className="ios-story-selection-actions"><div className="ios-story-counter"><span><strong>{excerpt.lines}</strong> {t.count}</span><IconButton label={t.reset} disabled={!choice.selection} onClick={()=>setChoice({selection:null,problem:null})}><RotateCcw size={20}/></IconButton></div><p>{t.choose}</p>{problemText&&<p className="ios-story-error" role="alert">{problemText}</p>}<button className="ios-primary" disabled={!excerpt.text||Boolean(problem)||lyricsBusy} onClick={beginPreview}>{t.next}<ArrowRight size={20}/></button><small>{t.source}</small></footer>
  </>:<>
   <div className="ios-story-preview" aria-label={t.previewLabel}>
    <canvas ref={canvas} aria-label={t.previewLabel} role="img" className={painted===key?'is-ready':''}/>
    {painted!==key&&!paintError&&<div className="ios-story-loading" role="status" aria-label={t.preparing}><LoaderCircle className="ios-spinner"/></div>}
    {paintError&&<div className="ios-story-preview-error" role="alert"><p>{paintError}</p><button className="ios-text" onClick={()=>mode==='lyrics'?setPreview(false):setRenderAttempt(value=>value+1)}>{mode==='lyrics'?t.back:t.retry}</button></div>}
   </div>
   <footer className="ios-story-export">
    {art==='missing'&&!fallback&&<div className="ios-story-cover-error"><p>{t.artError}</p><div><button className="ios-text" onClick={()=>setArtAttempt(value=>value+1)}>{t.retryCover}</button><button className="ios-text" onClick={colors}>{t.colors}</button></div></div>}
    {art==='loading'&&!fallback&&<button className="ios-text ios-story-colors" onClick={colors}>{t.colors}</button>}
    {metadataTruncated&&<p className="ios-story-hint">{t.truncated}</p>}
    {notice&&<p className="ios-story-notice" role="status">{notice}</p>}
    {error&&<div className="ios-story-error" role="alert"><p>{error.text}</p>{error.permission&&<button className="ios-text" onClick={()=>void bridge.storyOpenSettings().catch(()=>setError({text:t.saveError,permission:false}))}>{t.settings}</button>}</div>}
    <div className="ios-story-export-buttons"><button disabled={!available} onClick={()=>void send(true)} aria-label={busy==='save'?t.saving:t.save}>{busy==='save'?<LoaderCircle className="ios-spinner" size={20}/>:<Download size={20}/>}<span>{t.save}</span></button><button className="ios-primary" disabled={!available} onClick={()=>void send(false)} aria-label={busy==='share'?t.sharing:t.share}>{busy==='share'?<LoaderCircle className="ios-spinner" size={20}/>:<Share2 size={20}/>}<span>{t.share}</span></button></div>
   </footer>
  </>}
 </Sheet>;
}
