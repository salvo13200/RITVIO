package it.ritvio.android

import java.text.Normalizer
import java.util.Locale

internal data class SuggestionKey(val videoId:String,val edition:String)
internal object DiscoveryRules {
    fun edition(title:String,artist:String,credits:List<String>):String {
        fun clean(value:String)=Normalizer.normalize(value,Normalizer.Form.NFKD).replace(Regex("\\p{M}"),"").lowercase(Locale.ROOT).replace(Regex("[^\\p{L}\\p{N}]+")," ").trim()
        return clean(title)+"::"+if(credits.isEmpty())clean(artist.replace(Regex("\\s*-\\s*Topic$",RegexOption.IGNORE_CASE),""))else credits.sorted().joinToString("|")
    }
    fun select(candidates:List<SuggestionKey>,excluded:List<SuggestionKey>,limit:Int):List<Int>{
        if(limit<=0)return emptyList()
        val ids=excluded.map{it.videoId}.toMutableSet();val editions=excluded.map{it.edition}.toMutableSet();val result=mutableListOf<Int>()
        for((i,key) in candidates.withIndex())if(key.videoId !in ids && key.edition !in editions){ids.add(key.videoId);editions.add(key.edition);result.add(i);if(result.size>=limit)break}
        return result
    }
    fun shouldExtend(enabled:Boolean,playing:Boolean,blocked:Boolean,remaining:Int)=enabled&&playing&&!blocked&&remaining in 0..2
    fun capacity(count:Int,past:Int,requested:Int)=minOf(requested,100-count+past).coerceAtLeast(0)
    fun futureAutomatic(order:List<Int>,current:Int,automatic:Set<Int>):List<Int> = if(current !in order)emptyList()else order.drop(order.indexOf(current)+1).filter{it in automatic}.sortedDescending()
}

/** Main-thread tickets. Invalidation cannot let an obsolete response mutate a new queue. */
internal class DiscoveryGate {
    data class Ticket(val generation:Long,val serial:Long)
    private var generation=0L;private var serial=0L;private var active:Ticket?=null
    val busy get()=active!=null
    fun begin():Ticket {check(!busy);return Ticket(generation,++serial).also{active=it}}
    fun invalidate(){generation++}
    fun accepts(ticket:Ticket)=active==ticket&&generation==ticket.generation
    fun finish(ticket:Ticket){if(active==ticket)active=null}
}
