import {test,expect,type Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
const output=process.env.RITVIO_ANDROID10==='1'?'test-results/visual/android-10/regression-android0-ui.spec':'test-results/visual/android-0';
async function fixture(page:Page){
  const picture=await readFile('apps/client/public/artwork/electronic.webp');
  await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/webp',body:picture}));
  await page.route('**/src/native.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const isAndroid=true;export const isIOS=false;export const isNativeMobile=true;export const nativePlayback=window.__mobileNative;'}));
  await page.addInitScript(()=>{
    const first={videoId:'abcdefghijk',title:'Un brano originale dal titolo molto lungo per verificare la leggibilità',artist:'Artista dimostrativo e un secondo artista',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',duration:240};
    const second={...first,videoId:'12345678901',title:'Secondo brano originale',artist:'Artista dimostrativo'};
    let state={items:[first,second],index:0,position:43,duration:240,buffered:70,playing:false,loading:false,repeat:'off',shuffle:false,volume:.7,error:null,status:'ready'};
    let listener:(s:typeof state)=>void=()=>{};
    const commands:unknown[]=[];
    Object.assign(window,{__mobileCommands:commands,__mobileNative:{snapshot:async()=>state,addListener:async(_event:string,fn:typeof listener)=>{listener=fn;return{remove:()=>{}};},search:async()=>({items:[first,second],cached:false}),playTracks:async(value:{items:typeof state.items;index:number})=>{state={...state,...value,playing:true};listener(state);return state;},enqueue:async({track}:{track:typeof first})=>{state={...state,items:[...state.items,track]};listener(state);return state;},command:async(command:{type:string;value:unknown})=>{commands.push(command);if(command.type==='seek')state={...state,position:Number(command.value)};if(command.type==='volume')state={...state,volume:Number(command.value)};if(command.type==='play')state={...state,playing:true};if(command.type==='pause')state={...state,playing:false};if(command.type==='clear')state={...state,items:[]};listener(state);return state;}}});
  });
  page.on('pageerror',error=>process.stderr.write(`Mobile page error: ${error.message}\n`));
  await page.goto('/',{waitUntil:'commit'});await expect(page.getByRole('heading',{name:'Trova il tuo prossimo ascolto.'})).toBeVisible({timeout:45000});await expect.poll(()=>page.evaluate(()=>document.fonts.check('16px "Ancizar Sans"')),{timeout:45000}).toBe(true);
}
test('search, queue and expanded controls use native commands without browser audio',async({page})=>{
  await fixture(page);await page.getByRole('searchbox').fill('Artista');await expect(page.getByRole('heading',{name:'Risultati'})).toBeVisible();
  await page.getByRole('button',{name:'Aggiungi alla coda: Secondo brano originale'}).click();
  await page.getByRole('button',{name:'Coda',exact:true}).click();await expect(page.getByText('3 brani · salvata sul telefono')).toBeVisible();
  await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.getByRole('dialog')).toBeVisible();
  const range=page.getByRole('slider',{name:'Posizione del brano'});await range.fill('80');await range.dispatchEvent('pointerup');
  await expect.poll(()=>page.evaluate(()=>((window as any).__mobileCommands as any[]).filter(item=>item.type==='seek').length)).toBe(1);
  await expect(range).toHaveValue('80');await expect(page.locator('audio')).toHaveCount(0);
  await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('compact phone and expanded player keep controls inside the viewport',async({page})=>{
  await fixture(page);await mkdir(output,{recursive:true});await page.getByRole('searchbox').fill('Artista');await expect(page.getByRole('button',{name:'Aggiungi alla coda: Secondo brano originale'})).toBeVisible();
  await page.screenshot({path:`${output}/web-search-393.png`,animations:'disabled'});
  await page.getByRole('button',{name:/Apri il player:/}).click();await expect(page.getByRole('dialog')).toHaveCSS('opacity','1');await page.screenshot({path:`${output}/web-player-393.png`,animations:'disabled'});
  await page.setViewportSize({width:360,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.screenshot({path:`${output}/web-player-360.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const controls=page.getByRole('dialog').getByRole('button');for(const button of await controls.all()){const box=await button.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(48);expect(box?.height).toBeGreaterThanOrEqual(48);}
});
