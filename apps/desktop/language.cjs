const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const manifest=require('./language-config.cjs');
const planned=manifest.languages.map(item=>item.code);
const valid=value=>value==='system'||planned.includes(value);
/** Main-process preference, independent of the player snapshot and renderer port. */
function createLanguagePreferences(directory,{systemLanguages,hasExistingProfile=false,available=manifest.available,onChange=()=>{}}){
 const filename=path.join(directory,'language-preference.json');let preference=hasExistingProfile?'it':'system',revision=0,lastSystem='',pending=Promise.resolve();
 const enabled=[...available];
 function snapshot(){const languages=systemLanguages().filter(value=>typeof value==='string'&&value.length>0&&value.length<=100).slice(0,20),signature=JSON.stringify(languages);if(signature!==lastSystem){lastSystem=signature;revision++;}return{schema:1,preference,systemLanguages:languages,revision};}
 async function persist(value){await fs.mkdir(directory,{recursive:true});const temporary=path.join(directory,`.language-${randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify({schema:1,preference:value})+'\n',{flag:'wx'});await fs.rename(temporary,filename);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}}
 const ready=(async()=>{let stored;try{if((await fs.stat(filename)).size<=4096)stored=JSON.parse(await fs.readFile(filename,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  if(stored?.schema===1&&valid(stored.preference))preference=stored.preference;else await persist(preference);
 })();
 void ready.catch(()=>{}); // Keep initialization failure observable to read(), not unhandled at startup.
 return{async read(){await ready;await pending.catch(()=>{});const before=revision,state=snapshot();if(state.revision!==before)onChange(state);return state;},write(value){if(!valid(value))return Promise.reject(Error('Invalid language preference'));if(value!=='system'&&!enabled.includes(value))return Promise.reject(Error('LANGUAGE_NOT_READY'));
  const work=pending.catch(()=>{}).then(async()=>{await ready;if(preference!==value){await persist(value);preference=value;revision++;}const state=snapshot();onChange(state);return state;});pending=work;return work;
 }};
}
module.exports={createLanguagePreferences};
