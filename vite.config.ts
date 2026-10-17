import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
  root: 'apps/client', plugins: [react(), tailwind()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: path.resolve('dist/client'), emptyOutDir: true },
});
