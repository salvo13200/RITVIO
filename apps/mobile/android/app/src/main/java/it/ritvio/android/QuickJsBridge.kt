package it.ritvio.android

import app.cash.zipline.EngineApi
import app.cash.zipline.InterruptHandler
import app.cash.zipline.QuickJs

/** No Java objects, filesystem or network functions are exposed to downloaded JS. */
@OptIn(EngineApi::class)
object QuickJsBridge {
    @JvmStatic fun evaluate(script: String): String {
        require(script.length <= 12 * 1024 * 1024) { "Script too large" }
        val deadline = System.nanoTime() + 12_000_000_000L
        return QuickJs.create().use { engine ->
            engine.memoryLimit = 192L * 1024 * 1024
            engine.maxStackSize = 8L * 1024 * 1024
            engine.interruptHandler = InterruptHandler { System.nanoTime() > deadline || Thread.currentThread().isInterrupted }
            engine.evaluate("var __ritvioOutput = ''; var console = { log: function(value) { __ritvioOutput = String(value); }, warn: function(){}, error: function(){} };")
            engine.evaluate(script, "youtube-challenge.js")
            val output = engine.evaluate("__ritvioOutput") as? String ?: error("No challenge output")
            require(output.length <= 4 * 1024 * 1024)
            output
        }
    }
}
