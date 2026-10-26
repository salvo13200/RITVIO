import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {fixture} from './helpers/ios-fixture';
test('resume, fixed single-cover player, release-only seek and paused intent',async({page})=>{
 const errors=await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 const player=page.getByRole('dialog',{name:'Now playing',exact:true}),slider=page.getByRole('slider',{name:'Playback position'});
 await expect(player.locator('.ios-player-top button').first()).toBeFocused();
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
 await input.fill('offline');await expect(page.getByRole('button',{name:'Try again'})).toBeInViewport();await expect(page.getByRole('status')).not.toContainText('Added to queue');
});
test('queue handles offer tap actions and cancel a held gesture after a native revision change',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Open player: After the rain'}).first().click();await page.getByRole('button',{name:'Queue',exact:true}).first().click();
 await page.getByRole('button',{name:'Reorder: Slow motion'}).click();await expect(page.getByRole('button',{name:'Move down'})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('button',{name:'Reorder: Slow motion'})).toBeFocused();
 const grip=page.getByRole('button',{name:'Reorder: Night swim'}),from=(await grip.boundingBox())!,to=(await page.getByRole('button',{name:'Reorder: Slow motion'}).boundingBox())!;
 await page.mouse.move(from.x+22,from.y+22);await page.mouse.down();await page.mouse.move(to.x+22,to.y+22,{steps:8});
 expect((await grip.boundingBox())!.y).toBeLessThan(from.y-50);
 await page.evaluate(()=>{const state=(window as any).__iosState();(window as any).__iosEmit({queueRevision:state.queueRevision+1,index:1});});await expect(page.locator('.ios-queue-entry.is-lifted')).toHaveCount(0);await page.mouse.up();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type==='move').length)).toBe(0);await expect(page.getByRole('status')).toContainText('Reorder cancelled');
});
test('a song menu consumes outside taps without activating the screen behind it',async({page})=>{
 await fixture(page);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('searchbox').fill('luna');await page.getByRole('button',{name:'More options: Slow motion'}).click();
 await expect(page.getByRole('dialog',{name:'Slow motion',exact:true})).toBeVisible();
 const gear=(await page.locator('.ios-header button').boundingBox())!;await page.mouse.click(gear.x+gear.width/2,gear.y+gear.height/2);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Search',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__iosOperations.filter((op:any)=>op.type||op.method==='playTracks').length)).toBe(0);
});
test('small iPhone, large text, reduced motion and keyboard dialogs stay usable',async({page})=>{
 await page.setViewportSize({width:375,height:667});await fixture(page,{scale:1.65});await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 const player=page.getByRole('dialog',{name:'Now playing',exact:true});
 expect(await player.evaluate(node=>node.scrollHeight<=node.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Next song'})).toBeInViewport();
 await page.getByRole('button',{name:'Close player'}).first().click();await page.getByRole('button',{name:'Settings'}).click();
 expect((await page.getByRole('button',{name:'Done',exact:true}).boundingBox())!.y).toBeGreaterThanOrEqual(20);
 await page.getByRole('switch',{name:'Reduce motion'}).check();await expect(page.locator('.ios-app')).toHaveClass(/ios-reduce-motion/);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Settings'}).click();await expect(page.getByRole('switch',{name:'Reduce motion'})).toBeChecked();await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:667,height:375});await page.getByRole('button',{name:'Open player: After the rain'}).first().click();
 expect(await player.evaluate(node=>node.scrollHeight<=node.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Next song'})).toBeInViewport();await expect(player.locator('.ios-player-details')).toBeInViewport();
});
test('empty first run, language persistence and accessibility scan',async({page})=>{
 await fixture(page,{empty:true});await expect(page.getByRole('heading',{name:'Your next listen starts here'})).toBeVisible();await expect(page.getByTestId('mini-player')).toHaveCount(0);
 const accessibility=await new AxeBuilder({page}).include('.ios-app').analyze();expect(accessibility.violations).toEqual([]);
 await page.getByRole('button',{name:'Settings'}).click();await page.getByRole('button',{name:'Italiano',exact:true}).click();await page.getByRole('button',{name:'Fine',exact:true}).click();await expect(page.getByRole('heading',{name:'Il tuo ascolto'})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('lang','it');await page.reload();await expect(page.getByRole('heading',{name:'Il tuo ascolto'})).toBeVisible();
});
