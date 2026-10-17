package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream

class GalleryExportTest {
    private class Store:GalleryExport.Store<String> {
        val events=mutableListOf<String>()
        val bytes=ByteArrayOutputStream()
        var failAt:String?=null
        override fun create(name:String):String{events.add("create");if(failAt=="create")throw IOException();return name}
        override fun open(item:String):OutputStream {
            events.add("open");if(failAt=="open")throw IOException()
            return object:OutputStream(){
                override fun write(value:Int){if(failAt=="write")throw IOException();bytes.write(value)}
                override fun close(){events.add("close");if(failAt=="close")throw IOException()}
            }
        }
        override fun publish(item:String){events.add("publish");if(failAt=="publish")throw IOException()}
        override fun remove(item:String){events.add("remove")}
    }
    @Test fun publishesExactImageOnlyAfterClosingTheStream(){
        val store=Store();val content=ByteArray(24000){(it%127).toByte()}
        val item=GalleryExport.save("image.png",ByteArrayInputStream(content),content.size.toLong(),store)
        assertEquals("image.png",item);assertArrayEquals(content,store.bytes.toByteArray())
        assertEquals(listOf("create","open","close","publish"),store.events)
    }
    @Test fun failedWriteOrCloseRemovesPendingImageWithoutPublishing(){
        for(stage in listOf("open","write","close")){
            val store=Store().apply{failAt=stage}
            assertThrows(IOException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf(1)),1,store)}
            assertEquals("remove",store.events.last());assertFalse(store.events.contains("publish"))
        }
    }
    @Test fun publicationFailureRemovesTheNewRow(){
        val store=Store().apply{failAt="publish"}
        assertThrows(IOException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf(1)),1,store)}
        assertEquals(listOf("create","open","close","publish","remove"),store.events)
    }
    @Test fun truncatedAndOversizedWritesNeverPublish(){
        for(expected in listOf(1L,3L)){
            val store=Store()
            assertThrows(IOException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf(1,2)),expected,store)}
            assertEquals("remove",store.events.last());assertFalse(store.events.contains("publish"))
        }
    }
    @Test fun insertionFailureAndInvalidLengthDoNotTouchExistingRows(){
        val store=Store().apply{failAt="create"}
        assertThrows(IOException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf(1)),1,store)}
        assertEquals(listOf("create"),store.events)
        val untouched=Store()
        assertThrows(IllegalArgumentException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf()),0,untouched)}
        assertTrue(untouched.events.isEmpty())
    }
    @Test fun interruptedAndAllocationFailureRemoveOnlyTheirPendingRow(){
        val interrupted=Store()
        try{
            Thread.currentThread().interrupt()
            assertThrows(java.io.InterruptedIOException::class.java){GalleryExport.save("image.png",ByteArrayInputStream(byteArrayOf(1)),1,interrupted)}
            assertEquals("remove",interrupted.events.last());assertFalse(interrupted.events.contains("publish"))
        }finally{Thread.interrupted()}
        val store=Store()
        val input=object:ByteArrayInputStream(byteArrayOf(1)){override fun read(buffer:ByteArray,offset:Int,length:Int):Int{throw OutOfMemoryError("simulated")}}
        assertThrows(OutOfMemoryError::class.java){GalleryExport.save("image.png",input,1,store)}
        assertEquals("remove",store.events.last());assertFalse(store.events.contains("publish"))
    }
}
