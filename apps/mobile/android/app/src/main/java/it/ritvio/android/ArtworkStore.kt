package it.ritvio.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** Private, bounded raster copies. No media-library permission or persistent picker grant. */
internal class ArtworkStore(private val context: Context) {
    private val directory get() = File(context.filesDir, "artwork").apply { check(isDirectory || mkdirs()) }
    fun owned(uri: String): File? = runCatching {
        val parsed = Uri.parse(uri)
        if (parsed.scheme != "file") return@runCatching null
        val file = File(parsed.path ?: return@runCatching null).canonicalFile
        file.takeIf { it.parentFile == directory.canonicalFile && Regex("^[a-f0-9-]{36}\\.jpg$").matches(it.name) && it.isFile }
    }.getOrNull()
    fun discard(uri: String?) { uri?.let { owned(it)?.delete() } }
    fun copy(uri: Uri): String {
        require(uri.scheme == "content")
        val bytes = context.contentResolver.openInputStream(uri)?.use { stream ->
            val out = ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (true) { val n = stream.read(buffer); if (n < 0) break; require(out.size() + n <= 20 * 1024 * 1024); out.write(buffer, 0, n) }
            out.toByteArray()
        } ?: error("Missing image")
        val info = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, info)
        require(info.outWidth > 0 && info.outHeight > 0 && info.outWidth.toLong() * info.outHeight <= 100_000_000)
        val bitmap = if (Build.VERSION.SDK_INT >= 28) ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes))) { decoder, image, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val scale = minOf(1.0, 1024.0 / maxOf(image.size.width, image.size.height))
            decoder.setTargetSize(maxOf(1, (image.size.width * scale).toInt()), maxOf(1, (image.size.height * scale).toInt()))
        } else {
            val options = BitmapFactory.Options().apply { inSampleSize = 1; while (maxOf(info.outWidth, info.outHeight) / inSampleSize > 1024) inSampleSize *= 2 }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: error("Invalid image")
        }
        val file = File(directory, "${UUID.randomUUID()}.jpg")
        try {
            require((directory.listFiles()?.sumOf { it.length() } ?: 0) < 128L * 1024 * 1024)
            file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it)) }
            check(file.length() in 1L..1_000_000L)
            return Uri.fromFile(file).toString()
        } catch (error: Throwable) { file.delete(); throw error } finally { bitmap.recycle() }
    }
    fun portable(uri: String): String? {
        val file=owned(uri)?:return null
        val bitmap=BitmapFactory.decodeFile(file.path,BitmapFactory.Options().apply{inSampleSize=2})?:return null
        return try{val bytes=ByteArrayOutputStream();for(quality in listOf(85,70,55)){bytes.reset();check(bitmap.compress(Bitmap.CompressFormat.JPEG,quality,bytes));if(bytes.size()<=140_000)break};check(bytes.size()<=140_000);"data:image/jpeg;base64,"+android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP)}finally{bitmap.recycle()}
    }
}
