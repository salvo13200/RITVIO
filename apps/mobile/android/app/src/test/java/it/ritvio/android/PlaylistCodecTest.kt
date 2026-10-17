package it.ritvio.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PlaylistCodecTest {
    private fun track()=JSONObject().put("videoId","abcdefghijk").put("title","Città").put("artist","Artista").put("duration",123)
    private fun file(format:String="ritvio-playlist")=JSONObject().put("format",format).put("version",1).put("exportedAt","2026-10-15T10:00:00Z").put("playlist",JSONObject().put("name","Viaggio").put("description","Testo e accenti: città").put("cover",JSONObject.NULL).put("tracks",JSONArray().put(track()).put(track())))
    @Test fun roundTripsTheDesktopFormatWithDuplicatesAndDescription(){
        val imported=PlaylistTransferCodec.file(file().toString());assertEquals(2,imported.getJSONArray("entries").length())
        val playlist=JSONObject().put("name",imported.getString("title")).put("description",imported.getString("description")).put("cover",JSONObject.NULL).put("items",JSONArray().put(imported.getJSONArray("entries").getJSONObject(0).getJSONObject("track")).put(track()))
        val exported=JSONObject(PlaylistTransferCodec.exported(playlist));assertEquals("ritvio-playlist",exported.getString("format"));assertEquals(1,exported.getInt("version"));assertEquals(2,exported.getJSONObject("playlist").getJSONArray("tracks").length());assertEquals("Testo e accenti: città",exported.getJSONObject("playlist").getString("description"));assertEquals(setOf("videoId","title","artist","duration"),exported.getJSONObject("playlist").getJSONArray("tracks").getJSONObject(0).keys().asSequence().toSet())
    }
    @Test fun readsLegacyFilesAndMarksMetadataClamping(){
        val value=file("spotyfree-playlist");value.getJSONObject("playlist").getJSONArray("tracks").getJSONObject(0).put("title","x".repeat(400)).put("duration",700000)
        val result=PlaylistTransferCodec.file(value.toString());assertEquals(1,result.getInt("adjusted"));assertEquals(300,result.getJSONArray("entries").getJSONObject(0).getJSONObject("track").getString("title").length)
    }
    @Test fun rejectsUnknownFormatsAndInvalidVideoIds(){
        assertThrows(Exception::class.java){PlaylistTransferCodec.file(file("other").toString())}
        val value=file();value.getJSONObject("playlist").getJSONArray("tracks").getJSONObject(0).put("videoId","../path");assertThrows(Exception::class.java){PlaylistTransferCodec.file(value.toString())}
        assertThrows(Exception::class.java){PlaylistTransferCodec.file("x".repeat(TransferRules.FILE_LIMIT+1))}
    }
    @Test fun validatesCustomCoverSignatureWithoutExecutingContent(){
        val value=file();value.getJSONObject("playlist").put("cover","data:image/png;base64,"+java.util.Base64.getEncoder().encodeToString(byteArrayOf(137.toByte(),80,78,71,13,10,26,10)))
        assertTrue(PlaylistTransferCodec.file(value.toString()).getString("cover").startsWith("data:image/png"))
        value.getJSONObject("playlist").put("cover","data:image/png;base64,PHNjcmlwdD4=");assertThrows(Exception::class.java){PlaylistTransferCodec.file(value.toString())}
    }
}
