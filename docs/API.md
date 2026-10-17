# API RITVIO — player e libreria locale

Aggiornamento 0.7.0: gli endpoint delle situazioni usano il token locale esistente: `GET /v1/situations`, `GET /v1/situations/:id`, `GET /v1/situations/:id/playlists/:playlistId`. Identificatori ammessi: focus, travel, energy, relax, workout, party. Risposte con data, stale, refreshing, error, updatedAt e retryAt; cache SQLite con backoff. Solo playlist presenti nella categoria possono essere risolte. I file importati accettano il formato precedente e ritvio-playlist; le esportazioni usano solo ritvio-playlist. Bridge desktop `window.ritvio`, canali IPC `ritvio:*`; il mini-player non accede a token, file o configurazione.

Le quantità e le fasi del registro seguente sono storiche.

Base /v1 su 127.0.0.1, porta libera assegnata da Electron. **51 operazioni implementate** nella versione 0.6.10; OpenAPI generato da scripts/api-contract.mjs (71 percorsi, 92 operazioni dichiarate, 110 schemi). Account online, collaborazione e operazioni successive sono marcati x-implemented: false. L’equalizzatore usa un endpoint di streaming locale in memoria; preferenze, shuffle ed esclusioni restano nello stato del player.

| Metodo e percorso | Comportamento |
| --- | --- |
| GET /health | Stato processo, nessun segreto; pubblico locale. |
| GET /runtime | catalogProvider=youtube-music, playbackProvider=youtube, resolverInstalled booleano. |
| GET /search | q 3–200 caratteri, type=track e provider=youtube opzionali, cursore firmato. Resolver YouTube Music, cache, massimo 20 brani/pagina e 100/query. |
| GET /media/{mediaId} | Metadati presenti nella cache o nella libreria permanente, oppure MEDIA_NOT_FOUND. |
| POST /links/resolve | Body {videoId}, esattamente 11 caratteri consentiti. Resolver YouTube per metadati e stream; risposta Media. |
| POST /media/{mediaId}/playback | Resolver YouTube, descrittore con percorso locale /v1/stream/{ticket}, expiresAt e capacità equalizer=true. fresh=true rinnova il flusso. |
| GET /stream/{ticket} | Streaming in memoria: ticket opaco obbligatorio, Range singolo, status 200/206/416. Nessun salvataggio audio. |

Tutte tranne health e stream richiedono Bearer della sessione locale; stream richiede un ticket temporaneo emesso da playback autenticato. Ogni origine fornita deve essere autorizzata. Non sono account utente. Non c’è dipendenza dalla Data API né chiave del provider. Il frontend non riceve percorsi Python, segreti o URL Googlevideo. Il ticket è una capacità temporanea del player, non va condiviso.

Media: UUID stabile sul video ID, titolo, artista, durata, copertina, URL canonico e licenza non verificata nulla. artists e album opzionali contengono identificativi e nomi YouTube Music quando disponibili. Un brano e un elemento della coda hanno identità distinte, per ammettere duplicati. Playback: mode=youtube-audio-resolver, accessMethod=unofficial-extraction, provider=youtube, videoId, percorso url locale con ticket, expiresAt e capacità (background/seek/volume/equalizer veri sul desktop, offline falso). Il client risolve il percorso rispetto alla base URL del servizio locale. Il descrittore e gli URL upstream non sono persistiti.

Cache ricerca sei ore, risultati degradati fino a 30 giorni in caso di timeout/servizio occupato/errore provider, cache.hit/cache.degraded con date UTC. I cursori sono ri-firmati dopo il riavvio e validati su query/offset. Limite API locale 90 richieste/minuto; non è la quota YouTube Data API. Errori sanitizzati in italiano: INVALID_REQUEST, UNAUTHORIZED, INVALID_ORIGIN, INVALID_CURSOR, MEDIA_NOT_FOUND, RESOLVER_MISSING, RESOLVER_BUSY, RESOLVER_TIMEOUT, RESOLVER_FAILED, RESOLVER_OUTPUT, TRACK_UNAVAILABLE, NO_AUDIO_STREAM. Nessun errore grezzo, token o URL audio nei log del servizio.

