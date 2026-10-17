import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = (extra = {}) => ({ type: 'string', ...extra });
const integer = (extra = {}) => ({ type: 'integer', ...extra });
const boolean = { type: 'boolean' };
const uuid = string({ format: 'uuid' });
const date = string({ format: 'date-time' });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const array = (items, maxItems = 1000) => ({ type: 'array', items, maxItems });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, required,
});
const text = (maxLength = 255, minLength = 1) => string({ minLength, maxLength });
const provider = string({ enum: ['audius', 'youtube'], default: 'youtube' });
const kind = string({ enum: ['track', 'artist', 'album', 'playlist'] });
const visibility = string({ enum: ['private', 'public'], default: 'private' });
const repeat = string({ enum: ['off', 'playlist', 'track'] });
const page = (name) => object({ items: array(ref(name), 50), nextCursor: nullable(text(2048)) });

const schemas = {
  Error: object({ error: object({
    code: text(80), message: text(1000), retryAt: nullable(date), requestId: text(100),
  }, ['code', 'message', 'requestId']) }),
  Health: object({ status: string({ enum: ['ok'] }) }),
  Runtime: object({ catalogProvider: string({const:'youtube-music'}), playbackProvider: string({const:'youtube'}), resolverInstalled: boolean }),
  ResolveLink: object({ videoId: string({ pattern: '^[A-Za-z0-9_-]{11}$' }) }),
  CacheInfo: object({ hit: boolean, fetchedAt: date, expiresAt: date, degraded: boolean }),
  License: object({ name: nullable(text(255)), url: nullable(string({ format: 'uri' })), attribution: nullable(text(2000)) }),
  Media: object({
    id: uuid, provider, externalId: text(), kind, title: text(1000),
    creatorName: nullable(text(1000)), artworkUrl: nullable(string({ format: 'uri' })),
    canonicalUrl: string({ format: 'uri' }), durationSeconds: nullable(integer({ minimum: 0 })),
    license: ref('License'), expiresAt: date,
  }),
  SearchResponse: object({ items: array(ref('Media'), 50), nextCursor: nullable(text(2048)), cache: ref('CacheInfo') }),
  Capabilities: object({ background: boolean, seek: boolean, volume: boolean, equalizer: boolean, offline: boolean }),
  AudioPlayback: object({
    mode: string({ const: 'audio-stream' }), provider: string({ const: 'audius' }),
    url: string({ format: 'uri', pattern: '^https://' }), expiresAt: date,
    capabilities: ref('Capabilities'), attribution: ref('License'),
  }),
  YouTubePlayback: object({
    mode: string({ const: 'youtube-iframe' }), provider: string({ const: 'youtube' }),
    videoId: string({ pattern: '^[A-Za-z0-9_-]{11}$' }),
    capabilities: object({
      background: { const: false, type: 'boolean' }, seek: boolean, volume: boolean,
      equalizer: { const: false, type: 'boolean' }, offline: { const: false, type: 'boolean' },
    }),
  }),
  ResolverYouTubePlayback: {
    ...object({
      mode: string({ const: 'youtube-audio-resolver' }),
      provider: string({ const: 'youtube' }),
      accessMethod: string({ const: 'unofficial-extraction' }),
      videoId: string({ pattern: '^[A-Za-z0-9_-]{11}$' }),
      url: string({ pattern: '^/v1/stream/[a-f0-9]{64}$' }), expiresAt: date,
      capabilities: object({
        background: boolean, seek: boolean, volume: boolean, equalizer: boolean,
        offline: { const: false, type: 'boolean' },
      }),
    }),
    description: 'Resolver principale non ufficiale. URL temporaneo; capacità dipendenti dal player e dalla piattaforma. Non implica autorizzazione YouTube o licenza del contenuto.',
  },
  PlaybackDescriptor: { oneOf: [ref('AudioPlayback'), ref('YouTubePlayback'), ref('ResolverYouTubePlayback')] },
  CatalogResource: object({ media: ref('Media'), tracks: array(ref('Media'), 50), nextCursor: nullable(text(2048)) }),
  Genre: object({ id: text(100), label: text(100) }),
  Genres: object({ items: array(ref('Genre'), 100) }),
  Register: object({ email: string({ format: 'email', maxLength: 254 }), password: text(128, 12), displayName: text(80) }),
  Login: object({ email: string({ format: 'email', maxLength: 254 }), password: text(128) }),
  Session: object({ token: text(1024), expiresAt: date, user: ref('Profile') }),
  OAuthStart: object({ url: string({ format: 'uri' }) }),
  OAuthExchange: object({ code: text(1024), verifier: text(128, 43) }),
  Profile: object({ id: uuid, email: string({ format: 'email' }), displayName: text(80), avatarKey: nullable(text(255)), historyEnabled: boolean }),
  ProfileUpdate: { ...object({ displayName: text(80), avatarKey: nullable(text()), historyEnabled: boolean }, []), minProperties: 1 },
  PublicProfile: object({ id: uuid, displayName: text(80), avatarKey: nullable(text()) }),
  PlaylistItem: object({ itemId: uuid, mediaId: uuid, position: integer({ minimum: 0, maximum: 999 }) }),
  Playlist: object({
    id: uuid, ownerId: uuid, name: text(100), description: text(2000, 0), visibility,
    coverKey: nullable(text()), revision: integer({ minimum: 1 }), items: array(ref('PlaylistItem')),
  }),
  PlaylistCreate: object({ name: text(100), description: text(2000, 0), visibility, coverKey: nullable(text()) }, ['name']),
  PlaylistUpdate: { ...object({ name: text(100), description: text(2000, 0), visibility, coverKey: nullable(text()) }, []), minProperties: 1 },
  AddItem: object({ itemId: uuid, mediaId: uuid }),
  Order: object({ itemIds: { ...array(uuid), uniqueItems: true } }),
  Revision: object({ revision: integer({ minimum: 1 }) }),
  HistoryEvent: object({ eventId: uuid, mediaId: uuid, startedAt: date, listenedSeconds: integer({ minimum: 0, maximum: 86400 }) }),
  QueueItem: object({ itemId: uuid, mediaId: uuid }),
  PlaybackState: object({
    queue: array(ref('QueueItem')), currentItemId: nullable(uuid),
    positionSeconds: { type: 'number', minimum: 0, exclusiveMaximum: 86400 },
    shuffle: boolean, repeat, volume: integer({ minimum: 0, maximum: 100 }), muted: boolean,
    revision: integer({ minimum: 1 }),
  }),
  PlaybackUpdate: object({
    queue: array(ref('QueueItem')), currentItemId: nullable(uuid),
    positionSeconds: { type: 'number', minimum: 0, exclusiveMaximum: 86400 },
    shuffle: boolean, repeat, volume: integer({ minimum: 0, maximum: 100 }), muted: boolean,
  }),
  Home: object({ recent: array(ref('Media'), 20), liked: array(ref('Media'), 20), dailyMixes: array(ref('Mix'), 10) }),
  Mix: object({ id: text(100), title: text(100), tracks: array(ref('Media'), 50) }),
  ImportRequest: object({ url: string({ format: 'uri', maxLength: 2048 }) }),
  ImportPreview: object({ resource: ref('Media'), tracks: array(ref('Media'), 50), nextCursor: nullable(text(2048)) }),
  ShareCreate: { oneOf: [object({ playlistId: uuid }), object({ mediaId: uuid })] },
  Share: object({ token: text(100), path: text(200), expiresAt: nullable(date) }),
  SharePreview: { oneOf: [object({ playlist: ref('Playlist') }), object({ media: ref('Media') })] },
  Member: object({ userId: uuid, role: string({ enum: ['viewer', 'editor'] }) }),
  MemberUpdate: object({ role: string({ enum: ['viewer', 'editor'] }) }),
  MemberList: object({ items: array(ref('Member'), 100) }),
  PlaylistEvent: object({ playlistId: uuid, revision: integer({ minimum: 1 }), operation: text(80) }),
  Image: object({ key: text(255) }),
};
schemas.MediaPage = page('Media');
schemas.PlaylistPage = page('Playlist');
schemas.HistoryPage = page('HistoryEvent');

