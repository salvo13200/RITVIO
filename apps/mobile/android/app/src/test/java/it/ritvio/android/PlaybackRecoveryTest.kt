package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class PlaybackRecoveryTest {
    @Test fun attemptsAreBoundedWithBackoffEvenWhenTheNetworkFlaps(){
        var now=0L;val recovery=PlaybackRecovery{now}
        val first=recovery.request("a")!!;assertEquals(1000L,first.delayMs)
        repeat(20){assertSame(first,recovery.request("a"))};assertEquals(1,recovery.attempts())
        assertTrue(recovery.consume(first));val second=recovery.request("a")!!;assertEquals(3000L,second.delayMs)
        assertTrue(recovery.consume(second));assertNull(recovery.request("a"));assertEquals(2,recovery.attempts())
    }
    @Test fun pauseInvalidatesTheDelayedAttemptAndDoesNotGrantMoreRetries(){
        val recovery=PlaybackRecovery{0};val old=recovery.request("a")!!;recovery.cancel()
        assertFalse(recovery.current(old,"a"));assertFalse(recovery.consume(old));assertEquals(1,recovery.attempts())
    }
    @Test fun changingTracksRejectsTheOldCallbackEvenWhenReturningToTheSameId(){
        val recovery=PlaybackRecovery{0};val old=recovery.request("a")!!;recovery.reset()
        val current=recovery.request("a")!!;assertFalse(recovery.current(old,"a"));assertTrue(recovery.current(current,"a"));assertFalse(recovery.current(current,"b"))
    }
    @Test fun offlineWaitingHasAFiniteDeadline(){
        var now=100L;val recovery=PlaybackRecovery{now};val ticket=recovery.request("a")!!
        now=30099;assertFalse(recovery.expired(ticket));now=30100;assertTrue(recovery.expired(ticket))
    }
    @Test fun explicitNewActivationRestoresTheBudget(){
        val recovery=PlaybackRecovery{0};repeat(2){recovery.consume(recovery.request("a")!!)};assertNull(recovery.request("a"))
        recovery.reset();assertNotNull(recovery.request("b"));assertEquals(1,recovery.attempts())
    }
}
