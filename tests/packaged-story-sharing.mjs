import {expect} from '@playwright/test';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {validateStoryPng}=createRequire(import.meta.url)('../apps/desktop/story-export.cjs');
export async function runNativeStorySharing({page,profile,capture,version,mediaId}){
  const title=await page.locator('.player-track strong').innerText();
  const lines=['Sotto la pioggia di neon','La città rallenta','resta accesa una finestra','porto il cielo nelle tasche','e ritorno verso casa','le strade parlano ancora',...Array.from({length:7},(_,i)=>`Un altro verso ${i+7}`)];
  await page.evaluate(async({mediaId,text})=>{const config=await window.ritvio.configuration();const response=await fetch(`${config.baseUrl}/v1/me/lyrics/${mediaId}`,{method:'PUT',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({text,format:'txt',fileName:'versi-originali-test.txt'})});if(!response.ok)throw Error(await response.text());},{mediaId,text:lines.join('\n')});
  await page.locator('#story-share-trigger').click();await expect(page.locator('.story-dialog')).toBeVisible();
  await expect.poll(async()=>await page.locator('.story-artwork-warning').count()>0||await page.getByRole('button',{name:'Salva immagine',exact:true}).isEnabled(),{timeout:12000}).toBe(true);
  const fallback=await page.locator('.story-artwork-warning').count()>0;
  if(fallback)await page.getByRole('button',{name:'Usa senza copertina'}).click();
  const exports=path.join(profile,'exports');await page.getByRole('button',{name:'Salva immagine',exact:true}).click();await expect(page.getByRole('button',{name:'Immagine salvata',exact:true})).toBeVisible();
  const filename=(await readdir(exports)).find(name=>name.endsWith('.png'));expect(filename).toBeTruthy();const trackBytes=await readFile(path.join(exports,filename));validateStoryPng(trackBytes);await writeFile(path.join(profile,'native-track-story.png'),trackBytes);await capture('native-track-composer.png');
  await page.locator('.story-modes').getByRole('button',{name:'Testo',exact:true}).click();await page.getByRole('button',{name:'Riga 2: La città rallenta'}).click();await page.getByRole('button',{name:'Riga 3: resta accesa una finestra'}).click();await page.getByRole('button',{name:'Riga 5: e ritorno verso casa'}).click();await expect(page.locator('.story-selection-heading output')).toHaveText('4/10 righe selezionate · 92 caratteri');await expect(page.getByRole('button',{name:'Salva immagine',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Salva immagine',exact:true}).click();await expect(page.getByRole('button',{name:'Immagine salvata',exact:true})).toBeVisible();const lyricBytes=await readFile(path.join(exports,filename));validateStoryPng(lyricBytes);expect(lyricBytes.equals(trackBytes)).toBe(false);await writeFile(path.join(profile,'native-lyric-story.png'),lyricBytes);await capture('native-lyric-composer.png');
  await page.getByRole('button',{name:`Riga 11: ${lines[10]}`,exact:true}).click();await expect(page.locator('.story-lines li.selected')).toHaveCount(10);
  await expect(page.locator('.story-selection-heading output')).toHaveText(`10/10 righe selezionate · ${Array.from(lines.slice(1,11).join('\n')).length} caratteri`);
  await page.getByRole('button',{name:`Riga 12: ${lines[11]}`,exact:true}).focus();await page.keyboard.press('Space');await expect(page.locator('.story-warning')).toContainText('Massimo 10 righe consecutive');await expect(page.locator('.story-lines li.selected')).toHaveCount(10);
  await page.getByRole('button',{name:'Salva immagine',exact:true}).click();await expect(page.getByRole('button',{name:'Immagine salvata',exact:true})).toBeVisible();const tenRows=await readFile(path.join(exports,filename));validateStoryPng(tenRows);expect(tenRows.equals(lyricBytes)).toBe(false);await writeFile(path.join(profile,'native-ten-rows-story.png'),tenRows);await capture('native-ten-rows-composer.png');
  await page.getByRole('button',{name:'Copia link',exact:true}).click();await expect(page.getByRole('button',{name:'Link copiato',exact:true})).toBeVisible();
  expect(await page.evaluate(async()=>{try{await window.ritvio.exportStory(new Uint8Array([1,2,3]),'bad');return false;}catch{return true;}})).toBe(true);
  expect(await page.evaluate(()=>typeof window.require)).toBe('undefined');await page.getByRole('button',{name:'Chiudi condivisione'}).click();await expect(page.locator('#story-share-trigger')).toBeFocused();await expect(page.locator('.player-track strong')).toHaveText(title);await expect(page.getByRole('button',{name:'Riproduci',exact:true})).toBeVisible();
  console.log(JSON.stringify({version,storySharing:true,trackPng:true,lyricsPng:true,tenRowsPng:true,persistentThirdClick:true,eleventhRowRejected:true,width:1080,height:1920,originalLyricsRange:'92 characters / 4 rows',realCoverProxy:!fallback,explicitArtworkFallback:fallback,copyLink:true,malformedPngRejected:true,rendererIsolated:true,playbackUnchanged:true,profile}));
}