const query = (name, schema, required = false) => ({ name, in: 'query', required, schema });
const pagination = [query('cursor', text(2048)), query('limit', integer({ minimum: 1, maximum: 50, default: 20 }))];
const revisionHeader = { name: 'If-Match', in: 'header', required: true, schema: string({ pattern: '^"[1-9][0-9]*"$' }) };
const json = (schema) => ({ 'application/json': { schema } });
const result = (schema, description = 'Operazione completata') => ({ description, content: json(schema) });
const paths = {};
const standardErrors = {
  400: 'Input non valido', 401: 'Sessione assente o scaduta', 403: 'Operazione non consentita',
  404: 'Risorsa assente o non leggibile', 413:'File o immagine oltre il limite',429: 'Rate limit o quota provider', 503: 'Provider non disponibile o disattivato',
  500: 'Errore interno sanitizzato', 502: 'Risoluzione upstream fallita', 504: 'Timeout upstream',
};

function route(method, path, operationId, phase, summary, options = {}) {
  const parameters = [...(options.parameters ?? [])];
  for (const [, name] of path.matchAll(/\{([^}]+)\}/g)) {
    const schema = name === 'provider' ? provider : name === 'kind' ? kind
      : name === 'externalId' || name === 'token' ? text(255) : uuid;
    parameters.push({ name, in: 'path', required: true, schema:options.pathSchemas?.[name]??schema });
  }
  if (options.revision) parameters.push(revisionHeader);
  const responses = {};
  const status = options.status ?? (options.response ? 200 : 204);
  responses[status] = options.response ? result(ref(options.response)) : { description: 'Operazione completata, nessun contenuto' };
  for (const [code, description] of Object.entries(standardErrors)) responses[code] = result(ref('Error'), description);
  if (options.revision) {
    responses[409] = result(ref('Error'), 'Revisione in conflitto');
    responses[428] = result(ref('Error'), 'If-Match richiesto');
  }
  if (options.redirect) {
    delete responses[204];
    responses[302] = { description: 'Ritorno al client con codice monouso legato al verifier', headers: { Location: { schema: string({ format: 'uri' }) } } };
  }
  if (options.sse) responses[200] = {
    description: 'Eventi SSE: data contiene JSON PlaylistEvent. Permessi ricontrollati durante lo stream.',
    content: { 'text/event-stream': { schema: string() } },
  };
  if (options.multipart) {
    responses[413] = result(ref('Error'), 'Immagine oltre 5 MB');
  }
  const operation = {
    operationId, summary, tags: [`Fase ${phase}`], 'x-phase': phase,
    'x-implemented': options.implemented??phase === 2,
    ...(options.public ? { security: options.optionalAuth ? [{}, { appSession: [] }] : [] } : {}),
    ...(parameters.length ? { parameters } : {}), responses,
    ...(options.request ? { requestBody: { required: true, content: json(ref(options.request)) } } : {}),
    ...(options.multipart ? { requestBody: { required: true, content: {
      'multipart/form-data': { schema: object({ image: string({ format: 'binary' }) }) },
    } } } : {}),
  };
  paths[path] ??= {};
  if (paths[path][method]) throw new Error(`Duplicato ${method} ${path}`);
  paths[path][method] = operation;
}

