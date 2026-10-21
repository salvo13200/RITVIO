import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './helpers/mobile-fixture';

const output='test-results/mobile-readability';
async function inspect(page:Page,name:string){
 await page.evaluate(()=>document.fonts.ready);
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);
 const layout=await page.evaluate(()=>{
  const root=document.querySelector('dialog:not([inert])[open]')??document.querySelector('main')??document.body;
  const visible=(el:Element)=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(el).visibility!=='hidden';};
  return {width:innerWidth,height:innerHeight,rootOverflow:document.documentElement.scrollWidth>innerWidth,
   controls:Array.from(root.querySelectorAll<HTMLElement>('button,input,select')).filter(visible).map(el=>{const b=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')??el.textContent?.trim(),class:el.className,x:b.x,y:b.y,width:b.width,height:b.height,outside:b.left<-.5||b.right>innerWidth+.5||b.top<-.5||b.bottom>innerHeight+.5};}),
   regions:Array.from(root.querySelectorAll<HTMLElement>('.full-body,.track-identity,.transport,.player-utilities,.sheet-content,.story-excerpt,.story-verse-list,.story-selection-footer,.queue-scroll')).map(el=>({class:el.className,height:el.clientHeight,scrollHeight:el.scrollHeight,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}))};
 });
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 await writeFile(`${output}/${name}.json`,JSON.stringify({layout,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))},null,2));
 await page.screenshot({path:`${output}/${name}.png`,animations:'disabled'});
 expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),name).toEqual([]);
 expect(layout.rootOverflow,name).toBe(false);
 if(name.startsWith('player-')){
  expect(layout.controls.filter(c=>c.outside),name).toEqual([]);
  expect(layout.controls.filter(c=>c.width<48||c.height<48),name).toEqual([]);
  const body=layout.regions.find(r=>r.class==='full-body')!;
  expect(body.scrollHeight,name).toBeLessThanOrEqual(body.height+1);
 }
}

for(const {scale,width,height} of [{scale:100,width:360,height:740},{scale:150,width:360,height:740},{scale:200,width:360,height:740},{scale:200,width:360,height:640},{scale:150,width:740,height:360}])test(`readability and accessible actions ${scale}% ${width}x${height}`,async({page})=>{
 const label=`${scale}-${width}x${height}`;
 await mkdir(output,{recursive:true});await page.setViewportSize({width,height});
 await fixture(page,{language:'en',queueLength:4});
 await page.evaluate(()=>{(window as any).__storyLyrics=Array.from({length:14},(_,i)=>`Original demo verse ${i+1}`).join('\n');});
 await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByRole('searchbox').fill('Luna');await expect(page.locator('.search-results .track-row').first()).toBeVisible();
 await inspect(page,`search-${label}`);
 await page.getByRole('button',{name:/^Open player:/}).click();await inspect(page,`player-${label}`);
 await page.getByRole('button',{name:'Open queue',exact:true}).click();await inspect(page,`queue-${label}`);
 const queue=page.getByRole('dialog',{name:'Queue',exact:true});
 await queue.locator('.queue-grip').first().click();await queue.getByRole('button',{name:'Move down',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__mobileOperations.filter((o:any)=>o.type==='move').length)).toBe(1);
 await page.goBack();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 const composer=page.getByRole('dialog').filter({has:page.locator('.mobile-story')});
 await composer.getByRole('button',{name:'Lyrics',exact:true}).click();await expect(composer.getByRole('button',{name:/^Line 1:/})).toBeVisible();
 await inspect(page,`selection-${label}`);
 const line=composer.getByRole('button',{name:/^Line 8:/});
 await line.scrollIntoViewIfNeeded();await expect(line).toBeInViewport({ratio:.95});await line.click();
 await composer.getByRole('button',{name:/^Line 10:/}).click();
 await expect(composer.locator('.story-verse-list [aria-pressed=true]')).toHaveCount(3);
 const scroll=await composer.locator('.story-selection-scroll').evaluate(el=>el.scrollTop);
 await composer.getByRole('button',{name:'Preview card',exact:true}).click();await expect(composer.getByRole('button',{name:'Share image',exact:true})).toBeEnabled();
 await inspect(page,`preview-${label}`);
 const preview=composer.getByRole('region',{name:'Preview card',exact:true});await preview.focus();await expect(preview).toBeFocused();
 await page.goBack();await expect(composer.getByRole('button',{name:/^Line 10:/})).toBeFocused();
 expect(await composer.locator('.story-selection-scroll').evaluate(el=>el.scrollTop)).toBeCloseTo(scroll,0);
 expect(await page.evaluate(()=>(window as any).__mobileOperations.filter((o:any)=>(o.method==='command'&&o.type!=='move')||o.method==='playTracks'))).toEqual([]);
});
