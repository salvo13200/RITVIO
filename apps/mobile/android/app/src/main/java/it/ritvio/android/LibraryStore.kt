package it.ritvio.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Local repository boundary. UI never owns or rewrites the database document. */
class LibraryStore internal constructor(context:Context,databaseName:String="library.sqlite"):SQLiteOpenHelper(context,databaseName,null,1){
    override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE library_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)")}
    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){}
    private fun empty()=JSONObject().put("likes",JSONArray()).put("playlists",JSONArray()).put("recent",JSONArray()).put("follows",JSONArray())
    @Synchronized fun snapshot():JSONObject=readableDatabase.rawQuery("SELECT data FROM library_state WHERE id=1",null).use{if(it.moveToFirst())JSONObject(it.getString(0)) else empty()}
    private fun save(state:JSONObject){val data=state.toString();require(data.toByteArray(Charsets.UTF_8).size<=4*1024*1024){"La libreria supera lo spazio disponibile. Nessuna modifica salvata."};writableDatabase.execSQL("INSERT OR REPLACE INTO library_state VALUES (1,?)",arrayOf(data))}
    private fun without(array:JSONArray,keep:(JSONObject,Int)->Boolean)=JSONArray().apply{for(i in 0 until array.length()){val item=array.getJSONObject(i);if(keep(item,i))put(item)}}
    @Synchronized fun importPlaylist(input:JSONObject):JSONObject{
        val state=snapshot();val playlists=state.getJSONArray("playlists");val targetId=if(input.isNull("targetId"))null else input.getString("targetId")
        val target=if(targetId==null)null else {(0 until playlists.length()).map{playlists.getJSONObject(it)}.firstOrNull{it.getString("id")==targetId}?:throw IllegalArgumentException("Playlist rimossa. Scegli una nuova destinazione.")}
        if(target!=null)require(target.optLong("revision",1)==input.getLong("targetRevision")){"La playlist è cambiata. Rileggi la libreria prima di aggiungere i brani."}
        val raw=input.getJSONArray("items");require(raw.length() in 1..1000);val tracks=(0 until raw.length()).map{TrackData.parse(raw.getJSONObject(it))}
        val existing=target?.getJSONArray("items")?:JSONArray();val oldIds=(0 until existing.length()).map{existing.getJSONObject(it).getString("videoId")}
        val (indices,skipped)=TransferRules.selected(tracks.map{it.videoId},tracks.indices.map{it+1},input.getBoolean("skipDuplicates"),oldIds)
        require(existing.length()+indices.size<=1000){"La destinazione supererebbe 1.000 brani."}
        if(target==null)require(playlists.length()<100){"La libreria può contenere 100 playlist."}
        val title=input.getString("name").trim();require(title.length in 1..100)
        val destination=target?:JSONObject().put("id",UUID.randomUUID().toString()).put("name",title).put("description",input.optString("description","").take(1000)).put("cover",input.opt("cover")?:JSONObject.NULL).put("items",existing).put("revision",0)
        if(indices.isNotEmpty()){indices.forEach{existing.put(tracks[it].json())};destination.put("updatedAt",System.currentTimeMillis()).put("revision",destination.optLong("revision",1)+1);if(target==null)playlists.put(destination);save(state)}
        return JSONObject().put("library",state).put("playlistId",destination.getString("id")).put("added",indices.size).put("skippedDuplicates",skipped)
    }
    @Synchronized fun remember(track:TrackData){val state=snapshot();val recent=JSONArray().put(track.json());val old=state.getJSONArray("recent");for(i in 0 until old.length()){val item=old.getJSONObject(i);if(item.optString("videoId")!=track.videoId && recent.length()<40)recent.put(item)};state.put("recent",recent);save(state)}
    @Synchronized fun command(input:JSONObject):JSONObject{
        val state=snapshot();val likes=state.getJSONArray("likes");val playlists=state.getJSONArray("playlists");val follows=state.getJSONArray("follows")
        fun playlist():JSONObject{val id=input.getString("id");return (0 until playlists.length()).map{playlists.getJSONObject(it)}.firstOrNull{it.getString("id")==id}?:throw IllegalArgumentException("Playlist missing")}
        fun name():String=input.getString("name").trim().also{require(it.length in 1..100)}
        fun touch(p:JSONObject){p.put("updatedAt",System.currentTimeMillis()).put("revision",p.optLong("revision",1)+1)}
        when(input.getString("type")){
            "like"->{val track=TrackData.parse(input.getJSONObject("track"));val remaining=without(likes){item,_->item.getString("videoId")!=track.videoId};if(input.getBoolean("liked")){require(remaining.length()<3000);remaining.put(track.json())};state.put("likes",remaining)}
            "create"->{require(playlists.length()<100);playlists.put(JSONObject().put("id",UUID.randomUUID().toString()).put("name",name()).put("items",JSONArray()).put("updatedAt",System.currentTimeMillis()))}
            "createFromTracks"->{require(playlists.length()<100);val parsed=TrackData.parseList(input.getJSONArray("items"));val title=name();playlists.put(JSONObject().put("id",UUID.randomUUID().toString()).put("name",title).put("items",JSONArray().apply{parsed.forEach{put(it.json())}}).put("updatedAt",System.currentTimeMillis()))}
            "rename"->{val p=playlist();p.put("name",name());touch(p)}
            "delete"->{val id=input.getString("id");state.put("playlists",without(playlists){item,_->item.getString("id")!=id})}
            "add"->{val p=playlist();val items=p.getJSONArray("items");require(items.length()<1000);items.put(TrackData.parse(input.getJSONObject("track")).json());touch(p)}
            "remove"->{val p=playlist();val items=p.getJSONArray("items");val index=input.getInt("index");require(index in 0 until items.length());p.put("items",without(items){_,i->i!=index});touch(p)}
            "follow"->{val resource=input.getJSONObject("resource");val id=resource.getString("id");require(TrackData.resourceId.matches(id));val kind=resource.getString("kind");require(kind in listOf("artist","album"));val title=resource.getString("name");require(title.length in 1..300);val artwork=resource.optString("artwork","");if(artwork.isNotEmpty()&&artwork!="null")TrackData.parse(JSONObject().put("videoId","abcdefghijk").put("title","Artwork").put("artist","Artwork").put("thumbnail",artwork));val remaining=without(follows){item,_->item.getString("id")!=id};if(input.getBoolean("followed")){require(remaining.length()<1000);remaining.put(JSONObject().put("id",id).put("kind",kind).put("name",title).put("artwork",artwork.takeIf{it!="null"}?:""))};state.put("follows",remaining)}
            else->throw IllegalArgumentException("Unknown library command")
        };save(state);return state
    }
    companion object{@Volatile private var instance:LibraryStore?=null;fun get(context:Context)=instance?:synchronized(this){instance?:LibraryStore(context.applicationContext).also{instance=it}}}
}
