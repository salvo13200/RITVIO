import {readFile,writeFile,mkdir} from 'node:fs/promises';
const beforeVersion=process.argv[2]??'0.6.33',version=process.argv[3]??'0.7.0';
if(![beforeVersion,version].every(v=>/^\d+\.\d+\.\d+$/.test(v)))throw Error('Versioni non valide');
const folder=`docs/design/ritvio-${version}`;
const [before,after,audio,restored,frames]=await Promise.all([
  readFile(`docs/design/ui-6-4/NATIVE-${beforeVersion}.json`,'utf8'),readFile(`docs/design/ui-6-4/NATIVE-${version}.json`,'utf8'),
  readFile(`data/analysis/playback-native-${version}.json`,'utf8'),readFile(`data/analysis/playback-native-${version}-restore8.json`,'utf8'),readFile(`${folder}/FRAMES-WEB.json`,'utf8'),
]).then(files=>files.map(file=>JSON.parse(file)));
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2;};
const spread=values=>({n:values.length,median:median(values),min:Math.min(...values),max:Math.max(...values)});
const transition=(record,page)=>spread(record.samples.filter(s=>s.page===page).map(s=>s.ms));
const change=(a,b)=>({before:a,after:b,delta:b-a,percent:(b-a)/a*100});
const result={version,beforeVersion,conditions:{before:before.conditions,after:after.conditions,comparison:'Same Windows PC and 500 logical queue entries. Three automation timings per route in isolated hidden portable windows; first 500 versus first61 rendered rows is the intended workload reduction. Samples taken hours apart; external caches, OS scheduling and GC are not controlled. Timing includes Playwright/CDP automation, not user click-to-paint.',memory:'Renderer JS heap snapshot without forced GC; not whole-process RAM, retained heap or a leak test.',audio:audio.conditions,frames:frames.conditions,nativeFrames:after.frameTimes},startupMs:{before:before.startupToVisibleMs,after:after.startupToVisibleMs,samplesPerVersion:1},navigation:{queue:{before:transition(before,'queue'),after:transition(after,'queue')},preferences:{before:transition(before,'preferences'),after:transition(after,'preferences')}},nodes:change(before.metrics.Nodes,after.metrics.Nodes),jsHeapUsedBytes:change(before.metrics.JSHeapUsedSize,after.metrics.JSHeapUsedSize),audio:{startAtZero:audio,startAtEight:restored},webFrames:frames.passes,limitations:['No measured comparison against SimpMusic. Only the official ZIP was downloaded again; no new execution or profile.','A prior cold-start attempt did not play; its cause is not established. Subsequent isolated runs from 0 and 8 seconds passed. Successful timings are not a catalog reliability or availability rate.','Native hidden windows did not provide enough rAF samples: no native visible-window FPS claim. Web samples include automation work and do not measure GPU presentation.']};
const number=value=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(value);
const md=`# RITVIO ${version} — misurazioni desktop

Confronto con ${beforeVersion} sullo stesso PC Windows, coda logica di 500 brani e profili isolati. Prima erano renderizzate tutte le righe; ora il primo blocco è di 61 (brano corrente e 60 successivi), espandibile senza perdere dati. Tre campioni di navigazione per superficie, una sola estrazione/avvio per versione. Cache esterne, stato del sistema e garbage collection non sono controllati.

| Snapshot del renderer | ${beforeVersion} | ${version} | Variazione |
| --- | ---: | ---: | ---: |
| Nodi DOM | ${before.metrics.Nodes} | ${after.metrics.Nodes} | ${number(result.nodes.percent)}% |
| Heap JS usato | ${number(before.metrics.JSHeapUsedSize/1048576)} MiB | ${number(after.metrics.JSHeapUsedSize/1048576)} MiB | ${number(result.jsHeapUsedBytes.percent)}% |
| Mediana automazione apertura coda | ${number(result.navigation.queue.before.median)} ms | ${number(result.navigation.queue.after.median)} ms | n=3 per versione |
| Mediana automazione impostazioni | ${number(result.navigation.preferences.before.median)} ms | ${number(result.navigation.preferences.after.median)} ms | n=3 per versione |

Le durate di navigazione includono i costi di Playwright/CDP su finestre nascoste: non sono la latenza percepita da un utente. Il dato concreto è la riduzione dei nodi mantenendo l'intera coda; questi snapshot non provano un risparmio equivalente di RAM totale o una velocità generale superiore. L'avvio fino allo stato DOM pronto, con estrazione del portatile, è ${number(before.startupToVisibleMs/1000)} → ${number(after.startupToVisibleMs/1000)} secondi: n=1 e cache non controllata, quindi nessuna promessa sull'avvio.

## Audio reale nell'EXE

Due riferimenti video pubblici, profili locali nuovi, descrittori e audio reali tramite proxy locale. DOM click → evento HTMLMediaElement playing; nessuna garanzia di latenza e nessun confronto audio con il concorrente. La ripresa riusa il flusso; la preparazione anticipa solo il descrittore. Anche il seek a 8 secondi dopo l'avvio è passato.

| Prova | Avvio audio (n=1) | Ripresa: mediana [min–max], n=3 | Cambio caldo: mediana [min–max], n=3 |
| --- | ---: | ---: | ---: |
| Posizione iniziale 0 | ${number(audio.coldMs)} ms | ${number(audio.resume.medianMs)} [${number(audio.resume.minMs)}–${number(audio.resume.maxMs)}] ms | ${number(audio.warmChanges.medianMs)} [${number(audio.warmChanges.minMs)}–${number(audio.warmChanges.maxMs)}] ms |
| Ripristino iniziale 8 s | ${number(restored.coldMs)} ms | ${number(restored.resume.medianMs)} [${number(restored.resume.minMs)}–${number(restored.resume.maxMs)}] ms | ${number(restored.warmChanges.medianMs)} [${number(restored.warmChanges.minMs)}–${number(restored.warmChanges.maxMs)}] ms |

Un precedente tentativo all'avvio non ha riprodotto il flusso; da quel test non è stabilita una causa. Le due successive prove isolate sono passate. I numeri sopra descrivono campioni riusciti, non un tasso di affidabilità del catalogo. I resolver e i servizi esterni possono fallire.

## Scheduling delle animazioni

La finestra nativa nascosta ha consegnato solo ${after.frameTimes?.count??0} intervalli nel budget di 8 secondi: il campione non permette di inferire FPS visibili. Separatamente, Edge headless/Vite a 1280×800 ha misurato 3 cicli caldi di navigazione e pannelli, 180 intervalli rAF consecutivi per ciclo, con 500 elementi conservati e 61 righe iniziali. Mediane ${frames.passes.map(p=>number(p.medianMs)).join(' / ')} ms; p95 ${frames.passes.map(p=>number(p.p95Ms)).join(' / ')} ms; massimi ${frames.passes.map(p=>number(p.maxMs)).join(' / ')} ms. Sono stati osservati task lunghi ${frames.passes.map(p=>p.longTasksMs.map(number).join(', ')||'nessuno').join(' / ')} ms: il lavoro di automazione è incluso. È una misura dello scheduling browser con fixture e build di sviluppo, non di presentazione GPU, batteria o FPS nativi.

SimpMusic non è stata rieseguita per misurare. Su nuova richiesta è stato riscaricato soltanto l'archivio ufficiale: il programma e il profilo precedenti restano rimossi. Non si dichiara superiorità prestazionale su quel progetto.

Dati completi: [PERFORMANCE.json](PERFORMANCE.json), [FRAMES-WEB.json](FRAMES-WEB.json). Riproduzione del confronto: .\\scripts\\pnpm.ps1 exec node scripts/compare-desktop-performance.mjs ${beforeVersion} ${version}.
`;
await mkdir(folder,{recursive:true});await writeFile(`${folder}/PERFORMANCE.json`,JSON.stringify(result,null,2));await writeFile(`${folder}/PERFORMANCE.md`,md);console.log(JSON.stringify({version,nodes:result.nodes,jsHeapUsedBytes:result.jsHeapUsedBytes,report:`${folder}/PERFORMANCE.md`}));
