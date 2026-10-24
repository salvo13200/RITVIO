export interface FoundationStatus {
 platform:'ios'; phase:'IOS-1'; version:string; build:string; bundleId:string; systemVersion:string;
 environment:'simulator'|'device'; minimumOS:string; bundledAssets:boolean;
 capabilities:{resolver:false;playback:false;library:false;lyrics:false;sharing:false};
}
export function parseFoundationStatus(value:unknown):FoundationStatus {
 if(!value||typeof value!=='object')throw Error('Invalid iOS bridge response');
 const source=value as Record<string,unknown>;
 if(source.platform!=='ios'||source.phase!=='IOS-1'||!['simulator','device'].includes(String(source.environment))||typeof source.bundledAssets!=='boolean')throw Error('Unexpected iOS bridge');
 for(const key of ['version','build','bundleId','systemVersion','minimumOS'])if(typeof source[key]!=='string'||!(source[key] as string).length||(source[key] as string).length>200)throw Error('Invalid iOS build metadata');
 const capabilities=source.capabilities as Record<string,unknown>|null;
 if(!capabilities||typeof capabilities!=='object')throw Error('Missing iOS capabilities');
 for(const key of ['resolver','playback','library','lyrics','sharing'])if(capabilities[key]!==false)throw Error('IOS-1 cannot advertise listening capabilities');
 return source as unknown as FoundationStatus;
}
export function verifyFoundationCheck(value:unknown,nonce:string):void {
 if(!value||typeof value!=='object'||(value as Record<string,unknown>).nonce!==nonce||(value as Record<string,unknown>).platform!=='ios')throw Error('Native bridge round trip failed');
}
