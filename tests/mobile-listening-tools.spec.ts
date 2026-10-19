import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './helpers/mobile-fixture';

async function capture(page:Page,options:{path:string;animations:'disabled'}){await expect.poll(()=>page.evaluate(()=>Array.from(document.querySelectorAll<HTMLImageElement>('dialog:not([inert]) img')).filter(image=>{const r=image.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}).every(image=>image.complete&&image.naturalWidth>0)),{timeout:10000}).toBe(true);await page.evaluate(async()=>{await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('dialog:not([inert]) img')).map(image=>image.decode().catch(()=>{})));await Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});await page.screenshot(options);}
const verses=Array.from({length:14},(_,index)=>`Original demo verse ${index+1}`);
const composer=(page:Page)=>page.getByRole('dialog').filter({has:page.locator('.mobile-story')});
const state=(page:Page)=>page.evaluate(()=>(window as any).__mobileState());
const operations=(page:Page)=>page.evaluate(()=>(window as any).__mobileOperations as any[]);
async function openPlayer(page:Page){await page.getByRole('button',{name:/^(Apri il player:|Open player:)/}).click();}
async function share(page:Page){await openPlayer(page);await page.getByRole('button',{name:/^(Condividi|Share)$/}).click();await expect(composer(page).locator('canvas')).toHaveAttribute('width','1080');}
async function select(page:Page){await page.evaluate(lines=>{(window as any).__storyLyrics=lines.join('\n');},verses);await share(page);await composer(page).getByRole('button',{name:'Versi',exact:true}).click();await expect(composer(page).getByRole('button',{name:/^Riga 1:/})).toBeVisible();}
async function queue(page:Page,count=4){
 await fixture(page,{queueLength:4});
 if(count!==4)await page.evaluate(count=>{const w=window as any,s=w.__mobileState(),track=s.items[0];s.items=Array.from({length:count},(_,i)=>({...track,videoId:`demo${String(i).padStart(7,'0')}`,title:`Queue track ${i+1}`}));s.order=s.items.map((_:any,i:number)=>i);s.queueRevision++;w.__mobileUpdate();},count);
 await openPlayer(page);await page.getByRole('button',{name:'Apri coda'}).click();const dialog=page.getByRole('dialog',{name:'Coda',exact:true});await expect(dialog).toHaveCSS('transform','none');return dialog;
}
async function touch(session:CDPSession,type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',x=0,y=0){await session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:6,radiusY:6}]});}
async function point(page:Page,locator:ReturnType<Page['locator']>){await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity&&(animation.effect as KeyframeEffect)?.target?.closest('.queue-entry')).map(animation=>animation.finished.catch(()=>{})));});const box=(await locator.boundingBox())!;expect(box).not.toBeNull();return {x:box.x+box.width/2,y:box.y+box.height/2};}
async function drag(session:CDPSession,from:{x:number;y:number},to:{x:number;y:number}){await touch(session,'touchStart',from.x,from.y);for(let i=1;i<=10;i++){await touch(session,'touchMove',from.x+(to.x-from.x)*i/10,from.y+(to.y-from.y)*i/10);await new Promise(resolve=>setTimeout(resolve,16));}}

test('sharing selects contiguous verses in a full reading area and Back preserves them without audio commands',async({page})=>{
 await fixture(page);await select(page);const dialog=composer(page),line=(n:number)=>dialog.getByRole('button',{name:new RegExp(`^Riga ${n}:`)});
 await line(1).click();await line(4).click();await expect(dialog.locator('[aria-pressed=true]').filter({hasNot:page.locator('svg')})).not.toHaveCount(0);
 await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(4);await expect(dialog.locator('canvas')).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Anteprima card',exact:true})).toBeInViewport();
 await dialog.getByRole('button',{name:'Anteprima card',exact:true}).click();await expect(dialog.locator('canvas')).toHaveAttribute('height','1920');await expect(dialog.getByRole('button',{name:'Condividi immagine',exact:true})).toBeEnabled();
 await page.goBack();await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(4);
 await line(10).click();await line(11).click();await expect(dialog.getByRole('alert')).toContainText('10');await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(10);
 await dialog.getByRole('button',{name:'Anteprima card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Condividi immagine',exact:true})).toBeEnabled();await dialog.getByRole('button',{name:'Salva immagine',exact:true}).click();
 await expect.poll(async()=>(await operations(page)).filter(o=>o.method==='exportStory').length).toBe(1);const calls=await operations(page);expect(calls.filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);expect((await state(page)).position).toBe(84);
});

