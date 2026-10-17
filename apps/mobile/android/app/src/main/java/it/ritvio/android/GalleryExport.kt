package it.ritvio.android

import java.io.InputStream
import java.io.OutputStream
import java.io.IOException
import java.io.InterruptedIOException

/** Keep the media row pending until every byte is written and the stream is closed. */
object GalleryExport {
    interface Store<T> {
        fun create(name:String):T
        fun open(item:T):OutputStream
        fun publish(item:T)
        fun remove(item:T)
    }
    fun <T> save(name:String,input:InputStream,expectedBytes:Long,store:Store<T>):T {
        require(expectedBytes in 1..StoryRules.MAX_PNG.toLong())
        val item=store.create(name)
        try {
            val count=store.open(item).use { output ->
                val buffer=ByteArray(8192)
                var written=0L
                while(true){
                    if(Thread.currentThread().isInterrupted)throw InterruptedIOException()
                    val length=input.read(buffer)
                    if(length<0)break
                    written+=length
                    if(written>expectedBytes)throw IOException("Image length changed")
                    output.write(buffer,0,length)
                }
                written
            }
            if(count!=expectedBytes)throw IOException("Incomplete image")
            store.publish(item)
            return item
        } catch(error:Throwable) {
            try{store.remove(item)}catch(cleanup:Throwable){error.addSuppressed(cleanup)}
            throw error
        }
    }
}
