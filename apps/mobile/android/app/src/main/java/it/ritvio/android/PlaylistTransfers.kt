package it.ritvio.android

import org.json.JSONArray
import org.json.JSONObject

internal class PlaylistTransfers {
    data class Request(val id:String,val cancellation:ImportCancellation=ImportCancellation())
    private var active:Request?=null
    private var preview:JSONObject?=null
    @Synchronized fun begin(id:String):Request{
        require(Regex("^[a-fA-F0-9-]{36}$").matches(id));check(active==null){"Attendi la lettura precedente."}
        preview=null;return Request(id).also{active=it}
    }
    @Synchronized fun request(id:String):Request=active?.takeIf{it.id==id}?:throw IllegalArgumentException("Riapri l’importazione.")
    @Synchronized fun cancel(id:String){active?.takeIf{it.id==id}?.cancellation?.cancelled=true;if(preview?.optString("requestId")==id)preview=null}
    @Synchronized fun end(request:Request){if(active===request)active=null}
    @Synchronized fun close(){active?.cancellation?.cancelled=true;preview=null}
    @Synchronized fun ready(request:Request,raw:JSONObject):JSONObject{
        check(active===request&&!request.cancellation.cancelled){"Importazione annullata."}
        val input=raw.getJSONArray("entries");require(input.length()<=1000)
        val entries=JSONArray()
        for(i in 0 until input.length()){
            val entry=input.getJSONObject(i);val track=entry.optJSONObject("track")?.let{runCatching{TrackData.parse(it)}.getOrNull()}
            entries.put(JSONObject().put("number",i+1).put("title",track?.title?:entry.optString("title","Contenuto non disponibile").take(300)).put("track",track?.json()?:JSONObject.NULL))
        }
        val result=JSONObject(raw.toString()).put("title",raw.getString("title").take(100)).put("description",raw.optString("description","").take(1000)).put("entries",entries).put("requestId",request.id).put("expiresAt",System.currentTimeMillis()+600000)
        preview=result;return JSONObject(result.toString())
    }
    @Synchronized fun commit(id:String,input:JSONObject,store:LibraryStore):JSONObject{
        val value=preview?.takeIf{it.getString("requestId")==id&&it.getLong("expiresAt")>System.currentTimeMillis()}?:throw IllegalArgumentException("Anteprima scaduta. Rileggi la playlist.")
        val entries=value.getJSONArray("entries");val numbers=input.getJSONArray("numbers");val selected=(0 until numbers.length()).map{numbers.getInt(it)}
        val indices=TransferRules.selected((0 until entries.length()).map{entries.getJSONObject(it).optJSONObject("track")?.getString("videoId")},selected,false,emptyList()).first
        require(indices.isNotEmpty()){"Seleziona almeno un brano disponibile."}
        val payload=JSONObject(input.toString()).put("items",JSONArray().apply{indices.forEach{put(entries.getJSONObject(it).getJSONObject("track"))}}).put("description",value.optString("description","")).put("cover",value.opt("cover")?:JSONObject.NULL)
        val result=store.importPlaylist(payload);preview=null;return result
    }
}