test('shared renderer sizes the inner card by measured text while canvas stays 9:16',async({page})=>{
 await fixture(page);const modulePath='/@fs/'+path.resolve('packages/browser/story-canvas.ts').replaceAll('\\','/');
 const results=await page.evaluate(async modulePath=>{const {renderStory}=await import(modulePath),canvas=document.createElement('canvas'),track={title:'Demo track',artist:'Original artist'},results=[];for(const text of ['A quiet sky',Array.from({length:4},(_,i)=>`A quiet sky ${i}`).join('\n'),Array.from({length:10},(_,i)=>`Original long verse ${i} with enough words to wrap across several lines without being cropped or lost`).join('\n')]){results.push(await renderStory(canvas,track,null,'lyrics',text));if(canvas.width!==1080||canvas.height!==1920)throw Error('Canvas ratio changed');}let rejected=false;try{await renderStory(canvas,track,null,'lyrics','x'.repeat(10000));}catch{rejected=true;}return {results,rejected};},modulePath);
 const [one,four,ten]=results.results.map(r=>r.layout);expect(four.height).toBeGreaterThan(one.height+200);expect(one.lyricFontSize).toBe(four.lyricFontSize);expect(ten.height).toBeLessThanOrEqual(1660);expect(ten.y).toBeGreaterThanOrEqual(130);expect(ten.y+ten.height).toBeLessThanOrEqual(1790);expect(results.rejected).toBe(true);
});

test('Chromium touch drag moves upcoming tracks both ways and preserves current audio',async({page})=>{
 const dialog=await queue(page),session=await page.context().newCDPSession(page),before=await state(page);
 const handles=dialog.locator('.queue-scroll .queue-grip');const source=await point(page,handles.nth(0)),target=await point(page,handles.nth(2));
 await drag(session,source,target);await expect(dialog.locator('.is-dragging')).toHaveCount(1);await touch(session,'touchEnd');
 await expect.poll(async()=>(await operations(page)).filter(o=>o.type==='move').length).toBe(1);
 let after=await state(page);expect(after.items[after.index].videoId).toBe(before.items[before.index].videoId);expect(after.position).toBe(84);expect(after.playing).toBe(true);expect(after.items[3].videoId).toBe(before.items[1].videoId);
 await drag(session,await point(page,handles.nth(2)),await point(page,handles.nth(0)));await touch(session,'touchEnd');await expect.poll(async()=>(await operations(page)).filter(o=>o.type==='move').length).toBe(2);
 after=await state(page);expect(after.items.map((t:any)=>t.videoId)).toEqual(before.items.map((t:any)=>t.videoId));expect((await operations(page)).some(o=>o.method==='playTracks'||o.type==='jump')).toBe(false);
});

test('held touch at the bottom keeps scrolling without further moves; cancel commits nothing',async({page})=>{
 const dialog=await queue(page,30),scroll=dialog.locator('.queue-scroll'),session=await page.context().newCDPSession(page),bounds=(await scroll.boundingBox())!,contentHeight=await scroll.evaluate(el=>el.scrollHeight);
 await drag(session,await point(page,dialog.locator('.queue-grip').first()),{x:bounds.x+bounds.width-70,y:bounds.y+bounds.height-8});
 const first=await scroll.evaluate(el=>el.scrollTop);await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(first+120);
 await expect.poll(async()=>{const box=(await dialog.locator('.is-dragging .queue-grip').boundingBox())!;return Math.abs(box.y+box.height/2-(bounds.y+bounds.height-8));}).toBeLessThan(8);
 await scroll.evaluate(async el=>{el.scrollTop=el.scrollHeight;for(let i=0;i<20;i++)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));});expect(await scroll.evaluate(el=>el.scrollHeight)).toBeLessThanOrEqual(contentHeight+2);
 await touch(session,'touchCancel');await expect(dialog.locator('.is-dragging')).toHaveCount(0);expect((await operations(page)).filter(o=>o.type==='move')).toHaveLength(0);
});

