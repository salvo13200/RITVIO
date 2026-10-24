import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {mobilePlatform} from '../../scripts/mobile-platform.mjs';
const target=mobilePlatform();
export default defineConfig({root:import.meta.dirname,plugins:[react()],build:{outDir:target.webDir,emptyOutDir:true,...(target.platform==='ios'?{target:'safari15',cssTarget:'safari15'}:{})},server:{host:'127.0.0.1',port:5174,strictPort:true,watch:{ignored:['**/android/**','**/ios/**','**/web-dist/**','**/ios-web-dist/**']},fs:{allow:[path.resolve(import.meta.dirname,'../..')]}}});
