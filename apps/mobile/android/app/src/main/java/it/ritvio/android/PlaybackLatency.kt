package it.ritvio.android

/** Bounded, volatile timing evidence. IDs are only used for matching, never exported. */
internal class PlaybackLatency(private val clock:()->Long) {
    data class Sample(val action:String,val start:Long,val cached:Boolean,val needsAudio:Boolean,val target:String,
        var readyMs:Long?=null,var audioMs:Long?=null,var outcome:String="pending")
    private val history=ArrayDeque<Sample>()
    private var pending:Sample?=null
    fun begin(action:String,target:String,cached:Boolean=false,needsAudio:Boolean=true){
        cancel("superseded")
        pending=Sample(action,clock(),cached,needsAudio,target).also{history.addLast(it)}
        while(history.size>20)history.removeFirst()
    }
    fun ready(id:String){val sample=pending?:return;if(sample.target!=id)return;sample.readyMs=sample.readyMs?:elapsed(sample);if(!sample.needsAudio){sample.outcome="ready-paused";pending=null}}
    fun advancing(id:String,eventTime:Long){val sample=pending?:return;if(sample.target!=id||eventTime<sample.start)return;sample.audioMs=(eventTime-sample.start).coerceAtLeast(0);sample.outcome="audio-advancing";pending=null}
    fun cancel(reason:String){pending?.outcome=reason;pending=null}
    fun samples():List<Sample>{pending?.takeIf{elapsed(it)>30_000}?.let{it.outcome="timeout";pending=null};return history.map{it.copy(target="")}}
    private fun elapsed(sample:Sample)=(clock()-sample.start).coerceAtLeast(0)
}
