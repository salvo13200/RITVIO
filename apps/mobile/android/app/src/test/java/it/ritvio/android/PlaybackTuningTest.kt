package it.ritvio.android
import org.junit.Assert.*
import org.junit.Test

class PlaybackTuningTest {
    @Test fun preloadWaitsForStablePlaybackAndHonoursPauseSleepRepeatAndCooldown(){
        fun enabled(now:Long=2000,changed:Long=0,playing:Boolean=true,next:Boolean=true,sleep:Boolean=false,repeat:Boolean=false,cooldown:Long=0)=PlaybackTuning.preload(now,changed,playing,next,sleep,repeat,cooldown)
        assertTrue(enabled());assertFalse(enabled(now=1000));assertFalse(enabled(playing=false));assertFalse(enabled(next=false));assertFalse(enabled(sleep=true));assertFalse(enabled(repeat=true));assertFalse(enabled(cooldown=3000))
    }
    @Test fun timeAndMemoryTargetsStayBoundedAndValid(){
        assertTrue(PlaybackTuning.START_MS>0);assertTrue(PlaybackTuning.REBUFFER_MS>=PlaybackTuning.START_MS)
        assertTrue(PlaybackTuning.MIN_BUFFER_MS>=PlaybackTuning.REBUFFER_MS);assertTrue(PlaybackTuning.MAX_BUFFER_MS>=PlaybackTuning.MIN_BUFFER_MS)
        assertTrue(PlaybackTuning.TARGET_BUFFER_BYTES<=8*1024*1024);assertEquals(60_000,PlaybackTuning.BACK_BUFFER_MS);assertEquals(5_000_000L,PlaybackTuning.PRELOAD_US)
    }
}
