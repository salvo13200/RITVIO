package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.zip.CRC32
import java.util.zip.DeflaterOutputStream

class StoryRulesTest {
    private fun png(width:Int=1080,height:Int=1920):ByteArray{
        val output=ByteArrayOutputStream();val writer=DataOutputStream(output);writer.write(byteArrayOf(137.toByte(),80,78,71,13,10,26,10))
        fun chunk(name:String,data:ByteArray){val type=name.toByteArray(Charsets.US_ASCII);writer.writeInt(data.size);writer.write(type);writer.write(data);val crc=CRC32();crc.update(type);crc.update(data);writer.writeInt(crc.value.toInt())}
        val header=ByteArrayOutputStream();DataOutputStream(header).apply{writeInt(width);writeInt(height);write(byteArrayOf(8,6,0,0,0))};chunk("IHDR",header.toByteArray())
        val data=ByteArrayOutputStream();DeflaterOutputStream(data).use{it.write(ByteArray((width*4+1)*height))};chunk("IDAT",data.toByteArray());chunk("IEND",byteArrayOf());return output.toByteArray()
    }
    private fun rejected(bytes:ByteArray){try{StoryRules.validate(bytes);fail("Invalid PNG accepted")}catch(_:IllegalArgumentException){}}
    @Test fun fullExactSizePngIsAccepted(){StoryRules.validate(png())}
    @Test fun filenamesCannotEscapeOrContainTitles(){assertEquals("RITVIO-abcdefghijk.png",StoryRules.filename("abcdefghijk"));for(id in listOf("../bad","https://bad","","a".repeat(12))){try{StoryRules.filename(id);fail("Bad ID accepted")}catch(_:IllegalArgumentException){}}}
    @Test fun wrongDimensionsTruncatedAndOversizedAreRejected(){rejected(png(2,2));val valid=png();rejected(valid.copyOf(valid.size-1));rejected(ByteArray(StoryRules.MAX_PNG+1));rejected(byteArrayOf())}
    @Test fun corruptCrcAndTrailingPayloadAreRejected(){val valid=png();val damaged=valid.copyOf();damaged[42]=(damaged[42].toInt() xor 1).toByte();rejected(damaged);rejected(valid+byteArrayOf(1))}
}
