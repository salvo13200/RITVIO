import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {isPublicSource,publicFiles,scanPublicSource} from '../scripts/public-source.mjs';

test('public export excludes private, generated and design-work files while retaining build sources',()=>{
  for(const file of ['.local/android-signing/ritvio.jks','apps/mobile/android/local.properties','.agents/skills/test.md','docs/design/english-release/DELIVERY.json','data/history.json','.env','apps/mobile/android/app/build/output.apk','apps/mobile/android/app/src/main/assets/public/index.html','apps/client/.impeccable/design.json','apps/client/assets/plates/queue-cover-0.png','apps/client/src/design-review.tsx','apps/mobile/ANDROID-0-BRIEF.md','database/001_initial.sql','apps/mobile/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java','test-results/visual/private.png'])assert.equal(isPublicSource(file),false,file);
  for(const file of ['.github/FUNDING.yml','LICENSE','pnpm-lock.yaml','scripts/build-android.mjs','apps/mobile/android/gradle/wrapper/gradle-wrapper.jar','apps/client/src/App.tsx','third-party/inventory.json','docs/BUILDING.md','docs/QUALITY_STATUS.md','tests/fixtures/artwork/city.webp','docs/README.md','docs/SCREENSHOTS.md','docs/media/banner.webp','docs/media/share-card-lyrics.webp'])assert.equal(isPublicSource(file),true,file);
  assert.equal(isPublicSource('docs/media/private-screenshot.png'),false);
  assert.equal(isPublicSource('apps/mobile/android/.kotlin/sessions/compiler.salive'),false);
  for(const file of ['docs/ADOPTION.md','docs/COMMUNITY.md','docs/media/adoption.json','docs/media/adoption-demo.webm','docs/media/mobile-support-entry.webp'])assert.equal(isPublicSource(file),true,file);
  for(const file of ['docs/media/private-recording.webm','docs/media/private-support.webp','test-results/adoption/raw-video/session.webm'])assert.equal(isPublicSource(file),false,file);
});

test('public export rejects embedded image prompts and truncated binary containers',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ritvio-image-scan-'));
  try{
    await mkdir(path.join(root,'apps/client/public'),{recursive:true});
    const payload=Buffer.from('hidden prompt!'),chunk=Buffer.alloc(8+payload.length+(payload.length%2)),header=Buffer.alloc(12);
    chunk.write('XMP ');chunk.writeUInt32LE(payload.length,4);payload.copy(chunk,8);
    header.write('RIFF');header.writeUInt32LE(4+chunk.length,4);header.write('WEBP',8);
    await writeFile(path.join(root,'apps/client/public/cover.webp'),Buffer.concat([header,chunk]));
    const findings=await scanPublicSource(root,['apps/client/public/cover.webp']);
    assert.equal(findings.length,1);assert.match(findings[0].reason,/embedded image metadata/);
    await writeFile(path.join(root,'apps/client/public/cover.webp'),Buffer.from('not an image'));
    assert.equal((await scanPublicSource(root,['apps/client/public/cover.webp'])).length,1);
    await mkdir(path.join(root,'docs/media'),{recursive:true});await writeFile(path.join(root,'docs/media/adoption-demo.webm'),'<html>an error page is not a recording</html>');
    assert.equal((await scanPublicSource(root,['docs/media/adoption-demo.webm'])).length,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('source selection and credential scan operate on the exported set',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ritvio-source-'));
  try{
    await mkdir(path.join(root,'apps/client/src'),{recursive:true});await mkdir(path.join(root,'.local'),{recursive:true});
    await writeFile(path.join(root,'apps/client/src/test.ts'),'export const value=1;');await writeFile(path.join(root,'.local/secret.txt'),'private');
    await mkdir(path.join(root,'apps/mobile/android/.kotlin/sessions'),{recursive:true});
    await writeFile(path.join(root,'apps/mobile/android/.kotlin/sessions/compiler.salive'),'private compiler cache');
    const files=await publicFiles(root);assert.deepEqual(files,['apps/client/src/test.ts']);assert.deepEqual(await scanPublicSource(root,files),[]);
    await writeFile(path.join(root,'apps/client/src/test.ts'),['-----BEGIN','PRIVATE KEY-----'].join(' '));assert.equal((await scanPublicSource(root,files)).length,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
