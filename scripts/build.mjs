import { build as viteBuild } from 'vite';
import { build as esBuild } from 'esbuild';
export async function buildApi() {
  await esBuild({entryPoints:['apps/api/server.ts'],outfile:'dist/api.mjs',bundle:true,platform:'node',target:'node24',format:'esm',packages:'external',sourcemap:true});
}
if(process.argv[1]?.endsWith('build.mjs')){await import('./sync-localization.mjs');await import('./check-locales.mjs');if(process.exitCode)throw Error('Localization validation failed');await buildApi();await viteBuild();}
