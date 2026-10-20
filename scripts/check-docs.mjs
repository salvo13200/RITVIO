import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isPublicSource} from './public-source.mjs';
import {imageMetadataIssue} from './check-assets.mjs';
import showcase from './showcase-files.json' with {type:'json'};

const root=path.resolve(import.meta.dirname,'..');
const documentation=(await readdir(path.join(root,'docs'))).filter(name=>name.endsWith('.md')&&isPublicSource(`docs/${name}`)).sort();
const files=['README.md','README.en.md','README.it.md',...documentation.map(name=>`docs/${name}`),'docs/media/README.md'];
const problems=[];let links=0;
for(const name of files){
 const text=await readFile(path.join(root,name),'utf8'),body=text.replace(/```[\s\S]*?```/g,'');
 const targets=[...body.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match=>match[1]);
 targets.push(...[...body.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match=>match[1]));
 for(const target of targets){
  if(/^(?:https?:|mailto:)/.test(target))continue;
  const [file,anchor]=target.split('#'),resolved=path.resolve(root,path.dirname(name),decodeURIComponent(file||path.basename(name)));
  if(!resolved.startsWith(root+path.sep)){problems.push(`${name}: path escapes source root`);continue;}
  const relative=path.relative(root,resolved).replaceAll(path.sep,'/');links++;
  try{
   if(!(await stat(resolved)).isFile())throw Error('not a file');
   if(!isPublicSource(relative))problems.push(`${name}: link to excluded source: ${target}`);
   if(anchor&&relative.endsWith('.md')){
    const content=await readFile(resolved,'utf8');
    const headings=[...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match=>match[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-'));
    if(!headings.includes(anchor))problems.push(`${name}: missing heading ${target}`);
   }
  }catch{problems.push(`${name}: missing file ${target}`);}
 }
}
if(await readFile(path.join(root,'README.md'),'utf8')!==await readFile(path.join(root,'README.en.md'),'utf8'))problems.push('English README copies differ');
const inventory=JSON.parse(await readFile(path.join(root,'docs/media/manifest.json'),'utf8'));
if(showcase.views.some(view=>!/^(desktop|mobile|share-card)-[a-z-]+$/.test(view.name)))throw Error('Invalid showcase view name');
const expected=new Set(['banner.webp',...showcase.views.map(view=>`${view.name}.webp`)]);
if(inventory.schema!==1||inventory.language!=='en'||inventory.files.length!==expected.size)problems.push('Invalid presentation image inventory');
const gallery=await readFile(path.join(root,'docs/SCREENSHOTS.md'),'utf8');
let bytes=0;
for(const record of inventory.files){
 if(!/^[a-z][a-z-]*\.webp$/.test(record.file)||!expected.delete(record.file)){problems.push('Invalid or duplicate presentation image path');continue;}
 if(record.file!=='banner.webp'&&!gallery.includes(`media/${record.file}`))problems.push(`Gallery is missing the feature view: ${record.file}`);
 const data=await readFile(path.join(root,'docs/media',record.file));bytes+=data.length;
 const issue=imageMetadataIssue(data);if(issue)problems.push(`${record.file}: ${issue}`);
 if(record.bytes!==data.length||createHash('sha256').update(data).digest('hex')!==record.sha256)problems.push(`${record.file}: image inventory does not match bytes`);
}
if(expected.size)problems.push('Missing presentation image files');
if(bytes>6_000_000)problems.push('Presentation media exceed the 6 MB budget');
if(problems.length)throw Error(problems.join('\n'));
console.log(JSON.stringify({documents:files.length,localLinks:links,images:inventory.files.length,imageBytes:bytes,language:'en',metadata:'absent'}));
