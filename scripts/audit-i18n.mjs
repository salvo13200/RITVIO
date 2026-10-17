import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Read-only baseline, not an automatic translator. Candidate literals need human review.
const root=path.resolve(import.meta.dirname,'..');
const languageManifest=JSON.parse(await readFile(path.join(root,'packages/i18n/manifest.json'),'utf8'));
const languages=languageManifest.available;
const relative=file=>path.relative(root,file).split(path.sep).join('/');
async function json(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(file));else if(/\.(?:tsx?|kt|java|cjs|xml)$/.test(entry.name))result.push(file);}return result;}
const source=await json(path.join(root,'packages/i18n/it.json'));
if(!source||Array.isArray(source)||typeof source!=='object')throw Error('Italian source catalog missing or invalid');
const sourceKeys=Object.keys(source);
const placeholders=value=>[...new Set([...String(value).matchAll(/\{\{?(\w+)\}?\}/g)].map(match=>match[1]))].sort().join(',');
const catalogs=[];
for(const language of languages){
 const messages=await json(path.join(root,`packages/i18n/${language}.json`));
 const missing=sourceKeys.filter(key=>!messages||typeof messages[key]!=='string'||!messages[key].trim());
 const extra=messages?Object.keys(messages).filter(key=>!(key in source)&&!(/_(?:one|other)$/.test(key)&&key.replace(/_(?:one|other)$/,'') in source)):[];
 const invalidPlaceholders=messages?sourceKeys.filter(key=>typeof messages[key]==='string'&&placeholders(messages[key])!==placeholders(source[key])):[];
 catalogs.push({language,present:messages!==null,entries:messages?Object.keys(messages).length:0,missing,extra,invalidPlaceholders});
}
const surfaces=[];
const visibleAttributes=new Set(['aria-label','aria-description','placeholder','title','alt','label']);
for(const directory of ['apps/client/src','apps/mobile/src']){
 const references=[],dynamicReferences=[],literalCandidates=[];
 const sourceFiles=(await files(path.join(root,directory))).filter(file=>/\.(?:ts|tsx)$/.test(file));
 for(const file of sourceFiles){
  const text=await readFile(file,'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const location=node=>({file:relative(file),line:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1});
  const candidate=(node,value,kind)=>{const clean=value.replace(/\s+/g,' ').trim();if(/[\p{L}]/u.test(clean))literalCandidates.push({...location(node),kind,text:clean});};
  function visit(node){
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&node.arguments[0]){
    const key=node.arguments[0];if(ts.isStringLiteralLike(key))references.push({...location(node),key:key.text});else dynamicReferences.push({...location(node),expression:key.getText(tree)});
   }
   if(ts.isJsxText(node))candidate(node,node.text,'jsx-text');
   if(ts.isJsxAttribute(node)&&visibleAttributes.has(node.name.getText(tree))&&node.initializer&&ts.isStringLiteral(node.initializer))candidate(node,node.initializer.text,'jsx-attribute');
   ts.forEachChild(node,visit);
  }
  visit(tree);
 }
 surfaces.push({directory,sourceFiles:sourceFiles.length,staticTranslationReferences:references.length,distinctStaticKeys:new Set(references.map(item=>item.key)).size,unknownStaticKeys:references.filter(item=>!(item.key in source)),dynamicReferences,literalCandidates});
}
const nativeFiles=await files(path.join(root,'apps/mobile/android/app/src/main/java'));
const nativeCandidates=[];
for(const file of nativeFiles){const text=await readFile(file,'utf8');for(const [index,line] of text.split(/\r?\n/).entries()){
 if(/call\.reject\(|throw .*Exception\(|setContentTitle\(|setContentText\(/.test(line)&&/"[^"\r\n]*\s+[^"\r\n]*"/.test(line))nativeCandidates.push({file:relative(file),line:index+1,text:line.trim()});
}}
const legacyMobile=await json(path.join(root,'packages/i18n/mobile-it.json'));
const result={schema:1,sourceCatalog:'packages/i18n/it.json',targetLanguages:languages,sourceEntries:sourceKeys.length,legacyMobileEntries:legacyMobile?Object.keys(legacyMobile).length:0,catalogs,surfaces,nativeCandidates,
 limitations:['Literal candidates are a lower bound: expressions, templates, stored messages, Electron, API and Python need a separate audit.','Identical international terms or names are not automatically untranslated defects.','Catalog parity does not prove translation accuracy or complete UI coverage.','Current gate checks legacy flat desktop catalogs; namespace migration must update this checker.']};
const output=path.join(root,'data/analysis/i18n-current.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
const incomplete=catalogs.some(item=>item.missing.length||item.extra.length||item.invalidPlaceholders.length);
console.log(JSON.stringify({sourceEntries:result.sourceEntries,legacyMobileEntries:result.legacyMobileEntries,catalogs:catalogs.map(({language,present,entries,missing,extra,invalidPlaceholders})=>({language,present,entries,missing:missing.length,extra:extra.length,invalidPlaceholders:invalidPlaceholders.length})),surfaces:surfaces.map(({directory,sourceFiles,staticTranslationReferences,distinctStaticKeys,literalCandidates,unknownStaticKeys,dynamicReferences})=>({directory,sourceFiles,staticTranslationReferences,distinctStaticKeys,literalCandidates:literalCandidates.length,unknownStaticKeys:unknownStaticKeys.length,dynamicReferences:dynamicReferences.length})),nativeCandidates:nativeCandidates.length,report:relative(output),completeLegacyCatalogs:!incomplete}));
if(process.argv.includes('--check')&&incomplete)process.exitCode=1;
