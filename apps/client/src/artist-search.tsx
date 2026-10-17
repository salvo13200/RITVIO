import type {MusicResource} from '../../../packages/domain/index';
import {UserRound} from 'lucide-react';
import {CatalogResourceLink} from './catalog-navigation';
import {t} from './i18n';
export function ArtistSearchMatch({artist}:{artist?:MusicResource}){
  return artist?<div className="artist-search-match"><UserRound size={20} aria-hidden="true"/><CatalogResourceLink kind="artist" resource={artist}/><p>{t('artistSearch.priorityHint')}</p></div>:null;
}
export function ArtistSearchScope({artist,onClear}:{artist:MusicResource;onClear:()=>void}){
  return <section className="artist-search-scope" aria-label={t('artistSearch.scopeLabel')}><div><strong>{t('artistSearch.only',{name:artist.name})}</strong><p>{t('artistSearch.scopeHint')}</p></div><button type="button" className="text-button" onClick={onClear}>{t('artistSearch.clear')}</button></section>;
}
