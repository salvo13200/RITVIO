import {Resolver} from '../apps/api/resolver';
import {loadConfig} from '../apps/api/config';
import {playlistLink} from '../packages/domain/playlist-import';
const link=playlistLink(process.argv[2]??'https://music.youtube.com/playlist?list=OLAK5uy_kNhM2yaBTOVwrcZJepB1C9P3-n5_Sfy5c');
try{
  // No Store or personal database is opened by this metadata-only probe.
  const preview=await new Resolver(loadConfig()).playlistPreview(link.id,new AbortController().signal,provider=>console.log(JSON.stringify({phase:provider})));
  console.log(JSON.stringify({id:preview.id,title:preview.title,provider:preview.provider,count:preview.entries.length,available:preview.entries.filter(e=>e.track).length,reportedCount:preview.reportedCount,partial:preview.partial,truncated:preview.truncated,metadataOnly:true}));
  if(!preview.entries.some(e=>e.track))process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
