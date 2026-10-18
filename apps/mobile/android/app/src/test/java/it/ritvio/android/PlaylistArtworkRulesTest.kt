package it.ritvio.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PlaylistArtworkRulesTest {
    @Test fun personalPlaylistsAreAccepted() {
        PlaylistArtworkRules.validate("playlist", "f750267d-1d38-4d63-a9ec-16a7593c31e6")
    }
    @Test fun tracksAndNonlocalTargetsAreRejected() {
        for ((kind,id) in listOf("track" to "abcdefghijk", "album" to "ALBUM1", "playlist" to "", "playlist" to "../outside")) {
            assertThrows(IllegalArgumentException::class.java) { PlaylistArtworkRules.validate(kind,id) }
        }
    }
    @Test fun retirementPreservesPlaylistsAndTheirCovers() {
        val playlist=JSONObject().put("id","mine").put("cover","file:///artwork/shared.jpg").put("items",JSONArray().put(JSONObject().put("videoId","abcdefghijk")))
        val state=JSONObject().put("playlists",JSONArray().put(playlist)).put("likes",JSONArray().put("kept"))
            .put("artwork",JSONObject().put("abcdefghijk","file:///artwork/old.jpg").put("12345678901","file:///artwork/shared.jpg"))
        assertEquals(listOf("file:///artwork/old.jpg"),PlaylistArtworkRules.retireTrackOverrides(state))
        assertFalse(state.has("artwork"))
        assertSame(playlist,state.getJSONArray("playlists").getJSONObject(0))
        assertEquals("kept",state.getJSONArray("likes").getString(0))
        assertTrue(PlaylistArtworkRules.retireTrackOverrides(state).isEmpty())
    }
}
