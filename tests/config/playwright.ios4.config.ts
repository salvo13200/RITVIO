import path from 'node:path';
import {defineConfig} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../..');
export default defineConfig({testDir:path.join(root,'tests'),testMatch:'ios4-ui.spec.ts',outputDir:path.join(root,'test-results/ios4'),workers:1,timeout:45000,use:{browserName:'chromium',...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true,baseURL:'http://127.0.0.1:5174',viewport:{width:393,height:852},isMobile:true,hasTouch:true},webServer:{cwd:root,command:process.platform==='win32'?'powershell -NoProfile -File scripts/pnpm.ps1 --dir apps/mobile exec vite --host 127.0.0.1 --port 5174':'pnpm --dir apps/mobile exec vite --host 127.0.0.1 --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:false,timeout:60000}});
