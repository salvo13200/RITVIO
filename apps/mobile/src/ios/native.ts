import {registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {MobilePlayback,MobileCommand,NativeTrack} from '../../../../packages/domain/mobile';
import type {LibraryAction} from './library-model';
interface FoundationPlugin {
 foundationStatus():Promise<unknown>;
 foundationCheck(options:{nonce:string}):Promise<unknown>;
 snapshot():Promise<MobilePlayback>;
 search(options:{query:string;requestId:string}):Promise<{items:NativeTrack[];cached:boolean}>;
 catalog(options:({operation:'catalog-search';kind:'artist'|'album';query:string}|{operation:'detail';kind:'artist'|'album';id:string})&{requestId:string}):Promise<unknown>;
 cancelResolver(options:{requestId:string}):Promise<{cancelled:boolean}>;
 playTracks(options:{items:NativeTrack[];index:number}):Promise<MobilePlayback>;
 enqueue(options:{track:NativeTrack;next?:boolean}):Promise<MobilePlayback>;
 command(options:MobileCommand):Promise<MobilePlayback>;
 library():Promise<unknown>;
 libraryCommand(options:LibraryAction):Promise<unknown>;
 saveQueue(options:{name:string;revision:number}):Promise<unknown>;
 chooseArtwork(options:{kind:'playlist';id:string;revision:number}):Promise<{cancelled:boolean;library?:unknown}>;
 removeArtwork(options:{kind:'playlist';id:string;revision:number}):Promise<unknown>;
 navigationState(options:{canGoBack:boolean}):Promise<void>;
 addListener(event:'playback',listener:(state:MobilePlayback)=>void):Promise<PluginListenerHandle>;
 addListener(event:'library',listener:(state:unknown)=>void):Promise<PluginListenerHandle>;
}
export const foundationBridge=registerPlugin<FoundationPlugin>('RitvioPlayback');
