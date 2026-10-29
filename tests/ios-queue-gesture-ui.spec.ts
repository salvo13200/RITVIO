import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture} from './helpers/ios-fixture';
const folder='.local/ios-queue-gesture-preview';
async function shot(page:Page,name:string){await mkdir(folder,{recursive:true});await page.screenshot({path:`${folder}/${name}.png`,animations:'disabled'});}
for(const scale of [1,2.14])test(`queue hold, scrolling, edge drop and next occurrence at ${scale}`,async({page})=>{
 await page.setViewportSize(scale===1?{width:375,height:667}:{width:402,height:874});await page.route('https://**',route=>route.abort());const errors=await fixture(page,{withLibrary:true,discovery:true,scale});
 await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();const queue=page.getByRole('dialog',{name:'Queue',exact:true}),area=queue.locator('.ios-queue-list'),grip=queue.getByRole('button',{name:'Reorder: Night swim',exact:true});
 await grip.scrollIntoViewIfNeeded();const rect=(await area.boundingBox())!,box=(await grip.boundingBox())!,before=await area.evaluate(el=>el.scrollTop);
 // Hold a real grip near an edge, without movement: it must remain stationary.
 const x=box.x+box.width/2,y=Math.min(rect.y+rect.height-10,box.y+box.height/2);
 await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(350);expect(await area.evaluate(el=>el.scrollTop)).toBe(before);await shot(page,`held-${scale}`);
 await page.mouse.move(x,rect.y+8,{steps:12});await expect.poll(()=>area.evaluate(el=>el.scrollTop)).toBe(0);await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosState().items[(window as any).__iosState().order[1]].title)).toBe('Night swim');await shot(page,`reordered-${scale}`);
 await queue.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Next song',exact:true}).click();await expect(page.getByRole('heading',{name:'Night swim',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('pointer release uses its final position even without an intervening move',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();const from=page.getByRole('button',{name:'Reorder: Night swim'}),target=page.getByRole('button',{name:'Reorder: Slow motion'}),source=(await from.boundingBox())!,destination=(await target.boundingBox())!;
 await from.evaluate(el=>el.addEventListener('pointerdown',event=>{(window as any).__queuePointer=(event as PointerEvent).pointerId;},{once:true}));await page.mouse.move(source.x+22,source.y+22);await page.mouse.down();const pointer=await page.evaluate(()=>(window as any).__queuePointer);await from.dispatchEvent('pointerup',{pointerId:pointer,button:0,clientX:destination.x+22,clientY:destination.y+22});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosState().items[(window as any).__iosState().order[1]].title)).toBe('Night swim');
});

test('document release commits once when the grip does not receive pointer-up',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 const from=page.getByRole('button',{name:'Reorder: Night swim'}),target=page.getByRole('button',{name:'Reorder: Slow motion'}),source=(await from.boundingBox())!,destination=(await target.boundingBox())!;
 await from.evaluate(el=>el.addEventListener('pointerdown',event=>{(window as any).__queuePointer=(event as PointerEvent).pointerId;},{once:true}));await page.mouse.move(source.x+22,source.y+22);await page.mouse.down();
 await page.evaluate(y=>document.dispatchEvent(new PointerEvent('pointerup',{pointerId:(window as any).__queuePointer,clientY:y})),destination.y+22);await page.mouse.up();
 await expect(page.locator('.ios-queue-list')).not.toHaveClass(/is-dragging/);await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__iosState();return s.items[s.order[1]].title;})).toBe('Night swim');
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((item:any)=>item.type==='move').length)).toBe(1);
});

for(const cancel of [false,true])test(`legacy touch ${cancel?'cancellation':'release'} closes only the owning drag`,async({page})=>{
 const errors=await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 const from=page.getByRole('button',{name:'Reorder: Night swim'}),target=page.getByRole('button',{name:'Reorder: Slow motion'}),source=(await from.boundingBox())!,destination=(await target.boundingBox())!;
 await page.mouse.move(source.x+22,source.y+22);await page.mouse.down();
 await from.evaluate((el,{x,y})=>el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[new Touch({identifier:17,target:el,clientX:x,clientY:y})]})),{x:source.x+22,y:source.y+22});
 await page.mouse.move(destination.x+22,destination.y+22,{steps:8});
 await from.evaluate(el=>el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:18,target:el})]})));
 await expect(page.locator('.ios-queue-list')).toHaveClass(/is-dragging/);
 await from.evaluate((el,{cancel,x,y})=>el.dispatchEvent(new TouchEvent(cancel?'touchcancel':'touchend',{bubbles:true,changedTouches:[new Touch({identifier:17,target:el,clientX:x,clientY:y})]})),{cancel,x:destination.x+22,y:destination.y+22});await page.mouse.up();
 await expect(page.locator('.ios-queue-list')).not.toHaveClass(/is-dragging/);await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__iosState();return s.items[s.order[1]].title;})).toBe(cancel?'Slow motion':'Night swim');
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((item:any)=>item.type==='move').length)).toBe(cancel?0:1);expect(errors).toEqual([]);
});
