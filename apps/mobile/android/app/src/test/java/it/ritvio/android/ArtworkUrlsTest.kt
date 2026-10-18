package it.ritvio.android
import org.junit.Assert.*
import org.junit.Test
class ArtworkUrlsTest {
    @Test fun largerGoogleImageKeepsOriginalFallback(){val source="https://lh3.googleusercontent.com/cover=w60-h60-l90-rj";val urls=ArtworkUrls.candidates(source,"abcdefghijk");assertEquals("https://lh3.googleusercontent.com/cover=w1024-h1024-l90-rj",urls.first());assertTrue(urls.contains(source))}
    @Test fun unavailableMaxresHasFallback(){val source="https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";assertEquals("https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg",ArtworkUrls.candidates(source,"abcdefghijk").first());assertTrue(ArtworkUrls.candidates(source,"abcdefghijk").contains(source))}
    @Test fun untrustedSourcesAreNeverFetched(){for(source in listOf("https://evil.example/a.jpg","file:///private/image.jpg","https://i.ytimg.com.evil.example/a.jpg","https://user@i.ytimg.com/a.jpg","http://i.ytimg.com/a.jpg")){assertEquals(listOf("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"),ArtworkUrls.candidates(source,"abcdefghijk"))}}
}
