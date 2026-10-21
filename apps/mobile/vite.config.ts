import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({root:import.meta.dirname,plugins:[react()],build:{outDir:'web-dist',emptyOutDir:true},server:{host:'127.0.0.1',port:5174,strictPort:true,watch:{ignored:['**/android/**','**/web-dist/**']},fs:{allow:[path.resolve(import.meta.dirname,'../..')]}}});
