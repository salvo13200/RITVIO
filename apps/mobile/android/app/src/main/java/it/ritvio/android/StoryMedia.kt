package it.ritvio.android

import android.content.Context
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.util.Base64
import java.io.File
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class StoryMedia(private val context:Context){
    fun directory():File=File(context.cacheDir,"story-exports").apply{mkdirs()}
    fun artwork(id:String,source:String?=null):String {
        val custom=LibraryStore.get(context).artwork("track",id)?.let{ArtworkStore(context).owned(it)}
        if(custom!=null)return "data:image/jpeg;base64,"+Base64.encodeToString(custom.readBytes(),Base64.NO_WRAP)
        var failure:Exception?=null
        for(url in ArtworkUrls.candidates(source,id))try{return download(url)}catch(error:Exception){failure=error}
        throw failure?:IllegalArgumentException("Missing artwork")
    }
    private fun download(url:String):String {
        val connection=URL(url).openConnection() as HttpsURLConnection
        connection.connectTimeout=4000;connection.readTimeout=4000;connection.instanceFollowRedirects=false
        try{
            require(connection.responseCode==200)
            require(connection.contentType.orEmpty().substringBefore(';') in listOf("image/jpeg","image/png","image/webp"))
            val started=android.os.SystemClock.elapsedRealtime()
            val bytes=connection.inputStream.use{input->val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){require(android.os.SystemClock.elapsedRealtime()-started<=8000);val n=input.read(buffer);if(n<0)break;require(output.size()+n<=1024*1024);output.write(buffer,0,n)};output.toByteArray()}
            val info=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,info)
            require(info.outWidth in 1..4096 && info.outHeight in 1..4096 && info.outWidth.toLong()*info.outHeight<=4000000)
            return "data:${connection.contentType.substringBefore(';')};base64,"+Base64.encodeToString(bytes,Base64.NO_WRAP)
        }finally{connection.disconnect()}
    }
    fun prepare(id:String,encoded:String):File{
        StoryRules.filename(id);require(encoded.length<=StoryRules.MAX_BASE64)
        val bytes=Base64.decode(encoded,Base64.NO_WRAP);StoryRules.validate(bytes)
        val info=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,info)
        require(info.outWidth==1080 && info.outHeight==1920 && info.outMimeType=="image/png")
        // Header dimensions are already checked. A sampled decode validates the PNG
        // without allocating another full 1080x1920 bitmap alongside the WebView canvas.
        val sample=BitmapFactory.Options().apply{inSampleSize=4;inPreferredConfig=Bitmap.Config.RGB_565}
        val decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.size,sample)?:throw IllegalArgumentException()
        try{require(decoded.width==270&&decoded.height==480)}finally{decoded.recycle()}
        val dir=directory()
        dir.listFiles()?.filter{it.isFile&&it.canonicalFile.parentFile==dir.canonicalFile&&Regex("^[a-f0-9-]{36}\\.png$").matches(it.name)&&it.lastModified()<System.currentTimeMillis()-86400000}?.forEach{it.delete()}
        val file=File(dir,"${java.util.UUID.randomUUID()}.png")
        try{file.writeBytes(bytes);return file}catch(error:Throwable){file.delete();throw error}
    }
}
