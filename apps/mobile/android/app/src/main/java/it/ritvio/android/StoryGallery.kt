package it.ritvio.android

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import java.io.File
import java.io.IOException
import java.util.UUID

/** App-owned MediaStore images need no photo-library permission on Android 10+. */
@RequiresApi(Build.VERSION_CODES.Q)
class StoryGallery(private val context:Context) {
    val album:String=context.getString(R.string.app_name)
    fun save(file:File,id:String):Uri {
        require(file.isFile&&file.canonicalFile.parentFile==StoryMedia(context).directory().canonicalFile)
        val name=StoryRules.filename(id).removeSuffix(".png")+"-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(8)}.png"
        val resolver=context.contentResolver
        val collection=MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val store=object:GalleryExport.Store<Uri> {
            override fun create(name:String):Uri {
                val values=ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME,name)
                    put(MediaStore.Images.Media.MIME_TYPE,"image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH,"${Environment.DIRECTORY_PICTURES}/$album")
                    put(MediaStore.Images.Media.IS_PENDING,1)
                }
                return resolver.insert(collection,values)?:throw IOException("Cannot create gallery image")
            }
            override fun open(item:Uri)=resolver.openOutputStream(item,"w")?:throw IOException("Cannot open gallery image")
            override fun publish(item:Uri){
                val values=ContentValues().apply{put(MediaStore.Images.Media.IS_PENDING,0)}
                if(resolver.update(item,values,null,null)!=1)throw IOException("Cannot publish gallery image")
            }
            override fun remove(item:Uri){resolver.delete(item,null,null)}
        }
        return file.inputStream().use{GalleryExport.save(name,it,file.length(),store)}
    }
}
