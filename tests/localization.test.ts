import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createLocalization} from '../packages/i18n/runtime';
import {connectLanguageHost,type LanguageHost} from '../packages/i18n/host';
import {availableLanguages,resolveLanguage,normalizeLanguage,parseHostState,languageCodes,type LanguageHostState} from '../packages/i18n/languages';
import {t,messages,type MessageKey} from '../packages/i18n';
const {createLanguagePreferences}=createRequire(import.meta.url)('../apps/desktop/language.cjs');
const resources=Object.fromEntries(languageCodes.map((language,index)=>[language,{common:{title:['Lingua','Language','Idioma','Langue','Sprache'][index],items_one:'{{count}} item',items_other:'{{count}} items',interpolation:'{{name}}'}}]));
const runtime=()=>createLocalization({resources,available:languageCodes,fallback:'en'});
const state=(preference:LanguageHostState['preference'],revision:number):LanguageHostState=>({schema:1,preference,revision,systemLanguages:['fr-CA','it-IT']});
async function temporary(action:(directory:string)=>Promise<void>){const directory=await mkdtemp(path.join(os.tmpdir(),'ritvio-language-'));try{await action(directory);}finally{const resolved=path.resolve(directory),parent=path.resolve(os.tmpdir())+path.sep;assert.ok(resolved.startsWith(parent)&&path.basename(resolved).startsWith('ritvio-language-'));await rm(resolved,{recursive:true,force:true});}}

