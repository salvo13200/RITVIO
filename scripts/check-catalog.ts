import {createApi} from '../apps/api/server';
const {app,config}=await createApi();
try{
  const headers={authorization:`Bearer ${config.token}`};
  const url=`/v1/search?q=${encodeURIComponent(process.argv[2]||'Daft Punk Get Lucky')}`;
  const response=await app.inject({url,headers});const result=response.json();
  if(response.statusCode!==200)throw Error(result.error.message);
  const cached=(await app.inject({url,headers})).json();
  console.log(JSON.stringify({provider:'youtube-music',keyRequired:false,count:result.items.length,first:result.items[0],hasNext:result.nextCursor!==null,cacheHit:cached.cache.hit},null,2));
  if(!result.items.length||!result.items[0].creatorName||!result.items[0].durationSeconds||!cached.cache.hit)process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
finally{await app.close();}
