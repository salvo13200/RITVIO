package it.ritvio.android

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import com.getcapacitor.JSObject
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.ByteArrayOutputStream

/** Separate from playback/resolver workers. Fixed HTTPS endpoint; no install permission. */
internal class UpdateAccess(private val context: Context) {
    private val preferences get() = context.getSharedPreferences("ritvio-updates-v1", Context.MODE_PRIVATE)
    fun read(): JSObject = JSObject().put("version", context.packageManager.getPackageInfo(context.packageName, 0).versionName).put("stored", preferences.getString("state", null))
    fun write(value: String) {
        require(value.toByteArray(Charsets.UTF_8).size <= 200_000 && JSONObject(value).optInt("schema") == 1)
        check(preferences.edit().putString("state", value).commit())
    }
    fun fetch(etag: String?): JSObject {
        require(etag == null || etag.length <= 300 && !etag.contains('\r') && !etag.contains('\n'))
        val connection = URL("https://api.github.com/repos/salvo13200/RITVIO/releases?per_page=30").openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 5000
            connection.readTimeout = 8000
            connection.setRequestProperty("Accept", "application/vnd.github+json")
            connection.setRequestProperty("User-Agent", "RITVIO-update-check")
            if (!etag.isNullOrEmpty()) connection.setRequestProperty("If-None-Match", etag)
            val deadline = SystemClock.elapsedRealtime() + 12_000
            val status = connection.responseCode
            var body = ""
            if (status == 200) {
                require(connection.contentLengthLong <= 2_000_000)
                connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        check(SystemClock.elapsedRealtime() <= deadline)
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 2_000_000)
                        output.write(buffer, 0, count)
                    }
                    body = output.toString("UTF-8")
                }
            }
            val result = JSObject().put("status", status).put("body", body)
            connection.getHeaderField("ETag")?.takeIf { it.length <= 300 && !it.contains('\r') && !it.contains('\n') }?.let { result.put("etag", it) }
            val retrySeconds = connection.getHeaderField("Retry-After")?.toLongOrNull()?.coerceIn(0, 86400)
            val reset = connection.getHeaderField("X-RateLimit-Reset")?.toLongOrNull()?.takeIf { it in 0..10_000_000_000L }
            if (retrySeconds != null) result.put("retryAt", System.currentTimeMillis() + retrySeconds * 1000)
            else if (reset != null) result.put("retryAt", reset * 1000)
            return result
        } finally { connection.disconnect() }
    }
    fun open(url: String) {
        require(officialUrl(url))
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_HISTORY))
    }
    companion object {
        private val version = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?"
        private val official = Regex("^https://github\\.com/salvo13200/RITVIO/releases/(tag|download)/android-v($version)(?:/([^/]+))?$")
        fun officialUrl(url: String): Boolean {
            if (url.length > 450) return false
            val match = official.matchEntire(url) ?: return false
            return if (match.groupValues[1] == "tag") match.groupValues[3].isEmpty()
            else match.groupValues[3] == "RITVIO-Android-${match.groupValues[2]}.apk"
        }
    }
}
