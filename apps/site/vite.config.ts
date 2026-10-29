import {defineConfig} from 'vite';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {publishedDownloads, formatDownloadSize} from '../../packages/releases/catalog';

const root=path.resolve(import.meta.dirname,'../..');
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const tokens:Record<string,string>={verifiedAt:publishedDownloads.verifiedAt};
for(const platform of ['android','windows','ios'] as const){
  const release=publishedDownloads[platform];
  if(!release)continue;
  tokens[platform]='available';
  Object.assign(tokens,Object.fromEntries(Object.entries(release).filter(([,value])=>typeof value==='string').map(([key,value])=>[`${platform}.${key}`,String(value)])));
  tokens[`${platform}.channel`]=platform==='ios'?'iOS beta':release.preview?'Public preview':'Stable release';
  tokens[`${platform}.size`]=formatDownloadSize(release.bytes);
}
export default defineConfig({
  root:import.meta.dirname,base:'./',
  plugins:[{name:'ritvio-download-snapshot',enforce:'post',transformIndexHtml(html,context){
    let result=html.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,(_,key:string,content:string)=>tokens[key]?content:'').replace(/\{\{([\w.]+)\}\}/g,(_,key:string)=>{if(!(key in tokens))throw Error(`Unknown download token: ${key}`);return escape(tokens[key]);});
    if(context.server)result=result.replace(/href="\.\.\/\.\.\/docs\/media\/([a-z-]+\.webp)"/g,(_,filename:string)=>`href="/@fs/${path.join(root,'docs/media',filename).replaceAll('\\','/')}"`);
    return result;
  },generateBundle:{order:'post',handler(_options,bundle){
    this.emitFile({type:'asset',fileName:'licenses/OFL-AncizarSans.txt',source:readFileSync(path.join(root,'apps/client/public/fonts/OFL-AncizarSans.txt'),'utf8')});
    this.emitFile({type:'asset',fileName:'licenses/GPL-3.0.txt',source:readFileSync(path.join(root,'LICENSE'),'utf8')});
    const html=bundle['index.html'];if(!html||html.type!=='asset')throw Error('Missing site HTML');
    html.source=String(html.source).replace(/href="\.\.\/\.\.\/docs\/media\/([a-z-]+\.webp)"/g,(_,filename:string)=>{
      const asset=Object.values(bundle).find(item=>item.type==='asset'&&(item.names.includes(filename)||item.originalFileNames.some(name=>path.basename(name)===filename)));
      if(!asset)throw Error(`Missing full-size screenshot: ${filename}`);
      return `href="./${asset.fileName}"`;
    });
  }}}],
  server:{host:'127.0.0.1',port:5180,strictPort:true,fs:{allow:[root]}},
  build:{outDir:path.join(root,'dist/site'),emptyOutDir:true,target:'es2022',assetsInlineLimit:0},
});
