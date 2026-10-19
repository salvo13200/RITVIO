package it.ritvio.android

/** Each activation gets at most two automatic attempts. Cancellation invalidates old callbacks. */
internal class PlaybackRecovery(private val clock:()->Long) {
    data class Ticket(val generation:Long,val id:String,val delayMs:Long,val deadline:Long)
    private var generation=0L
    private var attempts=0
    var pending:Ticket?=null;private set
    fun reset(){cancel();attempts=0}
    fun cancel(){generation++;pending=null}
    fun request(id:String):Ticket? {
        pending?.let{return it}
        if(attempts>=2)return null
        return Ticket(++generation,id,if(attempts++==0)1000 else 3000,clock()+30000).also{pending=it}
    }
    fun current(ticket:Ticket,id:String?)=pending===ticket&&ticket.generation==generation&&ticket.id==id
    fun expired(ticket:Ticket)=clock()>=ticket.deadline
    fun consume(ticket:Ticket):Boolean {if(pending!==ticket)return false;pending=null;return true}
    fun attempts()=attempts
}
