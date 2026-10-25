export interface FoundationStatus {
 platform:'ios'; phase:'IOS-1'|'IOS-2'|'IOS-3'; version:string; build:string; bundleId:string; systemVersion:string;
 environment:'simulator'|'device'; minimumOS:string; bundledAssets:boolean;
 capabilities:{resolver:boolean;playback:boolean;library:false;lyrics:false;sharing:false};
}
export function parseFoundationStatus(value:unknown):FoundationStatus {
 if(!value||typeof value!=='object')throw Error('Invalid iOS bridge response');
 const source=value as Record<string,unknown>;
 if(source.platform!=='ios'||!['IOS-1','IOS-2','IOS-3'].includes(String(source.phase))||!['simulator','device'].includes(String(source.environment))||typeof source.bundledAssets!=='boolean')throw Error('Unexpected iOS bridge');
 for(const key of ['version','build','bundleId','systemVersion','minimumOS'])if(typeof source[key]!=='string'||!(source[key] as string).length||(source[key] as string).length>200)throw Error('Invalid iOS build metadata');
 const capabilities=source.capabilities as Record<string,unknown>|null;
 if(!capabilities||typeof capabilities!=='object')throw Error('Missing iOS capabilities');
 if(typeof capabilities.resolver!=='boolean'||source.phase==='IOS-1'&&capabilities.resolver)throw Error('Invalid embedded resolver capability');
 if(typeof capabilities.playback!=='boolean'||source.phase!=='IOS-3'&&capabilities.playback)throw Error('Invalid native player capability');
 for(const key of ['library','lyrics','sharing'])if(capabilities[key]!==false)throw Error('This technical build cannot advertise library capabilities');
 return source as unknown as FoundationStatus;
}
export function verifyFoundationCheck(value:unknown,nonce:string):void {
 if(!value||typeof value!=='object'||(value as Record<string,unknown>).nonce!==nonce||(value as Record<string,unknown>).platform!=='ios')throw Error('Native bridge round trip failed');
}
