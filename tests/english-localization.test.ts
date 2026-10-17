import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalization} from '../packages/i18n/runtime';
import {resources} from '../packages/i18n/resources-desktop';
import {phraseTranslator} from '../packages/i18n/phrases';
import {noticeTranslator} from '../packages/i18n/notices';
import {createRequire} from 'node:module';
test('English UI translates complete messages without changing interpolated song metadata',async()=>{
 const runtime=createLocalization({resources}),msg=phraseTranslator(runtime);await runtime.apply('en',['it-IT']);
 assert.equal(msg('Riproduci {p0}',{p0:'Luna {p1} & Marea'}),'Play Luna {p1} & Marea');
 assert.equal(msg('Brani'),'Tracks');assert.equal(msg('Artisti'),'Artists');assert.equal(runtime.getSnapshot().locale,'en-GB');
 assert.equal(runtime.engine.t('next',{ns:'legacy'}),'Next track');assert.equal(runtime.engine.t('language.title'),'Language');
 await runtime.apply('it',[]);assert.equal(msg('Brani'),'Brani');assert.equal(msg('I tuoi artisti, qui'),'I tuoi artisti, qui');
});
test('stored Italian errors and parameterised notices can be displayed in the active language',async()=>{
 const runtime=createLocalization({resources}),notice=noticeTranslator(runtime);await runtime.apply('en',[]);
 assert.equal(notice('Il flusso audio non è disponibile. Riprova o scegli un altro brano.'),'The audio stream is unavailable. Try again or choose another track.');
 assert.equal(notice('Immagine salvata in Galleria · RITVIO.'),'Image saved to Gallery · RITVIO.');
 assert.equal(notice('My own playlist {title}'),'My own playlist {title}');
 await runtime.apply('it',[]);assert.equal(notice('Attendi la lettura precedente.'),'Attendi la lettura precedente.');
});
test('native desktop dialogs use the same English catalog and system fallback',()=>{
 const {nativeText}=createRequire(import.meta.url)('../apps/desktop/native-text.cjs');
 assert.equal(nativeText('Salva immagine',{preference:'en'}),'Save image');assert.equal(nativeText('Salva immagine',{preference:'it'}),'Salva immagine');
 assert.equal(nativeText('Esporta playlist RITVIO',{preference:'system',systemLanguages:['de-DE','en-US']}),'Export RITVIO playlist');
 assert.equal(nativeText('Salva immagine',{preference:'system',systemLanguages:['it-CH','en-US']}),'Salva immagine');
});
