import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
async function fixture(page:Page){
 await page.route('https://i.ytimg.com/**',route=>route.fulfill({path:path.resolve('tests/fixtures/artwork/city.webp'),contentType:'image/webp'}));
 await page.addInitScript(()=>{
  delete (window as any).ResizeObserver;delete (window as any).PointerEvent;delete (Intl as any).Locale;delete (Intl as any).PluralRules;
  delete (Element.prototype as any).setPointerCapture;delete (Element.prototype as any).releasePointerCapture;delete (Element.prototype as any).hasPointerCapture;
  // Chromium still emits native pointer events after the constructor is removed.
  // Suppress those, retaining PEP's synthetic events to exercise the iOS-12 path.
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])window.addEventListener(type,event=>{if(event.isTrusted)event.stopImmediatePropagation();},true);
  const tracks=[{videoId:'abcdefghijk',title:'After the rain',artist:'Luna Vale',thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',duration:180},{videoId:'lmnopqrstuv',title:'Slow motion',artist:'Luna Vale',thumbnail:'https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg',duration:210},{videoId:'wxyzabcdefg',title:'Afterlight',artist:'Luna Vale',thumbnail:'https://i.ytimg.com/vi/wxyzabcdefg/hqdefault.jpg',duration:190}];
  const state:any={items:[],index:0,order:[],queueRevision:0,position:0,duration:0,buffered:0,playing:false,loading:false,shuffle:false,repeat:'off',volume:1,error:null,status:'idle',stamp:{session:1,sequence:0}};
  const library={revision:0,likes:[],playlists:[],recent:[],follows:[]};
  const calls:any[]=[];(window as any).__pcTestCalls=calls;
  const reply=(id:string,value:unknown,error?:string)=>{const copy=JSON.parse(JSON.stringify(value));setTimeout(()=>{(window as any).__ritvioReceive({id,ok:!error,value:copy,error});},5);};
  (window as any).webkit={messageHandlers:{ritvio:{postMessage(input:any){
   const {id,method,data}=input;calls.push({method,data});
   if(method==='languageRead'||method==='languageWrite')return reply(id,{schema:1,preference:'en',systemLanguages:['en-US'],revision:0});
   if(method==='pcRead')return reply(id,{connected:false,host:'',port:59212});
   if(method==='pcPair')return data.pin==='123456'?reply(id,{connected:true}):reply(id,null,'PAIRING_FAILED');
   if(method==='foundationStatus')return reply(id,{platform:'ios',phase:'IOS-12-PC',version:'0.1.0',build:'1',bundleId:'it.ritvio.pctest',systemVersion:'12.5.8',environment:'device',minimumOS:'12.0',bundledAssets:true,capabilities:{resolver:false,playback:true,library:true,lyrics:false,sharing:false},safeArea:{top:20,right:0,bottom:0,left:0}});
   if(method==='snapshot')return reply(id,state);
   if(method==='library')return reply(id,library);
   if(method==='search')return reply(id,{items:tracks,cached:false});
   if(method==='playTracks'){state.items=data.items;state.index=data.index;state.order=data.items.map((_:any,i:number)=>i);state.duration=state.items[state.index].duration;state.playing=true;state.status='ready';state.queueRevision++;state.stamp.sequence++;return reply(id,state);}
   if(method==='enqueue'){state.items.push(data.track);state.order.push(state.items.length-1);state.queueRevision++;state.stamp.sequence++;return reply(id,state);}
   if(method==='command'){
    if(data.type==='seek')state.position=data.value;
    if(data.type==='pause')state.playing=false;
    if(data.type==='play')state.playing=true;
    if(data.type==='next'&&state.index+1<state.items.length){state.index++;state.duration=state.items[state.index].duration;}
    state.stamp.sequence++;return reply(id,state);
   }
   return reply(id,{});
  }}}};
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Connect your PC'})).toBeVisible();
}
async function pair(page:Page){await page.getByLabel('PC IP address').fill('192.168.1.10');await page.getByLabel('Pairing code').fill('123456');await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByRole('heading',{name:'Your listening'})).toBeVisible();}
test('old-WebKit API fallbacks bootstrap; pairing errors recover without losing the form',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);
 await page.screenshot({animations:'disabled',path:info.outputPath('connection.png')});
 await page.getByLabel('PC IP address').fill('192.168.1.10');await page.getByLabel('Pairing code').fill('000000');await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Incorrect');
 await pair(page);await expect(page.getByRole('button',{name:'Connection',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Library',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('queue handle reorders via the touch-to-pointer fallback',async({page})=>{
 await fixture(page);await pair(page);await page.getByRole('navigation').getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('Luna Vale');
 await page.getByRole('button',{name:'Play: After the rain',exact:true}).click();
 for(const name of ['Slow motion','Afterlight']){await page.getByRole('button',{name:`More options: ${name}`}).click();await page.getByRole('button',{name:'Add to queue',exact:true}).click();}
 await page.getByTestId('mini-player').getByRole('button',{name:'Open player: After the rain'}).click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 const from=await page.getByRole('button',{name:'Reorder: Afterlight'}).boundingBox(),to=await page.getByRole('button',{name:'Reorder: Slow motion'}).boundingBox();if(!from||!to)throw Error('Queue handles missing');
 const session=await page.context().newCDPSession(page),x=from.x+from.width/2,start=from.y+from.height/2,end=to.y+to.height/2-5;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
 for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/8}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>(window as any).__pcTestCalls.filter((x:any)=>x.method==='command'&&x.data.type==='move').length)).toBe(1);
});
test('search, fixed player, touch seek release and queue work through the legacy message adapter',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await fixture(page);await pair(page);
 await page.getByRole('navigation',{name:'RITVIO'}).getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('Luna Vale');
 await expect(page.getByRole('button',{name:'Play: After the rain',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:info.outputPath('search.png')});
 await page.getByRole('button',{name:'Play: After the rain',exact:true}).click();
 await page.getByRole('button',{name:'More options: Slow motion'}).click();await page.getByRole('button',{name:'Add to queue',exact:true}).click();
 await page.getByTestId('mini-player').getByRole('button',{name:'Open player: After the rain'}).click();
 await expect(page.getByRole('dialog',{name:'Now playing'})).toBeVisible();
 await page.screenshot({animations:'disabled',path:info.outputPath('player.png')});
 const slider=page.getByRole('slider',{name:'Playback position'});const rect=await slider.boundingBox();if(!rect)throw Error('Seek control missing');
 const touch=await page.context().newCDPSession(page),y=rect.y+rect.height/2;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.25,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*.65,y}]});
 expect(await page.evaluate(()=>(window as any).__pcTestCalls.filter((x:any)=>x.method==='command'&&x.data.type==='seek').length)).toBe(0);
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>(window as any).__pcTestCalls.filter((x:any)=>x.method==='command'&&x.data.type==='seek').length)).toBe(1);
 expect(await page.locator('.ios-player').evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true);
 await page.getByRole('button',{name:'Queue',exact:true}).first().click();await expect(page.getByRole('dialog',{name:'Queue'})).toBeVisible();await expect(page.getByRole('button',{name:'Reorder: Slow motion'})).toBeVisible();await page.screenshot({animations:'disabled',path:info.outputPath('queue.png')});
 expect(errors).toEqual([]);
});
