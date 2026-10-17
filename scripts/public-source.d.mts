export function isPublicSource(file:string):boolean;
export function publicFiles(root:string):Promise<string[]>;
export function scanPublicSource(root:string,files:string[]):Promise<{file:string;reason:string}[]>;
