import path from 'node:path';
import {defineConfig} from '@playwright/test';
import base from './playwright.updates.config';
const root=path.resolve(import.meta.dirname,'../..');
export default defineConfig({...base,outputDir:path.join(root,'test-results/sharing-discovery'),testMatch:undefined,
 projects:[
  {name:'site',testMatch:['sharing-site.spec.ts','site-ui.spec.ts'],use:{baseURL:'http://127.0.0.1:5180'}},
  {name:'desktop',testMatch:['sharing-discovery-desktop.spec.ts','story-sharing.spec.ts'],use:{baseURL:'http://127.0.0.1:5173'}},
  {name:'android-browser',testMatch:['sharing-discovery-mobile.spec.ts','android6-ui.spec.ts'],use:{baseURL:'http://127.0.0.1:5174',viewport:{width:393,height:852},isMobile:true,hasTouch:true}},
 ],webServer:[...(base.webServer as any[]),{cwd:root,command:'node scripts/preview-site.mjs --build',url:'http://127.0.0.1:5180',reuseExistingServer:false,timeout:60000}],
});