route('get', '/health', 'health', 2, 'Stato del processo', { response: 'Health', public: true });
route('get', '/runtime', 'runtime', 2, 'Configurazione locale senza credenziali', { response: 'Runtime' });
route('post', '/links/resolve', 'resolveLink', 2, 'Risoluzione di un video YouTube tramite resolver', { request: 'ResolveLink', response: 'Media' });
route('get', '/search', 'search', 2, 'Ricerca catalogo con cache e budget', {
  response: 'SearchResponse', parameters: [query('q', text(200, 3), true), query('provider', string({enum:['youtube']})),
    query('type', string({ enum: ['track'], default: 'track' })), query('cursor',text(4096))],
});
route('get', '/media/{mediaId}', 'getMedia', 2, 'Metadati della risorsa', { response: 'Media' });
route('post', '/media/{mediaId}/playback', 'resolvePlayback', 2, 'Risolve un URL audio temporaneo con il resolver principale', { response: 'ResolverYouTubePlayback',parameters:[query('fresh',string({enum:['true']}))] });
route('get','/stream/{ticket}','streamAudio',5,'Trasmette il flusso audio in memoria con ticket temporaneo',{implemented:true,public:true,pathSchemas:{ticket:string({pattern:'^[a-f0-9]{64}$'})}});
paths['/stream/{ticket}'].get.description='Ticket opaco obbligatorio, emesso solo da POST playback autenticato. Origini limitate al client locale; nessun URL arbitrario. Range singolo, niente download su disco. Il ticket scade al più in 30 minuti e alla chiusura del servizio.';
paths['/stream/{ticket}'].get.parameters.push({name:'Range',in:'header',schema:string(),required:false});
for(const status of [200,206])paths['/stream/{ticket}'].get.responses[status]={description:status===206?'Intervallo audio richiesto':'Flusso audio',content:{'audio/mp4':{schema:string({format:'binary'})},'audio/webm':{schema:string({format:'binary'})},'audio/wav':{schema:string({format:'binary'})}},headers:{'Accept-Ranges':{schema:string()},'Content-Range':{schema:string()},'Content-Length':{schema:integer()}}};
delete paths['/stream/{ticket}'].get.responses[204];
paths['/stream/{ticket}'].get.responses[416]={description:'Intervallo non valido o oltre la fine del flusso',headers:{'Content-Range':{schema:string()}}};
route('get', '/catalog/{provider}/{kind}/{externalId}', 'getCatalogResource', 3, 'Recupera risorsa del provider', { response: 'CatalogResource', parameters: pagination });
route('get', '/genres', 'genres', 3, 'Generi disponibili', { response: 'Genres', parameters: [query('provider', provider)] });

route('post', '/auth/register', 'register', 3, 'Registrazione account RITVIO', { request: 'Register', response: 'Session', status: 201, public: true });
route('post', '/auth/login', 'login', 3, 'Login email e password', { request: 'Login', response: 'Session', public: true });
route('post', '/auth/logout', 'logout', 3, 'Revoca sessione corrente');
route('get', '/auth/google/start', 'googleStart', 3, 'Inizia OAuth nel browser esterno', {
  response: 'OAuthStart', public: true,
  parameters: [query('codeChallenge', string({ pattern: '^[A-Za-z0-9_-]{43}$' }), true),
    query('client', string({ enum: ['desktop', 'android', 'web'] }), true)],
});
route('get', '/auth/google/callback', 'googleCallback', 3, 'Callback OAuth con state verificato', {
  public: true, redirect: true, parameters: [query('code', text(2048)), query('state', text(1024), true), query('error', text(255))],
});
route('post', '/auth/exchange', 'exchangeLogin', 3, 'Scambia codice monouso e verifier per sessione', { request: 'OAuthExchange', response: 'Session', public: true });
route('get', '/me', 'getProfile', 3, 'Profilo privato', { response: 'Profile' });
route('patch', '/me', 'updateProfile', 3, 'Aggiorna profilo e opt-in cronologia', { request: 'ProfileUpdate', response: 'Profile' });
route('delete', '/me', 'deleteAccount', 3, 'Cancella account con ri-autenticazione recente');
route('get', '/me/likes', 'likedTracks', 3, 'Preferiti privati', { response: 'MediaPage', parameters: pagination });
route('put', '/me/likes/{mediaId}', 'likeTrack', 3, 'Aggiunge preferito idempotentemente');
route('delete', '/me/likes/{mediaId}', 'unlikeTrack', 3, 'Rimuove preferito idempotentemente');
route('get', '/me/followed-resources', 'followedResources', 3, 'Artisti e raccolte seguiti', { response: 'MediaPage', parameters: pagination });
route('put', '/me/followed-resources/{mediaId}', 'followResource', 3, 'Segue una risorsa del catalogo nell’app');
route('delete', '/me/followed-resources/{mediaId}', 'unfollowResource', 3, 'Smette di seguire la risorsa');
route('get', '/me/playlists', 'myPlaylists', 3, 'Playlist proprie e condivise', { response: 'PlaylistPage', parameters: pagination });
route('post', '/playlists', 'createPlaylist', 3, 'Crea playlist privata per default', { request: 'PlaylistCreate', response: 'Playlist', status: 201 });
route('get', '/playlists/{playlistId}', 'getPlaylist', 3, 'Legge playlist secondo visibilità', { response: 'Playlist', public: true, optionalAuth: true });
route('patch', '/playlists/{playlistId}', 'updatePlaylist', 3, 'Aggiorna metadata, solo owner', { request: 'PlaylistUpdate', response: 'Playlist', revision: true });
route('delete', '/playlists/{playlistId}', 'deletePlaylist', 3, 'Elimina playlist, solo owner', { revision: true });
route('post', '/playlists/{playlistId}/items', 'addPlaylistItem', 3, 'Aggiunge elemento, owner/editor', { request: 'AddItem', response: 'Revision', revision: true });
route('delete', '/playlists/{playlistId}/items/{itemId}', 'removePlaylistItem', 3, 'Rimuove elemento, owner/editor', { response: 'Revision', revision: true });
route('put', '/playlists/{playlistId}/order', 'reorderPlaylist', 3, 'Riordina con permutazione completa', { request: 'Order', response: 'Revision', revision: true });
route('get', '/me/history', 'history', 3, 'Cronologia privata', { response: 'HistoryPage', parameters: pagination });
route('post', '/me/history', 'recordHistory', 3, 'Registra evento con consenso, eventId idempotente', { request: 'HistoryEvent' });
route('delete', '/me/history', 'clearHistory', 3, 'Cancella cronologia propria');
route('get', '/me/playback/{deviceId}', 'getPlaybackState', 3, 'Recupera stato del dispositivo', { response: 'PlaybackState' });
route('put', '/me/playback/{deviceId}', 'savePlaybackState', 3, 'Salva stato del dispositivo', { request: 'PlaybackUpdate', response: 'PlaybackState', revision: true });
route('get', '/me/home', 'home', 3, 'Home e mix RITVIO', { response: 'Home' });
route('post', '/imports/resolve', 'resolveImport', 3, 'Anteprima import Audius, nessun salvataggio automatico', { request: 'ImportRequest', response: 'ImportPreview', parameters: pagination });

