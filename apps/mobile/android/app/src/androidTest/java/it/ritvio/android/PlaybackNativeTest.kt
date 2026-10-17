package it.ritvio.android

import android.content.Intent
import android.os.SystemClock
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackNativeTest {
    private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
    private fun main(block:()->Unit){instrumentation.runOnMainSync(block)}
    private fun await(timeout:Long=90000,condition:()->Boolean){val until=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<until){if(condition())return;SystemClock.sleep(250)};fail("Native condition timed out")}
    @Test fun embeddedJavaScriptHasNoHostPrivileges(){
        val result=JSONObject(QuickJsBridge.evaluate("console.log(JSON.stringify({sum:21+21,filesystem:typeof require,java:typeof Java}));"))
        assertEquals(42,result.getInt("sum"));assertEquals("undefined",result.getString("filesystem"));assertEquals("undefined",result.getString("java"))
    }
    @Test fun rejectsUntrustedArtworkAndIdentifiers(){
        val base=JSONObject().put("videoId","jNQXAC9IVRw").put("title","Originale").put("artist","Test").put("duration",19).put("thumbnail","")
        assertEquals("jNQXAC9IVRw",TrackData.parse(base).videoId)
        for(change in listOf("videoId" to "../file","thumbnail" to "https://evil.invalid/image")){
            val modified=JSONObject(base.toString()).put(change.first,change.second)
            assertThrows(IllegalArgumentException::class.java){TrackData.parse(modified)}
        }
    }
    @Test fun realCatalogAndAudioContinueWithoutActivity(){
        val context=instrumentation.targetContext
        val resolver=Resolver.get(context)
        val search=resolver.search("Marracash")
        assertTrue(search.getJSONArray("items").length()>0)
        val records=search.getJSONArray("items");for(i in 0 until records.length())TrackData.parse(records.getJSONObject(i))
        val scenario=ActivityScenario.launch(MainActivity::class.java)
        try{
            await{PlaybackService.instance!=null}
            // Public, non-musical test videos. No fixture is substituted for native streaming.
            val short=TrackData("jNQXAC9IVRw","Me at the zoo","jawed","https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",19.0)
            val long=TrackData("aqz-KE-bpKQ","Big Buck Bunny","Blender Foundation","https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",596.0)
            main{PlaybackService.instance!!.setQueue(listOf(short,long),0)}
            await{var ready=false;main{ready=PlaybackService.instance?.player?.isPlaying==true};ready}
            main{PlaybackService.instance!!.command("seek",17.0)}
            context.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            instrumentation.uiAutomation.executeShellCommand("input keyevent 223").close()
            await(90000){var advanced=false;main{val player=PlaybackService.instance?.player;advanced=player?.currentMediaItem?.mediaId==long.videoId && player.isPlaying && player.currentPosition>1500};advanced}
            var before=0L;main{before=PlaybackService.instance!!.player.currentPosition};SystemClock.sleep(4000)
            main{assertTrue(PlaybackService.instance!!.player.currentPosition>before+2000);PlaybackService.instance!!.command("pause",null);assertFalse(PlaybackService.instance!!.player.playWhenReady);PlaybackService.instance!!.command("volume",0.45);assertEquals(.45f,PlaybackService.instance!!.player.volume,.01f)}
            instrumentation.uiAutomation.executeShellCommand("input keyevent 224").close()
            scenario.onActivity{it.recreate()}
            await{var restored=false;main{val state=PlaybackService.instance?.snapshot();restored=state?.getJSONArray("items")?.length()==2 && state.getInt("index")==1};restored}
            main{PlaybackService.instance!!.command("clear",null)}
        }finally{instrumentation.uiAutomation.executeShellCommand("input keyevent 224").close();main{PlaybackService.instance?.player?.pause()};scenario.close()}
    }
}
