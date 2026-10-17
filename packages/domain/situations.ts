import type {Track} from './index';
export const situationKeys=['focus','travel','energy','relax','workout','party'] as const;
export type SituationKey=typeof situationKeys[number];
export type Situation={id:SituationKey;params:string;sourceTitle:string};
export type SituationPlaylist={id:string;title:string;author:string;artwork:string|null};
export type SituationTracks={playlist:SituationPlaylist;tracks:Track[];partial:boolean};
export type SituationResult<T>={data:T|null;stale:boolean;refreshing:boolean;error:string|null;updatedAt:string|null;retryAt:string|null};
