package it.ritvio.android

import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.ActivityCallback
import androidx.activity.result.ActivityResult
import android.app.Activity
import android.content.Intent
import android.content.ClipData
import androidx.core.content.FileProvider
import java.io.File
import org.json.JSONObject
import com.google.common.util.concurrent.ListenableFuture
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name="RitvioPlayback")
class RitvioPlaybackPlugin:Plugin(){
    @PluginMethod fun languageRead(call:PluginCall){activity.runOnUiThread{try{call.resolve(JSObject(LanguagePreferences.snapshot(context).toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Preferenza lingua non disponibile."),"LANGUAGE_READ_FAILED")}}}
    @PluginMethod fun languageWrite(call:PluginCall){activity.runOnUiThread{try{val state=JSObject(LanguagePreferences.write(activity,call.getString("preference")?:"").toString());notifyListeners("language",state);call.resolve(state)}catch(error:Exception){call.reject(NativeText.text(context,"Impossibile cambiare la lingua. Riprova."),if(error.message=="LANGUAGE_NOT_READY")"LANGUAGE_NOT_READY" else "LANGUAGE_WRITE_FAILED")}}}
    private fun publishLanguage(){runCatching{notifyListeners("language",JSObject(LanguagePreferences.snapshot(context).toString()))}}
    override fun handleOnConfigurationChanged(newConfig:android.content.res.Configuration){publishLanguage()}
    private lateinit var controller:ListenableFuture<MediaController>
    private val storyWorker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(1))
    @Volatile private var storyFile:File?=null
    private fun stories()=StoryMedia(context)
    private val handler=Handler(Looper.getMainLooper())
    private var visible=true
    private val searches=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(2))
    private val catalogWorker=ThreadPoolExecutor(2,2,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(4))
    private val libraryWorker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(12))
    private val transferWorker=ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,ArrayBlockingQueue<Runnable>(1))
    private val transfers=PlaylistTransfers()
    @Volatile private var exportFile:File?=null
    private val updates=object:Runnable{override fun run(){if(visible){PlaybackService.instance?.let{notifyListeners("playback",JSObject(it.snapshot().toString()))};handler.postDelayed(this,500)}}}
    override fun load(){controller=MediaController.Builder(context,SessionToken(context,ComponentName(context,PlaybackService::class.java))).buildAsync();handler.post(updates)}
    private fun service(call:PluginCall,action:(PlaybackService)->Unit){
        controller.addListener({try{controller.get();val service=PlaybackService.instance?:error("No service");action(service)}catch(_:Exception){call.reject(NativeText.text(context,"Il player non è disponibile. Riapri l’app."),"PLAYER_UNAVAILABLE")}},ContextCompat.getMainExecutor(context))
    }
    @PluginMethod fun snapshot(call:PluginCall){service(call){call.resolve(JSObject(it.snapshot().toString()))}}
    @PluginMethod fun radio(call:PluginCall){service(call){service->try{service.startRadio(TrackData.parse(call.getObject("track")?:throw IllegalArgumentException()));call.resolve(JSObject(service.snapshot().toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Attendi la preparazione in corso e riprova."),"DISCOVERY_BUSY")}}}
    @PluginMethod fun discoveryCommand(call:PluginCall){service(call){service->try{service.discoveryCommand(call.data);call.resolve(JSObject(service.snapshot().toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Impossibile aggiornare l’autoplay. Riprova."),"DISCOVERY_FAILED")}}}
    @PluginMethod fun catalog(call:PluginCall){try{catalogWorker.execute{try{call.resolve(JSObject(Resolver.get(context).catalog(call.data).toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Il catalogo non risponde. Riprova tra poco."),"CATALOG_FAILED")}}}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi il caricamento in corso."),"CATALOG_BUSY")}}
    @PluginMethod fun library(call:PluginCall){libraryTask(call){LibraryStore.get(context).snapshot()}}
    @PluginMethod fun libraryCommand(call:PluginCall){libraryTask(call){LibraryStore.get(context).command(call.data)}}
    private fun transferTask(call:PluginCall,action:()->Unit):Boolean{try{transferWorker.execute{try{action()}catch(error:Exception){val message=error.message?.takeIf{NativeText.isMessage(it)}?.let{NativeText.text(context,it)};call.reject(message?:NativeText.text(context,"Operazione non riuscita. Controlla i dati e riprova."),"TRANSFER_FAILED")}};return true}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi l’operazione in corso."),"TRANSFER_BUSY");return false}}
    @PluginMethod fun previewPlaylist(call:PluginCall){
        val request=try{transfers.begin(call.getString("requestId")?:"")}catch(_:Exception){call.reject(NativeText.text(context,"Attendi la lettura precedente."),"TRANSFER_BUSY");return}
        if(!transferTask(call){try{val id=TransferRules.link(call.getString("url")?:"");val raw=Resolver.get(context).playlistPreview(id,request.cancellation);call.resolve(JSObject(transfers.ready(request,raw).toString()))}finally{transfers.end(request)}})transfers.end(request)
    }
    @PluginMethod fun cancelPlaylistImport(call:PluginCall){transfers.cancel(call.getString("requestId")?:"");call.resolve()}
    @PluginMethod fun choosePlaylistFile(call:PluginCall){
        try{transfers.begin(call.getString("requestId")?:"")}catch(_:Exception){call.reject(NativeText.text(context,"Attendi la lettura precedente."),"TRANSFER_BUSY");return}
        activity.runOnUiThread{try{startActivityForResult(call,Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),"playlistChosen")}catch(_:Exception){runCatching{transfers.end(transfers.request(call.getString("requestId")?:""))};call.reject(NativeText.text(context,"Selettore documenti non disponibile."),"PICKER_UNAVAILABLE")}}
    }
    @ActivityCallback private fun playlistChosen(call:PluginCall?,result:ActivityResult){
        if(call==null)return
        val request=runCatching{transfers.request(call.getString("requestId")?:"")}.getOrElse{call.reject(NativeText.text(context,"Riapri l’importazione dopo il riavvio."),"IMPORT_EXPIRED");return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK||uri==null){transfers.end(request);call.resolve(JSObject().put("cancelled",true));return}
        if(!transferTask(call){try{
            require(uri.scheme=="content"&&!request.cancellation.cancelled)
            val bytes=context.contentResolver.openInputStream(uri)?.use{stream->val buffer=java.io.ByteArrayOutputStream();val chunk=ByteArray(8192);while(true){val size=stream.read(chunk);if(size<0)break;require(buffer.size()+size<=TransferRules.FILE_LIMIT&&!request.cancellation.cancelled);buffer.write(chunk,0,size)};buffer.toByteArray()}?:throw IllegalArgumentException()
            val text=Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString()
            val value=PlaylistTransferCodec.file(text);call.resolve(JSObject(transfers.ready(request,value).toString()))
        }finally{transfers.end(request)}})transfers.end(request)
    }
    @PluginMethod fun commitPlaylistImport(call:PluginCall){
        transferTask(call){call.resolve(JSObject(transfers.commit(call.getString("requestId")?:"",call.data,LibraryStore.get(context)).toString()))}
    }
    private fun exportDirectory()=File(context.cacheDir,"playlist-exports").apply{mkdirs()}
    @PluginMethod fun exportPlaylist(call:PluginCall){transferTask(call){
        check(exportFile==null)
        val library=LibraryStore.get(context).snapshot().getJSONArray("playlists");val id=call.getString("id")?:""
        val playlist=(0 until library.length()).map{library.getJSONObject(it)}.firstOrNull{it.getString("id")==id}?:throw IllegalArgumentException()
        val filename=TransferRules.filename(playlist.getString("name"));val content=PlaylistTransferCodec.exported(playlist)
        val directory=exportDirectory();directory.listFiles()?.filter{it.isFile&&it.canonicalFile.parentFile==directory.canonicalFile&&Regex("^[a-f0-9-]{36}\\.ritvio\\.json$").matches(it.name)&&it.lastModified()<System.currentTimeMillis()-86400000}?.forEach{it.delete()}
        val file=File(directory,"${java.util.UUID.randomUUID()}.ritvio.json");file.writeText(content,Charsets.UTF_8)
        if(call.getBoolean("save",false)==true){
            exportFile=file
            activity.runOnUiThread{try{startActivityForResult(call,Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,filename),"playlistSaved")}catch(_:Exception){exportFile=null;file.delete();call.reject(NativeText.text(context,"Salvataggio non disponibile."),"PICKER_UNAVAILABLE")}}
        }else activity.runOnUiThread{try{val uri=FileProvider.getUriForFile(context,context.packageName+".fileprovider",file,filename);val intent=Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM,uri).putExtra(Intent.EXTRA_TITLE,filename).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.clipData=ClipData.newRawUri(filename,uri);activity.startActivity(Intent.createChooser(intent,NativeText.text(context,"Condividi playlist")));call.resolve(JSObject().put("status","opened"))}catch(_:Exception){call.reject(NativeText.text(context,"Nessuna app disponibile per condividere la playlist."),"SHARE_FAILED")}}
    }}
    @ActivityCallback private fun playlistSaved(call:PluginCall?,result:ActivityResult){
        val file=exportFile;exportFile=null;if(call==null)return
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK||uri==null){file?.delete();call.resolve(JSObject().put("status","cancelled"));return}
        transferTask(call){try{require(file!=null&&file.canonicalFile.parentFile==exportDirectory().canonicalFile&&uri.scheme=="content");context.contentResolver.openOutputStream(uri,"w")?.use{output->file.inputStream().use{it.copyTo(output)}}?:throw IllegalArgumentException();call.resolve(JSObject().put("status","saved"))}finally{file?.delete()}}
    }
    @PluginMethod fun saveQueue(call:PluginCall){service(call){service->
        val items=org.json.JSONArray().apply{service.queueTracks().forEach{put(it.json())}}
        val input=org.json.JSONObject().put("type","createFromTracks").put("name",call.getString("name")?:"").put("items",items)
        libraryTask(call){LibraryStore.get(context).command(input)}
    }}
    @PluginMethod fun audio(call:PluginCall){service(call){call.resolve(JSObject(it.audioState().toString()))}}
    @PluginMethod fun audioCommand(call:PluginCall){service(call){service->try{call.resolve(JSObject(service.audioCommand(call.data).toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Controllo audio non disponibile sul dispositivo."),"AUDIO_UNAVAILABLE")}}}
    @PluginMethod fun lyrics(call:PluginCall){try{catalogWorker.execute{try{val track=TrackData.parse(call.getObject("track")?:throw IllegalArgumentException());val result=Resolver.get(context).lyrics(track).toString();call.resolve(JSObject(result))}catch(error:Exception){val limited=error.toString().contains("LYRICS_RATE_LIMIT");call.reject(if(limited)NativeText.text(context,"La fonte dei testi richiede una pausa. Riprova tra poco.") else NativeText.text(context,"Testo non disponibile. Riprova tra poco."),if(limited)"LYRICS_RATE_LIMIT" else "LYRICS_FAILED")}}}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi il caricamento in corso."),"CATALOG_BUSY")}}
    private fun storyTask(call:PluginCall,action:()->Unit){try{storyWorker.execute{try{action()}catch(_:OutOfMemoryError){call.reject(NativeText.text(context,"Memoria insufficiente per l’immagine. Chiudi l’anteprima e riprova."),"STORY_MEMORY")}catch(_:Exception){call.reject(NativeText.text(context,"Immagine non disponibile. Riapri Condividi e riprova."),"STORY_FAILED")}}}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi la preparazione dell’immagine e riprova."),"STORY_BUSY")}}
    @PluginMethod fun storyArtwork(call:PluginCall){storyTask(call){call.resolve(JSObject().put("dataUrl",stories().artwork(call.getString("videoId")?:"")))}}
    @PluginMethod fun exportStory(call:PluginCall){storyTask(call){
        require(storyFile==null)
        val id=call.getString("videoId")?:"";val filename=StoryRules.filename(id);val file=stories().prepare(id,call.getString("base64")?:"")
        if(call.getBoolean("save",false)==true&&Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q){
            try{
                val gallery=StoryGallery(context)
                gallery.save(file,id)
                call.resolve(JSObject().put("status","saved").put("destination","gallery").put("album",gallery.album))
            }catch(_:Exception){call.reject(NativeText.text(context,"Impossibile salvare in Galleria. Controlla lo spazio disponibile e riprova."),"STORY_SAVE_FAILED")}
            finally{file.delete()}
        }else if(call.getBoolean("save",false)==true){
            storyFile=file
            activity.runOnUiThread{try{startActivityForResult(call,Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE,filename),"storySaved")}catch(_:Exception){storyFile=null;file.delete();call.reject(NativeText.text(context,"Salvataggio non disponibile. Riprova."),"STORY_SAVE_FAILED")}}
        }else activity.runOnUiThread{try{
            val uri=FileProvider.getUriForFile(context,context.packageName+".fileprovider",file,filename)
            val intent=Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,uri).putExtra(Intent.EXTRA_TITLE,filename).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.clipData=ClipData.newRawUri(filename,uri);activity.startActivity(Intent.createChooser(intent,NativeText.text(context,"Condividi immagine")));call.resolve(JSObject().put("status","opened"))
        }catch(_:Exception){file.delete();call.reject(NativeText.text(context,"Nessuna app disponibile per condividere l’immagine."),"STORY_SHARE_FAILED")}}
    }}
    @ActivityCallback private fun storySaved(call:PluginCall?,result:ActivityResult){
        val file=storyFile;storyFile=null;if(call==null){file?.delete();return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK||uri==null){file?.delete();call.resolve(JSObject().put("status","cancelled"));return}
        storyTask(call){try{require(file!=null&&file.canonicalFile.parentFile==stories().directory().canonicalFile&&uri.scheme=="content");context.contentResolver.openOutputStream(uri,"w")?.use{output->file.inputStream().use{it.copyTo(output)}}?:throw IllegalArgumentException();call.resolve(JSObject().put("status","saved").put("destination","document"))}finally{file?.delete()}}
    }
    @PluginMethod fun share(call:PluginCall){
        try{val track=TrackData.parse(call.getObject("track")?:throw IllegalArgumentException());val intent=android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT,"${track.title} — ${track.artist}\nhttps://www.youtube.com/watch?v=${track.videoId}\n${NativeText.text(context,"Condiviso con RITVIO")}");activity.runOnUiThread{try{activity.startActivity(android.content.Intent.createChooser(intent,NativeText.text(context,"Condividi brano")));call.resolve()}catch(_:Exception){call.reject(NativeText.text(context,"Nessuna app di condivisione disponibile."),"SHARE_FAILED")}}}catch(_:Exception){call.reject(NativeText.text(context,"Brano non valido."),"INVALID_TRACK")}
    }
    private fun libraryTask(call:PluginCall,action:()->org.json.JSONObject){try{libraryWorker.execute{try{call.resolve(JSObject(action().toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Impossibile aggiornare la libreria. Controlla i dati e riprova."),"LIBRARY_FAILED")}}}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi il salvataggio in corso."),"LIBRARY_BUSY")}}
    @PluginMethod fun search(call:PluginCall){
        val query=call.getString("query")?.trim().orEmpty();if(query.length !in 3..200){call.reject(NativeText.text(context,"Inserisci da 3 a 200 caratteri."),"INVALID_QUERY");return}
        try{searches.execute{try{val result=Resolver.get(context).search(query);call.resolve(JSObject(result.toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Il catalogo non risponde. Controlla la connessione e riprova."),"SEARCH_FAILED")}}}catch(_:java.util.concurrent.RejectedExecutionException){call.reject(NativeText.text(context,"Attendi la ricerca in corso."),"SEARCH_BUSY")}
    }
    @PluginMethod fun playTracks(call:PluginCall){service(call){service->try{val items=TrackData.parseList(call.getArray("items")?:throw IllegalArgumentException());val index=call.getInt("index",0)?:0;service.setQueue(items,index);call.resolve(JSObject(service.snapshot().toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Coda non valida."),"INVALID_QUEUE")}}}
    @PluginMethod fun enqueue(call:PluginCall){service(call){service->try{service.enqueue(TrackData.parse(call.getObject("track")?:throw IllegalArgumentException()),call.getBoolean("next",false)?:false);call.resolve(JSObject(service.snapshot().toString()))}catch(_:Exception){call.reject(NativeText.text(context,"Impossibile aggiungere il brano. La coda può contenere 100 brani."),"QUEUE_FULL")}}}
    @PluginMethod fun command(call:PluginCall){service(call){service->try{service.command(call.getString("type")?:"",call.data.opt("value"));call.resolve(JSObject(service.snapshot().toString()))}catch(error:Exception){if(error.message=="QUEUE_CHANGED")call.reject(NativeText.text(context,"La coda è cambiata. Riprova sulla posizione aggiornata."),"QUEUE_CHANGED")else call.reject(NativeText.text(context,"Comando non valido."),"INVALID_COMMAND")}}}
    override fun handleOnPause(){visible=false;handler.removeCallbacks(updates)}
    override fun handleOnResume(){visible=true;handler.removeCallbacks(updates);handler.post(updates);publishLanguage()}
    override fun handleOnDestroy(){visible=false;handler.removeCallbacks(updates);transfers.close();storyWorker.shutdownNow();transferWorker.shutdownNow();searches.shutdownNow();catalogWorker.shutdownNow();libraryWorker.shutdownNow();MediaController.releaseFuture(controller)}
}
