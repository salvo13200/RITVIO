import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedDownloads, readPublishedCatalog, releaseDownload} from '../packages/releases/catalog';
import {downloadTable,syncDownloads} from '../scripts/sync-downloads';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
function release(version:string,preview=false){
 const tag=`windows-v${version}`,url=`https://github.com/salvo13200/RITVIO/releases/download/${tag}/`;
 return{draft:false,prerelease:preview,tag_name:tag,html_url:`https://github.com/salvo13200/RITVIO/releases/tag/${tag}`,assets:[{name:`RITVIO-${version}-setup.exe`,browser_download_url:`${url}RITVIO-${version}-setup.exe`,size:100,state:'uploaded'},{name:`RITVIO-${version}-portatile.zip`,browser_download_url:`${url}RITVIO-${version}-portatile.zip`,size:200,state:'uploaded'}]};
}
test('public catalog supplies both official platforms and matching README tables',async()=>{
 assert.match(publishedDownloads.android.download,/android-v[\w.+-]+\/RITVIO-Android-[\w.+-]+\.apk$/);
 assert.match(publishedDownloads.windows.download,/windows-v[\w.+-]+\/RITVIO-[\w.+-]+-setup\.exe$/);
 assert.match(publishedDownloads.windows.portableZip!,/-portatile\.zip$/);
 for(const [name,language]of [['README.md','en'],['README.en.md','en'],['README.it.md','it']] as const){const source=await readFile(name,'utf8');assert.ok(source.includes(downloadTable(publishedDownloads,language)),name);}
 await syncDownloads(path.resolve('.'),true);
});
test('website prefers a real stable package over a newer optional preview',()=>{
 assert.equal(releaseDownload(JSON.stringify([release('1.0.0'),release('1.1.0',true)]),'windows')?.version,'1.0.0');
 assert.equal(releaseDownload(JSON.stringify([release('1.1.0',true)]),'windows')?.preview,true);
 assert.equal(releaseDownload(JSON.stringify([release('1.0.0')]),'android'),null);
});
test('portable links and release targets cannot escape the official repository or version',()=>{
 const raw=release('1.0.0');raw.assets[1].browser_download_url='https://example.org/untrusted.zip';
 const selected=releaseDownload(JSON.stringify([raw]),'windows');assert.equal(selected?.portableZip,undefined);assert.match(selected!.download,/RITVIO-1\.0\.0-setup\.exe$/);
 raw.assets[0].browser_download_url=raw.assets[0].browser_download_url.replace('1.0.0-setup','0.7.5-setup');assert.equal(releaseDownload(JSON.stringify([raw]),'windows'),null);
 assert.throws(()=>readPublishedCatalog({schema:1,verifiedAt:'2026-10-21',releases:[release('1.0.0')]}));
 assert.throws(()=>releaseDownload('{broken','windows'));
});
