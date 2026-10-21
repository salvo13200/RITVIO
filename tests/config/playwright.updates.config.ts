import path from 'node:path';
import {defineConfig} from '@playwright/test';
const root=path.resolve(import.meta.dirname,'../..');
export default defineConfig({
  testDir:path.join(root,'tests'),outputDir:path.join(root,'test-results/updates'),testMatch:'updates-ui.spec.ts',
  workers:1,timeout:60000,reporter:'list',use:{baseURL:'http://127.0.0.1:5174',channel:'msedge',headless:true,viewport:{width:1440,height:940},screenshot:'only-on-failure'},
  webServer:[
    {cwd:root,command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:false},
    {cwd:root,command:'node node_modules/tsx/dist/cli.mjs tests/ui-server.ts',url:'http://127.0.0.1:5199/v1/health',reuseExistingServer:false},
    {cwd:root,command:'node ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174',url:'http://127.0.0.1:5174',reuseExistingServer:false},
  ].map((server,index)=>index===2?{...server,cwd:path.join(root,'apps/mobile')}:server),
});
