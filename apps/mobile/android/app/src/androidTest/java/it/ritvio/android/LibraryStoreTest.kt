package it.ritvio.android

import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

/** A disposable database name isolates these tests from the personal library. */
class LibraryStoreTest{
    @Test fun importIsAtomicAndRevisionProtected(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext;val name="library-import-test-${UUID.randomUUID()}.sqlite";val store=LibraryStore(context,name)
        val first=JSONObject().put("videoId","abcdefghijk").put("title","Primo").put("artist","Test").put("duration",120)
        val second=JSONObject(first.toString()).put("videoId","12345678901").put("title","Secondo")
        fun input()=JSONObject().put("targetId",JSONObject.NULL).put("targetRevision",JSONObject.NULL).put("name","Importata").put("description","Descrizione conservata").put("cover",JSONObject.NULL).put("skipDuplicates",true).put("items",org.json.JSONArray().put(first).put(first))
        try{
            val created=store.importPlaylist(input());assertEquals(1,created.getInt("added"));assertEquals(1,created.getInt("skippedDuplicates"));val id=created.getString("playlistId")
            val append=input().put("targetId",id).put("targetRevision",1).put("items",org.json.JSONArray().put(second).put(second))
            val updated=store.importPlaylist(append);assertEquals(1,updated.getInt("added"));val before=store.snapshot().toString()
            try{store.importPlaylist(append);fail("Stale revision accepted")}catch(_:IllegalArgumentException){}
            assertEquals(before,store.snapshot().toString())
            val invalid=input().put("items",org.json.JSONArray().put(first).put(JSONObject().put("videoId","invalid")))
            try{store.importPlaylist(invalid);fail("Invalid track accepted")}catch(_:Exception){}
            assertEquals(before,store.snapshot().toString());store.close()
            val reopened=LibraryStore(context,name);try{assertEquals(2,reopened.snapshot().getJSONArray("playlists").getJSONObject(0).getJSONArray("items").length());assertEquals("Descrizione conservata",reopened.snapshot().getJSONArray("playlists").getJSONObject(0).getString("description"))}finally{reopened.close()}
        }finally{runCatching{store.close()};context.deleteDatabase(name)}
    }
    @Test fun libraryPersistsAndRejectsInvalidChanges(){
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val name="library-test-${UUID.randomUUID()}.sqlite"
        var store=LibraryStore(context,name)
        val track=JSONObject().put("videoId","abcdefghijk").put("title","Test track").put("artist","Test artist").put("duration",120)
        try{
            store.command(JSONObject().put("type","like").put("track",track).put("liked",true))
            store.command(JSONObject().put("type","like").put("track",track).put("liked",true))
            assertEquals(1,store.snapshot().getJSONArray("likes").length())
            val created=store.command(JSONObject().put("type","create").put("name","Test playlist"))
            val id=created.getJSONArray("playlists").getJSONObject(0).getString("id")
            repeat(2){store.command(JSONObject().put("type","add").put("id",id).put("track",track))}
            store.close();store=LibraryStore(context,name)
            assertEquals(2,store.snapshot().getJSONArray("playlists").getJSONObject(0).getJSONArray("items").length())
            val before=store.snapshot().toString()
            try{store.command(JSONObject().put("type","remove").put("id",id).put("index",100));fail("Invalid position accepted")}catch(_:IllegalArgumentException){}
            assertEquals(before,store.snapshot().toString())
            try{store.command(JSONObject().put("type","createFromTracks").put("name","Snapshot").put("items",org.json.JSONArray().put(track).put(JSONObject().put("videoId","invalid"))));fail("Invalid snapshot accepted")}catch(_:Exception){}
            assertEquals(before,store.snapshot().toString())
            val imported=store.command(JSONObject().put("type","createFromTracks").put("name","Snapshot").put("items",org.json.JSONArray().put(track).put(track)))
            assertEquals(2,imported.getJSONArray("playlists").getJSONObject(1).getJSONArray("items").length())
            store.command(JSONObject().put("type","remove").put("id",id).put("index",0))
            assertEquals(1,store.snapshot().getJSONArray("playlists").getJSONObject(0).getJSONArray("items").length())
            store.remember(TrackData.parse(track));store.remember(TrackData.parse(track))
            assertEquals(1,store.snapshot().getJSONArray("recent").length())
        }finally{store.close();context.deleteDatabase(name)}
    }
}
