import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { loadConfig, type Config } from './config';
import { Store, asMedia } from './store';
import { ResolverCatalog } from './catalog';
import { Resolver,type ContentResolver } from './resolver';
import { AppError } from './errors';
import {LocalIdentityProvider,type IdentityProvider} from './identity';
import {registerLibraryRoutes} from './library-routes';
import {registerSharingRoutes} from './sharing';
import {createAudioStreams,streamTicketPath} from './audio-stream';
import {registerLyricsRoutes} from './lyrics';
import {registerCatalogPages} from './catalog-pages';
import {registerActivity} from './activity';
import {registerMetadata} from './metadata';
import {registerTaste} from './taste';
import {registerPlaylistImport} from './playlist-import';
import {requestBudget} from './request-budget';
import {registerStoryArtwork} from './story-artwork';
import {registerHome} from './home';
import {registerSituations} from './situations';
export {playlistFilename} from '../../packages/domain/sharing';
export async function createApi(options: { config?: Config; root?: string; packagedRuntime?: Parameters<typeof loadConfig>[1]; resolver?: ContentResolver; devOrigin?: string; serveClient?: boolean;identityProvider?:IdentityProvider;rateLimitPerMinute?:number;streamFetch?:typeof fetch;artworkFetch?:typeof fetch;lyricsOptions?:Parameters<typeof registerLyricsRoutes>[3];metadataOptions?:Parameters<typeof registerMetadata>[4] } = {}) {
  const config = options.config ?? loadConfig(options.root,options.packagedRuntime);
  const store = new Store(config.database);
  const resolver = options.resolver ?? new Resolver(config);
  const catalog = new ResolverCatalog(config,store,resolver);
  const app = Fastify({ logger:false, bodyLimit:4096, requestIdHeader:false,ajv:{customOptions:{removeAdditional:false}} });
  const originAllowed = (origin: string) => origin === options.devOrigin || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) && origin === app.listeningOrigin;
  await app.register(cors, { origin(origin, cb) { cb(null,!origin || originAllowed(origin)); }, methods:['GET','POST','PUT','PATCH','DELETE'], allowedHeaders:['Authorization','Content-Type','If-Match','Range'] });
  const rates = new Map<string,{start:number,count:number}>();
  app.addHook('preHandler', async (request,reply) => {
    if (!request.url.startsWith('/v1/')) return;
    const origin = request.headers.origin;
    if (origin && !originAllowed(origin)) throw new AppError(403,'INVALID_ORIGIN','Origine non autorizzata.');
    if (request.url === '/v1/health') return;
    const received = Buffer.from(request.headers.authorization ?? ''); const expected = Buffer.from(`Bearer ${config.token}`);
    if (streamTicketPath.test(request.url)){
      if(request.method!=='GET'||!streams.authorized(request.url))throw new AppError(401,'EXPIRED_STREAM','Il flusso è scaduto. Riprendi il brano.');
    }else if (received.length !== expected.length || !timingSafeEqual(received,expected)) throw new AppError(401,'UNAUTHORIZED','Sessione locale scaduta. Riavvia l’app.');
    const budget=requestBudget(request.method,request.url);
    if(budget==='essential')return;
    const now = Date.now(),key=`${request.ip}:${budget}`;let rate=rates.get(key);
    if (!rate || now-rate.start>=60000) { rate={start:now,count:0}; rates.set(key,rate); }
    const limit=options.rateLimitPerMinute??(budget==='local'?360:90);
    if (++rate.count>limit){const wait=Math.max(1,Math.ceil((rate.start+60000-now)/1000));reply.header('Retry-After',wait);throw new AppError(429,'RATE_LIMIT','Richieste troppo ravvicinate. Attendi prima di riprovare.',new Date(rate.start+60000).toISOString());}
  });
  app.setErrorHandler((error,request,reply) => {
    const known = error instanceof AppError;
    const validation = typeof error === 'object' && error !== null && ('validation' in error || (error as {code?:string}).code==='FST_ERR_CTP_INVALID_JSON_BODY');
    const tooLarge=(error as {code?:string}).code==='FST_ERR_CTP_BODY_TOO_LARGE';
    reply.code(known?error.status:tooLarge?413:validation?400:500).send({error:{code:known?error.code:tooLarge?'REQUEST_TOO_LARGE':validation?'INVALID_REQUEST':'INTERNAL_ERROR',message:known?error.message:tooLarge?'Il contenuto è troppo grande. Scegli un file o un’immagine più piccoli.':validation?'Richiesta non valida.':'Si è verificato un errore. Riprova.',requestId:request.id,...(known && error.retryAt?{retryAt:error.retryAt}:{})}});
  });
  const streams=createAudioStreams(app,options.streamFetch);
  app.get('/v1/health',async () => ({status:'ok'}));
  const identity=options.identityProvider??new LocalIdentityProvider(store.library);
  registerLibraryRoutes(app,store,identity);
  registerSharingRoutes(app,store,identity);
  registerStoryArtwork(app,store,options.artworkFetch);
  const home=registerHome(app,store,resolver);
  registerSituations(app,store,resolver);
  const playlistImports=registerPlaylistImport(app,store,resolver,identity);
  registerLyricsRoutes(app,store,identity,options.lyricsOptions);
  registerCatalogPages(app,store,resolver,identity);
  const activity=registerActivity(app,store,identity);
  registerMetadata(app,store,resolver,identity,options.metadataOptions);
  const taste=registerTaste(app,store,identity,activity,catalog);
  app.get('/v1/runtime',async () => ({catalogProvider:'youtube-music',playbackProvider:'youtube',resolverInstalled:await resolver.installed()}));
  app.get<{Querystring:{q:string;cursor?:string;type?:string;provider?:string}}>('/v1/search',{
    schema:{querystring:{type:'object',additionalProperties:false,required:['q'],properties:{q:{type:'string',minLength:3,maxLength:200},cursor:{type:'string',maxLength:4096},type:{type:'string',enum:['track']},provider:{type:'string',enum:['youtube']}}}},
  },async request => {
    const result=await catalog.search(request.query.q,request.query.cursor);
    return {...result,items:result.items.map(asMedia)};
  });
  app.get<{Params:{mediaId:string}}>('/v1/media/:mediaId',async request => {
    const track=store.getTrack(request.params.mediaId);
    if (!track) throw new AppError(404,'MEDIA_NOT_FOUND','Brano non presente nella cache. Apri nuovamente il link.');
    return asMedia(track);
  });
  app.post<{Body:{videoId:string}}>('/v1/links/resolve',{
    schema:{body:{type:'object',additionalProperties:false,required:['videoId'],properties:{videoId:{type:'string',pattern:'^[A-Za-z0-9_-]{11}$'}}}},
  },async (request,reply) => {
    const controller=new AbortController(),abort=()=>{if(!reply.raw.writableEnded)controller.abort();};reply.raw.once('close',abort);
    try{const resolved=await resolver.resolve(request.body.videoId,false,{signal:controller.signal});store.saveTrack(resolved.track);return asMedia(resolved.track);}
    finally{reply.raw.removeListener('close',abort);}
  });
  app.get('/v1/playback/diagnostics',async()=>resolver.diagnostics?.()??{available:false});
  app.post<{Params:{mediaId:string};Querystring:{fresh?:string;prepare?:string}}>('/v1/media/:mediaId/playback',{
    schema:{querystring:{type:'object',additionalProperties:false,properties:{fresh:{type:'string',enum:['true']},prepare:{type:'string',enum:['true']}}}},
  },async (request,reply) => {
    const track=store.getTrack(request.params.mediaId);
    if (!track) throw new AppError(404,'MEDIA_NOT_FOUND','Questo brano non è più nella cache. Apri nuovamente il link.');
    const controller=new AbortController();const abort=()=>{if(!reply.raw.writableEnded)controller.abort();};
    reply.raw.once('close',abort);
    try{return streams.issue((await resolver.resolve(track.videoId,request.query.fresh==='true',{priority:request.query.prepare==='true'?'prefetch':'foreground',signal:controller.signal})).playback);}
    finally{reply.raw.removeListener('close',abort);}
  });
  if (options.serveClient) {
    app.addHook('onSend', async (_request,reply) => {
      reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com https://*.ytimg.com https://yt3.googleusercontent.com https://lh3.googleusercontent.com data: blob:; media-src 'self' https://*.googlevideo.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      reply.header('X-Content-Type-Options','nosniff'); reply.header('Referrer-Policy','no-referrer');
    });
    await app.register(staticFiles,{root:path.join(config.root,'dist/client')});
    app.setNotFoundHandler((req,reply) => req.url.startsWith('/v1/')?reply.code(404).send({error:{code:'NOT_FOUND',message:'Funzione non disponibile in questa fase.',requestId:randomUUID()}}):reply.sendFile('index.html'));
  }
  app.addHook('preClose',async()=>resolver.close?.());
  app.addHook('onClose',async () => {await playlistImports.close();store.close();});
  return {app,config,store,activity,taste,home};
}
