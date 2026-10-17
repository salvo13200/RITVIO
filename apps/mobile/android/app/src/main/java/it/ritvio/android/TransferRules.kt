package it.ritvio.android

import java.net.URI
import java.net.URLDecoder
import java.text.Normalizer

internal object TransferRules {
    const val FILE_LIMIT=4*1024*1024
    val playlistId=Regex("^(?:PL|OLAK5uy_|RDCLAK5uy_)[A-Za-z0-9_-]{8,150}$")
    fun link(value:String):String{
        require(value.length<=2048)
        val uri=URI(value.trim());val host=uri.host?.lowercase()?:""
        require(uri.scheme=="https"&&host in listOf("youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be")&&uri.rawUserInfo==null&&uri.port==-1)
        require(if(host=="youtu.be")Regex("^/[A-Za-z0-9_-]{11}$").matches(uri.path)else uri.path in listOf("/playlist","/watch"))
        val lists=uri.rawQuery.orEmpty().split('&').map{it.split('=',limit=2)}.filter{URLDecoder.decode(it[0],"UTF-8")=="list"}
        require(lists.size==1);val id=URLDecoder.decode(lists[0].getOrElse(1){""},"UTF-8");require(playlistId.matches(id));return id
    }
    fun filename(name:String):String{
        var safe=Normalizer.normalize(name,Normalizer.Form.NFKC).replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1f]")," ").trim().trimEnd('.',' ').take(80).trimEnd('.',' ')
        if(safe.isEmpty()||Regex("^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\.|$)",RegexOption.IGNORE_CASE).containsMatchIn(safe))safe="Playlist "+safe.ifEmpty{"RITVIO"}
        return "$safe.ritvio.json"
    }
    fun selected(ids:List<String?>,numbers:List<Int>,skipDuplicates:Boolean,existing:List<String>):Pair<List<Int>,Int>{
        require(numbers.isNotEmpty()&&numbers.size<=1000&&numbers.distinct().size==numbers.size&&numbers.all{it in 1..ids.size})
        val chosen=numbers.toSet();val seen=existing.toMutableSet();val result=mutableListOf<Int>();var skipped=0
        ids.forEachIndexed{i,id->if(i+1 in chosen&&id!=null){if(skipDuplicates&&id in seen)skipped++ else {result.add(i);seen.add(id)}}}
        return result to skipped
    }
}

/** Visible to the embedded Python adapter; checked between bounded HTTP requests. */
class ImportCancellation {
    @Volatile var cancelled=false
    fun isCancelled()=cancelled
}
