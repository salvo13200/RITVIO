package it.ritvio.android

import java.net.URLEncoder
import java.text.Normalizer

/** Kept in sync with packages/domain/track-sharing.ts; no resolver or network access. */
object TrackShare {
    const val site="https://salvo13200.github.io/RITVIO/"
    fun label(value:String,limit:Int):String {
        val cleaned=StringBuilder()
        Normalizer.normalize(value,Normalizer.Form.NFC).codePoints().forEach { code ->
            val space=Character.isWhitespace(code)||Character.isSpaceChar(code)||code in 0..31||code in 127..159||code in 0x200e..0x200f||code in 0x202a..0x202e||code in 0x2066..0x2069
            cleaned.appendCodePoint(if(space)32 else code)
        }
        val compact=cleaned.toString().replace(Regex(" +")," ").trim()
        return String(compact.codePoints().limit(limit.toLong()).toArray(),0,minOf(compact.codePointCount(0,compact.length),limit))
    }
    fun link(videoId:String,title:String,artist:String):String {
        require(Regex("^[A-Za-z0-9_-]{11}$").matches(videoId))
        fun encode(value:String)=URLEncoder.encode(value,"UTF-8")
        val params=mutableListOf("track=$videoId")
        label(title,160).takeIf{it.isNotEmpty()}?.let{params.add("title=${encode(it)}")}
        label(artist,96).takeIf{it.isNotEmpty()}?.let{params.add("artist=${encode(it)}")}
        return site+"#"+params.joinToString("&")
    }
    fun message(videoId:String,title:String,artist:String,credit:String):String =
        listOf(listOf(label(title,160),label(artist,96)).filter{it.isNotEmpty()}.joinToString(" — "),label(credit,80),link(videoId,title,artist)).filter{it.isNotEmpty()}.joinToString("\n")
}
