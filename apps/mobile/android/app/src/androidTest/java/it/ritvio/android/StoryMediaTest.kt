package it.ritvio.android

import android.content.ContextWrapper
import android.graphics.Bitmap
import android.util.Base64
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import android.os.Build
import android.provider.MediaStore
import org.junit.Assume.assumeTrue

class StoryMediaTest{
    @Test fun gallerySavePublishesExactPngInAppAlbumWithoutReplacingEarlierSaves(){
        assumeTrue(Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q)
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val bitmap=Bitmap.createBitmap(1080,1920,Bitmap.Config.ARGB_8888)
        val bytes=ByteArrayOutputStream()
        try{assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes))}finally{bitmap.recycle()}
        val file=StoryMedia(context).prepare("abcdefghijk",Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP))
        val created=mutableListOf<android.net.Uri>()
        try{
            val gallery=StoryGallery(context)
            repeat(2){created.add(gallery.save(file,"abcdefghijk"))}
            assertNotEquals(created[0],created[1])
            for(uri in created){
                assertArrayEquals(bytes.toByteArray(),context.contentResolver.openInputStream(uri)!!.use{it.readBytes()})
                context.contentResolver.query(uri,arrayOf(MediaStore.Images.Media.IS_PENDING,MediaStore.Images.Media.MIME_TYPE,MediaStore.Images.Media.RELATIVE_PATH),null,null,null)!!.use{cursor->
                    assertTrue(cursor.moveToFirst());assertEquals(0,cursor.getInt(0));assertEquals("image/png",cursor.getString(1));assertEquals("Pictures/${gallery.album}/",cursor.getString(2))
                }
            }
        }finally{created.forEach{context.contentResolver.delete(it,null,null)};file.delete()}
    }
    @Test fun generatedPngIsStoredOnlyInIsolatedPrivateExportDirectory(){
        val base=InstrumentationRegistry.getInstrumentation().targetContext
        val isolated=File(base.cacheDir,"story-test-${UUID.randomUUID()}").apply{mkdirs()}
        val context=object:ContextWrapper(base){override fun getCacheDir()=isolated}
        val media=StoryMedia(context);val bitmap=Bitmap.createBitmap(1080,1920,Bitmap.Config.ARGB_8888)
        val bytes=ByteArrayOutputStream();try{assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes))}finally{bitmap.recycle()}
        val file=media.prepare("abcdefghijk",Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP))
        try{assertEquals(media.directory().canonicalFile,file.canonicalFile.parentFile);assertArrayEquals(bytes.toByteArray(),file.readBytes())}finally{file.delete();media.directory().delete();isolated.delete()}
    }
}