test('touch reorder in shuffle uses the upcoming listening order and leaves played and current items fixed',async({page})=>{
 const dialog=await queue(page),session=await page.context().newCDPSession(page);await page.evaluate(()=>{const w=window as any,s=w.__mobileState();s.shuffle=true;s.order=[2,0,3,1];s.queueRevision++;w.__mobileUpdate();});const before=await state(page),handles=dialog.locator('[data-queue-section=next] .queue-grip');await expect(handles).toHaveCount(2);await drag(session,await point(page,handles.first()),await point(page,handles.last()));await touch(session,'touchEnd');await expect.poll(async()=>(await operations(page)).filter(o=>o.type==='move').length).toBe(1);const after=await state(page);expect(after.order.map((i:number)=>after.items[i].videoId)).toEqual([2,0,1,3].map(i=>before.items[i].videoId));expect(after.items[after.index].videoId).toBe(before.items[before.index].videoId);expect(after.position).toBe(84);expect(after.shuffle).toBe(true);expect(after.playing).toBe(true);
});

test('edge scrolling can drop beyond the initially visible rows and also scroll back upwards',async({page})=>{
 const dialog=await queue(page,30),scroll=dialog.locator('.queue-scroll'),session=await page.context().newCDPSession(page),bounds=(await scroll.boundingBox())!;
 await drag(session,await point(page,dialog.locator('.queue-grip').first()),{x:bounds.x+bounds.width-70,y:bounds.y+bounds.height-8});await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(350);await touch(session,'touchEnd');
 await expect.poll(async()=>(await operations(page)).filter(o=>o.type==='move').length).toBe(1);const moved=(await operations(page)).find(o=>o.type==='move');expect(moved.value.to).toBeGreaterThan(5);
 const visible=dialog.locator('.queue-grip').filter({visible:true});let handle=visible.first();for(const entry of await visible.all()){const b=await entry.boundingBox();if(b&&b.y>bounds.y+90&&b.y<bounds.y+bounds.height-60){handle=entry;break;}}
 const initial=await scroll.evaluate(el=>el.scrollTop);await drag(session,await point(page,handle),{x:bounds.x+bounds.width-70,y:bounds.y+8});await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeLessThan(initial-120);await touch(session,'touchCancel');expect((await operations(page)).filter(o=>o.type==='move')).toHaveLength(1);
});

test('ordinary touch swipes scroll rows without reordering; a revision cancels a held drag',async({page})=>{
 const dialog=await queue(page,30),scroll=dialog.locator('.queue-scroll'),bounds=(await scroll.boundingBox())!,session=await page.context().newCDPSession(page);
 await drag(session,{x:bounds.x+90,y:bounds.y+bounds.height-40},{x:bounds.x+90,y:bounds.y+50});await touch(session,'touchEnd');await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(40);expect((await operations(page)).filter(o=>o.type==='move')).toHaveLength(0);
 await scroll.evaluate(el=>el.scrollTop=0);await drag(session,await point(page,dialog.locator('.queue-grip').first()),await point(page,dialog.locator('.queue-grip').nth(2)));
 await page.evaluate(()=>{const w=window as any;w.__mobileState().queueRevision++;w.__mobileUpdate();});await expect(dialog.locator('.is-dragging')).toHaveCount(0);await touch(session,'touchEnd');expect((await operations(page)).filter(o=>o.type==='move')).toHaveLength(0);
});

