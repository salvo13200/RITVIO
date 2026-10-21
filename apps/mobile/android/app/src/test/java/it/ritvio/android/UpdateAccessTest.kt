package it.ritvio.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateAccessTest {
    @Test fun officialUpdateLinksArePlatformAndRepositoryBound() {
        assertTrue(UpdateAccess.officialUrl("https://github.com/salvo13200/RITVIO/releases/tag/android-v1.4.0"))
        assertTrue(UpdateAccess.officialUrl("https://github.com/salvo13200/RITVIO/releases/download/android-v1.4.0/RITVIO-Android-1.4.0.apk"))
        assertTrue(UpdateAccess.officialUrl("https://github.com/salvo13200/RITVIO/releases/tag/android-v1.4.0-rc.1"))
        listOf(
            "https://github.com.evil.test/salvo13200/RITVIO/releases/tag/android-v1.4.0",
            "https://github.com/salvo13200/OTHER/releases/tag/android-v1.4.0",
            "https://github.com/salvo13200/RITVIO/releases/tag/windows-v1.4.0",
            "https://github.com/salvo13200/RITVIO/releases/tag/android-v1.4.0?next=other",
            "https://github.com/salvo13200/RITVIO/releases/download/android-v1.4.0/RITVIO-Android-1.3.1.apk",
            "https://github.com/salvo13200/RITVIO/releases/download/android-v1.4.0/other.apk",
            "file:///data/local/app.apk"
        ).forEach { assertFalse(it, UpdateAccess.officialUrl(it)) }
    }
}
