export interface FoundationStatus {
 platform:'ios'; phase:'IOS-1'|'IOS-2'|'IOS-3'|'IOS-4'|'IOS-5'; version:string; build:string; bundleId:string; systemVersion:string;
 environment:'simulator'|'device'; minimumOS:string; bundledAssets:boolean;
 capabilities:{resolver:boolean;playback:boolean;library:boolean;lyrics:boolean;sharing:boolean;sleepTimer?:boolean;discovery?:boolean};
 textScale?:number;
 safeArea?:{top:number;right:number;bottom:number;left:number};
}
export function parseFoundationStatus(value:unknown):FoundationStatus {
 if(!value||typeof value!=='object')throw Error('Invalid iOS bridge response');
 const source=value as Record<string,unknown>;
 if(source.platform!=='ios'||!['IOS-1','IOS-2','IOS-3','IOS-4','IOS-5'].includes(String(source.phase))||!['simulator','device'].includes(String(source.environment))||typeof source.bundledAssets!=='boolean')throw Error('Unexpected iOS bridge');
 for(const key of ['version','build','bundleId','systemVersion','minimumOS'])if(typeof source[key]!=='string'||!(source[key] as string).length||(source[key] as string).length>200)throw Error('Invalid iOS build metadata');
 if(source.textScale!==undefined&&(typeof source.textScale!=='number'||!Number.isFinite(source.textScale)||source.textScale<0.5||source.textScale>4))throw Error('Invalid native text scale');
 if(source.safeArea!==undefined){const insets=source.safeArea as Record<string,unknown>|null;if(!insets||typeof insets!=='object'||['top','right','bottom','left'].some(key=>typeof insets[key]!=='number'||!Number.isFinite(insets[key])||(insets[key] as number)<0||(insets[key] as number)>240))throw Error('Invalid native safe area');}
 const capabilities=source.capabilities as Record<string,unknown>|null;
 if(!capabilities||typeof capabilities!=='object')throw Error('Missing iOS capabilities');
 if(typeof capabilities.resolver!=='boolean'||source.phase==='IOS-1'&&capabilities.resolver)throw Error('Invalid embedded resolver capability');
 if(typeof capabilities.playback!=='boolean'||!['IOS-3','IOS-4','IOS-5'].includes(String(source.phase))&&capabilities.playback)throw Error('Invalid native player capability');
 if(typeof capabilities.library!=='boolean'||capabilities.library&&source.phase!=='IOS-5')throw Error('Invalid native library capability');
 if(typeof capabilities.lyrics!=='boolean'||capabilities.lyrics&&source.phase!=='IOS-5'||typeof capabilities.sharing!=='boolean'||capabilities.sharing&&source.phase!=='IOS-5')throw Error('Invalid lyrics or sharing capability');
 if(capabilities.sleepTimer!==undefined&&(typeof capabilities.sleepTimer!=='boolean'||capabilities.sleepTimer&&source.phase!=='IOS-5'))throw Error('Invalid sleep timer capability');
 if(capabilities.discovery!==undefined&&(typeof capabilities.discovery!=='boolean'||capabilities.discovery&&source.phase!=='IOS-5'))throw Error('Invalid discovery capability');
 return source as unknown as FoundationStatus;
}
export function verifyFoundationCheck(value:unknown,nonce:string):void {
 if(!value||typeof value!=='object'||(value as Record<string,unknown>).nonce!==nonce||(value as Record<string,unknown>).platform!=='ios')throw Error('Native bridge round trip failed');
}
