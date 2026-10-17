import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {tracks} from './fixtures';
test('a stalled listening cover falls back after the loading deadline',async({page,request})=>{
  const base='http://127.0.0.1:5199';await request.post(base+'/test-reset-library');await request.get(base+'/v1/search?q=Musica%20test',{headers:{authorization:'Bearer test-token-only'}});await page.clock.install();
  await page.addInitScript(({base,tracks})=>{window.__RITVIO_TEST_CONFIG__={baseUrl:base,token:'test-token-only'};localStorage.setItem('ritvio-player-v1',JSON.stringify({state:{queue:tracks.map((track,i)=>({...track,queueId:'timeout-'+i})),index:0,playing:false},version:1}));},{base,tracks});
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('https://*.ytimg.com/**',async route=>{if(route.request().url().includes('testmusic02'))await gate;await route.fulfill({contentType:'image/png',body:await readFile('docs/design/ui-1/preview/assets/city.png')});});
  await page.goto('/');await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','false');await page.locator('.transport').getByRole('button',{name:'Brano successivo',exact:true}).click();await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('aria-busy','true');
  await page.clock.fastForward(12050);await expect(page.locator('.now-artwork .animated-cover')).toHaveAttribute('data-artwork','fallback');await expect(page.locator('.now-artwork .cover-retained')).toHaveCount(0);release();
});
