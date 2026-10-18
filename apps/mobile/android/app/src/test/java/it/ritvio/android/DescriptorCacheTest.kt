package it.ritvio.android
import org.junit.Assert.*
import org.junit.Test

class DescriptorCacheTest {
    @Test fun descriptorsNearExpiryAreNeverReused(){
        var now=100L;val cache=DescriptorCache<String>({now});val key=cache.key("a");cache.store(key,"signed",300)
        assertEquals("signed",cache.cached("a"));now=210;assertNull(cache.cached("a"))
    }
    @Test fun anOldPreloadCannotPoisonTheCacheAfterRetry(){
        val cache=DescriptorCache<String>({0});val old=cache.key("a");cache.invalidate("a");val retry=cache.key("a")
        assertNotEquals(old,retry);assertFalse(cache.current(old));assertTrue(cache.store(retry,"fresh",500));assertFalse(cache.store(old,"stale",500));assertEquals("fresh",cache.cached("a"))
    }
    @Test fun activeConsumersUseTheSameGenerationUntilInvalidated(){
        val cache=DescriptorCache<String>({0});assertEquals(cache.key("a"),cache.key("a"));cache.invalidate("a");assertEquals(0,cache.count())
    }
    @Test fun readyAndPendingEntriesShareABoundedLru(){
        val cache=DescriptorCache<String>({0},2);val a=cache.key("a");cache.store(a,"a",500);val b=cache.key("b");cache.store(b,"b",500)
        assertEquals("a",cache.cached("a"));cache.key("c");assertNull(cache.cached("b"));assertFalse(cache.store(b,"old",500));assertEquals("a",cache.cached("a"))
    }
}
