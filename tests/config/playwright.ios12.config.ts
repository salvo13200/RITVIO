import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({testDir:'..',testMatch:'ios12-ui.spec.ts',workers:1,retries:0,timeout:35000,outputDir:'../../.local/ios12/browser',use:{baseURL:'http://127.0.0.1:5186',browserName:'chromium',viewport:{width:375,height:667},hasTouch:true,trace:'retain-on-failure'},webServer:{command:'pnpm exec vite preview --config apps/ios12-test/vite.config.ts --host 127.0.0.1 --port 5186 --strictPort',cwd:path.resolve(import.meta.dirname,'../..'),url:'http://127.0.0.1:5186',reuseExistingServer:false,timeout:30000}});
