package it.ritvio.android

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject

data class QueueOrigin(val automatic:Boolean)

data class TrackData(val videoId: String, val title: String, val artist: String, val thumbnail: String, val duration: Double, val albumId:String?=null,val albumName:String?=null,val people:List<Pair<String,String>> = emptyList()) {
    fun json() = JSONObject().put("videoId",videoId).put("title",title).put("artist",artist).put("thumbnail",thumbnail).put("duration",duration)
        .put("album",if(albumId!=null)JSONObject().put("id",albumId).put("name",albumName) else JSONObject.NULL)
        .put("artists",JSONArray().apply{people.forEach{put(JSONObject().put("id",it.first).put("name",it.second))}})
    fun item(automatic:Boolean=false,artworkUri:String?=null): MediaItem = MediaItem.Builder().setMediaId(videoId).setUri("ritvio://track/$videoId").setTag(QueueOrigin(automatic))
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist(artist)
            .setArtworkUri((artworkUri?:thumbnail).takeIf{it.isNotEmpty()}?.let{Uri.parse(it)}).build()).build()
    companion object {
        val idPattern = Regex("^[A-Za-z0-9_-]{11}$")
        fun parse(value: JSONObject): TrackData {
            val id=value.getString("videoId");require(idPattern.matches(id))
            val title=value.getString("title").trim();val artist=value.getString("artist").trim()
            require(title.isNotEmpty() && title.length<=300 && artist.isNotEmpty() && artist.length<=300)
            var image=value.optString("thumbnail","")
            if(image.isNotEmpty()) { val uri=Uri.parse(image);val host=uri.host.orEmpty();require(uri.scheme=="https" && uri.userInfo==null && image.length<2048 && listOf(".ytimg.com",".googleusercontent.com",".ggpht.com").any { host.endsWith(it) }) }
            val seconds=value.optDouble("duration",0.0);require(seconds.isFinite() && seconds>=0 && seconds<=86400*7)
            val album=value.optJSONObject("album");val aid=album?.optString("id")?.takeIf{resourceId.matches(it)}
            val people=value.optJSONArray("artists");val credits=mutableListOf<Pair<String,String>>()
            if(people!=null)for(index in 0 until minOf(people.length(),12)){val p=people.optJSONObject(index)?:continue;val pid=p.optString("id");val name=p.optString("name");if(resourceId.matches(pid)&&name.length in 1..300)credits.add(pid to name)}
            return TrackData(id,title,artist,image,seconds,aid,album?.optString("name")?.take(300),credits)
        }
        fun parseList(array: JSONArray): List<TrackData> { require(array.length() in 1..100);return (0 until array.length()).map { parse(array.getJSONObject(it)) } }
        val resourceId=Regex("^[A-Za-z0-9_-]{1,160}$")
    }
}