## Libreria implementata

| Metodo e percorso | Body / risposta |
| --- | --- |
| GET /me/library | Profilo, preferiti, riepiloghi playlist, risorse seguite e ultimi 100 ascolti. |
| PATCH /me/profile | {displayName, avatar}, risposta Profile; avatar data URI immagine oppure null. |
| PUT /me/likes/{mediaId} | {liked: boolean}, risposta {ok:true}. |
| POST /me/history | {mediaId,eventId}, registra un ascolto idempotentemente; {ok:true}. |
| DELETE /me/history | Cancella la cronologia del profilo; {ok:true}. |
| PUT /me/follows | {kind: artist/album,resourceId,mediaId,followed:boolean}; risorsa validata sui metadati. |
| DELETE /me/follows/{kind}/{id} | Rimuove una risorsa seguita; {ok:true}. |
| POST /me/playlists | {name}, risposta playlist completa, 201. |
| POST /me/playlists/from-queue | {name,mediaIds}: 1–1000 UUID, ordine e duplicati conservati. Nuova playlist privata in transazione, 201; riferimenti assenti impediscono creazioni parziali. |
| GET /me/playlists/{id} | Playlist completa con elementi {id,track}. |
| PATCH /me/playlists/{id} | {name,description,visibility,cover}, risposta playlist completa. |
| DELETE /me/playlists/{id} | Cancella playlist ed elementi; {ok:true}. |
| POST /me/playlists/{id}/items | {mediaId}, aggiunge un elemento distinto; risposta playlist completa. |
| DELETE /me/playlists/{id}/items/{itemId} | Rimuove un elemento; risposta playlist completa. |
| PUT /me/playlists/{id}/order | {itemIds:[...]}, permutazione completa; risposta playlist completa. |

Modifiche alle playlist esistenti richiedono `If-Match: "revision"`: 428 se manca, 409 se obsoleta. Richieste con campi non previsti sono rifiutate. Nome 1–100 caratteri non vuoti, descrizione fino a 1.000, copertina/avatar PNG/JPEG/WebP base64 fino a 196.608 caratteri; richieste oltre il limite del body ricevono 413. Le liste di elementi sono limitate a 1.000. Tutte le identità sono ricavate da IdentityProvider sul server, mai da un owner nel body o nella query.

`library_profiles` distingue identità locale/online, ma solo il profilo locale è collegato in questa versione. Non è ancora presente un login online. Visibilità pubblica è salvata per la futura condivisione; nessuna playlist è esposta pubblicamente. Fasi successive: account online, importazione da playlist YouTube, social, condivisione online e collaborazione. I dettagli storici su Audius/IFrame e quote Data API non descrivono il runtime corrente. Vedi [FASE-3.md](FASE-3.md) per limiti e futura migrazione.

## Scambio di playlist implementato nella Fase 4

| Metodo e percorso | Comportamento |
| --- | --- |
| GET /me/playlists/{id}/export | File JSON format=spotyfree-playlist, version=1, exportedAt UTC; playlist con nome, descrizione, copertina e tracks. Solo proprietario. |
| POST /me/playlists/import | Body nel formato del file, fino a 4 MiB e 1.000 brani; risposta playlist completa, 201. Nuova identità e visibilità privata, importazione atomica. |

Ogni brano del file ha solo videoId, title, artist e duration. UUID, copertina remota e URL canonico vengono ricostruiti dal server, senza accettare URL audio o immagini remote dal file. I metadati già presenti nella libreria non sono sovrascritti da un'importazione. Il file non contiene owner, token, email, foto del profilo, cronologia, URL audio o musica.

Copia dei link YouTube e salvataggio del file desktop usano IPC limitato: renderer attendibile e identificatori validati. Il dialogo Salva sceglie la destinazione e il file viene scritto tramite un temporaneo nella stessa cartella. Non è un download audio e non viene avviato automaticamente alcun invio a terzi. [Dettagli Fase 4](FASE-4.md).


## Testi implementati nella 0.6.3

Tutti i percorsi richiedono Bearer e identità del profilo attivo. Il mediaId viene risolto nel catalogo o nella libreria; non si accettano URL esterni né owner inviati dal client.

