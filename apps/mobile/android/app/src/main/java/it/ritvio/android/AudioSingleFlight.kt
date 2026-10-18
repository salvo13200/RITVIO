package it.ritvio.android

import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** One interactive and one speculative request at most; consumers of an ID share work. */
internal class AudioSingleFlight<K,V>(private val load:(K,Boolean)->V) {
    private class Flight<V>(foreground:Boolean) {
        val foreground=AtomicBoolean(foreground)
        val result=CompletableFuture<V>()
    }
    private val flights=mutableMapOf<K,Flight<V>>()
    private val interactive=Semaphore(1,true)
    private val speculative=Semaphore(1,true)
    val joined=AtomicLong()
    fun pending()=synchronized(flights){flights.size}

    fun get(key:K,background:Boolean=false):V {
        val (flight,owner)=synchronized(flights){
            val existing=flights[key]
            if(existing!=null){if(!background)existing.foreground.set(true);joined.incrementAndGet();existing to false}
            else Flight<V>(!background).also{flights[key]=it} to true
        }
        if(owner){
            var permit:Semaphore?=null
            try{
                while(permit==null){
                    if(flight.foreground.get()){interactive.acquire();permit=interactive}
                    else if(speculative.tryAcquire(25,TimeUnit.MILLISECONDS))permit=speculative
                }
                flight.result.complete(load(key,!flight.foreground.get()))
            }catch(error:Throwable){flight.result.completeExceptionally(error)}
            finally{permit?.release();synchronized(flights){if(flights[key]===flight)flights.remove(key)}}
        }
        try{return flight.result.get()}
        catch(error:InterruptedException){Thread.currentThread().interrupt();throw error}
        catch(error:ExecutionException){val cause=error.cause?:error;if(cause is InterruptedException)Thread.currentThread().interrupt();throw cause}
    }
}
