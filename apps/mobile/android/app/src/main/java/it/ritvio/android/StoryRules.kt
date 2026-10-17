package it.ritvio.android

object StoryRules {
    const val MAX_PNG=8*1024*1024
    const val MAX_BASE64=4*((MAX_PNG+2)/3)
    fun filename(id:String):String { require(Regex("^[A-Za-z0-9_-]{11}$").matches(id));return "RITVIO-$id.png" }
    fun validate(bytes:ByteArray) {
        require(bytes.size in 33..MAX_PNG)
        val signature=byteArrayOf(137.toByte(),80,78,71,13,10,26,10)
        require(bytes.copyOfRange(0,8).contentEquals(signature))
        require(String(bytes,12,4,Charsets.US_ASCII)=="IHDR")
        fun uint(at:Int)=(0..3).fold(0L){v,i->(v shl 8) or (bytes[at+i].toLong() and 255)}
        require(uint(8)==13L && uint(16)==1080L && uint(20)==1920L)
        var at=8;var imageData=false;var ended=false
        while(at+12<=bytes.size){
            val count=uint(at);require(count<=MAX_PNG && count+at+12<=bytes.size)
            val length=count.toInt();val kind=String(bytes,at+4,4,Charsets.US_ASCII)
            val crc=java.util.zip.CRC32();crc.update(bytes,at+4,length+4);require(crc.value==uint(at+8+length))
            if(at==8)require(kind=="IHDR"&&length==13) else require(kind!="IHDR")
            if(kind=="IDAT")imageData=true
            at+=length+12
            if(kind=="IEND"){require(length==0&&at==bytes.size);ended=true;break}
        }
        require(ended&&imageData)
    }
}
