package it.ritvio.android

/** Small URL-metadata cache. A retry's generation cannot be overwritten by an old preload. */
internal class DescriptorCache<T:Any>(private val seconds:()->Long,private val capacity:Int=8) {
    data class Key(val id:String,val generation:Long)
    private data class Entry<T>(val key:Key,var value:T?=null,var expires:Long=0)
    private val entries=LinkedHashMap<String,Entry<T>>(8,.75f,true)
    private var generation=0L
    init{require(capacity>0)}
    @Synchronized fun key(id:String):Key {
        entries[id]?.let{return it.key}
        val key=Key(id,++generation);entries[id]=Entry(key)
        while(entries.size>capacity)entries.remove(entries.keys.first())
        return key
    }
    @Synchronized fun cached(id:String):T?=entries[id]?.takeIf{it.expires>seconds()+90}?.value
    @Synchronized fun current(key:Key)=entries[key.id]?.key==key
    @Synchronized fun store(key:Key,value:T,expires:Long):Boolean {
        val entry=entries[key.id]?.takeIf{it.key==key}?:return false
        entry.value=value;entry.expires=expires;return true
    }
    @Synchronized fun invalidate(id:String){entries.remove(id)}
    @Synchronized fun count()=entries.values.count{it.value!=null&&it.expires>seconds()+90}
}
