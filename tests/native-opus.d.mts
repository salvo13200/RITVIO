import type {Page} from '@playwright/test';
export function originalStereoTone(seconds?:number):Buffer;
export function recordNativeOpus(page:Page,seconds?:number):Promise<{bytes:Buffer;metadata:{mimeType:'audio/webm;codecs=opus';sampleRate:number;channels:number;duration:number;requestedBitsPerSecond:number}}>;
