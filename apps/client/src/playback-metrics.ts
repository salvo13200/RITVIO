import {usePlayer} from './store';
type Sample={mode:'new'|'resume'|'refresh';prepared:boolean;restoreMs?:number;descriptorMs?:number;firstDataMs?:number;playingMs?:number;outcome:'pending'|'playing'|'failed'|'cancelled'};
let requested=0,key='',lastPlaying=false;
const samples:Sample[]=[];
export function observePlaybackRequests(){
  Object.defineProperty(window,'ritvioPlaybackMetrics',{get:playbackMetrics,configurable:true});
  const observe=()=>{const s=usePlayer.getState(),nextKey=`${s.queue[s.index]?.queueId}:${s.activation}`;if(s.playing&&(!lastPlaying||nextKey!==key)){requested=performance.now();}lastPlaying=s.playing;key=nextKey;};
  observe();const unsubscribe=usePlayer.subscribe(observe);return()=>{unsubscribe();delete (window as Window&{ritvioPlaybackMetrics?:Sample[]}).ritvioPlaybackMetrics;};
}
export function beginPlayback(mode:Sample['mode']){
  const started=mode==='refresh'?performance.now():requested||performance.now();
  const sample:Sample={mode,prepared:false,outcome:'pending'};samples.push(sample);if(samples.length>40)samples.shift();
  return {stages:(value:{prepared:boolean;restoreMs:number;descriptorMs:number})=>{sample.prepared=value.prepared;sample.restoreMs=value.restoreMs;sample.descriptorMs=value.descriptorMs;},firstData:()=>{sample.firstDataMs??=performance.now()-started;},playing:()=>{sample.playingMs??=performance.now()-started;sample.outcome='playing';},fail:()=>{sample.outcome='failed';},cancel:()=>{if(sample.outcome==='pending')sample.outcome='cancelled';}};
}
export function playbackMetrics(){return samples.map(sample=>({...sample}));}
