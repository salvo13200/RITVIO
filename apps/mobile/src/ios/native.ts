import {registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {MobilePlayback,MobileCommand,NativeTrack} from '../../../../packages/domain/mobile';
interface FoundationPlugin {
 foundationStatus():Promise<unknown>;
 foundationCheck(options:{nonce:string}):Promise<unknown>;
 snapshot():Promise<MobilePlayback>;
 search(options:{query:string;requestId:string}):Promise<{items:NativeTrack[];cached:boolean}>;
 cancelResolver(options:{requestId:string}):Promise<{cancelled:boolean}>;
 playTracks(options:{items:NativeTrack[];index:number}):Promise<MobilePlayback>;
 enqueue(options:{track:NativeTrack;next?:boolean}):Promise<MobilePlayback>;
 command(options:MobileCommand):Promise<MobilePlayback>;
 addListener(event:'playback',listener:(state:MobilePlayback)=>void):Promise<PluginListenerHandle>;
}
export const foundationBridge=registerPlugin<FoundationPlugin>('RitvioPlayback');
