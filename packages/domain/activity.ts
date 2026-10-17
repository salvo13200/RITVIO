import type {Track} from './index';
export type ActivityReason='completed'|'skip'|'replay'|'change'|'error'|'interrupted';
export type ActivityCheckpoint={id:string;mediaId:string;epoch:number;sequence:number;startedAt:number;updatedAt:number;listenedMs:number;durationMs:number;seeks:number;closed:boolean;reason:ActivityReason|null};
export type ActivitySettings={privateMode:boolean;retentionDays:90|180|365;epoch:number};
export type ActivityEntry=ActivityCheckpoint & {track:Track;excluded:boolean;replay:boolean;tasteWeight:number};
export type ActivitySnapshot={settings:ActivitySettings;items:ActivityEntry[];summary:{sessions:number;listenedMs:number;completed:number;skips:number;replays:number;errors:number;interrupted:number;excluded:number};legacyStarts:number};
export type ActivityJournalItem={track:Track;checkpoint:ActivityCheckpoint};
/** Counts only plausible media movement with an active audio signal. Long suspend gaps are discarded. */
export class ListeningClock {
  listenedMs=0;seeks=0;
  private previous:{wall:number;media:number}|null=null;
  sample(wall:number,media:number,active:boolean,rate=1){
    const previous=this.previous;
    this.previous=active&&Number.isFinite(media)?{wall,media}:null;
    if(!previous||!this.previous)return;
    const elapsed=wall-previous.wall,delta=(media-previous.media)*1000;
    if(elapsed<=0||elapsed>5000||delta<=0||delta>elapsed*Math.max(.25,rate)+350)return;
    this.listenedMs+=Math.min(delta,elapsed*Math.max(.25,rate));
  }
  discontinuity(){this.previous=null;}
  seek(){this.seeks++;this.discontinuity();}
}
