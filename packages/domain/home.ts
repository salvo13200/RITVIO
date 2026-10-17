import type {Track} from './index';
import type {CatalogResource} from './catalog';
export const homeCollectionIds=['italy','releases','global','trending'] as const;
/** Public Home selection; legacy IDs remain valid for stored references. */
export const publicHomeCollectionIds=['global','releases'] as const;
export type HomeCollectionId=typeof homeCollectionIds[number];
export type HomeCollection={id:HomeCollectionId;playlistId:string|null;sourceTitle:string;country:'IT'|'ZZ'|null;artwork:string|null;albums:CatalogResource[]};
export type HomeIndex={collections:HomeCollection[];missing:HomeCollectionId[]};
export type HomeDetail={collection:HomeCollection;tracks:Track[];albums:CatalogResource[];partial:boolean};
export type HomeResult<T>={data:T|null;updatedAt:string|null;edition:string;refreshing:boolean;stale:boolean;error:string|null;retryAt:string|null};
/** Friday's calendar date in Rome, independent of the PC timezone and DST. */
export function homeEdition(now:number):string{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value),day=new Date(Date.UTC(get('year'),get('month')-1,get('day')));
  day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+2)%7);return day.toISOString().slice(0,10);
}
