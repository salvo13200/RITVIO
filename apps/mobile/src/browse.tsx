import {useState} from 'react';
import {ArrowRight, ChevronLeft, Play, Shuffle} from 'lucide-react';
import type {MobileCatalog, NativeTrack} from '../../../packages/domain/mobile';
import {useCatalog} from './catalog-pages';
import {Artwork, Empty, Skeleton, TrackRow} from './ui';
import {msg} from './messages';

export type BrowseCategory = {id:string; params:string; name:string};
type Playlist = {id:string; name:string; artwork:string|null};
type BrowseCatalog = MobileCatalog & {genres?:BrowseCategory[]; moods?:BrowseCategory[]; playlists?:Playlist[]};
const names:Record<string,string>={Focus:'Concentrazione',Relax:'Relax',Chill:'Relax',Workout:'Allenamento',Party:'Festa',Commute:'In viaggio',Travel:'In viaggio',Energy:'Energia',Energize:'Energia',Electronic:'Elettronica',Sleep:'Sonno',Romance:'Romantico'};
export const categoryName=(name:string)=>msg(names[name]??name);

export function BrowseSections({open, compact=false}:{open:(category:BrowseCategory)=>void; compact?:boolean}) {
    const result=useCatalog({operation:'browse-index'}), data=result.data as BrowseCatalog|null;
    return <section className="browse-sections" aria-label={msg('Generi e mood')}>
      {result.loading ? <Skeleton/> : result.error ? <div className="welcome-inline"><p>{msg('Generi e mood non disponibili al momento.')}</p><button className="text-action" onClick={result.retry}>{msg('Riprova')}</button></div> : <>
        {(['genres','moods'] as const).map(group=>{const items=data?.[group]??[];return items.length>0&&<section key={group}><div className="section-heading"><h2>{group==='genres'?msg('Generi'):msg('Mood e attività')}</h2></div><div className="browse-categories">{(compact?items.slice(0,group==='genres'?8:6):items).map((item,index)=><button key={item.id} className={`browse-category category-tone-${index%4}`} onClick={()=>open(item)}><span>{categoryName(item.name)}</span><ArrowRight size={20} aria-hidden="true"/></button>)}</div></section>})}
        {!data?.genres?.length&&!data?.moods?.length&&<p className="source-date">{msg('Nessuna categoria disponibile. Puoi continuare dalla ricerca.')}</p>}
      </>}
    </section>;
}

export function BrowsePage({category, close, play, more, current}:{category:BrowseCategory;close:()=>void;play:(items:NativeTrack[],index:number)=>void;more:(track:NativeTrack)=>void;current?:NativeTrack}) {
    const [selected,setSelected]=useState<Playlist|null>(null);
    const result=useCatalog(selected?{operation:'browse-tracks',id:selected.id}:{operation:'browse-playlists',params:category.params}), data=result.data as BrowseCatalog|null;
    const tracks=data?.tracks??[];
    return <section className="browse-page"><button className="back-control" onClick={()=>selected?setSelected(null):close()}><ChevronLeft size={23}/>{msg('Indietro')}</button>
      <div className="browse-heading">{selected&&<Artwork src={selected.artwork} large/>}<h1>{selected?.name??categoryName(category.name)}</h1>{selected&&<p className="source-date">{categoryName(category.name)}</p>}</div>
      {result.loading?<Skeleton/>:result.error?<Empty title={msg('Il catalogo non risponde. Controlla la connessione e riprova.')} action={<button className="tonal" onClick={result.retry}>{msg('Riprova')}</button>}/>:selected?<>
        <div className="detail-actions"><button className="primary" disabled={!tracks.length} onClick={()=>play(tracks,0)}><Play size={21}/>{msg('Ascolta')}</button><button className="tonal" disabled={!tracks.length} onClick={()=>{const items=[...tracks];for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}play(items,0);}}><Shuffle size={20}/>{msg('Riproduzione casuale')}</button></div>
        {data?.partial&&<p className="source-date">{msg('Alcuni brani non sono disponibili nel catalogo.')}</p>}
        <div className="track-list">{tracks.map((track,index)=><TrackRow key={`${track.videoId}:${index}`} track={track} active={track.videoId===current?.videoId} onPlay={()=>play(tracks,index)} onMore={()=>more(track)}/>)}</div>
        {!tracks.length&&<Empty title={msg('Nessun brano disponibile')}/>}
      </>:<div className="collection-grid">{(data?.playlists??[]).map(item=><button key={item.id} className="cover-card" onClick={()=>setSelected(item)}><Artwork src={item.artwork} large/><strong>{item.name}</strong></button>)}{!data?.playlists?.length&&<Empty title={msg('Nessuna raccolta disponibile dal catalogo al momento.')}/>}</div>}
    </section>;
}