route('post', '/shares', 'createShare', 4, 'Link revocabile a risorsa pubblica', { request: 'ShareCreate', response: 'Share', status: 201 });
route('get', '/shares/{token}', 'sharePreview', 4, 'Anteprima con controllo visibilità attuale', { response: 'SharePreview', public: true });
paths['/shares/{token}'].get.responses[410] = result(ref('Error'), 'Link revocato o scaduto');
route('delete', '/shares/{token}', 'revokeShare', 4, 'Revoca link, solo autore');
route('get', '/users/{userId}', 'publicUser', 4, 'Profilo pubblico senza email', { response: 'PublicProfile', public: true });
route('get', '/users/{userId}/playlists', 'publicUserPlaylists', 4, 'Playlist pubbliche utente', { response: 'PlaylistPage', public: true, parameters: pagination });
route('put', '/me/following/{userId}', 'followUser', 4, 'Segue utente RITVIO');
route('delete', '/me/following/{userId}', 'unfollowUser', 4, 'Rimuove relazione follow');
route('get', '/playlists/{playlistId}/members', 'playlistMembers', 4, 'Membri, accesso owner o membro', { response: 'MemberList' });
route('put', '/playlists/{playlistId}/members/{userId}', 'setPlaylistMember', 4, 'Assegna viewer/editor, solo owner', { request: 'MemberUpdate', response: 'Revision', revision: true });
route('delete', '/playlists/{playlistId}/members/{userId}', 'removePlaylistMember', 4, 'Revoca membro, solo owner', { response: 'Revision', revision: true });
route('get', '/playlists/{playlistId}/events', 'playlistEvents', 4, 'SSE con verifica permessi continua', { sse: true, parameters: [{ name: 'Last-Event-ID', in: 'header', schema: text(100) }] });
route('post', '/me/images', 'uploadImage', 5, 'Upload immagine privata limitata a 5 MB', { response: 'Image', status: 201, multipart: true });

