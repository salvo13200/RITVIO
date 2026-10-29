import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishedDownloads,type DownloadCatalog} from '../packages/releases/catalog';

export function downloadTable(catalog:DownloadCatalog,language:'en'|'it'){
 const {android:a,windows:w,ios}=catalog;
 if(language==='it')return ['| Piattaforma | Download |','| --- | --- |',`| Windows 10/11 x64 | [Installer](${w.download})${w.portableZip?` · [ZIP da estrarre una volta](${w.portableZip})`:''}${w.portableExe?` · [EXE autoestraente](${w.portableExe})`:''} |`,`| Android 7.0+ ARM64/x86_64 | [APK firmata](${a.download}) |`,...(ios?[`| iOS 15+ · beta | [IPA da firmare con Sideloadly](${ios.download}) · [Guida iOS](docs/IOS.md) |`]:[])].join('\n');
 return ['| Platform | Package | Get it |','| --- | --- | --- |',`| Windows 10/11 · x64 | Per-user installer | [Download Setup EXE](${w.download}) |`,...(w.portableZip?[`| Windows 10/11 · x64 | Portable ZIP · extract once | [Download portable ZIP](${w.portableZip}) |`]:[]),...(w.portableExe?[`| Windows 10/11 · x64 | Self-extracting portable EXE | [Download portable EXE](${w.portableExe}) |`]:[]),`| Android 7.0+ · ARM64 / x86_64 | Signed APK | [Download Android APK](${a.download}) |`,...(ios?[`| iOS 15+ · beta | IPA · personal signing required | [Download iOS beta IPA](${ios.download}) · [Installation guide](docs/IOS.md) |`]:[])].join('\n');
}
export async function syncDownloads(root:string,check:boolean){
 for(const [name,language]of [['README.md','en'],['README.en.md','en'],['README.it.md','it']] as const){
  const file=path.join(root,name),source=await readFile(file,'utf8');
  const generated=`<!-- downloads:start -->\n${downloadTable(publishedDownloads,language)}\n<!-- downloads:end -->`;
  const marked=/<!-- downloads:start -->[\s\S]*?<!-- downloads:end -->/;
  const legacy=/\| (?:Platform \| Package \| Get it|Piattaforma \| Download) \|\r?\n(?:\|[^\n]*\|\r?\n?)+/;
  if(!marked.test(source)&&!legacy.test(source))throw Error(`Download table not found: ${name}`);
  const expected=source.replace(marked.test(source)?marked:legacy,generated+(marked.test(source)?'':'\n'));
  if(source===expected)continue;
  if(check)throw Error(`Stale download links: ${name}. Run pnpm downloads:sync.`);
  await writeFile(file,expected);
 }
 console.log(`Official download snapshot and three README tables ${check?'verified':'synchronized'}.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await syncDownloads(path.resolve(import.meta.dirname,'..'),process.argv.includes('--check'));
