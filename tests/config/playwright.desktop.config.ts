import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:path.join(root,'tests'),outputDir:path.join(root,'test-results/playwright'),testMatch:'ui.spec.ts',workers:1,timeout:30000,
  reporter:'list',use:{baseURL:'http://127.0.0.1:5173',channel:'msedge',headless:true,viewport:{width:1440,height:940},screenshot:'only-on-failure'},
  webServer:[
    {cwd:root,command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:false},
    {cwd:root,command:'node node_modules/tsx/dist/cli.mjs tests/ui-server.ts',url:'http://127.0.0.1:5199/v1/health',reuseExistingServer:false},
  ],
});
