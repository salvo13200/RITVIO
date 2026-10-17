package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class TransferRulesTest {
    @Test fun acceptsCanonicalPublicLinksAndRejectsOtherHostsAndLists(){
        val id="PLabcdefghijklmno"
        for(url in listOf("https://music.youtube.com/playlist?list=$id","https://www.youtube.com/watch?v=abcdefghijk&list=$id","https://youtu.be/abcdefghijk?list=$id"))assertEquals(id,TransferRules.link(url))
        for(url in listOf("http://youtube.com/playlist?list=$id","https://youtube.com.evil.invalid/playlist?list=$id","https://name@youtube.com/playlist?list=$id","https://youtube.com/playlist?list=$id&list=$id","https://127.0.0.1/playlist?list=$id","https://youtube.com/playlist?list=WL"))assertThrows(Exception::class.java){TransferRules.link(url)}
    }
    @Test fun duplicatePolicyPreservesInputOrderAndUnavailableSlots(){
        val ids=listOf("a",null,"b","a","c")
        assertEquals(listOf(2,4) to 2,TransferRules.selected(ids,listOf(5,4,3,2,1),true,listOf("a")))
        assertEquals(listOf(0,2,3,4) to 0,TransferRules.selected(ids,listOf(1,2,3,4,5),false,emptyList()))
    }
    @Test fun rejectsStaleOrAmbiguousSelections(){
        assertThrows(IllegalArgumentException::class.java){TransferRules.selected(listOf("a"),listOf(1,1),true,emptyList())}
        assertThrows(IllegalArgumentException::class.java){TransferRules.selected(listOf("a"),listOf(2),true,emptyList())}
    }
    @Test fun filenamesStayCompatibleWithWindows(){
        assertEquals("Playlist CON.ritvio.json",TransferRules.filename("CON"))
        assertFalse(TransferRules.filename("../Un:viaggio?.").contains('/'))
        assertTrue(TransferRules.filename("Notte città").endsWith(".ritvio.json"))
    }
}
