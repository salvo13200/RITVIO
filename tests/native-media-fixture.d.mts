interface NativeByteFixture {
  origin:string;url:string;
  urlFor(key:string):string;
  response(range?:string,intercepted?:boolean):{status:number;headers:Record<string,string>;body:Buffer};
  report():{mediaBytes:number;wavBytes?:number;httpResponses:number;interceptedResponses:number;bodyBytes:number;maxBodyBytes:number;invalidRequests:number;distinctItems:number;maxAllowedBodyBytes:number};
  close():Promise<void>;
}
export function createNativeMediaFixture(seconds:number):Promise<NativeByteFixture>;
export function createNativeByteFixture(data:Buffer,options:{contentType:'audio/wav'|'audio/webm;codecs=opus';extension:'wav'|'webm'}):Promise<NativeByteFixture>;
