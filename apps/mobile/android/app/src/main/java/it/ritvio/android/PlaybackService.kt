package it.ritvio.android

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.ShuffleOrder
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray
import org.json.JSONObject

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackService:MediaSessionService(){
    lateinit var player:ExoPlayer;private set
    private var session:MediaSession?=null
    private val tracks=mutableMapOf<String,TrackData>()
    private val handler=Handler(Looper.getMainLooper())
    private var lastError:String?=null
    private val recovery=PlaybackRecovery{SystemClock.elapsedRealtime()}
    private val retryPlayback=Runnable{retryPending()}
    private val snapshotSession=SystemClock.elapsedRealtimeNanos()/1000
    private var snapshotSequence=0L
    private var connectivity:ConnectivityManager?=null
    private val networkCallback=object:ConnectivityManager.NetworkCallback(){
        override fun onCapabilitiesChanged(network:Network,capabilities:NetworkCapabilities){if(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))handler.post{if(!shuttingDown)retryPending()}}
    }
    private var restoring=false
    private var queueRevision=0L
    private lateinit var discovery:DiscoveryController
    private var shuttingDown=false
    @Volatile private var activeTrackId:String?=null
    private var changedAt=SystemClock.elapsedRealtime()
    private var preloading=false
    private val latency=PlaybackLatency{SystemClock.elapsedRealtime()}
    private val discoveryTick=object:Runnable{override fun run(){discovery.tick();updatePreloading();handler.postDelayed(this,1000)}}
    private val historyWorker=java.util.concurrent.Executors.newSingleThreadExecutor()
    private var equalizer:android.media.audiofx.Equalizer?=null
    private var sleepUntil:Long?=null
    private var sleepAtEnd=false
    private val sleepAction=Runnable{discovery.invalidate();player.pause();cancelSleep()}
    private val persistence=object:Runnable{override fun run(){persist();handler.postDelayed(this,5000)}}
    override fun onCreate(){
        super.onCreate();instance=this
        val resolver=Resolver.get(this)
        historyWorker.execute{runCatching{resolver.initialize()}}
        val source=ResolvingDataSource.Factory(DefaultHttpDataSource.Factory().setConnectTimeoutMs(12000).setReadTimeoutMs(20000)){spec ->
            require(spec.uri.scheme=="ritvio" && spec.uri.host=="track")
            val id=spec.uri.lastPathSegment.orEmpty();val descriptor=resolver.resolve(id,speculative=id!=activeTrackId)
            spec.withUri(descriptor.uri).withRequestHeaders(descriptor.headers)
        }
        val loadControl=DefaultLoadControl.Builder()
            .setBufferDurationsMs(PlaybackTuning.MIN_BUFFER_MS,PlaybackTuning.MAX_BUFFER_MS,PlaybackTuning.START_MS,PlaybackTuning.REBUFFER_MS)
            .setBackBuffer(PlaybackTuning.BACK_BUFFER_MS,true)
            .setTargetBufferBytes(PlaybackTuning.TARGET_BUFFER_BYTES).build()
        player=ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(source)).setLoadControl(loadControl)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_NETWORK).build()
        discovery=DiscoveryController(this,resolver)
        player.addListener(object:Player.Listener{
            override fun onPlayWhenReadyChanged(playWhenReady:Boolean,reason:Int){
                if(!playWhenReady){discovery.invalidate();cancelRecovery()}
                else if(player.playbackState==Player.STATE_IDLE&&player.mediaItemCount>0){lastError=null;resetRecovery();player.currentMediaItem?.mediaId?.let{resolver.invalidate(it)};player.prepare()}
                if(sleepAtEnd && !playWhenReady && reason==Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM)cancelSleep()
                updatePreloading()
            }
            override fun onPlaybackStateChanged(playbackState:Int){if(sleepAtEnd && playbackState==Player.STATE_ENDED)cancelSleep();if(playbackState==Player.STATE_READY)latency.ready(player.currentMediaItem?.mediaId.orEmpty());updatePreloading()}
            override fun onIsPlayingChanged(isPlaying:Boolean){updatePreloading()}
            override fun onAudioSessionIdChanged(audioSessionId:Int){
                equalizer?.release();equalizer=null
                if(audioSessionId>0)runCatching{equalizer=android.media.audiofx.Equalizer(0,audioSessionId).apply{enabled=getSharedPreferences("audio",MODE_PRIVATE).getBoolean("eqEnabled",false);for(i in 0 until numberOfBands.toInt()){val level=getSharedPreferences("audio",MODE_PRIVATE).getInt("band$i",0).coerceIn(bandLevelRange[0].toInt(),bandLevelRange[1].toInt());setBandLevel(i.toShort(),level.toShort())}}}
            }
            override fun onEvents(player:Player,events:Player.Events){if(!restoring && !shuttingDown)persist()}
            override fun onMediaItemTransition(mediaItem:MediaItem?,reason:Int){
                activeTrackId=mediaItem?.mediaId;changedAt=SystemClock.elapsedRealtime();updatePreloading()
                if(!restoring&&reason==Player.MEDIA_ITEM_TRANSITION_REASON_SEEK)discovery.invalidate()
                discovery.trackChanged()
                if(sleepAtEnd && reason in listOf(Player.MEDIA_ITEM_TRANSITION_REASON_SEEK,Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED))cancelSleep()
                lastError=null;resetRecovery();mediaItem?.mediaId?.let{tracks[it]}?.let{track->historyWorker.execute{runCatching{LibraryStore.get(this@PlaybackService).remember(track)}}}
            }
            override fun onPlayerError(error:PlaybackException){
                latency.cancel("playback-error")
                val id=player.currentMediaItem?.mediaId
                val ticket=if(id!=null&&player.playWhenReady&&recoverable(error))recovery.request(id)else null
                if(ticket!=null){handler.removeCallbacks(retryPlayback);handler.postDelayed(retryPlayback,ticket.delayMs)}else failPlayback()
            }
        })
        player.addAnalyticsListener(object:AnalyticsListener{
            override fun onAudioPositionAdvancing(eventTime:AnalyticsListener.EventTime,playoutStartSystemTimeMs:Long){
                if(eventTime.windowIndex==player.currentMediaItemIndex)latency.advancing(player.currentMediaItem?.mediaId.orEmpty(),eventTime.realtimeMs)
            }
        })
        val intent=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        session=MediaSession.Builder(this,player).setSessionActivity(intent).setCallback(object:MediaSession.Callback{
            override fun onConnect(session:MediaSession,controller:MediaSession.ControllerInfo):MediaSession.ConnectionResult {
                if(controller.packageName!=packageName && !controller.isTrusted)return MediaSession.ConnectionResult.reject()
                return super.onConnect(session,controller)
            }
            override fun onAddMediaItems(session:MediaSession,controller:MediaSession.ControllerInfo,mediaItems:MutableList<MediaItem>):ListenableFuture<MutableList<MediaItem>> {
                val safe=mediaItems.take(100).mapNotNull{tracks[it.mediaId]?.item()}.toMutableList()
                return Futures.immediateFuture(safe)
            }
        }).build()
        setMediaNotificationProvider(DefaultMediaNotificationProvider.Builder(this).build().apply{setSmallIcon(R.drawable.ic_notification)})
        restore();handler.postDelayed(persistence,5000);handler.postDelayed(discoveryTick,1000)
        connectivity=getSystemService(ConnectivityManager::class.java)
        runCatching{connectivity?.registerDefaultNetworkCallback(networkCallback)}
        val prefs=getSharedPreferences("audio",MODE_PRIVATE)
        val deadline=prefs.getLong("sleepUntil",0)
        if(deadline>System.currentTimeMillis()){sleepUntil=deadline;handler.postDelayed(sleepAction,deadline-System.currentTimeMillis())}
        else if(prefs.getBoolean("sleepAtEnd",false) && player.mediaItemCount>0){sleepAtEnd=true;player.setPauseAtEndOfMediaItems(true)}
        else prefs.edit().remove("sleepUntil").remove("sleepAtEnd").apply()
    }
    private fun cancelRecovery(){handler.removeCallbacks(retryPlayback);recovery.cancel()}
    private fun resetRecovery(){handler.removeCallbacks(retryPlayback);recovery.reset()}
    private fun failPlayback(){cancelRecovery();lastError="Il flusso audio non è disponibile. Riprova o scegli un altro brano.";player.pause();persist()}
    private fun recoverable(error:PlaybackException):Boolean {
        var cause:Throwable?=error
        while(cause!=null){
            if(cause is AudioCooldownException)return false
            if(cause is HttpDataSource.InvalidResponseCodeException)return cause.responseCode in listOf(403,408,410,500,502,503,504)
            cause=cause.cause
        }
        return error.errorCode in listOf(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,PlaybackException.ERROR_CODE_IO_UNSPECIFIED)
    }
    private fun retryPending(){
        val ticket=recovery.pending?:return
        handler.removeCallbacks(retryPlayback)
        if(shuttingDown||!recovery.current(ticket,player.currentMediaItem?.mediaId)||!player.playWhenReady){cancelRecovery();return}
        if(recovery.expired(ticket)){failPlayback();return}
        val online=runCatching{connectivity?.activeNetwork?.let{connectivity?.getNetworkCapabilities(it)}?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)==true}.getOrDefault(false)
        if(!online||player.playbackSuppressionReason!=Player.PLAYBACK_SUPPRESSION_REASON_NONE){handler.postDelayed(retryPlayback,1000);return}
        if(!recovery.consume(ticket))return
        Resolver.get(this).invalidate(ticket.id);lastError=null;player.prepare();persist()
    }
    private fun updatePreloading(){
        if(!::player.isInitialized||shuttingDown)return
        val now=SystemClock.elapsedRealtime()
        val cooldown=(Resolver.get(this).audioCooldownUntil-System.currentTimeMillis()).coerceAtLeast(0)
        val enabled=recovery.pending==null&&PlaybackTuning.preload(now,changedAt,player.isPlaying,player.hasNextMediaItem(),sleeping(),player.repeatMode==Player.REPEAT_MODE_ONE,if(cooldown>0)now+cooldown else 0)
        if(enabled!=preloading){preloading=enabled;player.preloadConfiguration=if(enabled)ExoPlayer.PreloadConfiguration(PlaybackTuning.PRELOAD_US)else ExoPlayer.PreloadConfiguration.DEFAULT}
    }
    fun playbackDiagnostics():JSONObject=JSONObject().put("schema",1).put("version",packageManager.getPackageInfo(packageName,0).versionName)
        .put("engine","Media3").put("preloading",preloading).put("bufferedAheadMs",(player.bufferedPosition-player.currentPosition).coerceAtLeast(0))
        .put("policy",JSONObject().put("startMs",PlaybackTuning.START_MS).put("rebufferMs",PlaybackTuning.REBUFFER_MS).put("backBufferMs",PlaybackTuning.BACK_BUFFER_MS).put("maxForwardBufferMs",PlaybackTuning.MAX_BUFFER_MS).put("targetBufferBytes",PlaybackTuning.TARGET_BUFFER_BYTES).put("nextPreloadMs",PlaybackTuning.PRELOAD_US/1000))
        .put("recovery",JSONObject().put("attempts",recovery.attempts()).put("pending",recovery.pending!=null))
        .put("resolver",Resolver.get(this).diagnostics()).put("samples",JSONArray().apply{latency.samples().forEach{put(JSONObject().put("action",it.action).put("bufferedSeekHint",it.cached).put("requiresAudio",it.needsAudio).put("readyMs",it.readyMs?:JSONObject.NULL).put("audioPositionAdvancingMs",it.audioMs?:JSONObject.NULL).put("outcome",it.outcome))}})
    private fun cancelSleep(){handler.removeCallbacks(sleepAction);sleepUntil=null;sleepAtEnd=false;player.setPauseAtEndOfMediaItems(false);getSharedPreferences("audio",MODE_PRIVATE).edit().remove("sleepUntil").remove("sleepAtEnd").apply()}
    internal fun queueVersion()=queueRevision
    internal fun sleeping()=sleepUntil!=null||sleepAtEnd
    internal fun canExtendDiscovery()=!restoring&&!shuttingDown&&lastError==null&&recovery.pending==null&&!sleeping()&&player.repeatMode==Player.REPEAT_MODE_OFF&&player.playWhenReady&&player.mediaItemCount>0
    fun startRadio(track:TrackData){discovery.radio(track)}
    fun discoveryCommand(input:JSONObject){when(input.getString("type")){"enabled"->discovery.toggle(input.getBoolean("enabled"));"cancel"->discovery.cancelRadio();"retry"->discovery.retry();else->throw IllegalArgumentException()};persist()}
    private fun automatic(index:Int)=(player.getMediaItemAt(index).localConfiguration?.tag as? QueueOrigin)?.automatic==true
    internal fun removeFutureAutomatic(){
        val order=queueOrder();val upcoming=DiscoveryRules.futureAutomatic(order,player.currentMediaItemIndex,(0 until player.mediaItemCount).filter{automatic(it)}.toSet())
        if(upcoming.isNotEmpty()){queueRevision++;upcoming.forEach{player.removeMediaItem(it)};pruneTracks()}
    }
    private fun pruneTracks(){val retained=(0 until player.mediaItemCount).map{player.getMediaItemAt(it).mediaId}.toSet();tracks.keys.retainAll(retained)}
    internal fun appendAutomatic(candidates:List<TrackData>):List<TrackData>{
        val order=queueOrder();val past=order.take(order.indexOf(player.currentMediaItemIndex));val selected=candidates.take(DiscoveryRules.capacity(player.mediaItemCount,past.size,candidates.size));if(selected.isEmpty())return emptyList()
        val ended=player.playbackState==Player.STATE_ENDED&&player.playWhenReady
        val remove=(player.mediaItemCount+selected.size-100).coerceAtLeast(0);queueRevision++
        past.take(remove).sortedDescending().forEach{player.removeMediaItem(it)};pruneTracks()
        val originalOrder=queueOrder();val start=player.mediaItemCount
        selected.forEach{tracks[it.videoId]=it};player.addMediaItems(selected.map{it.item(automatic=true)})
        if(player.shuffleModeEnabled)player.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder((originalOrder+(start until start+selected.size)).toIntArray(),System.nanoTime()))
        if(ended){player.seekTo(start,0);player.prepare();player.play()};persist();return selected
    }
    fun audioState():JSONObject {
        val eq=equalizer;val bands=JSONArray()
        if(eq!=null)runCatching{for(i in 0 until eq.numberOfBands.toInt())bands.put(JSONObject().put("index",i).put("frequency",eq.getCenterFreq(i.toShort())/1000).put("level",eq.getBandLevel(i.toShort()).toInt()/100.0))}
        return JSONObject().put("available",eq!=null).put("bands",bands).put("min",eq?.bandLevelRange?.get(0)?.toInt()?.div(100.0)?:-15).put("max",eq?.bandLevelRange?.get(1)?.toInt()?.div(100.0)?:15).put("enabled",eq?.enabled?:false).put("sleepUntil",sleepUntil?:JSONObject.NULL).put("sleepAtEnd",sleepAtEnd)
    }
    fun audioCommand(input:JSONObject):JSONObject{
        val prefs=getSharedPreferences("audio",MODE_PRIVATE)
        when(input.getString("type")){
            "equalizer"->{val eq=equalizer?:throw IllegalStateException();val enabled=input.getBoolean("enabled");eq.enabled=enabled;prefs.edit().putBoolean("eqEnabled",enabled).apply()}
            "band"->{val eq=equalizer?:throw IllegalStateException();val band=input.getInt("index");val level=input.getDouble("level");require(band in 0 until eq.numberOfBands.toInt() && level.isFinite());val value=(level*100).toInt().coerceIn(eq.bandLevelRange[0].toInt(),eq.bandLevelRange[1].toInt());eq.setBandLevel(band.toShort(),value.toShort());prefs.edit().putInt("band$band",value).apply()}
            "sleep"->{val minutes=input.getInt("minutes");require(minutes in 0..180);discovery.invalidate();cancelSleep();sleepUntil=if(minutes==0)null else System.currentTimeMillis()+minutes*60000L;prefs.edit().putLong("sleepUntil",sleepUntil?:0).apply();sleepUntil?.let{handler.postDelayed(sleepAction,it-System.currentTimeMillis())}}
            "sleepEnd"->{require(player.mediaItemCount>0 && player.playbackState!=Player.STATE_ENDED);discovery.invalidate();cancelSleep();sleepAtEnd=true;player.setPauseAtEndOfMediaItems(true);prefs.edit().putBoolean("sleepAtEnd",true).apply()}
            else->throw IllegalArgumentException()
        };updatePreloading();return audioState()
    }
    override fun onGetSession(controllerInfo:MediaSession.ControllerInfo):MediaSession?=session
    fun setQueue(items:List<TrackData>,index:Int,fromDiscovery:Boolean=false){
        require(items.isNotEmpty() && items.size<=100 && index in items.indices)
        if(!fromDiscovery)discovery.reset()
        if(sleepAtEnd)cancelSleep()
        queueRevision++
        latency.begin("play",items[index].videoId)
        activeTrackId=items[index].videoId
        tracks.clear();items.forEach{tracks[it.videoId]=it};lastError=null;resetRecovery()
        player.setMediaItems(items.map{it.item()},index,0);player.prepare();player.play();persist()
    }
    fun queueOrder():List<Int>{
        val timeline=player.currentTimeline
        val result=mutableListOf<Int>();var index=timeline.getFirstWindowIndex(player.shuffleModeEnabled)
        while(index!=C.INDEX_UNSET && result.size<player.mediaItemCount){result.add(index);index=timeline.getNextWindowIndex(index,Player.REPEAT_MODE_OFF,player.shuffleModeEnabled)}
        return result.also{QueueRules.validate(it)}
    }
    fun queueTracks():List<TrackData> = queueOrder().map{tracks.getValue(player.getMediaItemAt(it).mediaId)}
    fun enqueue(track:TrackData,next:Boolean=false){
        require(player.mediaItemCount<100)
        discovery.invalidate()
        val oldOrder=queueOrder();val at=if(next && player.mediaItemCount>0)player.currentMediaItemIndex+1 else player.mediaItemCount
        val shuffled=if(next && player.shuffleModeEnabled)QueueRules.insertedNext(oldOrder,player.currentMediaItemIndex,at)else null
        queueRevision++;tracks[track.videoId]=track;player.addMediaItem(at,track.item())
        shuffled?.let{player.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder(it.toIntArray(),System.nanoTime()))};persist()
    }
    fun command(type:String,value:Any?){
        if(type in listOf("play","retry","next","previous","jump"))resetRecovery()
        if(type in listOf("pause","clear"))cancelRecovery()
        if(type in listOf("pause","next","previous","jump","seek","retry"))discovery.invalidate()
        val currentId=player.currentMediaItem?.mediaId
        val destination=when(type){
            "next"->player.nextMediaItemIndex.takeIf{it>=0}?.let{player.getMediaItemAt(it).mediaId}
            "previous"->if(player.currentPosition>3000)currentId else player.previousMediaItemIndex.takeIf{it>=0}?.let{player.getMediaItemAt(it).mediaId}?:currentId
            "jump"->(value as Number).toInt().takeIf{it in 0 until player.mediaItemCount}?.let{player.getMediaItemAt(it).mediaId}
            "seek","retry","play"->currentId
            else->null
        }
        if(type=="pause"||type=="clear")latency.cancel(type)
        if(destination!=null){
            val inBuffer=type=="seek"&&(value as Number).toDouble()*1000 in player.currentPosition.toDouble()..player.bufferedPosition.toDouble()
            latency.begin(type,destination,inBuffer,needsAudio=type in listOf("play","retry","jump")||player.playWhenReady)
            if(type!="seek")activeTrackId=destination
        }
        when(type){
            "play","retry"->{if(player.mediaItemCount==0)return;lastError=null;if(type=="retry")player.currentMediaItem?.mediaId?.let{Resolver.get(this).invalidate(it)};if(player.playbackState==Player.STATE_ENDED)player.seekToDefaultPosition();if(player.playbackState==Player.STATE_IDLE || type=="retry")player.prepare();player.play()}
            "pause"->player.pause()
            "next"->{if(player.hasNextMediaItem()){val resume=player.playWhenReady || lastError!=null;lastError=null;player.seekToNextMediaItem();if(resume){if(player.playbackState==Player.STATE_IDLE)player.prepare();player.play()}}}
            "previous"->{val resume=player.playWhenReady || lastError!=null;lastError=null;if(player.currentPosition>3000)player.seekTo(0)else if(player.hasPreviousMediaItem())player.seekToPreviousMediaItem()else player.seekTo(0);if(resume && player.mediaItemCount>0){if(player.playbackState==Player.STATE_IDLE)player.prepare();player.play()}}
            "seek"->{val n=(value as Number).toDouble();require(n.isFinite() && n>=0);val duration=player.duration.takeIf{it>0}?:((tracks[player.currentMediaItem?.mediaId]?.duration?:0.0)*1000).toLong();require(duration>0 && n*1000<=duration+1000);player.seekTo((n*1000).toLong().coerceAtMost(duration))}
            "volume"->{val n=(value as Number).toFloat();require(n.isFinite() && n in 0f..1f);player.volume=n}
            "shuffle"->{discovery.invalidate();queueRevision++;player.shuffleModeEnabled=value as Boolean}
            "repeat"->{val mode=when(value as String){"off"->Player.REPEAT_MODE_OFF;"all"->Player.REPEAT_MODE_ALL;"one"->Player.REPEAT_MODE_ONE;else->throw IllegalArgumentException()};discovery.invalidate();player.repeatMode=mode}
            "remove"->{val index=if(value is JSONObject){require(value.getLong("revision")==queueRevision){"QUEUE_CHANGED"};value.getInt("index")}else (value as Number).toInt();require(index in 0 until player.mediaItemCount);discovery.removed(tracks[player.getMediaItemAt(index).mediaId]);queueRevision++;player.removeMediaItem(index);pruneTracks()}
            "move"->{val data=value as JSONObject;require(data.getLong("revision")==queueRevision){"QUEUE_CHANGED"};val from=data.getInt("from");val to=data.getInt("to");val order=QueueRules.moved(queueOrder(),from,to);discovery.invalidate();queueRevision++;player.moveMediaItem(from,to);if(player.shuffleModeEnabled)player.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder(order.toIntArray(),System.nanoTime()))}
            "jump"->{val index=(value as Number).toInt();require(index in 0 until player.mediaItemCount);lastError=null;player.seekTo(index,0);if(player.playbackState==Player.STATE_IDLE)player.prepare();player.play()}
            "clear"->{discovery.reset();if(sleepAtEnd)cancelSleep();queueRevision++;player.stop();player.clearMediaItems();tracks.clear();lastError=null}
            else->throw IllegalArgumentException("Unknown command")
        };updatePreloading();persist()
    }
    fun snapshot():JSONObject {
        val items=JSONArray();for(index in 0 until player.mediaItemCount){tracks[player.getMediaItemAt(index).mediaId]?.let{items.put(it.json())}}
        val current=tracks[player.currentMediaItem?.mediaId]
        val duration=if(player.duration>0)player.duration/1000.0 else current?.duration?:0.0
        val status=when(player.playbackState){Player.STATE_READY->"ready";Player.STATE_BUFFERING->"buffering";Player.STATE_ENDED->"ended";else->"idle"}
        return JSONObject().put("items",items).put("index",player.currentMediaItemIndex.coerceAtLeast(0)).put("position",player.currentPosition.coerceAtLeast(0)/1000.0)
            .put("duration",duration).put("buffered",player.bufferedPosition.coerceAtLeast(0)/1000.0)
            .put("playing",player.playWhenReady && player.playbackState!=Player.STATE_ENDED && lastError==null).put("loading",player.playbackState==Player.STATE_BUFFERING||recovery.pending!=null)
            .put("stamp",JSONObject().put("session",snapshotSession).put("sequence",++snapshotSequence))
            .put("repeat",when(player.repeatMode){Player.REPEAT_MODE_ALL->"all";Player.REPEAT_MODE_ONE->"one";else->"off"})
            .put("shuffle",player.shuffleModeEnabled).put("volume",player.volume).put("error",lastError?:JSONObject.NULL).put("status",status).put("order",JSONArray(queueOrder())).put("queueRevision",queueRevision).put("discovery",discovery.state().put("suspended",if(sleeping())"timer"else if(player.repeatMode!=Player.REPEAT_MODE_OFF)"repeat"else JSONObject.NULL)).put("automatic",JSONArray((0 until player.mediaItemCount).filter{automatic(it)}))
    }
    private val savePending=Runnable{persistNow()}
    private fun persist(){if(restoring||!::player.isInitialized||shuttingDown)return;handler.removeCallbacks(savePending);handler.postDelayed(savePending,200)}
    private fun persistNow(){if(restoring||!::player.isInitialized)return;getSharedPreferences("playback",MODE_PRIVATE).edit().putString("state",snapshot().toString()).apply()}
    private fun restore(){
        restoring=true
        try{val raw=getSharedPreferences("playback",MODE_PRIVATE).getString("state",null)?:return;val state=JSONObject(raw);val items=TrackData.parseList(state.getJSONArray("items"));val index=state.optInt("index",0).coerceIn(items.indices);items.forEach{tracks[it.videoId]=it}
            val auto=state.optJSONArray("automatic");val autoIndices=if(auto==null)emptySet()else (0 until auto.length()).map{auto.optInt(it,-1)}.toSet()
            player.setMediaItems(items.mapIndexed{i,item->item.item(i in autoIndices)},index,(state.optDouble("position",0.0).takeIf{it.isFinite()&&it>=0}?:0.0).times(1000).toLong())
            player.volume=state.optDouble("volume",1.0).toFloat().takeIf{it.isFinite()}?.coerceIn(0f,1f)?:1f
            player.shuffleModeEnabled=state.optBoolean("shuffle",false);player.repeatMode=when(state.optString("repeat")){"all"->Player.REPEAT_MODE_ALL;"one"->Player.REPEAT_MODE_ONE;else->Player.REPEAT_MODE_OFF}
            state.optJSONArray("order")?.let{array->val order=(0 until array.length()).map{array.getInt(it)};if(order.size==items.size && order.sorted()==items.indices.toList())player.setShuffleOrder(ShuffleOrder.DefaultShuffleOrder(order.toIntArray(),System.nanoTime()))}
        }catch(_:Exception){getSharedPreferences("playback",MODE_PRIVATE).edit().remove("state").apply()}finally{restoring=false}
    }
    override fun onDestroy(){cancelRecovery();runCatching{connectivity?.unregisterNetworkCallback(networkCallback)};handler.removeCallbacks(persistence);handler.removeCallbacks(savePending);handler.removeCallbacks(sleepAction);handler.removeCallbacks(discoveryTick);persistNow();shuttingDown=true;discovery.close();session?.release();equalizer?.release();player.release();historyWorker.shutdown();instance=null;super.onDestroy()}
    companion object {@Volatile var instance:PlaybackService?=null;private set}
}
