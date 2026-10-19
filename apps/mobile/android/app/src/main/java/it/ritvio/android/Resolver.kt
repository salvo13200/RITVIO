package it.ritvio.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.atomic.AtomicLong

data class AudioDescriptor(val uri: Uri, val headers: Map<String,String>, val expires: Long)
class RadioCooldownException(val until:Long):IOException("Attendi prima di richiedere altri suggerimenti")
class AudioCooldownException(val until:Long):IOException("Preparazione temporaneamente sospesa. Riprova tra poco.")

class Resolver private constructor(context: Context) {
    private val app=context.applicationContext
    private val cache=SearchCache(app)
    private val audio=DescriptorCache<AudioDescriptor>({System.currentTimeMillis()/1000})
    private val preparation=AudioSingleFlight<DescriptorCache.Key,AudioDescriptor>{key,background->resolveLocked(key,background)}
    private val cacheHits=AtomicLong()
    private val networkResolutions=AtomicLong()
    private val lastResolutionMs=AtomicLong()
    private val lastForegroundMs=AtomicLong()
    private val lastBackgroundMs=AtomicLong()
    private val radioLock=Any()
    private var radioNextAllowed=0L
    private var playlistNextAllowed=0L
    private val failures=mutableMapOf<String,Long>()
    @Volatile var audioCooldownUntil=0L;private set
    @Volatile private var initialized=false
    @Synchronized fun initialize() {
        if(initialized)return
        if(!Python.isStarted())Python.start(AndroidPlatform(app))
        Python.getInstance().getModule("ritvio_resolver").callAttr("initialize",QuickJsBridge)
        initialized=true
    }
    fun search(query: String): JSONObject {
        val trimmed=query.trim();require(trimmed.length in 3..200)
        val key=trimmed.lowercase(java.util.Locale.ROOT)
        cache.read(key)?.let { return it.put("cached",true) }
        initialize()
        val result=JSONObject(Python.getInstance().getModule("ritvio_resolver").callAttr("search",trimmed).toString())
        val items=result.getJSONArray("items");require(items.length()<=20)
        for(index in 0 until items.length())TrackData.parse(items.getJSONObject(index))
        cache.write(key,result.toString());return result.put("cached",false)
    }
    fun invalidate(id:String) { audio.invalidate(id);synchronized(failures){failures.remove(id)} }
    fun playlistPreview(id:String,cancellation:ImportCancellation):JSONObject{
        require(TransferRules.playlistId.matches(id));val key="playlist:"+id
        cache.read(key)?.let{return it.put("cached",true)}
        synchronized(radioLock){require(System.currentTimeMillis()>=playlistNextAllowed){"Attendi qualche secondo prima di importare un'altra playlist."};playlistNextAllowed=System.currentTimeMillis()+20000}
        initialize();val value=Python.getInstance().getModule("ritvio_resolver").callAttr("playlist_preview",id,cancellation).toString()
        require(value.toByteArray(Charsets.UTF_8).size<=TransferRules.FILE_LIMIT&&!cancellation.cancelled)
        val result=JSONObject(value);require(result.getJSONArray("entries").length()<=1000);result.put("fetchedAt",System.currentTimeMillis());cache.write(key,result.toString());return result.put("cached",false)
    }
    fun radio(id:String):List<TrackData>{
        require(TrackData.idPattern.matches(id));val key="radio:"+id
        fun parse(value:JSONObject):List<TrackData>{val items=value.getJSONArray("items");return (0 until minOf(items.length(),51)).mapNotNull{runCatching{TrackData.parse(items.getJSONObject(it))}.getOrNull()}}
        cache.read(key)?.let{return parse(it)}
        synchronized(radioLock){val now=System.currentTimeMillis();if(now<radioNextAllowed)throw RadioCooldownException(radioNextAllowed);radioNextAllowed=now+20000}
        try{
            initialize();val payload=JSONObject().put("operation","radio").put("videoId",id)
            val raw=Python.getInstance().getModule("ritvio_resolver").callAttr("catalog",payload.toString()).toString();require(raw.length<=500000)
            val value=JSONObject(raw);val tracks=parse(value);if(tracks.isNotEmpty())cache.write(key,value.toString());return tracks
        }catch(error:Exception){synchronized(radioLock){radioNextAllowed=System.currentTimeMillis()+60000};throw error}
    }
    fun catalog(payload:JSONObject):JSONObject{
        val operation=payload.getString("operation");require(operation in listOf("catalog-search","detail","home-index","home-collection","browse-index","browse-playlists","browse-tracks"))
        val refresh=payload.optBoolean("refresh",false);val normalized=JSONObject(payload.toString());normalized.remove("refresh")
        val json=normalized.toString();require(json.length<=100000)
        val key=(if(operation=="home-index")"catalog:international-v1:" else "catalog:")+json
        if(!refresh)cache.read(key)?.let{return it.put("cached",true)}
        initialize()
        try{
            val value=Python.getInstance().getModule("ritvio_resolver").callAttr("catalog",json).toString();require(value.length<=2*1024*1024)
            val result=JSONObject(value).put("fetchedAt",System.currentTimeMillis()).put("stale",false)
            if(operation=="home-index" && result.optJSONArray("collections")?.length()==0)throw IOException("Empty Home catalog")
            cache.write(key,result.toString());return result.put("cached",false)
        }catch(error:Exception){cache.read(key,true)?.let{return it.put("cached",true).put("stale",true)};throw error}
    }
    fun lyrics(track:TrackData):JSONObject{
        val primary=track.people.firstOrNull()?.second.orEmpty()
        val key="lyrics:v2:"+track.videoId+":"+track.title+":"+track.artist+":"+primary+":"+track.duration
        cache.read(key)?.let{return it}
        initialize();val value=Python.getInstance().getModule("ritvio_resolver").callAttr("lyrics",track.title,track.artist,track.duration,primary).toString();require(value.length<=500000)
        return JSONObject(value).also{result->
            val hasText=listOf("plainLyrics","syncedLyrics").any{!result.isNull(it)&&result.optString(it).isNotBlank()}
            if(result.optBoolean("instrumental")||hasText)cache.write(key,result.toString())
        }
    }
    fun resolve(id:String,speculative:Boolean=false):AudioDescriptor {
        require(TrackData.idPattern.matches(id))
        audio.cached(id)?.let{cacheHits.incrementAndGet();return it}
        try{return preparation.get(audio.key(id),speculative)}
        catch(error:InterruptedException){Thread.currentThread().interrupt();throw IOException("Preparazione annullata",error)}
    }
    fun diagnostics()=JSONObject().put("cacheHits",cacheHits.get()).put("networkResolutions",networkResolutions.get()).put("joinedRequests",preparation.joined.get()).put("pendingRequests",preparation.pending()).put("lastResolutionMs",lastResolutionMs.get()).put("lastForegroundResolutionMs",lastForegroundMs.get()).put("lastBackgroundResolutionMs",lastBackgroundMs.get()).put("cachedDescriptors",audio.count()).put("cooldownRemainingMs",(audioCooldownUntil-System.currentTimeMillis()).coerceAtLeast(0))
    private fun resolveLocked(key:DescriptorCache.Key,speculative:Boolean=false):AudioDescriptor {
        val id=key.id
        audio.cached(id)?.let{return it}
        if(!audio.current(key))throw IOException("Preparazione annullata")
        val now=System.currentTimeMillis()
        if(now<audioCooldownUntil)throw AudioCooldownException(audioCooldownUntil)
        if(synchronized(failures){(failures[id]?:0)>now})throw IOException("Preparazione temporaneamente sospesa. Riprova tra poco.")
        val started=System.nanoTime()
        try{
            networkResolutions.incrementAndGet()
            initialize()
            val raw=JSONObject(Python.getInstance().getModule("ritvio_resolver").callAttr("resolve",id).toString())
            val uri=Uri.parse(raw.getString("url"));require(uri.scheme=="https" && uri.host.orEmpty().endsWith(".googlevideo.com") && uri.userInfo==null && uri.port in listOf(-1,443))
            val expires=raw.getLong("expires");require(expires>System.currentTimeMillis()/1000+20)
            val headers=raw.getJSONObject("headers");val allowed=setOf("user-agent","referer","origin","accept","accept-language")
            val map=buildMap { for(key in headers.keys()){val value=headers.getString(key);require(key.lowercase() in allowed && !value.contains('\n') && !value.contains('\r'));put(key,value)} }
            val result=AudioDescriptor(uri,map,expires);audio.store(key,result,expires);return result
        }catch(error:Exception){
            if(error.toString().contains("429")||error.toString().contains("Too Many Requests",true)){audioCooldownUntil=System.currentTimeMillis()+60000;throw AudioCooldownException(audioCooldownUntil)}
            // A loader cancelled by a skip must not negatively cache the old track.
            if(Thread.currentThread().isInterrupted)throw IOException("Preparazione annullata",error)
            if(!speculative)synchronized(failures){failures.entries.removeAll{it.value<now};failures[id]=System.currentTimeMillis()+10000}
            throw IOException("Il servizio musicale non risponde. Riprova tra poco.",error)
        }finally{val elapsed=(System.nanoTime()-started)/1_000_000;lastResolutionMs.set(elapsed);if(speculative)lastBackgroundMs.set(elapsed)else lastForegroundMs.set(elapsed)}
    }
    companion object {
        @Volatile private var instance:Resolver?=null
        fun get(context:Context):Resolver=instance?:synchronized(this){instance?:Resolver(context).also{instance=it}}
    }
}

private class SearchCache(context:Context):SQLiteOpenHelper(context,"catalog.sqlite",null,1){
    override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE search_cache (query TEXT PRIMARY KEY, data TEXT NOT NULL, fetched INTEGER NOT NULL)")}
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){}
    @Synchronized fun read(query:String,stale:Boolean=false):JSONObject? = readableDatabase.rawQuery("SELECT data FROM search_cache WHERE query=? AND fetched>?",arrayOf(query,(if(stale)0 else System.currentTimeMillis()-6*3600000).toString())).use { if(it.moveToFirst())JSONObject(it.getString(0)) else null }
    @Synchronized fun write(query:String,data:String){val db=writableDatabase;db.execSQL("INSERT OR REPLACE INTO search_cache VALUES (?,?,?)",arrayOf<Any>(query,data,System.currentTimeMillis()));db.execSQL("DELETE FROM search_cache WHERE query NOT IN (SELECT query FROM search_cache ORDER BY fetched DESC LIMIT 40)")}
}
