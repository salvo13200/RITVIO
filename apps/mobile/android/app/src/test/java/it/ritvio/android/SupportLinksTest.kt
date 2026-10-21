package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class SupportLinksTest {
    @Test fun permitsOnlyTheFixedFormsAndMinimalContext(){
        assertTrue(SupportLinks.allowed(SupportLinks.issues))
        assertTrue(SupportLinks.allowed(SupportLinks.issues+"/new?template=bug_report.yml&context=RITVIO+1.3.1%0APlatform%3A+Android&version=1.3.1"))
        assertTrue(SupportLinks.allowed(SupportLinks.issues+"/new?template=visual_feedback.yml&context=RITVIO+1.3.1%0APlatform%3A+Android"))
        assertTrue(SupportLinks.allowed(SupportLinks.issues+"/new?template=feature_request.yml&context=RITVIO+0.7.5%0APlatform%3A+Windows"))
    }
    @Test fun rejectsRedirectsSecretsExtraFieldsAndMalformedContexts(){
        val good=SupportLinks.issues+"/new?template=bug_report.yml&context=RITVIO+1.3.1%0APlatform%3A+Android&version=1.3.1"
        for(url in listOf(good+"&token=secret",good+"#fragment",good.replace("github.com","github.com.evil.invalid"),good.replace("bug_report.yml","unknown.yml"),good.replace("version=1.3.1","version=2.0.0"),good.replace("RITVIO+1.3.1","private+profile"),good.replace("https:","http:"),good+"&context=other",good.replace("%0A","%xx")))assertFalse(url,SupportLinks.allowed(url))
    }
}
