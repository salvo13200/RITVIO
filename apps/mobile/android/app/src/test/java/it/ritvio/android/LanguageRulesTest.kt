package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class LanguageRulesTest {
    @Test fun plannedLanguagesAreDistinctFromCompleteCatalogs(){
        assertEquals(setOf("it","en","es","fr","de"),LanguageConfig.planned)
        assertEquals(setOf("it","en"),LanguageConfig.available)
        assertTrue(LanguageRules.valid("de"));assertFalse(LanguageRules.writable("de"));assertTrue(LanguageRules.writable("system"));assertTrue(LanguageRules.writable("en"))
    }
    @Test fun regionalPreferencesResolveOnlyToCompleteCatalogs(){
        assertEquals("fr",LanguageRules.language("FR_ca"))
        assertEquals("it",LanguageRules.resolve("system",listOf("de-DE","it-CH")))
        assertEquals("en",LanguageRules.resolve("de",listOf("de-DE")))
        assertEquals("en",LanguageRules.resolve("system",listOf("ja-JP")))
    }
    @Test fun invalidInputsDoNotBecomePreferences(){
        assertFalse(LanguageRules.valid("../../it"));assertFalse(LanguageRules.valid("fr-FR"))
        try{LanguageRules.resolve("invalid",emptyList());fail("Invalid preference accepted")}catch(_:IllegalArgumentException){}
    }
    @Test fun osUpgradeHandsOffOnlyOnceAndKeepsTheCustomChoice(){
        assertFalse(LanguageRules.needsPlatformHandoff(32,false))
        assertTrue(LanguageRules.needsPlatformHandoff(33,false))
        assertFalse(LanguageRules.needsPlatformHandoff(36,true))
        assertEquals("it",LanguageRules.handoffPreference("it",""))
        assertEquals("system",LanguageRules.handoffPreference("system",""))
    }
    @Test fun osSelectionWinsDuringHandoffAndInvalidStorageFallsBack(){
        assertNull(LanguageRules.handoffPreference("it","fr-CA"))
        assertNull(LanguageRules.handoffPreference("system","it-IT"))
        assertEquals("system",LanguageRules.handoffPreference("../../it",""))
    }
}