const coverImage=nullable(string({maxLength:196608,pattern:'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'}));
schemas.MusicResource=object({id:text(160),name:text(300)});
schemas.Media.properties.artists=array(ref('MusicResource'),20);schemas.Media.properties.album=ref('MusicResource');
schemas.LibraryTrack=object({id:uuid,videoId:string({pattern:'^[A-Za-z0-9_-]{11}$'}),title:text(1000),artist:text(1000),thumbnail:string({format:'uri'}),canonicalUrl:string({format:'uri'}),duration:{type:'number',minimum:0},artists:array(ref('MusicResource'),20),album:ref('MusicResource')},['id','videoId','title','artist','thumbnail','canonicalUrl','duration']);
schemas.LocalProfile=object({id:uuid,mode:string({enum:['local','online']}),displayName:text(100),avatar:coverImage});
schemas.LocalProfileUpdate=object({displayName:text(100),avatar:coverImage});
schemas.LocalPlaylistSummary=object({id:uuid,name:text(100),description:text(1000,0),visibility,cover:coverImage,artwork:array(string({format:'uri'}),4),count:integer({minimum:0,maximum:1000}),revision:integer({minimum:1}),updatedAt:date,durationSeconds:nullable({type:'number',minimum:0})});
schemas.LocalPlaylistItem=object({id:uuid,track:ref('LibraryTrack')});
schemas.PlaylistUndo=object({count:integer({minimum:1,maximum:1000}),kind:string({enum:['remove','move']}),targetName:nullable(text(100))});
schemas.LocalPlaylist=object({...schemas.LocalPlaylistSummary.properties,items:array(ref('LocalPlaylistItem'),1000),undo:nullable(ref('PlaylistUndo'))});
schemas.LocalPlaylistCreate=object({name:text(100)});
schemas.LocalPlaylistUpdate=object({name:text(100),description:text(1000,0),visibility,cover:coverImage});
schemas.LikeUpdate=object({liked:boolean});schemas.RecordListen=object({mediaId:uuid,eventId:uuid});
schemas.LocalFollow=object({id:text(160),name:text(300),kind:string({enum:['artist','album']}),artwork:nullable(string({format:'uri'})),url:string({format:'uri'})});
schemas.FollowUpdate=object({kind:string({enum:['artist','album']}),resourceId:text(160),mediaId:uuid,followed:boolean});
schemas.LocalHistory=object({id:uuid,track:ref('LibraryTrack'),playedAt:date});
schemas.LocalLibrary=object({profile:ref('LocalProfile'),likes:array(ref('LibraryTrack'),5000),playlists:array(ref('LocalPlaylistSummary'),100),follows:array(ref('LocalFollow'),5000),history:array(ref('LocalHistory'),100)});
schemas.LocalAddItem=object({mediaId:uuid});schemas.Ok=object({ok:{type:'boolean',const:true}});
function localRoute(method,path,id,summary,options={}){if(paths[path]?.[method])delete paths[path][method];route(method,path,id,options.phase??3,summary,{implemented:true,response:'Ok',...options});}
localRoute('get','/me/library','getLocalLibrary','Libreria privata completa del profilo attivo',{response:'LocalLibrary'});
localRoute('patch','/me/profile','updateLocalProfile','Nome e foto del profilo locale',{request:'LocalProfileUpdate',response:'LocalProfile'});
localRoute('put','/me/likes/{mediaId}','setLocalLike','Salva o rimuove un brano piaciuto',{request:'LikeUpdate'});
localRoute('post','/me/history','recordLocalListen','Registra ascolto effettivo con eventId idempotente',{request:'RecordListen'});
localRoute('delete','/me/history','clearLocalHistory','Cancella la cronologia privata');
localRoute('put','/me/follows','setLocalFollow','Segue un artista/album identificato nei metadati del brano',{request:'FollowUpdate'});
localRoute('delete','/me/follows/{kind}/{id}','removeLocalFollow','Rimuove artista/album seguito',{pathSchemas:{kind:string({enum:['artist','album']}),id:text(160)}});
localRoute('post','/me/playlists','createLocalPlaylist','Crea playlist privata',{request:'LocalPlaylistCreate',response:'LocalPlaylist',status:201});
localRoute('get','/me/playlists/{id}','getLocalPlaylist','Legge una playlist del profilo attivo',{response:'LocalPlaylist'});
localRoute('patch','/me/playlists/{id}','editLocalPlaylist','Modifica metadati/copertina della playlist',{request:'LocalPlaylistUpdate',response:'LocalPlaylist',revision:true});
localRoute('delete','/me/playlists/{id}','deleteLocalPlaylist','Elimina playlist e suoi elementi',{revision:true});
localRoute('post','/me/playlists/{id}/items','addLocalPlaylistItem','Aggiunge un brano, con duplicati ammessi',{request:'LocalAddItem',response:'LocalPlaylist',revision:true});
localRoute('delete','/me/playlists/{id}/items/{itemId}','removeLocalPlaylistItem','Rimuove un elemento distinto della playlist',{response:'LocalPlaylist',revision:true});
localRoute('put','/me/playlists/{id}/order','reorderLocalPlaylist','Riordina gli elementi con permutazione completa',{request:'Order',response:'LocalPlaylist',revision:true});
schemas.PlaylistSelection=object({itemIds:{type:'array',items:uuid,minItems:1,maxItems:1000,uniqueItems:true}});
schemas.PlaylistTransfer=object({mode:string({enum:['copy','move']}),itemIds:schemas.PlaylistSelection.properties.itemIds,targetId:uuid,targetRevision:integer({minimum:1,maximum:999999999})});
schemas.PlaylistTransferResult=object({source:ref('LocalPlaylist'),target:ref('LocalPlaylist')});
localRoute('post','/me/playlists/{id}/remove-items','removeLocalPlaylistItems','Rimozione atomica con ultima rimozione annullabile',{request:'PlaylistSelection',response:'LocalPlaylist',revision:true,phase:5});
localRoute('post','/me/playlists/{id}/transfer','transferLocalPlaylistItems','Copia/sposta atomicamente in ordine originale, con revisione di entrambe le playlist',{request:'PlaylistTransfer',response:'PlaylistTransferResult',revision:true,phase:5});
localRoute('post','/me/playlists/{id}/undo','undoLocalPlaylistRemoval','Annulla ultima rimozione o spostamento se nessuna playlist coinvolta è stata modificata',{response:'LocalPlaylist',revision:true,phase:5});
localRoute('post','/me/playlists/{id}/duplicate','duplicateLocalPlaylist','Copia privata indipendente con metadati e duplicati',{request:'LocalPlaylistCreate',response:'LocalPlaylist',revision:true,status:201,phase:5});
schemas.SharedFileTrack=object({videoId:string({pattern:'^[A-Za-z0-9_-]{11}$'}),title:text(1000),artist:text(1000),duration:{type:'number',minimum:0,maximum:31536000}});
schemas.PlaylistFile=object({format:string({enum:['ritvio-playlist','spotyfree-playlist']}),version:{type:'integer',const:1},exportedAt:date,playlist:object({name:text(100),description:text(1000,0),cover:coverImage,tracks:array(ref('SharedFileTrack'),1000)})});
localRoute('get','/me/playlists/{id}/export','exportPlaylistFile','Esporta riferimenti musicali e copertina senza dati personali',{response:'PlaylistFile',phase:4});
schemas.QueuePlaylistCreate=object({name:text(100),mediaIds:array(uuid,1000)},['name','mediaIds']);
schemas.QueuePlaylistCreate.properties.mediaIds.minItems=1;
localRoute('post','/me/playlists/from-queue','saveQueuePlaylist','Salva atomicamente una coda in una nuova playlist privata, conserva ordine e duplicati',{request:'QueuePlaylistCreate',response:'LocalPlaylist',status:201,phase:5});
localRoute('post','/me/playlists/import','importPlaylistFile','Importa file RITVIO come nuova playlist privata, limite 4 MiB',{request:'PlaylistFile',response:'LocalPlaylist',status:201,phase:4});
schemas.RemoteEntry=object({number:integer({minimum:1,maximum:1000}),title:text(300),track:nullable(ref('LibraryTrack'))});
schemas.RemotePreview=object({id:text(160),url:string({format:'uri'}),title:text(100),description:text(1000,0),author:text(300,0),artwork:nullable(string({format:'uri'})),entries:array(ref('RemoteEntry'),1000),reportedCount:nullable(integer({minimum:0,maximum:1000000})),partial:boolean,truncated:boolean,provider:string({enum:['youtube-music','youtube']}),fetchedAt:date,cache:string({enum:['fresh','cached','stale']})});
schemas.RemoteResult=object({playlist:ref('LocalPlaylist'),added:integer({minimum:0}),skippedDuplicates:integer({minimum:0}),unavailable:integer({minimum:0}),excluded:integer({minimum:0}),partial:boolean});
schemas.RemoteJob=object({id:uuid,state:string({enum:['loading','ready','failed','cancelled','imported']}),phase:string({enum:['youtube-music','youtube','ready']}),preview:nullable(ref('RemotePreview')),error:nullable(text(1000)),result:nullable(ref('RemoteResult'))});
schemas.RemoteImportStart=object({url:text(2048),fresh:boolean});
schemas.RemoteImportCommit=object({entryNumbers:{type:'array',minItems:1,maxItems:1000,uniqueItems:true,items:integer({minimum:1,maximum:1000})},skipDuplicates:boolean,name:text(100,0),targetId:nullable(uuid),targetRevision:nullable(integer({minimum:1,maximum:999999999}))});
localRoute('post','/me/playlist-imports','startRemotePlaylistImport','Avvia lettura cancellabile di riferimenti pubblici, anteprima separata dalla libreria, cache datata',{request:'RemoteImportStart',response:'RemoteJob',status:202,phase:5});
localRoute('get','/me/playlist-imports/{id}','getRemotePlaylistImport','Legge fase reale e anteprima del solo profilo proprietario, valida per 15 minuti',{response:'RemoteJob',phase:5});
localRoute('delete','/me/playlist-imports/{id}','cancelRemotePlaylistImport','Interrompe lettura e rilascia anteprima; nessuna modifica della libreria',{response:'RemoteJob',phase:5});
localRoute('post','/me/playlist-imports/{id}/commit','commitRemotePlaylistImport','Importa selezione in ordine sorgente; revisioni e duplicati ricontrollati atomicamente, retry identico idempotente fino al rilascio',{request:'RemoteImportCommit',response:'RemoteResult',status:201,phase:5});
paths['/me/playlist-imports/{id}/commit'].post.responses['200']={description:'Retry identico della stessa conferma già salvata',content:{'application/json':{schema:ref('RemoteResult')}}};
schemas.LyricsLine=object({at:{type:'number',minimum:0,maximum:86400},text:text(200000,0)});
schemas.LyricsDocument=object({plainText:text(200000,0),lines:array(ref('LyricsLine'),5000),offsetMs:integer({minimum:-600000,maximum:600000}),provider:string({enum:['lrclib','local']}),providerId:nullable(integer({minimum:1})),title:text(1000),artist:text(1000),fileName:nullable(text(100)),instrumental:boolean,fetchedAt:date,licenseVerified:nullable({type:'boolean',const:false})});
schemas.LyricsResponse=object({status:string({enum:['ready','instrumental','missing']}),document:nullable(ref('LyricsDocument')),cacheHit:boolean,savedChoice:boolean});
schemas.LyricsCandidate=object({id:integer({minimum:1}),title:text(1000),artist:text(1000),album:text(1000,0),duration:{type:'number',minimum:0,maximum:86400},instrumental:boolean,synced:boolean});
schemas.LyricsCandidates=object({items:array(ref('LyricsCandidate'),20)});
schemas.LyricsImport=object({text:text(200000),format:string({enum:['txt','lrc']}),fileName:text(100)});
schemas.LyricsSelection=object({providerId:integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER})});
localRoute('get','/me/lyrics/{mediaId}','getLyrics','Legge la scelta personale oppure cerca su LRCLIB con cache',{phase:5,response:'LyricsResponse',parameters:[{name:'fresh',in:'query',schema:string({enum:['true']})}]});
localRoute('get','/me/lyrics/{mediaId}/search','searchLyrics','Cerca versioni da scegliere esplicitamente',{phase:5,response:'LyricsCandidates',parameters:[{name:'title',in:'query',required:true,schema:text(200)},{name:'artist',in:'query',required:true,schema:text(200)}]});
localRoute('post','/me/lyrics/{mediaId}/select','selectLyrics','Associa una versione LRCLIB al brano e al profilo attivo',{phase:5,request:'LyricsSelection',response:'LyricsResponse'});
localRoute('put','/me/lyrics/{mediaId}','importLyrics','Importa testo UTF-8 locale, massimo 200 KB e 5000 righe sincronizzate',{phase:5,request:'LyricsImport',response:'LyricsResponse'});
localRoute('delete','/me/lyrics/{mediaId}','resetLyrics','Rimuove la scelta personale senza modificare il brano',{phase:5});
schemas.CatalogResource=object({id:text(160),name:text(300),kind:string({enum:['artist','album']}),artwork:nullable(string({format:'uri'})),artists:array(ref('MusicResource'),30),year:nullable(text(20)),releaseType:nullable(text(40))});
schemas.SearchResponse.properties.priorityArtist=ref('MusicResource');
schemas.SearchResponse.properties.truncated=boolean;
schemas.CatalogSearchData=object({items:array(ref('CatalogResource'),20),truncated:boolean,priorityArtist:ref('MusicResource')},['items','truncated']);
schemas.CatalogSearchResult=object({data:ref('CatalogSearchData'),cache:ref('CacheInfo')});
schemas.AlbumEntry=object({number:integer({minimum:1}),title:text(300),duration:integer({minimum:0,maximum:86400}),track:nullable(ref('LibraryTrack'))});
schemas.AlbumDetail=object({...schemas.CatalogResource.properties,kind:{type:'string',const:'album'},description:text(10000,0),entries:array(ref('AlbumEntry'),1000),reportedCount:nullable(integer({minimum:0,maximum:100000})),incomplete:boolean});
schemas.ArtistDetail=object({...schemas.CatalogResource.properties,kind:{type:'string',const:'artist'},description:text(10000,0),tracks:array(ref('LibraryTrack'),100),albums:array(ref('CatalogResource'),100),singles:array(ref('CatalogResource'),100),moreAlbums:boolean,moreSingles:boolean});
schemas.CatalogDetailResult=object({data:{oneOf:[ref('AlbumDetail'),ref('ArtistDetail')]},cache:ref('CacheInfo')});
schemas.ArtistReleasesResult=object({data:object({items:array(ref('CatalogResource'),100),truncated:boolean}),cache:ref('CacheInfo')});
schemas.ArtistSearchResult=object({data:{oneOf:[object({kind:string({const:'track'}),items:array(ref('LibraryTrack'),100),truncated:boolean}),object({kind:string({const:'album'}),items:array(ref('CatalogResource'),100),truncated:boolean})]},cache:ref('CacheInfo')});
schemas.CatalogFollow=object({followed:boolean});
const catalogPath={kind:string({enum:['artist','album']}),id:string({pattern:'^[A-Za-z0-9_-]{1,160}$'})};
localRoute('get','/catalog/search','searchCatalogResources','Cerca artisti o album, primi 20 risultati con cache',{phase:5,response:'CatalogSearchResult',parameters:[{name:'q',in:'query',required:true,schema:text(200,3)},{name:'kind',in:'query',required:true,schema:string({enum:['artist','album']})}]});
localRoute('get','/catalog/{kind}/{id}','getCatalogDetail','Pagina artista o album con tracce disponibili e cache',{phase:5,response:'CatalogDetailResult',pathSchemas:catalogPath});
localRoute('get','/catalog/artist/{id}/releases/{section}','getArtistReleases','Pubblicazioni aggiuntive, fino a 100 per sezione',{phase:5,response:'ArtistReleasesResult',pathSchemas:{id:catalogPath.id,section:string({enum:['albums','singles']})}});
localRoute('get','/catalog/artist/{id}/search','searchArtistCatalog','Ricerca esplicita per ID artista; conserva collaborazioni e scarta risultati senza credito verificabile',{phase:5,response:'ArtistSearchResult',pathSchemas:{id:catalogPath.id},parameters:[{name:'q',in:'query',required:true,schema:text(200,0)},{name:'kind',in:'query',required:true,schema:string({enum:['track','album']})}]});
localRoute('put','/me/catalog/{kind}/{id}','followCatalogResource','Segue una risorsa derivandone i metadati dal catalogo',{phase:5,request:'CatalogFollow',pathSchemas:catalogPath});

