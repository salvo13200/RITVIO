import path from 'node:path';
import {defineConfig} from '@playwright/test';
import base from './playwright.updates.config';
const root=path.resolve(import.meta.dirname,'../..');
export default defineConfig({...base,testMatch:undefined,outputDir:path.join(root,'test-results/support'),
 projects:[
  {name:'desktop',testMatch:'support-desktop.spec.ts',use:{baseURL:'http://127.0.0.1:5173'}},
  {name:'android-browser',testMatch:['support-mobile.spec.ts','mobile-latency-ui.spec.ts'],use:{baseURL:'http://127.0.0.1:5174',viewport:{width:393,height:852},isMobile:true,hasTouch:true}},
  {name:'presentation',testMatch:'adoption-media.spec.ts',use:{baseURL:'http://127.0.0.1:5174',viewport:{width:393,height:852},isMobile:true,hasTouch:true}},
 ],webServer:[...(base.webServer as any[]),{cwd:root,command:'node scripts/preview-site.mjs --build --port=5190',url:'http://127.0.0.1:5190',reuseExistingServer:false,timeout:60000}],
});
