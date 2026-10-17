import {readFile,readdir} from 'node:fs/promises';
import ts from 'typescript';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const manifest=await json('packages/i18n/manifest.json'),errors=[];
const tokens=value=>[...value.matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map(match=>match[1]).sort().join(',');
let checked=0;
for(const group of ['legacy','common','ui','native']){
 const original=await json(group==='legacy'?'packages/i18n/it.json':`packages/i18n/locales/it/${group}.json`);
 for(const language of manifest.available){const catalog=await json(group==='legacy'?`packages/i18n/${language}.json`:`packages/i18n/locales/${language}/${group}.json`);
  for(const [key,value]of Object.entries(original)){const translated=catalog[key];checked++;if(typeof translated!=='string'||!translated.trim())errors.push(`${language}/${group}: missing ${key}`);else if(tokens(value)!==tokens(translated))errors.push(`${language}/${group}: parameters differ for ${key}`);}
 }
}
const phrases=await json('packages/i18n/locales/it/ui.json');let calls=0;
for(const directory of ['apps/mobile/src','apps/client/src'])for(const name of await readdir(directory)){if(!/\.tsx?$/.test(name))continue;const file=directory+'/'+name,source=await readFile(file,'utf8'),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,name.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(sf)==='msg'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){calls++;if(!phrases[node.arguments[0].text])errors.push(`${file}: unknown phrase ${node.arguments[0].text}`);}ts.forEachChild(node,visit);}visit(sf);}
if(errors.length){for(const error of errors)console.error(error);process.exitCode=1;}else console.log(JSON.stringify({available:manifest.available,fallback:manifest.fallback,checkedEntries:checked,staticPhraseCalls:calls,missing:0,parameterMismatches:0}));
