package it.ritvio.android

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import org.json.JSONArray
import org.json.JSONObject

/** Preferences live outside the playback/library stores; language changes never command audio. */
internal object LanguagePreferences {
    private fun prefs(context:Context)=context.getSharedPreferences("ui-language",Context.MODE_PRIVATE)
    private fun appTags(context:Context):String=if(Build.VERSION.SDK_INT>=33)context.getSystemService(LocaleManager::class.java).applicationLocales.toLanguageTags() else AppCompatDelegate.getApplicationLocales().toLanguageTags()
    private fun systemTags(context:Context):List<String>{
        val tags=if(Build.VERSION.SDK_INT>=33)context.getSystemService(LocaleManager::class.java).systemLocales.toLanguageTags() else Resources.getSystem().configuration.locales.toLanguageTags()
        return tags.split(',').filter{it.isNotEmpty()}.take(20)
    }
    private fun apply(context:Context,preference:String){
        val tag=if(preference=="system")"" else preference
        if(appTags(context)==tag)return
        if(Build.VERSION.SDK_INT>=33)context.getSystemService(LocaleManager::class.java).applicationLocales=LocaleList.forLanguageTags(tag)
        else AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
    }
    @Synchronized fun restore(activity:Activity){
        val store=prefs(activity)
        if(!store.getBoolean("initialized",false)){
            val existing=activity.getDatabasePath("library.sqlite").exists()||activity.getSharedPreferences("playback",Context.MODE_PRIVATE).contains("state")
            val current=appTags(activity).split(',').firstOrNull()?.let{LanguageRules.language(it)}?.takeIf{it in LanguageConfig.available}
            val choice=current?:if(existing)"it" else "system"
            check(store.edit().putString("preference",choice).putBoolean("initialized",true).putInt("revision",1).commit())
        }
        if(LanguageRules.needsPlatformHandoff(Build.VERSION.SDK_INT,store.getBoolean("platform33Migrated",false))){
            // One-time handoff after an Android12 -> 13+ OS upgrade; never override an OS choice.
            LanguageRules.handoffPreference(store.getString("preference",null),appTags(activity))?.let{apply(activity,it)}
            check(store.edit().putBoolean("platform33Migrated",true).commit())
        }else if(Build.VERSION.SDK_INT<33){
            // Before Android13 AppCompat needs the application's stored choice on process startup.
            apply(activity,store.getString("preference","system")?.takeIf{LanguageRules.valid(it)}?:"system")
        }
    }
    @Synchronized fun snapshot(context:Context):JSONObject{
        val store=prefs(context);val tags=systemTags(context)
        val application=appTags(context).split(',').firstOrNull()?.let{LanguageRules.language(it)}
        val preference=application?:"system"
        val signature=tags.joinToString(",")
        var revision=store.getInt("revision",0)
        if(store.getString("preference",null)!=preference||store.getString("system",null)!=signature){
            revision++
            check(store.edit().putString("preference",preference).putString("system",signature).putInt("revision",revision).commit())
        }
        return JSONObject().put("schema",1).put("preference",preference).put("systemLanguages",JSONArray(tags)).put("revision",revision)
    }
    @Synchronized fun write(activity:Activity,preference:String):JSONObject{
        require(LanguageRules.valid(preference)){"INVALID_LANGUAGE"}
        require(LanguageRules.writable(preference)){"LANGUAGE_NOT_READY"}
        val store=prefs(activity);val old=store.getString("preference","system")?:"system"
        // Apply via official platform/AppCompat APIs. No playback service binding is involved.
        apply(activity,preference)
        if(old!=preference)try{check(store.edit().putString("preference",preference).putInt("revision",store.getInt("revision",0)+1).commit())}catch(error:Exception){runCatching{apply(activity,old)};throw error}
        return snapshot(activity)
    }
}
