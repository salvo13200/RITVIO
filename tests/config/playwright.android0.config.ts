import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:path.join(root,'tests'),outputDir:path.join(root,'test-results/playwright'),testMatch:'android0-ui.spec.ts',workers:1,timeout:60000,use:{browserName:'chromium',channel:'msedge',baseURL:'http://127.0.0.1:5174',viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true},webServer:{cwd:root,command:'powershell -NoProfile -File scripts/pnpm.ps1 --dir apps/mobile exec vite --host 127.0.0.1 --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:60000}});