test('accessible arrows and row removal preserve duplicate occurrences and a paused current track',async({page})=>{
 const dialog=await queue(page);await page.evaluate(()=>{const w=window as any,s=w.__mobileState();s.playing=false;s.items[3]={...s.items[1]};s.queueRevision++;w.__mobileUpdate();});const before=await state(page);
 await dialog.locator('.queue-grip').nth(1).click();await dialog.getByRole('button',{name:'Sposta su',exact:true}).click();await expect.poll(async()=>(await operations(page)).filter(o=>o.type==='move').length).toBe(1);
 const after=await state(page);expect(after.playing).toBe(false);expect(after.position).toBe(84);expect(after.items.filter((t:any)=>t.videoId===before.items[1].videoId)).toHaveLength(2);
 await dialog.locator('.queue-entry-main').first().getByRole('button',{name:/Opzioni:/}).click();await dialog.getByRole('button',{name:/Rimuovi dalla coda:/}).click();await expect.poll(async()=>(await state(page)).items.length).toBe(3);expect((await state(page)).playing).toBe(false);
});

test('lyrics readability persists and active-line changes keep row layout stable; manual scroll can resume follow',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__mobileNative.lyrics=async()=>({plainLyrics:null,syncedLyrics:Array.from({length:35},(_,i)=>`[${String(Math.floor(i*10/60)).padStart(2,'0')}:${String(i*10%60).padStart(2,'0')}]Original synced verse ${i}`).join('\n'),instrumental:false});});await openPlayer(page);await page.getByRole('button',{name:'Testi',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Testi',exact:true});await expect(dialog.locator('.is-active')).toHaveAttribute('aria-current','true');
 const before=await dialog.locator('.lyric-line').evaluateAll(nodes=>nodes.map(node=>({top:(node as HTMLElement).offsetTop,height:(node as HTMLElement).offsetHeight})));
 await page.evaluate(()=>{const w=window as any;w.__mobileState().position=96;w.__mobileUpdate();});await expect(dialog.locator('.is-active')).toContainText('verse 9');const after=await dialog.locator('.lyric-line').evaluateAll(nodes=>nodes.map(node=>({top:(node as HTMLElement).offsetTop,height:(node as HTMLElement).offsetHeight})));expect(after).toEqual(before);
 await dialog.getByRole('button',{name:'Leggibilità del testo'}).click();await dialog.getByRole('radio',{name:'Grande',exact:true}).check();await dialog.getByRole('radio',{name:'Standard',exact:true}).last().check();await expect(dialog.locator('.lyrics-panel')).toHaveClass(/lyrics-size-large lyrics-emphasis-standard/);
 await dialog.getByRole('button',{name:'Leggibilità del testo'}).click();await dialog.locator('.lyrics-reading').dispatchEvent('wheel',{deltaY:200});await expect(dialog.getByRole('button',{name:'Riprendi scorrimento'})).toBeVisible();await dialog.getByRole('button',{name:'Riprendi scorrimento'}).click();await expect(dialog.getByRole('button',{name:'Riprendi scorrimento'})).toHaveCount(0);
 await page.goBack();await page.getByRole('button',{name:'Testi',exact:true}).click();await expect(dialog.locator('.lyrics-panel')).toHaveClass(/lyrics-size-large lyrics-emphasis-standard/);expect((await operations(page)).filter(o=>o.method==='command'||o.method==='playTracks')).toHaveLength(0);
});

test('sharing failures retain an explicit artwork fallback and preview Back returns to the same excerpt',async({page})=>{
 await fixture(page);await page.evaluate(()=>{(window as any).__storyArtError=true;});await select(page);const dialog=composer(page);await dialog.getByRole('button',{name:/^Riga 2:/}).click();await dialog.getByRole('button',{name:'Anteprima card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Condividi immagine'})).toBeDisabled();await dialog.getByRole('button',{name:'Usa senza copertina'}).click();await expect(dialog.getByRole('button',{name:'Condividi immagine'})).toBeEnabled();await page.goBack();await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(1);await dialog.getByRole('button',{name:'Anteprima card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Condividi immagine'})).toBeEnabled();
});