schemas.ListeningSettings=object({privateMode:boolean,retentionDays:integer({enum:[90,180,365]}),epoch:integer({minimum:1})});
schemas.ListeningSettingsUpdate=object({privateMode:boolean,retentionDays:integer({enum:[90,180,365]})});
schemas.ListeningCheckpoint=object({id:uuid,mediaId:uuid,epoch:integer({minimum:1}),sequence:integer({minimum:0}),startedAt:integer({minimum:0}),updatedAt:integer({minimum:0}),listenedMs:integer({minimum:0,maximum:86400000}),durationMs:integer({minimum:0,maximum:86400000}),seeks:integer({minimum:0,maximum:100000}),closed:boolean,reason:nullable(string({enum:['completed','skip','replay','change','error','interrupted']}))});
schemas.ListeningEntry=object({...schemas.ListeningCheckpoint.properties,track:ref('LibraryTrack'),excluded:boolean,replay:boolean,tasteWeight:{type:'number',enum:[0,.25,1]}});
schemas.ListeningSnapshot=object({settings:ref('ListeningSettings'),items:array(ref('ListeningEntry'),100),summary:object(Object.fromEntries(['sessions','listenedMs','completed','skips','replays','errors','interrupted','excluded'].map(key=>[key,integer({minimum:0})]))),legacyStarts:integer({minimum:0})});
schemas.ListeningAck=object({accepted:boolean,epoch:integer({minimum:1})});
schemas.ListeningExcluded=object({excluded:boolean});
localRoute('get','/me/listening','getListening','Riepilogo locale e ultime 100 sessioni misurate',{phase:5,response:'ListeningSnapshot'});
localRoute('post','/me/listening/checkpoints','checkpointListening','Checkpoint cumulativo idempotente, isolato per profilo e generazione privacy',{phase:5,request:'ListeningCheckpoint',response:'ListeningAck'});
localRoute('put','/me/listening/settings','setListeningSettings','Ascolto privato e conservazione delle sessioni per 90, 180 o 365 giorni',{phase:5,request:'ListeningSettingsUpdate',response:'ListeningSettings'});
localRoute('patch','/me/listening/{id}','excludeListening','Esclude o include una sessione nei futuri gusti senza rimuoverla',{phase:5,request:'ListeningExcluded'});
localRoute('delete','/me/listening','clearListening','Cancella sessioni e cronologia, invalidando i checkpoint precedenti',{phase:5,response:'ListeningSettings'});

