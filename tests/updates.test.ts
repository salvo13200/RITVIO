import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UpdateController, compareUpdateVersions, parseUpdateVersion, parseOfficialReleases, selectUpdate, isOfficialUpdateUrl, updateInterval, type UpdateHost, type ReleaseResponse} from '../packages/domain/updates';

function release(version: string, platform = 'android', preview = false) {
  const tag = `${platform}-v${version}`, base = 'https://github.com/salvo13200/RITVIO', name = platform === 'android' ? `RITVIO-Android-${version}.apk` : `RITVIO-${version}-setup.exe`;
  return {draft: false, prerelease: preview, tag_name: tag, html_url: `${base}/releases/tag/${tag}`, body: 'Readable release notes', assets: [{name, state: 'uploaded', size: 100, browser_download_url: `${base}/releases/download/${tag}/${name}`} ]};
}
function rig(stored: unknown = null) {
  let now = 1_800_000_000_000, value = stored === null ? null : JSON.stringify(stored), requests = 0;
  const opened: string[] = [];
  let response: ReleaseResponse = {status: 200, body: JSON.stringify([release('1.4.0'), release('1.5.0', 'android', true), release('9.0.0', 'windows')]), etag: '"release-v1"'};
  const host: UpdateHost = {
    async read() {return {version: '1.3.1', stored: value};},
    async write(next) {value = next;},
    async fetch() {requests++; return response;},
    async open(url) {opened.push(url);},
  };
  const create = () => new UpdateController('android', host, () => now);
  return {host, create, opened, advance: (ms: number) => {now += ms;}, response: (next: ReleaseResponse) => {response = next;}, count: () => requests, saved: () => value};
}
test('semantic release ordering handles numeric versions and preview identifiers', () => {
  for (const [a, b] of [['1.10.0','1.9.9'], ['2.0.0','1.999.0'], ['1.4.0','1.4.0-rc.9'], ['1.4.0-rc.10','1.4.0-rc.2'], ['1.4.0-beta','1.4.0-1']]) assert.ok(compareUpdateVersions(a,b)>0, a);
  assert.equal(compareUpdateVersions('1.4.0+a','1.4.0+b'),0);
  for(const invalid of ['v1.0.0','01.0.0','1.0','1.2.3-01','<script>','1.2.3/other']) assert.equal(parseUpdateVersion(invalid),null);
});
test('selects the correct platform, channel, latest semantic version and required install asset', () => {
  const parsed = parseOfficialReleases(JSON.stringify([release('1.4.0'),release('1.10.0','android',true),release('9.0.0','windows')]),'android');
  assert.equal(selectUpdate(parsed,'1.3.1',false)?.version,'1.4.0');
  assert.equal(selectUpdate(parsed,'1.3.1',true)?.version,'1.10.0');
  assert.equal(selectUpdate(parsed,'2.0.0',true),null);
  assert.equal(selectUpdate(parsed,'1.4.0',false),null);
  const bad = release('1.4.0'); bad.assets[0].name='sources.zip';
  assert.deepEqual(parseOfficialReleases(JSON.stringify([bad]),'android'),[]);
  assert.equal(parseOfficialReleases(JSON.stringify([release('1.4.0','windows')]),'windows')[0].version,'1.4.0');
});
test('rejects foreign, malformed, draft and mismatched release links', () => {
  const valid = release('1.4.0');
  for(const item of [{...valid,draft:true},{...valid,html_url:valid.html_url+'?next=evil'},{...valid,assets:[{...valid.assets[0],browser_download_url:'https://example.org/app.apk'}]},{...release('1.4.0-rc.1'),prerelease:false}]) assert.deepEqual(parseOfficialReleases(JSON.stringify([item]),'android'),[]);
  for(const url of ['https://github.com.evil.test/salvo13200/RITVIO/releases/tag/android-v1.4.0', valid.html_url+'#fragment',valid.html_url+'?x=1', valid.assets[0].browser_download_url.replace('1.4.0.apk','1.3.1.apk'),valid.html_url.replace('https:','javascript:'),valid.html_url.replace('RITVIO','OTHER')]) assert.equal(isOfficialUpdateUrl(url,'android'),false,url);
  assert.equal(isOfficialUpdateUrl(valid.html_url,'windows'),false);
  assert.equal(isOfficialUpdateUrl(valid.assets[0].browser_download_url,'android'),true);
  assert.throws(()=>parseOfficialReleases('{broken','android'));
  assert.throws(()=>parseOfficialReleases('{}','android'));
});
test('startup is opt-in, concurrent checks coalesce, cache and notification dismissal survive restart', async () => {
  const r=rig(), controller=r.create(); await controller.initialize(); assert.equal(r.count(),0);
  await Promise.all([controller.check(),controller.check(),controller.check()]); assert.equal(r.count(),1);
  assert.equal(controller.getSnapshot().release?.version,'1.4.0');
  await controller.preferences({autoCheck:true,ignored:'1.4.0'});
  const next=r.create(); await next.initialize(); assert.equal(r.count(),1); assert.equal(next.getSnapshot().preferences.ignored,'1.4.0');
  await next.open(true); assert.match(r.opened[0],/RITVIO-Android-1\.4\.0\.apk$/);
  await next.preferences({previews:true}); assert.equal(next.getSnapshot().release?.version,'1.5.0');
  assert.equal(next.getSnapshot().preferences.ignored,'1.4.0');
});
test('automatic checks wait a day even after failure and errors retain the last good result', async () => {
  const r=rig(), controller=r.create(); await controller.initialize(); await controller.check(); await controller.preferences({autoCheck:true});
  r.advance(updateInterval); r.host.fetch=async()=>{throw Error('offline');};
  const next=r.create(); await next.initialize(); await next.check();
  assert.equal(next.getSnapshot().error,'connection'); assert.equal(next.getSnapshot().release?.version,'1.4.0');
  let attempted=0; r.host.fetch=async()=>{attempted++;return{status:200,body:'[]'};};
  r.advance(120_000); const again=r.create(); await again.initialize(); await again.check(true); assert.equal(attempted,0);
});
test('entity tags, rate-limit cooldown, manual backoff and invalid responses are bounded', async () => {
  const r=rig(), controller=r.create();await controller.initialize();await controller.check();
  let etag: string|undefined;r.host.fetch=async(value)=>{etag=value;return{status:304,body:''};};
  r.advance(31_000);await controller.check();assert.equal(etag,'"release-v1"');assert.equal(controller.getSnapshot().release?.version,'1.4.0');
  r.advance(31_000);r.host.fetch=async()=>({status:429,body:'',retryAt:9_999_999_999_999});await controller.check();
  const retry=controller.getSnapshot().retryAt;assert.ok(retry<=1_800_000_062_000+updateInterval);assert.equal(controller.getSnapshot().error,'limited');
  let requests=0;r.host.fetch=async()=>{requests++;return{status:200,body:'not json'};};await controller.check();assert.equal(requests,0);
  r.advance(updateInterval+1);await controller.check();assert.equal(controller.getSnapshot().error,'response');assert.equal(controller.getSnapshot().release?.version,'1.4.0');
});
test('corrupt persisted URLs cannot become update actions and failed preferences roll back', async () => {
  const r=rig({schema:1,autoCheck:false,previews:false,checkedAt:1_799_999_999_999,releases:[{version:'1.9.0',tag:'android-v1.9.0',url:'https://evil.test',download:'https://evil.test',notes:'x',preview:false}]}),controller=r.create();
  await controller.initialize();assert.equal(controller.getSnapshot().release,null);await controller.open(true);assert.deepEqual(r.opened,[]);
  r.host.write=async()=>{throw Error('disk full');};await controller.preferences({autoCheck:true});assert.equal(controller.getSnapshot().preferences.autoCheck,false);assert.equal(controller.getSnapshot().storageError,true);
});
test('read failures are retryable and an orphaned entity tag cannot trap future checks in 304', async () => {
  const r=rig({schema:1,etag:'"orphan"',checkedAt:null,releases:[]}),controller=r.create();
  const read=r.host.read;r.host.read=async()=>{throw Error('temporarily unavailable');};await controller.initialize();assert.equal(controller.getSnapshot().error,'storage');
  r.host.read=read;await controller.check();assert.equal(controller.getSnapshot().error,null);assert.equal(controller.getSnapshot().version,'1.3.1');
  r.response({status:304,body:''});await controller.check();assert.equal(controller.getSnapshot().error,'response');
  let etag:string|undefined='not called';r.host.fetch=async(value)=>{etag=value;return{status:200,body:JSON.stringify([release('1.4.0')])};};r.advance(61_000);await controller.check();assert.equal(etag,undefined);assert.equal(controller.getSnapshot().release?.version,'1.4.0');
});
