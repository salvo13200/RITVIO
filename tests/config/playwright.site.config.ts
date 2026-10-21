import path from 'node:path';
import {defineConfig} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../..');
export default defineConfig({testDir:path.join(root,'tests'),outputDir:path.join(root,'test-results/site'),testMatch:'site-ui.spec.ts',workers:1,timeout:45000,reporter:'list',use:{baseURL:'http://127.0.0.1:5180',channel:'msedge',headless:true,viewport:{width:1440,height:1000},screenshot:'only-on-failure'},webServer:{cwd:root,command:'node scripts/preview-site.mjs --build',url:'http://127.0.0.1:5180',reuseExistingServer:false,timeout:60000}});
