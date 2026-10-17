import {chromium} from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const client=path.resolve('apps/client');
const finalBuild=process.argv.includes('--final');
const root=path.join(client,finalBuild?'.impeccable/review/final-app':'.impeccable/review/app');
const server=http.createServer(async(request,response)=>{
  try{
    const file=path.resolve(root,`.${new URL(request.url,'http://localhost').pathname}`);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    const content=await fs.readFile(file);
    response.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'})[path.extname(file)]??'application/octet-stream');
    response.end(content);
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  if(finalBuild){
    const evidence=[];
    const directory=path.join(client,'.impeccable/review');
    const cases=[['final-comp',1586,992,'dark','home'],['desktop',1440,901,'dark','home'],['desktop-1280',1280,801,'dark','home'],['compact',640,800,'dark','home'],['mobile',390,844,'dark','home'],['compact-queue',640,800,'dark','queue'],['mobile-queue',390,844,'dark','queue'],['library',1440,940,'dark','library'],['settings-light',1440,940,'light','settings'],['mobile-settings',390,844,'light','settings'],['now-panel',1440,940,'dark','now']];
    for(const [name,width,height,theme,surface] of (process.argv.includes('--measure')?cases.slice(0,1):cases)){
      const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{})));});
      if(theme==='light'||surface==='settings')await page.getByRole('button',{name:'Impostazioni',exact:true}).click();
      if(theme==='light')await page.getByRole('dialog').getByRole('button',{name:'Scuro',exact:true}).click();
      if(surface==='library')await page.getByRole('button',{name:'La tua libreria',exact:true}).click();
      if(surface==='queue')await page.getByRole('button',{name:'Mostra coda di riproduzione',exact:true}).click();
      if(surface==='now')await page.getByRole('button',{name:'Mostra in riproduzione',exact:true}).click();
      if(surface==='home'&&theme==='light')await page.keyboard.press('Escape');
      if(!process.argv.includes('--measure'))await page.screenshot({path:path.join(directory,`${name}.png`),fullPage:true});
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,mainOverflow:document.querySelector('.main').scrollWidth>document.querySelector('.main').clientWidth+1}));
      const artwork=await page.locator('.quick-track .cover img,.recent-card .cover img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),fit:getComputedStyle(img).objectFit,natural:[img.naturalWidth,img.naturalHeight],size:[img.getBoundingClientRect().width,img.getBoundingClientRect().height],frame:[img.parentElement.getBoundingClientRect().width,img.parentElement.getBoundingClientRect().height]})));
      evidence.push({name,width,height,theme,surface,errors,...layout,artwork});
      if(errors.length||layout.overflow||layout.mainOverflow)process.exitCode=1;
      await page.close();
    }
    await fs.writeFile(path.join(directory,process.argv.includes('--measure')?'artwork-measurements.json':'final-captures.json'),JSON.stringify(evidence,null,2));
    if(!process.argv.includes('--measure'))await fs.writeFile(path.join(directory,'artwork-measurements.json'),JSON.stringify(evidence.slice(0,1),null,2));
    console.log(JSON.stringify(evidence));
  }else{
  const page=await browser.newPage({viewport:{width:1586,height:992},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(image=>image.decode().catch(()=>{})));});
  await page.screenshot({path:path.join(client,'.impeccable/review/hero-repro.png')});
  console.log(JSON.stringify({errors,imageCount:await page.locator('img').count(),controls:await page.locator('button,input').count()}));
  if(errors.length)process.exitCode=1;
  }
}finally{await browser.close();server.close();}
