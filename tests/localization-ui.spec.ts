import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {fixture} from './helpers/mobile-fixture';
async function probe(page:Page,query=''){
 const entry='/@fs/'+path.resolve('tests/fixtures/localization-probe.tsx').replaceAll('\\','/');
 await page.route('**/__localization-probe*',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="it"><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="${entry}"></script></body></html>`}));
 await page.goto('/__localization-probe'+query);await expect(page.getByRole('heading')).toBeVisible({timeout:45000});
}
test('five local test catalogs update React without remounting the audio owner and persist after reload',async({page})=>{
 await probe(page);await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>page.locator('audio').evaluate((el:HTMLAudioElement)=>!el.paused)).toBe(true);
 await page.evaluate(()=>{const w=window as any;w.__audioOwner=document.querySelector('audio');w.__initialMounts=w.__localizationProbe.getMounts();});
 for(const [language,title]of [['de','Sprache'],['fr','Langue'],['es','Idioma'],['en','Language'],['it','Lingua']]){
  await page.getByRole('combobox',{name:'Language'}).selectOption(language);await expect(page.getByRole('heading')).toHaveText(title);await expect(page.locator('html')).toHaveAttribute('lang',language);
  expect(await page.evaluate(()=>document.querySelector('audio')===(window as any).__audioOwner)).toBe(true);expect(await page.locator('audio').evaluate((el:HTMLAudioElement)=>el.paused)).toBe(false);
 }
 expect(await page.evaluate(()=>(window as any).__localizationProbe.getMounts()===(window as any).__initialMounts)).toBe(true);await expect(page.getByTestId('clicks')).toHaveText('1');
 await page.getByRole('combobox',{name:'Language'}).selectOption('de');await page.reload();await expect(page.getByRole('heading')).toHaveText('Sprache');await expect(page.getByTestId('preference')).toHaveText('de');
});
test('browser storage synchronizes independent windows and clearing it returns to system preference',async({page,context})=>{
 await probe(page);const second=await context.newPage();await probe(second);await page.getByRole('combobox',{name:'Language'}).selectOption('fr');await expect(second.getByRole('heading')).toHaveText('Langue');
 await page.evaluate(()=>localStorage.clear());await expect(second.getByTestId('preference')).toHaveText('system');await second.close();
});
test('an unresponsive host cannot leave startup blank',async({page})=>{
 await probe(page,'?unresponsive');await expect(page.getByRole('heading')).toHaveText('Lingua');await expect(page.getByTestId('preference')).toHaveText('it');
});
test('native language event keeps the real mobile player, artwork, route and queue in place',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:/Apri il player:/}).click();const player=page.getByRole('dialog',{name:'In ascolto',exact:true});await expect(player).toBeVisible();
 const before=await page.evaluate(()=>{const w=window as any;w.__playerOwner=document.querySelector('.full-player');w.__imageOwner=document.querySelector('.player-cover img');return{url:location.href,state:JSON.stringify(w.__mobileState())};});
 await page.evaluate(()=>{(window as any).__mobileLanguage('it');});await expect(page.locator('html')).toHaveAttribute('lang','it');await expect(player).toBeVisible();
 const after=await page.evaluate(()=>{const w=window as any;return{url:location.href,state:JSON.stringify(w.__mobileState()),samePlayer:document.querySelector('.full-player')===w.__playerOwner,sameImage:document.querySelector('.player-cover img')===w.__imageOwner,audioCommands:w.__mobileOperations.filter((item:any)=>item.method==='command'||item.method==='playTracks').length};});
 expect(after).toEqual({...before,samePlayer:true,sameImage:true,audioCommands:0});await player.getByRole('button',{name:'Testi',exact:true}).click();await expect(page.getByRole('dialog',{name:'Testi',exact:true})).toBeVisible();
});
