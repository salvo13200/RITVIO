package it.ritvio.android

internal object ArtworkUrls {
    fun candidates(source:String?,id:String):List<String> {
        require(Regex("^[A-Za-z0-9_-]{11}$").matches(id))
        val safe=source?.takeIf{it.length<2048}?.takeIf{runCatching{val uri=java.net.URI(it);uri.scheme=="https"&&uri.userInfo==null&&uri.port in listOf(-1,443)&&listOf(".ytimg.com",".googleusercontent.com",".ggpht.com").any{host->uri.host.orEmpty().endsWith(host)}}.getOrDefault(false)}
        val high=safe?.replace(Regex("([=-])w\\d+(?=-|$)"),"\$1w1024")?.replace(Regex("([=-])h\\d+(?=-|$)"),"\$1h1024")?.replace(Regex("/(mqdefault|hqdefault|sddefault)\\.(jpg|webp)(?=\\?|$)"),"/maxresdefault.\$2")
        return listOfNotNull(high,safe,"https://i.ytimg.com/vi/$id/hqdefault.jpg").distinct()
    }
}
