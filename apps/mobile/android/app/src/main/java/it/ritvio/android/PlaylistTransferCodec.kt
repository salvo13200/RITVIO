package it.ritvio.android

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal object PlaylistTransferCodec {
    fun file(text:String):JSONObject{
        require(text.toByteArray(Charsets.UTF_8).size<=TransferRules.FILE_LIMIT)
        val root=JSONObject(text.removePrefix("\uFEFF"));require(root.getString("format") in listOf("ritvio-playlist","spotyfree-playlist")&&root.getInt("version")==1)
        val raw=root.getJSONObject("playlist");val title=raw.getString("name").trim();require(title.length in 1..100)
        val description=raw.getString("description");require(description.length<=1000)
        val cover=if(raw.isNull("cover"))null else raw.getString("cover")
        if(cover!=null){require(cover.length<=196608&&Regex("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$").matches(cover));validateCover(cover)}
        val tracks=raw.getJSONArray("tracks");require(tracks.length()<=1000)
        var adjusted=0;val entries=JSONArray()
        for(i in 0 until tracks.length()){
            val item=tracks.getJSONObject(i);val fullTitle=item.getString("title").trim();val fullArtist=item.getString("artist").trim();val duration=item.getDouble("duration")
            require(fullTitle.length in 1..1000&&fullArtist.length in 1..1000&&duration.isFinite()&&duration in 0.0..31536000.0)
            if(fullTitle.length>300||fullArtist.length>300||duration>604800)adjusted++
            val id=item.getString("videoId");val track=TrackData.parse(JSONObject().put("videoId",id).put("title",fullTitle.take(300)).put("artist",fullArtist.take(300)).put("duration",duration.coerceAtMost(604800.0))).copy(thumbnail="https://i.ytimg.com/vi/$id/mqdefault.jpg")
            entries.put(JSONObject().put("number",i+1).put("title",track.title).put("track",track.json()))
        }
        return JSONObject().put("title",title).put("description",description).put("cover",cover?:JSONObject.NULL).put("entries",entries).put("reportedCount",entries.length()).put("partial",false).put("truncated",false).put("provider","file").put("adjusted",adjusted)
    }
    private fun validateCover(value:String){
        val decoded=mutableListOf<Int>();var acc=0;var bits=0;val alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        for(char in value.substringAfter(',').take(24)){if(char=='=')break;val n=alphabet.indexOf(char);require(n>=0);acc=(acc shl 6) or n;bits+=6;if(bits>=8){bits-=8;decoded.add((acc shr bits) and 255)}}
        val valid=when{value.startsWith("data:image/png;")->decoded.take(8)==listOf(137,80,78,71,13,10,26,10);value.startsWith("data:image/jpeg;")->decoded.take(3)==listOf(255,216,255);else->decoded.take(4)==listOf(82,73,70,70)&&decoded.drop(8).take(4)==listOf(87,69,66,80)}
        require(valid)
    }
    fun exported(playlist:JSONObject):String{
        val tracks=playlist.getJSONArray("items");val exported=JSONArray()
        for(i in 0 until tracks.length()){val t=tracks.getJSONObject(i);exported.put(JSONObject().put("videoId",t.getString("videoId")).put("title",t.getString("title")).put("artist",t.getString("artist")).put("duration",t.optDouble("duration",0.0)))}
        val date=SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.ROOT).apply{timeZone=TimeZone.getTimeZone("UTC")}.format(Date())
        val value=JSONObject().put("format","ritvio-playlist").put("version",1).put("exportedAt",date).put("playlist",JSONObject().put("name",playlist.getString("name")).put("description",playlist.optString("description","")).put("cover",playlist.opt("cover")?:JSONObject.NULL).put("tracks",exported)).toString(2)+"\n"
        require(value.toByteArray(Charsets.UTF_8).size<=TransferRules.FILE_LIMIT);return value
    }
}
