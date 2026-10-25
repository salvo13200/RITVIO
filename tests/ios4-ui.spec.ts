import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
async function fixture(page:Page,{empty=false,scale=1}:{empty?:boolean;scale?:number}={}){
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const cover=await readFile('apps/client/public/artwork/electronic.webp');
 await page.route('https://i.ytimg.com/**',route=>route.fulfill({contentType:'image/webp',body:cover}));
 await page.route('**/src/native.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const isIOS=true;export const isAndroid=false;export const isNativeMobile=true;export const nativePlayback=window.__ios;'}));
 await page.route('**/src/ios/native.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export const foundationBridge=window.__ios;'}));
 await page.addInitScript(({empty,scale})=>{
  const tracks=['After the rain','Slow motion','Golden hour','Night swim','An unusually long title that must remain readable without growing the player'].map((title,i)=>({videoId:`ritviotest${i+1}`,title,artist:['Luna Vale','North Avenue','June Atlas','Luna Vale','Many collaborating artists with a very long name'][i],thumbnail:`https://i.ytimg.com/vi/ritviotest${i+1}/hqdefault.jpg`,duration:90,...(i===0?{album:{id:'fixture-album',name:'Night scenes'}}:{})}));
  let state:any={items:empty?[]:tracks,index:0,order:empty?[]:[0,1,2,3,4],queueRevision:1,position:24,duration:90,buffered:65,playing:false,loading:false,repeat:'off',shuffle:false,volume:1,error:null,status:'ready',stamp:{session:1,sequence:0}};
  const operations:any[]=[],listeners=new Set<(value:any)=>void>(),languages=new Set<(value:any)=>void>();
  let language:any={schema:1,preference:localStorage.getItem('__iosLanguage')??'en',revision:1,systemLanguages:['en-US']};
  const copy=(value:any)=>JSON.parse(JSON.stringify(value));
  const emit=()=>{state.stamp.sequence++;for(const listener of listeners)listener(copy(state));return copy(state);};
  const fail=(code:string)=>Object.assign(Error(code),{code});
  Object.assign(window,{__iosOperations:operations,__iosState:()=>copy(state),__iosEmit:(value:any)=>{state={...state,...value};return emit();},__ios:{
   foundationStatus:async()=>({platform:'ios',phase:'IOS-4',version:'0.4.0',build:'4',bundleId:'it.ritvio.ios',systemVersion:'26.0',environment:'simulator',minimumOS:'15.0',bundledAssets:true,textScale:scale,capabilities:{resolver:true,playback:true,library:false,lyrics:false,sharing:false}}),
   snapshot:async()=>copy(state),
   languageRead:async()=>copy(language),languageWrite:async({preference}:any)=>{language={...language,preference,revision:language.revision+1};localStorage.setItem('__iosLanguage',preference);for(const listener of languages)listener(copy(language));return copy(language);},
   addListener:async(event:string,listener:(value:any)=>void)=>{const list=event==='language'?languages:listeners;list.add(listener);return {remove:async()=>{list.delete(listener);}};},
   search:async(input:any)=>{operations.push({method:'search',...input});await new Promise(resolve=>setTimeout(resolve,input.query==='slower'?600:30));if(input.query==='offline')throw fail('NETWORK_UNAVAILABLE');return {items:input.query==='empty'?[]:tracks,cached:false};},cancelResolver:async(input:any)=>{operations.push({method:'cancel',...input});return {cancelled:true};},
   playTracks:async(input:any)=>{operations.push({method:'playTracks',...input});state={...state,items:input.items,index:input.index,order:input.items.map((_:any,i:number)=>i),queueRevision:state.queueRevision+1,playing:true,position:0};return emit();},
   enqueue:async(input:any)=>{operations.push({method:'enqueue',...input});const entry=state.items.length;state.items.push(input.track);state.order.splice(input.next?state.order.indexOf(state.index)+1:state.order.length,0,entry);state.queueRevision++;return emit();},
   command:async(input:any)=>{operations.push(input);const {type,value}=input;
    if(type==='move'){if(value.revision!==state.queueRevision)throw fail('QUEUE_CHANGED');const old=state.items.slice(),ids=old.map((_:any,i:number)=>i),order=state.order.slice(),destination=order.indexOf(value.to);order.splice(order.indexOf(value.from),1);order.splice(destination,0,value.from);ids.splice(value.to,0,ids.splice(value.from,1)[0]);state.items=ids.map((i:number)=>old[i]);state.index=ids.indexOf(state.index);state.order=order.map((i:number)=>ids.indexOf(i));state.queueRevision++;}
    else if(type==='seek')state.position=value;
    else if(type==='play'||type==='pause')state.playing=type==='play';
    else if(type==='next'||type==='previous'){const at=state.order.indexOf(state.index)+(type==='next'?1:-1);if(state.order[at]!==undefined)state.index=state.order[at];state.position=0;}
    else if(type==='jump'){state.index=value;state.position=0;state.playing=true;}
    else if(type==='clear'){state.items=[];state.order=[];state.playing=false;state.index=0;state.queueRevision++;}
    else if(type==='repeat'||type==='shuffle'){state[type]=value;state.queueRevision++;}
    else if(type==='remove'){const index=value.index;state.items.splice(index,1);state.order=state.order.filter((i:number)=>i!==index).map((i:number)=>i>index?i-1:i);if(state.index>index)state.index--;state.queueRevision++;}
    return emit();}
  }});
 },{empty,scale});
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your listening',exact:true})).toBeVisible();
 return errors;
}
test('resume, fixed single-cover player, release-only seek and paused intent',async({page})=>{
 const errors=await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 const player=page.getByRole('dialog',{name:'Now playing',exact:true}),slider=page.getByRole('slider',{name:'Playback position'});
 const box=(await slider.boundingBox())!;
 await page.mouse.move(box.x+box.width*.3,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height/2,{steps:12});
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type==='seek').length)).toBe(0);
 await expect(player.locator('output')).toBeVisible();await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type==='seek').length)).toBe(1);
 await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 const initialArt=(await player.locator('[data-testid="player-art"] .artwork').boundingBox())!;
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Next song'}).click();
 await expect(player.locator('[data-testid="player-art"] img')).toHaveCount(1);
 const dimensions=await player.evaluate(element=>({scroll:element.scrollHeight,height:element.clientHeight,art:element.querySelector('.artwork')!.getBoundingClientRect().toJSON()}));
 expect(dimensions.scroll).toBe(dimensions.height);expect(Math.abs(dimensions.art.width-dimensions.art.height)).toBeLessThan(2);expect(Math.abs(dimensions.art.width-initialArt.width)).toBeLessThan(2);expect(errors).toEqual([]);
});
test('queue handle changes actual next track; accessible actions and clear work',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 const from=(await page.getByRole('button',{name:'Reorder: Night swim',exact:true}).boundingBox())!,to=(await page.getByRole('button',{name:'Reorder: Slow motion',exact:true}).boundingBox())!;
 expect(from.width).toBeGreaterThanOrEqual(44);
 await page.mouse.move(from.x+22,from.y+22);await page.mouse.down();await page.mouse.move(to.x+22,to.y+22,{steps:10});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window as any).__iosState().items[(window as any).__iosState().order[1]].title)).toBe('Night swim');
 await page.getByRole('button',{name:'More options: Night swim'}).click();await expect(page.getByRole('button',{name:'Move up'})).toBeDisabled();await page.getByRole('button',{name:'Move down'}).click();
 await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Next song'}).click();await expect(page.getByRole('heading',{name:'Slow motion',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Queue',exact:true}).first().click();await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByRole('dialog',{name:'Clear the queue?'}).getByRole('button',{name:'Clear',exact:true}).click();await expect(page.getByRole('heading',{name:'Your next listen starts here'})).toBeVisible();
});
test('debounced search, stale result rejection, queue menu and error recovery',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Search',exact:true}).click();const input=page.getByRole('searchbox');
 await input.fill('ab');await page.waitForTimeout(400);expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.method==='search').length)).toBe(0);
 await input.fill('slower');await page.waitForTimeout(400);await input.fill('empty');await expect(page.getByRole('heading',{name:'No songs found'})).toBeVisible();await page.waitForTimeout(400);await expect(page.getByRole('heading',{name:'No songs found'})).toBeVisible();
 await input.fill('offline');await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();await input.fill('luna');await page.getByRole('button',{name:'More options: Slow motion'}).click();await page.getByRole('button',{name:'Play next',exact:true}).click();await expect(page.getByRole('status')).toContainText('Added to queue');
 const toast=(await page.getByRole('status').boundingBox())!,mini=(await page.getByTestId('mini-player').boundingBox())!;expect(toast.y+toast.height).toBeLessThanOrEqual(mini.y);
});
test('queue handles offer tap actions and cancel a held gesture after a native revision change',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 await page.getByRole('button',{name:'Reorder: Slow motion'}).click();await expect(page.getByRole('button',{name:'Move down'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const grip=page.getByRole('button',{name:'Reorder: Night swim'}),from=(await grip.boundingBox())!,to=(await page.getByRole('button',{name:'Reorder: Slow motion'}).boundingBox())!;
 await page.mouse.move(from.x+22,from.y+22);await page.mouse.down();await page.mouse.move(to.x+22,to.y+22,{steps:8});
 expect((await grip.boundingBox())!.y).toBeLessThan(from.y-50);
 await page.evaluate(()=>{const state=(window as any).__iosState();(window as any).__iosEmit({queueRevision:state.queueRevision+1,index:1});});await expect(page.locator('.ios-queue-entry.is-lifted')).toHaveCount(0);await page.mouse.up();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type==='move').length)).toBe(0);await expect(page.getByRole('status')).toContainText('Reorder cancelled');
});
test('a song menu consumes outside taps without activating the screen behind it',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('luna');await page.getByRole('button',{name:'More options: Slow motion'}).click();
 const gear=(await page.locator('.ios-header button').boundingBox())!;await page.mouse.click(gear.x+gear.width/2,gear.y+gear.height/2);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Search',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type||op.method==='playTracks').length)).toBe(0);
});
test('small iPhone, large text, reduced motion and keyboard dialogs stay usable',async({page})=>{
 await page.setViewportSize({width:375,height:667});await fixture(page,{scale:1.65});await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 const player=page.getByRole('dialog',{name:'Now playing',exact:true});
 expect(await player.evaluate(node=>node.scrollHeight<=node.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Next song'})).toBeInViewport();
 await page.getByRole('button',{name:'Close player'}).first().click();await page.getByRole('button',{name:'Settings'}).click();await page.getByRole('checkbox',{name:'Reduce motion'}).check();await expect(page.locator('.ios-app')).toHaveClass(/ios-reduce-motion/);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:667,height:375});await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 expect(await player.evaluate(node=>node.scrollHeight<=node.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Next song'})).toBeInViewport();await expect(player.locator('.ios-player-details')).toBeInViewport();
});
test('empty first run, language persistence and accessibility scan',async({page})=>{
 await fixture(page,{empty:true});await expect(page.getByRole('heading',{name:'Your next listen starts here'})).toBeVisible();await expect(page.getByTestId('mini-player')).toHaveCount(0);
 const accessibility=await new AxeBuilder({page}).include('.ios-app').analyze();expect(accessibility.violations).toEqual([]);
 await page.getByRole('button',{name:'Settings'}).click();await page.getByRole('button',{name:'Italiano',exact:true}).click();await page.getByRole('button',{name:'Fine',exact:true}).click();await expect(page.getByRole('heading',{name:'Il tuo ascolto'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','it');await page.reload();await expect(page.getByRole('heading',{name:'Il tuo ascolto'})).toBeVisible();
});