| Metodo e percorso | Comportamento |
| --- | --- |
| GET /me/lyrics/{mediaId} | Scelta personale, oppure LRCLIB con cache; status ready/instrumental/missing, document, cacheHit, savedChoice. fresh=true rinnova la ricerca automatica rispettando throttling e cooldown. |
| GET /me/lyrics/{mediaId}/search?title=…&artist=… | Fino a 20 candidati con metadati; scelta esplicita della versione. |
| POST /me/lyrics/{mediaId}/select | Body {providerId}; recupera un ID LRCLIB valido e conserva l’associazione personale. |
| PUT /me/lyrics/{mediaId} | Body {text,format:txt/lrc,fileName}; UTF-8, 200 KB e massimo 5.000 righe sincronizzate. |
| DELETE /me/lyrics/{mediaId} | Rimuove scelta/importazione del solo profilo attivo. Nessuna modifica al brano. |

Cache automatica 7 giorni, risultati mancanti 6 ore, massimo 1.000 record; scelte/importazioni personali massimo 1.000 per profilo, conservate fino alla rimozione. SQLite usa tabelle additive lyrics_cache e lyrics_overrides; identità personale separata per futuri account online. Corrispondenza automatica conservativa su titolo/artista e durata ±2 secondi; versioni ambigue richiedono scelta.

Richieste LRCLIB seriali, 300 ms tra richieste, massimo 8 pendenti, timeout complessivo per richiesta 10 secondi, risposta limitata a 2 MB, redirect rifiutati e endpoint fissato nel server. Retry-After numerico o HTTP-date rispettato globalmente, fino a 24 ore; errori non salvati come testo mancante. Richieste concorrenti dello stesso brano condividono il recupero. Nessuna cronologia, ID profilo, token o URL audio viene inviata alla fonte; vengono inviati i metadati del brano cercato.

Errori in italiano: LYRICS_UNAVAILABLE, LYRICS_INVALID_RESPONSE, LYRICS_RATE_LIMIT con retryAt, LYRICS_BUSY, LYRICS_NOT_FOUND, LYRICS_LIMIT, LYRICS_TOO_LARGE, INVALID_LRC e INVALID_LYRICS. La risposta include provider e licenseVerified=false per LRCLIB; non è una certificazione dei diritti sui testi. [Istruzioni, fonti e limiti](BONUS-TESTI-0.6.3.md).

## Catalogo album/artisti — 0.6.4

GET `/catalog/search?q=…&kind=artist|album`, GET `/catalog/:kind/:id`, GET `/catalog/artist/:id/releases/:section` (`albums|singles`) e PUT `/me/catalog/:kind/:id` con `{followed:boolean}`. Le tre letture restituiscono `{data,cache}`; seguito `{ok:true}`. Tutte richiedono sessione Bearer e origine consentita. Identificativi 1–160 caratteri alfanumerici, underscore o trattino; nessun URL/owner/parametro interno del provider dal client.

Cache SQLite `catalog_pages` globale di metadati: ricerche 6 ore, dettagli/pubblicazioni 24 ore, massimo 500 risposte; coalescing e fallback degradato fino a 30 giorni su 429/5xx. Tracce disponibili registrate nella cache media anche su hit. Seguiti derivati dal server e isolati per identità, con tetto esistente 5000. Nessuna modifica allo streaming o ai dati delle playlist.

Modelli condivisi `packages/domain/catalog.ts`: CatalogResource, AlbumDetail (entries con track null per unavailable, reportedCount e incomplete), ArtistDetail, CatalogSearch e ArtistReleases. Ricerca risorse massimo 20, pubblicazioni aggiuntive massimo 100 e album massimo 1000 voci; truncated/incomplete espliciti. Artwork solo HTTPS da host YouTube/googleusercontent consentiti, descrizioni testo. Errori source sanitizzati RESOLVER_* e CATALOG_INVALID/CATALOG_UNSUPPORTED. [Dettagli e prove](BONUS-CATALOGO-0.6.4.md).

## Ascolti misurati 0.6.5