schemas.MetadataGenre=object({name:text(60),original:text(60)});
const metadataKind=string({enum:['artist','album','track']});
schemas.MetadataTarget=object({kind:metadataKind,id:text(160),name:text(300),artists:array(text(300),30),year:nullable(text(20)),duration:nullable({type:'number',minimum:0,maximum:86400})});
schemas.MetadataCandidate=object({id:integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER}),kind:metadataKind,name:text(300),artist:text(300,0),genre:array(ref('MetadataGenre'),20),year:nullable(text(20)),duration:nullable({type:'number',minimum:0,maximum:86400}),album:nullable(text(300)),quality:string({enum:['strong','partial','weak']}),matches:object({title:boolean,artist:boolean,year:nullable(boolean),duration:nullable(boolean)})});
schemas.MetadataSnapshot=object({target:ref('MetadataTarget'),status:string({enum:['unclassified','suggested','confirmed','local']}),genres:array(ref('MetadataGenre'),20),selected:nullable(ref('MetadataCandidate')),localGenres:nullable(array(ref('MetadataGenre'),20)),candidates:array(ref('MetadataCandidate'),20),cache:nullable(object({fetchedAt:date,expiresAt:date,stale:boolean,degraded:boolean})),updatedAt:nullable(date)});
schemas.MetadataSearch=object({query:text(200,3)},[]);
schemas.MetadataSelection=object({providerId:integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER})});
schemas.MetadataGenres=object({genres:array(text(60),20)});
const metadataPath={kind:metadataKind,id:string({pattern:'^[A-Za-z0-9_-]{1,160}$'})};
localRoute('get','/me/metadata/{kind}/{id}','getMetadata','Legge stato, generi personali e associazione; nessuna chiamata iTunes automatica',{phase:5,response:'MetadataSnapshot',pathSchemas:metadataPath});
localRoute('post','/me/metadata/{kind}/{id}/search','searchMetadata','Ricerca esplicita iTunes, cache e proposte da confermare',{phase:5,request:'MetadataSearch',response:'MetadataSnapshot',pathSchemas:metadataPath});
localRoute('put','/me/metadata/{kind}/{id}/selection','selectMetadata','Conferma un risultato server salvato per risorsa e profilo',{phase:5,request:'MetadataSelection',response:'MetadataSnapshot',pathSchemas:metadataPath});
localRoute('delete','/me/metadata/{kind}/{id}/selection','resetMetadataSelection','Rimuove associazione senza cancellare generi personali',{phase:5,response:'MetadataSnapshot',pathSchemas:metadataPath});
localRoute('put','/me/metadata/{kind}/{id}/genres','setLocalGenres','Sostituisce generi personali; lista vuota mantiene non classificato',{phase:5,request:'MetadataGenres',response:'MetadataSnapshot',pathSchemas:metadataPath});
localRoute('delete','/me/metadata/{kind}/{id}/genres','resetLocalGenres','Rimuove correzione locale e ripristina generi della fonte se associata',{phase:5,response:'MetadataSnapshot',pathSchemas:metadataPath});
schemas.TasteSettingsUpdate=object({days:integer({enum:[30,90,180]}),genreLevel:string({enum:['artist','track']}),discoveryPercent:integer({enum:[25,50,75]}),allowRecent:boolean,variety:boolean});
schemas.TasteSettings=object({...schemas.TasteSettingsUpdate.properties,resetAt:integer({minimum:0})});
schemas.TasteExclusions=object({tracks:array(object({videoId:string({pattern:'^[A-Za-z0-9_-]{11}$'}),title:text(500),artist:text(500)}),5000),artists:array(object({id:text(500),name:text(500),match:string({enum:['id','name']})}),5000)});
schemas.TasteMixRequest=object({kind:string({enum:['familiar','discovery','genre']}),genre:text(60),refresh:boolean,exclusions:ref('TasteExclusions')},['kind','exclusions']);
schemas.TasteFeedbackUpdate=object({value:integer({enum:[-1,0,1]})});
schemas.TasteProfile=object({sessions:integer({minimum:0}),listenedMs:integer({minimum:0}),personalized:boolean,artists:array(object({id:text(500),name:text(500),match:string({enum:['id','name']}),score:{type:'number'}}),12),genres:array(object({name:text(60),score:{type:'number'}}),20),unclassifiedPercent:integer({minimum:0,maximum:100}),trackScores:{type:'object',additionalProperties:{type:'number'}}});
schemas.TasteSnapshot=object({settings:ref('TasteSettings'),profile:ref('TasteProfile'),candidateCount:integer({minimum:0}),discoveredAt:nullable(integer({minimum:0})),privateMode:boolean,feedback:array(object({track:ref('LibraryTrack'),value:integer({enum:[-1,0,1]})}),20000)});
schemas.TasteMixItem=object({track:ref('LibraryTrack'),reason:string({enum:['liked','saved','listened','artist','genre','feedback','discovery']}),detail:nullable(text(500)),feedback:integer({enum:[-1,0,1]}),fresh:boolean});
schemas.TasteMix=object({kind:string({enum:['familiar','discovery','genre']}),genre:nullable(text(60)),day:string({pattern:'^\\d{4}-\\d{2}-\\d{2}$'}),items:array(ref('TasteMixItem'),20),requested:integer({const:20}),discoveryCount:integer({minimum:0,maximum:20}),generatedAt:integer({minimum:0}),cached:boolean});
schemas.TasteDiscoveryResult=object({added:integer({minimum:0,maximum:60}),failed:integer({minimum:0,maximum:3})});
localRoute('get','/me/taste','getTaste','Legge gusti, candidati e feedback locali senza richieste al provider',{phase:5,response:'TasteSnapshot'});
localRoute('put','/me/taste/settings','setTasteSettings','Periodo, livello dei generi, quota scoperta, recenti e varietà',{phase:5,request:'TasteSettingsUpdate',response:'TasteSettings'});
localRoute('delete','/me/taste','resetTaste','Reset derivati e soglia degli ascolti, conserva libreria e cronologia',{phase:5,response:'TasteSettings'});
localRoute('put','/me/taste/feedback/{id}','setTasteFeedback','Feedback reversibile -1/0/+1 per un candidato del profilo',{phase:5,request:'TasteFeedbackUpdate'});
localRoute('post','/me/taste/mix','prepareTasteMix','Mix locale fino a 20 brani; genere richiesto per kind genre, esclusioni fino a 5000 brani e artisti, body 8 MiB',{phase:5,request:'TasteMixRequest',response:'TasteMix'});
localRoute('post','/me/taste/discover','discoverTasteCandidates','Ricerca esplicita: fino a tre query artista, attesa di un minuto, cache personale di 200 candidati/30 giorni',{phase:5,response:'TasteDiscoveryResult'});
const situationId=string({enum:['focus','travel','energy','relax','workout','party']});
schemas.Situation=object({id:situationId,params:text(1024),sourceTitle:text(300)});
schemas.SituationPlaylist=object({id:text(160),title:text(300),author:text(200,0),artwork:nullable(string({format:'uri'}))});
schemas.SituationTracks=object({playlist:ref('SituationPlaylist'),tracks:array(ref('LibraryTrack'),100),partial:boolean});
for(const [name,data] of [['SituationIndex',array(ref('Situation'),6)],['SituationPlaylists',array(ref('SituationPlaylist'),12)],['SituationDetail',ref('SituationTracks')]])schemas[name]=object({data:nullable(data),updatedAt:nullable(date),stale:boolean,refreshing:boolean,error:nullable(text(1000)),retryAt:nullable(date)});
localRoute('get','/situations','situationIndex','Indice pubblico delle situazioni, cache locale e backoff',{response:'SituationIndex'});
localRoute('get','/situations/{id}','situationPlaylists','Raccolte pubbliche della situazione',{response:'SituationPlaylists',pathSchemas:{id:situationId}});
localRoute('get','/situations/{id}/playlists/{playlistId}','situationDetail','Metadati dei brani di una playlist presente nella situazione, senza avviare audio',{response:'SituationDetail',pathSchemas:{id:situationId,playlistId:text(160)}});

