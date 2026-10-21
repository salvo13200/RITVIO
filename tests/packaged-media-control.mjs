import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {expect} from '@playwright/test';
import {createNativeMediaFixture} from './native-media-fixture.mjs';
import {createNativeResourceProbe,readWindowsProcessTree,validateProcessSnapshot,cpuCorePercent} from './native-resource-probe.mjs';

/** Causal measurement control, not a real-provider or UI-navigation endurance test. */
export async function runNativeMediaControl({page,browser,rootPid,profile,mode,seconds,disconnect,reconnect}){
  assert(['intercepted','http-connected','http-detached'].includes(mode));
  assert(Number.isInteger(seconds)&&seconds>=60&&seconds<=3600);
  const fixture=await createNativeMediaFixture(seconds+120);
  let detached=false,documentOverrides=0,originalError;
  const samples=[],reportFile=path.join(profile,'media-control.json');
  const conditions={mode,requestedSeconds:seconds,queueItems:500,syntheticPCM:true,hiddenWindow:true,uiNavigation:false,
    csp:'Only the initial document media-src adds the exact ephemeral loopback fixture origin; original document and app origin retained',
    observer:mode==='http-detached'?'Playwright/CDP disconnected during OS-only measurement':'Playwright/CDP remains connected; no periodic CDP queries',
    limits:'Original mono 8 kHz PCM; idle Now Playing and 500 repeated queue references. Not real-provider playback, audible output, motion FPS or UI-navigation endurance. CDP is reattached only after the final OS sample.'};
  async function checkpoint(extra={}){await writeFile(reportFile,JSON.stringify({complete:false,conditions,documentOverrides,transport:fixture.report(),samples,...extra},null,2));}
  try{
    const documentUrl=page.url();
    await page.route(documentUrl,async route=>{
      assert.equal(documentOverrides,0,'Only one initial document may be changed');
      const response=await route.fetch(),headers=response.headers();
      const csp=headers['content-security-policy'];assert(csp&&/media-src [^;]+/.test(csp));
      headers['content-security-policy']=csp.replace(/media-src ([^;]+)/,`media-src $1 ${fixture.origin}`);
      documentOverrides++;await route.fulfill({response,headers});
    });
    await page.reload();await expect(page.getByRole('heading',{name:'La tua musica'})).toBeVisible();
    assert.equal(documentOverrides,1,'The controlled document CSP must actually be applied');
    await page.unroute(documentUrl);
    // Only small descriptors use interception. Once playback starts no routes are
    // needed by the detached arm; the ongoing media is ordinary loopback HTTP.
    await page.route('**/v1/media/*/playback*',route=>route.fulfill({json:{mode:'youtube-audio-resolver',accessMethod:'unofficial-extraction',provider:'youtube',videoId:'jNQXAC9IVRw',url:fixture.url,expiresAt:new Date(Date.now()+(seconds+600)*1000).toISOString(),capabilities:{background:true,seek:true,volume:true,equalizer:true,offline:false}}}));
    if(mode==='intercepted')await page.route(fixture.url,route=>route.fulfill(fixture.response(route.request().headers().range,true)));
    await page.locator('#queue-panel-trigger').click();await expect(page.locator('.queue-row')).toHaveCount(61);
    await page.locator('#now-panel-trigger').click();
    const seek=()=>page.getByRole('slider',{name:'Posizione del brano',exact:true});
    await page.locator('.transport').getByRole('button',{name:'Riproduci',exact:true}).click();
    await expect.poll(async()=>Number(await seek().inputValue()),{timeout:10000}).toBeGreaterThan(8);
    const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
    const probe=createNativeResourceProbe({cdp,browserCdp:await browser.newBrowserCDPSession(),rootPid});
    const before=await probe.sample('instrumented-before',{collectGarbage:true});
    const renderers=before.processes.filter(p=>p.kind==='renderer');
    assert.equal(renderers.length,1,'This control requires exactly one identified renderer');
    const roles=new Map(before.processes.map(p=>[`${p.pid}:${p.startedAt}`,p.kind]));
    const initialPosition=Number(await seek().inputValue());
    if(mode==='http-detached'){await page.unrouteAll({behavior:'wait'});await disconnect();detached=true;}
    const start=performance.now();
    async function sample(phase){
      const raw=validateProcessSnapshot(await readWindowsProcessTree(rootPid),rootPid,before.rootStartedAt);
      assert(raw.processes.some(p=>p.pid===renderers[0].pid&&p.startedAt===renderers[0].startedAt),'Renderer replacement invalidates a like-for-like memory comparison');
      const processes=raw.processes.map(p=>({...p,kind:roles.get(`${p.pid}:${p.startedAt}`)??'unclassified-child'}));
      const item={phase,elapsedMs:performance.now()-start,...raw,processes};
      for(const key of ['privateBytes','workingSetBytes','handles','threads'])item[key]=processes.reduce((sum,p)=>sum+p[key],0);
      if(samples.length)item.cpuCorePercent=cpuCorePercent(samples.at(-1),item);
      samples.push(item);await checkpoint({instrumentedBefore:before,initialPosition});
      console.log(JSON.stringify({scope:'native-media-control',mode,phase,elapsedSeconds:Math.round(item.elapsedMs/1000),privateMiB:Math.round(item.privateBytes/1048576),rendererMiB:Math.round(processes.filter(p=>p.kind==='renderer').reduce((sum,p)=>sum+p.privateBytes,0)/1048576)}));
    }
    await sample('baseline');
    let due=start+30000;
    while(performance.now()-start<seconds*1000){await delay(Math.max(0,Math.min(due,start+seconds*1000)-performance.now()));await sample('periodic');due+=30000;}
    const elapsedSeconds=(performance.now()-start)/1000;
    if(detached){({page,browser}=await reconnect());detached=false;}
    const lastPosition=Number(await seek().inputValue()),audioAdvancedSeconds=lastPosition-initialPosition;
    expect(audioAdvancedSeconds).toBeGreaterThan(elapsedSeconds*.9-2);
    await expect(page.locator('.transport').getByRole('button',{name:'Pausa',exact:true})).toBeVisible();
    const endCdp=await page.context().newCDPSession(page);await endCdp.send('Performance.enable');
    const endProbe=createNativeResourceProbe({cdp:endCdp,browserCdp:await browser.newBrowserCDPSession(),rootPid});
    const after=await endProbe.sample('instrumented-after',{collectGarbage:true});
    const transport=fixture.report();assert.equal(transport.invalidRequests,0);assert(transport.maxBodyBytes<=transport.maxAllowedBodyBytes);
    assert(mode==='intercepted'?transport.interceptedResponses>1&&transport.httpResponses===0:transport.httpResponses>1&&transport.interceptedResponses===0);
    await page.locator('.transport').getByRole('button',{name:'Pausa',exact:true}).click();
    const result={complete:true,conditions,documentOverrides,elapsedSeconds,initialPosition,lastPosition,audioAdvancedSeconds,instrumentedBefore:before,instrumentedAfter:after,samples,transport};
    await writeFile(reportFile,JSON.stringify(result,null,2));return result;
  }catch(error){originalError=error;throw error;}
  finally{
    const cleanupErrors=[];
    if(detached)try{await reconnect();}catch(error){cleanupErrors.push(error);}
    try{await fixture.close();}catch(error){cleanupErrors.push(error);}
    if(cleanupErrors.length)throw new AggregateError(originalError?[originalError,...cleanupErrors]:cleanupErrors,'Media-control cleanup failed; original failure is retained');
  }
}
