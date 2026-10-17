const path=require('node:path');
const fs=require('node:fs/promises');
const {DatabaseSync,backup}=require('node:sqlite');
const legacyName='SPOTYFREE';
/** One-way copy, never moves or modifies the user's previous installation. */
async function migrateLegacyProfile(appData,destination){
  const source=path.join(appData,legacyName),marker=path.join(destination,'legacy-migration.json'),pending=path.join(destination,'legacy-migration.pending.json');
  const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
  if(await exists(marker)||(!await exists(pending)&&(await exists(path.join(destination,'cache/mvp.sqlite'))||await exists(path.join(destination,'player-state.json')))))return false;
  const database=path.join(source,'cache/mvp.sqlite');if(!await exists(database))return false;
  await fs.mkdir(path.join(destination,'cache'),{recursive:true});
  await fs.writeFile(pending,JSON.stringify({source:legacyName,version:1}));
  const temporary=path.join(destination,'cache/migration.sqlite');let db;
  try{
    let player=null;if(await exists(path.join(source,'player-state.json'))){player=await fs.readFile(path.join(source,'player-state.json'),'utf8');if(player.length>2000000)throw Error('Stato precedente troppo grande');JSON.parse(player);}
    if(!await exists(path.join(destination,'cache/mvp.sqlite'))){db=new DatabaseSync(database,{readOnly:true});await backup(db,temporary);db.close();db=null;await fs.rename(temporary,path.join(destination,'cache/mvp.sqlite'));}
    if(player&&!await exists(path.join(destination,'player-state.json')))await fs.writeFile(path.join(destination,'player-state.json'),player,{flag:'wx'});
    await fs.writeFile(marker,JSON.stringify({source:legacyName,copiedAt:new Date().toISOString(),version:1}));await fs.rm(pending,{force:true});return true;
  }finally{db?.close();await fs.rm(temporary,{force:true});}
}
module.exports={migrateLegacyProfile};
