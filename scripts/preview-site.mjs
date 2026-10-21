import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';

const root=path.resolve(import.meta.dirname,'..'),directory=path.join(root,'dist/site');
const port=Number(process.argv.find(argument=>argument.startsWith('--port='))?.slice(7)??5180);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local preview port');
if(process.argv.includes('--build')){
  const {build}=await import('vite');
  await build({configFile:path.join(root,'apps/site/vite.config.ts')});
}
await stat(path.join(directory,'index.html'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  try{
    let pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    if(pathname==='/RITVIO'){response.writeHead(308,{Location:'/RITVIO/'}).end();return;}
    if(pathname.startsWith('/RITVIO/'))pathname=pathname.slice('/RITVIO'.length);
    if(pathname.endsWith('/'))pathname+='index.html';
    const target=path.resolve(directory,'.'+pathname);
    if(!target.startsWith(directory+path.sep))throw Error('Invalid path');
    const bytes=await readFile(target);
    response.writeHead(200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    response.end(request.method==='HEAD'?undefined:bytes);
  }catch{response.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`RITVIO download preview: http://127.0.0.1:${port}/ (project-path check: /RITVIO/)`));