Cinque operazioni locali protette: GET `/v1/me/listening`, POST `/v1/me/listening/checkpoints`, PUT `/v1/me/listening/settings`, PATCH `/v1/me/listening/:id`, DELETE `/v1/me/listening`. [Schema, privacy, migrazione e limiti](BONUS-ASCOLTI-0.6.5.md). La POST cronologia legacy rispetta l’ascolto privato; entrambe le DELETE invalidano i checkpoint della generazione precedente.

## Metadati e generi 0.6.6

Per `kind` artist/album/track, `/me/metadata/{kind}/{id}` legge stato, generi e proposte senza chiamare iTunes. POST `/search` accetta `query` opzionale e cerca esplicitamente con cache/rate limit. PUT `/selection` accetta un `providerId` della ricerca salvata per quel profilo/risorsa, DELETE rimuove associazione. PUT `/genres` sostituisce generi personali (max 20 di 60 caratteri), DELETE ripristina quelli della fonte selezionata. Nessuna assegnazione automatica, nessuna eredità dei generi fra livelli, nessun audio/asset iTunes. [Architettura, limiti e verifiche](BONUS-METADATI-0.6.6.md).

## Ricerca per identità artista 0.6.7

`GET /catalog/artist/{id}/search?q=&kind=track|album`: filtro esplicito per ID nei crediti, inclusi featuring e collaborazioni, massimo 100 righe verificate entro il limite della fonte. Query 0–200 caratteri; cache isolata per artista/tipo/query, sei ore e fallback datato solo della stessa ricerca. Brani nello schema LibraryTrack, album nello schema CatalogResource; discriminante data.kind, data.truncated e cache. Autenticazione/origine applicate come agli altri endpoint del catalogo. [Metodo e limiti](RICERCA-ARTISTA-0.6.7.md).

## Priorità automatica 0.6.8

`GET /search?q=&type=track&cursor=` conserva il contratto e aggiunge `priorityArtist` e `truncated` opzionali. La ricerca ordinaria ordina fino a 100 brani prima della paginazione di 20: identità nei crediti, titolo e ordine della fonte nei pareggi, nessun filtro automatico. Cache snapshot persistente `resolver-ranked-v1`, cursori firmati con query/offset/revisione; pagine della stessa revisione senza nuova ricerca. Un cursore riferito a una revisione sostituita viene rifiutato. `GET /catalog/search?kind=album&q=` ordina fino a 100 album prima del taglio a 20 e aggiunge `data.priorityArtist` opzionale, cache `search-v3`. Nessun nuovo endpoint, dato personale o chiave API. [Metodo, cache e limiti](RICERCA-PRIORITA-0.6.8.md).


## Gusti e mix locali — 0.6.9

| Metodo e percorso | Comportamento |
| --- | --- |
| GET /me/taste | Profilo su tutte le sessioni conservate, impostazioni, candidati e feedback. Nessuna richiesta a provider. |
| PUT /me/taste/settings | days 30/90/180, genreLevel artist/track, discoveryPercent 25/50/75, allowRecent e variety. |
| DELETE /me/taste | Reset della soglia temporale e dei derivati. Conserva ascolti, preferiti, playlist, metadati ed esclusioni. |
| PUT /me/taste/feedback/{id} | value -1/0/+1 su un candidato del profilo. Zero annulla. |
| POST /me/taste/mix | kind familiar/discovery/genre, genre richiesto per genere, exclusions, refresh opzionale. Fino a 20 brani, cache per giorno UTC. |
| POST /me/taste/discover | Azione esplicita; massimo 3 query di artisti e 60 risultati per tentativo, attesa 60 secondi, cache per profilo di 200 candidati/30 giorni. |

Tutti i dati derivati sono isolati per IdentityProvider. Candidati personali da preferiti, playlist, sessioni non escluse e feedback; nessuna scansione della libreria di altri utenti. I generi sono solo da metadata_choices confermati o personali; artisti e brani restano livelli separati. Body del mix fino a 8 MiB per le esclusioni persistite (massimo 5.000 brani e 5.000 artisti); il limite ordinario delle altre rotte resta 4 KiB. Le query online sono bloccate durante l’ascolto privato. Reset, cancellazione cronologia e cambi di privacy impediscono scritture tardive della scoperta.
