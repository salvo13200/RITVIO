import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tracks} from './fixtures';
test('sample UI scheduling across warm page and panel transitions with 500 retained queue items',async({page,request})=>{
  await request.post('http://127.0.0.1:5199/test-reset-library');
  await page.addInitScript(songs=>{window.__RITVIO_TEST_CONFIG__={baseUrl:'http://127.0.0.1:5199',token:'test-token-only'};localStorage.setItem('ritvio-player-v1',JSON.stringify({version:1,state:{queue:Array.from({length:500},(_,i)=>({...songs[i%2],queueId:'frames-'+i})),index:0,position:0,theme:'dark',volume:.6,uiLayout:{sidebarWidth:272,panelWidth:408,sidebarCollapsed:false,motion:'curated'}}}));},tracks);
  await page.route('https://i.ytimg.com/**',async route=>route.fulfill({body:await readFile('docs/design/ui-1/preview/assets/city.png'),contentType:'image/png'}));
  await page.setViewportSize({width:1280,height:800});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');await expect(page.locator('.home2')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();
  await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);await page.locator('#now-panel-trigger').click();
  const passes=[];
  for(let i=0;i<3;i++){
    const measured=page.evaluate(()=>new Promise<{count:number;medianMs:number;p95Ms:number;maxMs:number;longTasksMs:number[]}>(resolve=>{
      const gaps:number[]=[],longTasks:number[]=[];let previous:number|undefined,finished=false;
      const observer=new PerformanceObserver(list=>{longTasks.push(...list.getEntries().map(e=>e.duration));});if(PerformanceObserver.supportedEntryTypes.includes('longtask'))observer.observe({type:'longtask'});
      const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);observer.disconnect();const sorted=[...gaps].sort((a,b)=>a-b);resolve({count:gaps.length,medianMs:sorted[Math.floor(sorted.length*.5)]??0,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,maxMs:sorted.at(-1)??0,longTasksMs:longTasks});};
      const timer=setTimeout(finish,6000);const frame=(now:number)=>{if(finished)return;if(previous!==undefined)gaps.push(now-previous);previous=now;if(gaps.length>=180)finish();else requestAnimationFrame(frame);};requestAnimationFrame(frame);
    }));
    await page.getByRole('button',{name:'Impostazioni',exact:true}).click();await expect(page.locator('.preferences-page')).toBeVisible();await page.getByRole('button',{name:'Torna alla musica',exact:true}).click();await expect(page.locator('.home2')).toBeVisible();await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);await page.locator('#now-panel-trigger').click();
    const sample=await measured;expect(sample.count).toBe(180);passes.push(sample);
  }
  await mkdir('docs/design/ritvio-0.7.0',{recursive:true});await writeFile('docs/design/ritvio-0.7.0/FRAMES-WEB.json',JSON.stringify({version:'0.7.0',conditions:'Microsoft Edge headless, Vite development renderer and original metadata/image fixtures, 1280x800, curated motion, 500 retained queue entries/61 initial rows. Three warm Preferences/Home and Queue/Now cycles; 180 successive rAF intervals each. No audio, no concurrent native benchmark. Measures browser UI scheduling, not native visible-window FPS, GPU presentation, battery use or superiority to SimpMusic.',passes},null,2));
});
