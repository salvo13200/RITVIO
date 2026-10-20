export function createNativeMediaFixture(seconds:number):Promise<{
  origin:string;url:string;
  response(range?:string,intercepted?:boolean):{status:number;headers:Record<string,string>;body:Buffer};
  report():{wavBytes:number;httpResponses:number;interceptedResponses:number;bodyBytes:number;maxBodyBytes:number;invalidRequests:number;maxAllowedBodyBytes:number};
  close():Promise<void>;
}>;
