package it.ritvio.android

/** Positions, not video IDs: intentional duplicates are separate queue entries. */
internal object QueueRules {
    fun validate(order:List<Int>) { require(order.sorted()==order.indices.toList()) }
    fun moved(order:List<Int>,from:Int,to:Int):List<Int> {
        validate(order);require(from in order.indices && to in order.indices)
        val result=order.toMutableList()
        val destination=result.indexOf(to)
        result.remove(from);result.add(destination,from)
        return result.map { old -> when {
            old==from -> to
            from<to && old in (from+1)..to -> old-1
            from>to && old in to until from -> old+1
            else -> old
        }}
    }
    fun insertedNext(order:List<Int>,current:Int,insertAt:Int):List<Int> {
        validate(order);require(insertAt in 0..order.size)
        if(order.isEmpty())return listOf(0)
        require(current in order.indices)
        val next=order.map{if(it>=insertAt)it+1 else it}.toMutableList()
        next.add(order.indexOf(current)+1,insertAt)
        return next
    }
}
