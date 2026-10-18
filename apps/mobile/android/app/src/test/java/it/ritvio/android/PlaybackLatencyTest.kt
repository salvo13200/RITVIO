package it.ritvio.android
import org.junit.Assert.*
import org.junit.Test

class PlaybackLatencyTest {
    @Test fun rapidSkipsCannotReportASupersededTrackAsInstantPlayback(){
        var now=100L;val meter=PlaybackLatency{now};meter.begin("next","a");now=150;meter.begin("next","b");meter.advancing("a",160);meter.ready("b");meter.advancing("b",200)
        val samples=meter.samples();assertEquals("superseded",samples[0].outcome);assertNull(samples[0].audioMs);assertEquals(50L,samples[1].audioMs);assertTrue(samples.all{it.target.isEmpty()})
    }
    @Test fun staleAudioEventsAndErrorsDoNotBecomeSuccessfulSamples(){
        var now=100L;val meter=PlaybackLatency{now};meter.begin("seek","a",true);meter.advancing("a",99);meter.cancel("error");meter.advancing("a",130)
        assertNull(meter.samples().single().audioMs);assertEquals("error",meter.samples().single().outcome)
    }
    @Test fun pausedSeekReadinessDoesNotIncludeTimeSpentWaitingForTheUser(){
        var now=100L;val meter=PlaybackLatency{now};meter.begin("seek","a",needsAudio=false);now=120;meter.ready("a");now=10000;meter.advancing("a",now)
        assertEquals(20L,meter.samples().single().readyMs);assertNull(meter.samples().single().audioMs)
    }
    @Test fun missingEventsTimeoutAndHistoryIsBounded(){
        var now=0L;val meter=PlaybackLatency{now};repeat(25){meter.begin("next","$it")};now=31_000
        assertEquals(20,meter.samples().size);assertEquals("timeout",meter.samples().last().outcome)
    }
}
