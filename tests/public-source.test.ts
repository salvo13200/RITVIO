import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {isPublicSource,publicFiles,scanPublicSource} from '../scripts/public-source.mjs';

test('public export excludes private, generated and design-work files while retaining build sources',()=>{
  for(const file of ['.local/android-signing/ritvio.jks','apps/mobile/android/local.properties','.agents/skills/test.md','docs/design/english-release/DELIVERY.json','data/history.json','.env','apps/mobile/android/app/build/output.apk','apps/mobile/android/app/src/main/assets/public/index.html','apps/client/.impeccable/design.json','apps/client/assets/plates/queue-cover-0.png','apps/client/src/design-review.tsx'])assert.equal(isPublicSource(file),false,file);
  for(const file of ['.github/FUNDING.yml','LICENSE','pnpm-lock.yaml','scripts/build-android.mjs','apps/mobile/android/gradle/wrapper/gradle-wrapper.jar','apps/client/src/App.tsx','third-party/inventory.json','docs/BUILDING.md','docs/design/ui-1/preview/assets/city.png'])assert.equal(isPublicSource(file),true,file);
});
test('source selection and credential scan operate on the exported set',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ritvio-source-'));
  try{
    await mkdir(path.join(root,'apps/client/src'),{recursive:true});await mkdir(path.join(root,'.local'),{recursive:true});
    await writeFile(path.join(root,'apps/client/src/test.ts'),'export const value=1;');await writeFile(path.join(root,'.local/secret.txt'),'private');
    const files=await publicFiles(root);assert.deepEqual(files,['apps/client/src/test.ts']);assert.deepEqual(await scanPublicSource(root,files),[]);
    await writeFile(path.join(root,'apps/client/src/test.ts'),['-----BEGIN','PRIVATE KEY-----'].join(' '));assert.equal((await scanPublicSource(root,files)).length,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
