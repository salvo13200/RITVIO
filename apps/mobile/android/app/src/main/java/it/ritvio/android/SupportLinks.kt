package it.ritvio.android

import java.net.URLDecoder
import java.net.URLEncoder

/** Mirrors the narrow, context-only GitHub URL contract in packages/domain/support.ts. */
object SupportLinks {
    const val issues="https://github.com/salvo13200/RITVIO/issues"
    private val version=Regex("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}(?:-[a-zA-Z0-9.-]{1,20})?$")
    fun allowed(url:String):Boolean=runCatching {
        if(url==issues)return true
        if(url.length>1500||!url.startsWith("$issues/new?"))return false
        val parts=url.removePrefix("$issues/new?").split("&").map{it.split("=",limit=2)}
        if(parts.any{it.size!=2})return false
        val params=parts.map{URLDecoder.decode(it[0],"UTF-8") to URLDecoder.decode(it[1],"UTF-8")}
        if(params.map{it.first}.distinct().size!=params.size)return false
        val fields=params.toMap();val template=fields["template"]?:return false
        if(template !in listOf("bug_report.yml","visual_feedback.yml","feature_request.yml"))return false
        val context=fields["context"]?:return false
        val match=Regex("^RITVIO ([\\dA-Za-z.-]+)\nPlatform: (Android|Windows)$").matchEntire(context)?:return false
        if(!version.matches(match.groupValues[1]))return false
        val expected=mutableListOf("template" to template,"context" to context)
        if(template=="bug_report.yml")expected.add("version" to match.groupValues[1])
        val canonical=issues+"/new?"+expected.joinToString("&"){URLEncoder.encode(it.first,"UTF-8")+"="+URLEncoder.encode(it.second,"UTF-8")}
        url==canonical
    }.getOrDefault(false)
}
