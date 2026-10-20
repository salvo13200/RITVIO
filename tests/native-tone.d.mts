export const maxToneChunkBytes:number;
export function originalTone(seconds?:number):Buffer;
export function toneRangeResponse(wav:Buffer,range?:string,limit?:number):{status:number;headers:Record<string,string>;body:Buffer};
