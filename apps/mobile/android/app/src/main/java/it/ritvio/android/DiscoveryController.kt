package it.ritvio.android

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

@androidx.annotation.OptIn(UnstableApi::class)
internal class DiscoveryController(private val host:PlaybackService,private val resolver:Resolver){
    private val handler=Handler(Looper.getMainLooper())
    private val worker=Executors.newSingleThreadExecutor()
    private val warmer=Executors.newSingleThreadExecutor()
    private val gate=DiscoveryGate()
    private val prefs=host.getSharedPreferences("discovery",Context.MODE_PRIVATE)
    var enabled=prefs.getBoolean("enabled",false);private set
    private var origin:TrackData?=runCatching{TrackData.parse(JSONObject(prefs.getString("origin",null)?:""))}.getOrNull()
    private val seen=ArrayDeque<SuggestionKey>()
    private var status="idle";private var message:String?=null;private var mode:String?=null;private var retryAfter:Long?=null
    private var lastAttemptSeed:String?=null
    private var changedAt=SystemClock.elapsedRealtime()
    private var warmKey:String?=null;private var warmBusy=false;private var warmAfter=0L
    private var closed=false
    init{runCatching{val array=JSONArray(prefs.getString("seen","[]"));for(i in maxOf(0,array.length()-200) until array.length()){val item=array.getJSONObject(i);val id=item.getString("id");val edition=item.getString("edition");if(TrackData.idPattern.matches(id)&&edition.length<=6000)seen.addLast(SuggestionKey(id,edition))}}}
    private fun key(track:TrackData)=SuggestionKey(track.videoId,DiscoveryRules.edition(track.title,track.artist,track.people.map{it.first}))
    private fun remember(tracks:List<TrackData>){tracks.forEach{seen.addLast(key(it))};while(seen.size>200)seen.removeFirst();save()}
    private fun save(){prefs.edit().putBoolean("enabled",enabled).putString("origin",origin?.json()?.toString()).putString("seen",JSONArray().apply{seen.forEach{put(JSONObject().put("id",it.videoId).put("edition",it.edition))}}.toString()).apply()}
    fun state():JSONObject=JSONObject().put("enabled",enabled).put("status",status).put("loading",mode!=null).put("mode",mode?:JSONObject.NULL).put("origin",origin?.json()?:JSONObject.NULL).put("message",message?:JSONObject.NULL).put("retryAfter",retryAfter?:JSONObject.NULL)
    fun invalidate(){gate.invalidate();mode=null;status="idle";message=null;retryAfter=null;lastAttemptSeed=null}
    fun reset(){invalidate();origin=null;seen.clear();changedAt=SystemClock.elapsedRealtime();warmKey=null;save()}
    fun trackChanged(){changedAt=SystemClock.elapsedRealtime();warmKey=null}
    fun removed(track:TrackData?){if(track!=null)remember(listOf(track));invalidate()}
    fun toggle(value:Boolean){invalidate();enabled=value;if(!value){host.removeFutureAutomatic();origin=null};save()}
    fun cancelRadio(){if(mode=="radio")invalidate()}
    fun retry(){lastAttemptSeed=null;retryAfter=null;status="idle";message=null;requestAutomatic()}
    fun radio(seed:TrackData){
        check(!gate.busy){"DISCOVERY_BUSY"}
        launch(seed,true)
    }
    private fun launch(seed:TrackData,explicit:Boolean){
        val ticket=gate.begin();val revision=host.queueVersion()
        mode=if(explicit)"radio"else"autoplay";status="loading";message=null;retryAfter=null
        if(!explicit)lastAttemptSeed=seed.videoId
        worker.execute{
            var result:List<TrackData>?=null;var failure:Exception?=null
            try{result=resolver.radio(seed.videoId)}catch(error:Exception){failure=error}
            val recent=if(explicit)emptyList()else runCatching{val array=LibraryStore.get(host).snapshot().getJSONArray("recent");(0 until array.length()).map{TrackData.parse(array.getJSONObject(it))}}.getOrDefault(emptyList())
            handler.post{
                val currentTicket=gate.accepts(ticket)
                val accepted=!closed&&currentTicket&&host.queueVersion()==revision&&(explicit||host.canExtendDiscovery()&&enabled)
                gate.finish(ticket)
                if(!accepted){if(!closed&&currentTicket){mode=null;status="idle"};return@post}
                mode=null
                if(failure!=null){status="error";retryAfter=(failure as? RadioCooldownException)?.until?:System.currentTimeMillis()+60000;message="I suggerimenti non sono disponibili. La coda attuale resta utilizzabile.";return@post}
                val candidates=result.orEmpty()
                val excluded=if(explicit)listOf(key(seed))else host.queueTracks().map{key(it)}+recent.map{key(it)}+seen.toList()
                val selected=DiscoveryRules.select(candidates.map{key(it)},excluded,if(explicit)20 else 8).map{candidates[it]}
                if(selected.isEmpty()){status="empty";message="Nessun nuovo suggerimento per questa coda. Prova la radio di un altro brano.";return@post}
                if(explicit){
                    enabled=true;origin=seed;seen.clear();remember(listOf(seed)+selected)
                    host.player.repeatMode=Player.REPEAT_MODE_OFF
                    host.player.shuffleModeEnabled=false
                    host.setQueue(listOf(seed)+selected,0,fromDiscovery=true)
                }else{
                    val added=host.appendAutomatic(selected)
                    if(added.isEmpty()){status="full";message="La coda non ha spazio per altri suggerimenti.";return@post}
                    remember(added)
                }
                status="ready";message=null;save()
            }
        }
    }
    fun requestAutomatic(){
        if(closed||gate.busy||!host.canExtendDiscovery()||!enabled)return
        val order=host.queueOrder();val remaining=order.size-order.indexOf(host.player.currentMediaItemIndex)-1
        if(!DiscoveryRules.shouldExtend(enabled,host.player.playWhenReady,false,remaining))return
        val seed=host.queueTracks().lastOrNull()?:return
        if(seed.videoId==lastAttemptSeed)return
        launch(seed,false)
    }
    fun tick(){
        if(closed)return
        val now=SystemClock.elapsedRealtime();val player=host.player
        if(now-changedAt>=4000)requestAutomatic()
        if(warmBusy||mode=="radio"||now<warmAfter||now-changedAt<8000||!player.isPlaying||host.sleeping()||player.repeatMode==Player.REPEAT_MODE_ONE)return
        val next=player.nextMediaItemIndex;if(next<0)return
        val id=player.getMediaItemAt(next).mediaId
        if(id==player.currentMediaItem?.mediaId)return
        val pair="${player.currentMediaItem?.mediaId}:$id";if(pair==warmKey)return
        warmKey=pair;warmBusy=true;warmAfter=now+30000
        warmer.execute{runCatching{resolver.prepare(id)};handler.post{warmBusy=false}}
    }
    fun close(){closed=true;gate.invalidate();worker.shutdownNow();warmer.shutdownNow();handler.removeCallbacksAndMessages(null)}
}
