package it.ritvio.android

/** Audio sample buffers live in RAM only. No file cache or offline audio is created. */
internal object PlaybackTuning {
    const val START_MS=500
    const val REBUFFER_MS=1000
    const val MIN_BUFFER_MS=15_000
    const val MAX_BUFFER_MS=50_000
    const val BACK_BUFFER_MS=60_000
    const val TARGET_BUFFER_BYTES=8*1024*1024
    const val PRELOAD_US=5_000_000L
    const val STABLE_MS=1500L
    fun preload(now:Long,changedAt:Long,playing:Boolean,hasNext:Boolean,sleeping:Boolean,repeatOne:Boolean,cooldownUntil:Long)=
        playing&&hasNext&&!sleeping&&!repeatOne&&now-changedAt>=STABLE_MS&&now>=cooldownUntil
}
