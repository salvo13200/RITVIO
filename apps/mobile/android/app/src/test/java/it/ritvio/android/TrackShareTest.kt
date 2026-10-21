package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class TrackShareTest {
    @Test fun nativeLinkMatchesTheSharedWebContract(){
        assertEquals("https://salvo13200.github.io/RITVIO/#track=abcdefghijk&title=After+the+rain&artist=Luna+Vale",TrackShare.link("abcdefghijk","After the rain","Luna Vale"))
        assertEquals("After the rain — Luna Vale\nShared with RITVIO\n"+TrackShare.link("abcdefghijk","After the rain","Luna Vale"),TrackShare.message("abcdefghijk","After the rain","Luna Vale","Shared with RITVIO"))
    }
    @Test fun nativeMetadataIsBoundedAndCannotInjectLines(){
        assertEquals("one two three",TrackShare.label(" one\n\u202etwo\u00a0three ",160))
        assertEquals("🎵🎵",TrackShare.label("🎵🎵🎵",2))
        assertEquals(160,TrackShare.label("x".repeat(500),160).length)
        assertThrows(IllegalArgumentException::class.java){TrackShare.link("../invalid","title","artist")}
        assertEquals(TrackShare.site+"#track=abcdefghijk",TrackShare.link("abcdefghijk","",""))
    }
}
