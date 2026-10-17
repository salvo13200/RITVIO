package it.ritvio.android

/** Pure policy. Planned languages must not be advertised before their catalogs are complete. */
internal object LanguageRules {
    fun language(tag:String):String?=tag.replace('_','-').substringBefore('-').lowercase(java.util.Locale.ROOT).takeIf{it in LanguageConfig.planned}
    fun valid(preference:String)=preference=="system"||preference in LanguageConfig.planned
    fun writable(preference:String)=preference=="system"||preference in LanguageConfig.available
    fun needsPlatformHandoff(api:Int,completed:Boolean)=api>=33&&!completed
    /** null means a choice already exists in Android settings: preserve it. */
    fun handoffPreference(saved:String?,applicationTags:String):String?=if(applicationTags.isNotEmpty())null else saved?.takeIf{valid(it)}?:"system"
    fun resolve(preference:String,system:List<String>):String{
        require(valid(preference))
        if(preference!="system")return preference.takeIf{it in LanguageConfig.available}?:LanguageConfig.fallback
        return system.mapNotNull{language(it)}.firstOrNull{it in LanguageConfig.available}?:LanguageConfig.fallback
    }
}