const spec = {
  openapi: '3.1.0',
  info: { title: 'RITVIO API', version: '0.7.0', description: 'Player, libreria e file playlist locali; shuffle, esclusioni, equalizzatore, testi, catalogo album/artisti e misurazione degli ascolti con privacy; metadati testuali iTunes e generi locali. Ricerca ordinata per identità artista e titolo, con snapshot paginati stabili; esplorazione esclusiva per ID dalla pagina artista. Gusti locali, mix giornalieri spiegabili, feedback reversibile e ricerca esplicita di candidati. La licenza generale dei contenuti LRCLIB non è verificata. Android, account online, social e collaborazione restano da implementare.' },
  servers: [{ url: 'http://127.0.0.1:{port}/v1', description: 'Backend locale: porta assegnata a ogni avvio Electron',variables:{port:{default:'3001'}} }],
  security: [{ appSession: [] }],
  tags: [2, 3, 4, 5].map((phase) => ({ name: `Fase ${phase}` })),
  paths,
  components: {
    securitySchemes: { appSession: { type: 'http', scheme: 'bearer', description: 'Token opaco RITVIO; nel MVP locale token di installazione. Nessun token del provider.' } },
    schemas,
  },
};

const output = fileURLToPath(new URL('../docs/openapi.json', import.meta.url));
writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
console.log(`Contratto generato: ${Object.keys(paths).length} percorsi, ${Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0)} operazioni.`);