test('sharing from the lyrics reader opens verse selection and preview Back restores the reading position',async({page})=>{
 await fixture(page);await page.evaluate(lines=>{(window as any).__storyLyrics=lines.join('\n');},verses);await openPlayer(page);await page.getByRole('button',{name:'Testi',exact:true}).click();await page.getByRole('button',{name:'Condividi versi',exact:true}).click();const dialog=composer(page),list=dialog.locator('.story-verse-list'),line=dialog.getByRole('button',{name:/^Riga 10:/});await expect(list).toBeVisible();await line.click();const readingPosition=await list.evaluate(el=>el.scrollTop);expect(readingPosition).toBeGreaterThan(50);await dialog.getByRole('button',{name:'Anteprima card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Condividi immagine',exact:true})).toBeEnabled();await page.goBack();await expect(line).toBeFocused();expect(await list.evaluate(el=>el.scrollTop)).toBeCloseTo(readingPosition,0);await expect(dialog.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(1);expect((await operations(page)).some(o=>o.method==='command'||o.method==='playTracks')).toBe(false);
});

test('capture: approved workspaces retain readable controls at compact, large-font and landscape sizes',async({page})=>{
 const output='.impeccable/review/android-listening-tools';await mkdir(output,{recursive:true});await fixture(page,{queueLength:4,language:'en',artworkFiles:['tests/fixtures/artwork/city.webp','tests/fixtures/artwork/sky.webp','tests/fixtures/artwork/sunset.webp','tests/fixtures/artwork/city.webp'],sampleTracks:[['abcdefghijk','After the rain','Luna Vale'],['12345678901','Slow motion','North Avenue'],['23456789012','Golden hour','June Atlas'],['34567890123','Night signals','Luna Vale']].map(([videoId,title,artist])=>({videoId,title,artist,thumbnail:'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg',duration:222}))});await page.evaluate(()=>{const w=window as any,s=w.__mobileState();s.items.push({...s.items[1],videoId:'45678901234',title:'Open water'},{...s.items[2],videoId:'56789012345',title:'The long way home'});s.order=s.items.map((_:any,i:number)=>i);s.queueRevision++;w.__mobileNative.lyrics=async()=>({plainLyrics:w.__storyLyrics,syncedLyrics:w.__storyLyrics.split('\n').map((line:string,i:number)=>'['+String(Math.floor(i*25/60)).padStart(2,'0')+':'+String(i*25%60).padStart(2,'0')+']'+line).join('\n'),instrumental:false});w.__mobileUpdate();});await page.evaluate(()=>{(window as any).__storyLyrics=['The city settles into blue','A quiet road, a brighter view','We leave the hurried hours behind','And find a little room for time','The rain is gone, the lights remain','A thousand windows glow again'].join('\n');});await share(page);const dialog=composer(page);await dialog.getByRole('button',{name:'Lyrics',exact:true}).click();await dialog.getByRole('button',{name:/^Line 1:/}).click();await dialog.getByRole('button',{name:/^Line 4:/}).click();await capture(page,{path:`${output}/phone-selection.png`,animations:'disabled'});await dialog.getByRole('button',{name:'Preview card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Share image'})).toBeEnabled();await capture(page,{path:`${output}/phone-preview-four.png`,animations:'disabled'});
 const png=await dialog.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL().split(',')[1]);await writeFile(`${output}/export-four.png`,Buffer.from(png,'base64'));await page.goBack();await dialog.getByRole('button',{name:'Start again',exact:true}).click();await dialog.getByRole('button',{name:/^Line 1:/}).click();await dialog.getByRole('button',{name:'Preview card',exact:true}).click();await expect(dialog.getByRole('button',{name:'Share image'})).toBeEnabled();await capture(page,{path:`${output}/phone-preview-one.png`,animations:'disabled'});const one=await dialog.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL().split(',')[1]);await writeFile(`${output}/export-one.png`,Buffer.from(one,'base64'));
 await dialog.getByRole('button',{name:/Close Preview card/}).click();await page.getByRole('button',{name:'Open queue',exact:true}).click();await capture(page,{path:`${output}/phone-queue.png`,animations:'disabled'});await page.setViewportSize({width:360,height:740});await page.evaluate(()=>document.documentElement.style.fontSize='125%');await capture(page,{path:`${output}/phone-queue-large-font.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goBack();await page.getByRole('button',{name:'Lyrics',exact:true}).click();await capture(page,{path:`${output}/phone-lyrics-large-font.png`,animations:'disabled'});await page.setViewportSize({width:852,height:393});await capture(page,{path:`${output}/landscape-lyrics.png`,animations:'disabled'});
});
