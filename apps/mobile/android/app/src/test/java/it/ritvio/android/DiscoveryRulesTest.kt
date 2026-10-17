package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class DiscoveryRulesTest {
    @Test fun filtersVideoAndEditionDuplicatesButKeepsDistinctVersions(){
        val first=SuggestionKey("one","titolo::artist")
        val candidates=listOf(first,SuggestionKey("two",first.edition),SuggestionKey("three","titolo live::artist"),SuggestionKey("four","altro::artist"))
        assertEquals(listOf(2,3),DiscoveryRules.select(candidates,listOf(first),8))
        assertEquals(listOf(0,2),DiscoveryRules.select(candidates,emptyList(),2))
    }
    @Test fun normalizedCreditsAndTopicNamesMatchTheDesktopPolicy(){
        assertEquals(DiscoveryRules.edition("Città!","Artista - Topic",emptyList()),DiscoveryRules.edition("Citta","Artista",emptyList()))
        assertEquals(DiscoveryRules.edition("Titolo","A & B",listOf("B","A")),DiscoveryRules.edition("Titolo","B, A",listOf("A","B")))
        assertNotEquals(DiscoveryRules.edition("Titolo (live)","A",emptyList()),DiscoveryRules.edition("Titolo","A",emptyList()))
    }
    @Test fun respectsRecentAndSessionExclusions(){
        assertEquals(emptyList<Int>(),DiscoveryRules.select(listOf(SuggestionKey("one","edition")),listOf(SuggestionKey("another","edition")),8))
        assertEquals(emptyList<Int>(),DiscoveryRules.select(listOf(SuggestionKey("one","edition")),emptyList(),0))
    }
    @Test fun limitsTheQueueWithoutDiscardingUnplayedTracks(){
        assertEquals(0,DiscoveryRules.capacity(100,0,8))
        assertEquals(3,DiscoveryRules.capacity(100,3,8))
        assertEquals(8,DiscoveryRules.capacity(99,50,8))
        assertEquals(8,DiscoveryRules.capacity(90,0,8))
    }
    @Test fun doesNotFetchWhileDisabledPausedOrBlocked(){
        assertFalse(DiscoveryRules.shouldExtend(false,true,false,0))
        assertFalse(DiscoveryRules.shouldExtend(true,false,false,0))
        assertFalse(DiscoveryRules.shouldExtend(true,true,true,0))
        assertFalse(DiscoveryRules.shouldExtend(true,true,false,3))
        assertTrue(DiscoveryRules.shouldExtend(true,true,false,2))
        assertTrue(DiscoveryRules.shouldExtend(true,true,false,0))
    }
    @Test fun aLateReplyCannotApplyAfterPauseEditOrTimerInvalidation(){
        repeat(4){val gate=DiscoveryGate();val ticket=gate.begin();gate.invalidate();assertFalse(gate.accepts(ticket));assertTrue(gate.busy);gate.finish(ticket);assertFalse(gate.busy)}
    }
    @Test fun neverStartsTwoProviderJobsAtOnce(){
        val gate=DiscoveryGate();val first=gate.begin();assertThrows(IllegalStateException::class.java){gate.begin()};assertTrue(gate.accepts(first));gate.finish(first);val second=gate.begin();assertFalse(gate.accepts(first));assertTrue(gate.accepts(second))
    }
    @Test fun removesOnlyFutureAutomaticOccurrencesEvenWithIdenticalVideoIds(){
        assertEquals(listOf(3,1),DiscoveryRules.futureAutomatic(listOf(0,1,2,3),0,setOf(1,3)))
        assertEquals(listOf(1),DiscoveryRules.futureAutomatic(listOf(3,0,1,2),0,setOf(3,1)))
        assertEquals(emptyList<Int>(),DiscoveryRules.futureAutomatic(emptyList(),0,setOf(0)))
    }
    @Test fun staleCompletionCannotReleaseANewerTicket(){
        val gate=DiscoveryGate();val first=gate.begin();gate.finish(first);val second=gate.begin();gate.finish(first);assertTrue(gate.busy);assertTrue(gate.accepts(second));gate.finish(second);assertFalse(gate.busy)
    }
}