test('all 1048 legacy Italian messages retain interpolation, including missing and HTML-like parameters',()=>{
 for(const key of Object.keys(messages) as MessageKey[])for(const value of ['<Luna & Marea>','{artist} $&',null,42]){
  const params:Record<string,unknown>={};for(const match of messages[key].matchAll(/\{(\w+)\}/g))params[match[1]]=value;
  const expected=messages[key].replace(/\{(\w+)\}/g,(_match,name)=>String(params[name]??'{'+name+'}'));
  assert.equal(t(key,params),expected,key);
 }
});
test('language matching handles regional variants, ordered preferences and unreleased languages',()=>{
 assert.equal(normalizeLanguage('FR_ca'),'fr');assert.equal(normalizeLanguage('bad??'),null);
 assert.equal(resolveLanguage('system',['ja-JP','fr-CA','de-DE'],languageCodes,'en'),'fr');
 assert.equal(resolveLanguage('system',['en-US','it-CH'],availableLanguages,'it'),'en');
 assert.equal(resolveLanguage('de',['de-DE'],availableLanguages,'it'),'it');
 assert.equal(resolveLanguage('system',['ja'],languageCodes,'en'),'en');
 assert.throws(()=>resolveLanguage('system',[],[],'it'));
});
test('runtime updates reactively, preserves regional formatting, pluralizes and keeps stable snapshots',async()=>{
 const current=runtime(),original=current.getSnapshot();let changes=0;const stop=current.subscribe(()=>changes++);
 await current.apply('system',['fr-CA']);assert.equal(current.getSnapshot().language,'fr');assert.equal(current.getSnapshot().locale,'fr-CA');assert.equal(current.engine.t('title'),'Langue');
 assert.equal(current.engine.t('items',{count:2}),'2 items');assert.equal(current.engine.t('interpolation',{name:'<artista>'}),'<artista>');
 const settled=current.getSnapshot();await current.apply('system',['fr-CA']);assert.equal(current.getSnapshot(),settled);assert.equal(changes,1);assert.equal(original.language,'it');assert.ok(Object.isFrozen(settled));stop();
 await current.apply('de',[]);assert.equal(changes,1);assert.equal(current.engine.t('title'),'Sprache');
});
test('rapid locale requests are serialized without losing the last request',async()=>{
 const current=runtime();await Promise.all([current.apply('fr',[]),current.apply('de',[]),current.apply('en',[])]);assert.equal(current.getSnapshot().language,'en');assert.equal(current.engine.language,'en');
});
test('host events arriving before the initial read cannot be replaced by an older read',async()=>{
 const current=runtime();let receive:(value:unknown)=>void=()=>{},complete:(value:unknown)=>void=()=>{};
 const host:LanguageHost={read:()=>new Promise(resolve=>complete=resolve),write:async()=>state('en',3),subscribe(listener){receive=listener;return()=>{};}};
 const controller=connectLanguageHost(current,host);receive(state('de',2));complete(state('it',1));await controller.ready;assert.equal(current.getSnapshot().language,'de');
 await controller.setPreference('en');assert.equal(current.getSnapshot().language,'en');receive(state('it',2));await new Promise(resolve=>setImmediate(resolve));assert.equal(current.getSnapshot().language,'en');controller.dispose();
});
test('failed persistence leaves the active language unchanged and allows a retry',async()=>{
 const current=runtime();let fail=true;const host:LanguageHost={read:async()=>state('it',1),write:async()=>{if(fail)throw Error('disk full');return state('fr',2);},subscribe:()=>()=>{}};
 const controller=connectLanguageHost(current,host);await controller.ready;await assert.rejects(controller.setPreference('fr'),/disk full/);assert.equal(current.getSnapshot().language,'it');fail=false;await controller.setPreference('fr');assert.equal(current.getSnapshot().language,'fr');controller.dispose();
});
test('unreleased language is rejected before touching host storage',async()=>{
 const current=createLocalization({resources:{it:resources.it},available:['it'],fallback:'it'});let writes=0;const host:LanguageHost={read:async()=>state('it',1),write:async()=>{writes++;return state('en',2);},subscribe:()=>()=>{}};
 const controller=connectLanguageHost(current,host);await controller.ready;await assert.rejects(controller.setPreference('en'),/LANGUAGE_NOT_READY/);assert.equal(writes,0);assert.equal(current.engine.language,'it');controller.dispose();
});
test('disposing the host connection cancels subscriptions and ignores a pending read',async()=>{
 const current=runtime();let complete:(value:unknown)=>void=()=>{},stops=0;const controller=connectLanguageHost(current,{read:()=>new Promise(resolve=>complete=resolve),write:async()=>state('de',1),subscribe:()=>()=>{stops++;}});
 controller.dispose();controller.dispose();complete(state('de',1));await controller.ready;assert.equal(stops,1);assert.equal(current.getSnapshot().language,'it');await assert.rejects(controller.setPreference('en'),/disposed/);
});
test('invalid host payloads cannot become user preferences',()=>{
 for(const input of [null,{},state('it',-1),{...state('it',1),preference:'../../en'},{...state('it',1),systemLanguages:[7]}])assert.equal(parseHostState(input),null);
});
test('desktop preserves existing Italian profiles, saves separately and restores after reopening',async()=>temporary(async directory=>{
 await writeFile(path.join(directory,'player-state.json'),'{"queue":["keep"],"playing":true}');const prefs=createLanguagePreferences(directory,{systemLanguages:()=>['de-DE'],hasExistingProfile:true});
 assert.equal((await prefs.read()).preference,'it');await prefs.write('system');const next=createLanguagePreferences(directory,{systemLanguages:()=>['fr-CA'],hasExistingProfile:true});assert.equal((await next.read()).preference,'system');assert.equal(await readFile(path.join(directory,'player-state.json'),'utf8'),'{"queue":["keep"],"playing":true}');
}));
test('desktop serializes concurrent writes, broadcasts monotonically and rejects unknown or unreleased choices',async()=>temporary(async directory=>{
 const events:LanguageHostState[]=[];const prefs=createLanguagePreferences(directory,{systemLanguages:()=>['en-GB'],onChange:(value:LanguageHostState)=>events.push(value)});assert.equal((await prefs.read()).preference,'system');events.length=0;
 await Promise.all([prefs.write('it'),prefs.write('system'),prefs.write('it')]);assert.equal((await prefs.read()).preference,'it');assert.deepEqual(events.map(item=>item.preference),['it','system','it']);assert.ok(events[2].revision>events[1].revision);
 await assert.rejects(prefs.write('fr'),/LANGUAGE_NOT_READY/);await assert.rejects(prefs.write('../fr'),/Invalid/);assert.equal(JSON.parse(await readFile(path.join(directory,'language-preference.json'),'utf8')).preference,'it');
}));
test('corrupt desktop preference recovers without touching player data',async()=>temporary(async directory=>{
 await writeFile(path.join(directory,'language-preference.json'),'{broken');await writeFile(path.join(directory,'player-state.json'),'original');const prefs=createLanguagePreferences(directory,{systemLanguages:()=>['en'],hasExistingProfile:true});assert.equal((await prefs.read()).preference,'it');assert.equal(await readFile(path.join(directory,'player-state.json'),'utf8'),'original');
}));
test('failed desktop file replacement keeps the previous state and removes its temporary file',async()=>temporary(async directory=>{
 const prefs=createLanguagePreferences(directory,{systemLanguages:()=>['it']});await prefs.read();await rm(path.join(directory,'language-preference.json'));await mkdir(path.join(directory,'language-preference.json'));await assert.rejects(prefs.write('it'));assert.equal((await prefs.read()).preference,'system');assert.equal((await readdir(directory)).filter(name=>name.startsWith('.language-')).length,0);
}));
