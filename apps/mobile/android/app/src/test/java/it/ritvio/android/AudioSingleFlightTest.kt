package it.ritvio.android

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.*
import org.junit.Test

class AudioSingleFlightTest {
    private fun await(condition:()->Boolean){val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(!condition()&&System.nanoTime()<deadline)Thread.yield();assertTrue(condition())}
    @Test fun anUnrelatedInteractiveRequestDoesNotWaitForBackgroundNetwork(){
        val started=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newFixedThreadPool(2)
        val resolver=AudioSingleFlight<String,String>{id,_->if(id=="background"){started.countDown();check(release.await(15,TimeUnit.SECONDS))};id}
        try{val background=pool.submit<String>{resolver.get("background",true)};assertTrue(started.await(3,TimeUnit.SECONDS))
            assertEquals("selected",pool.submit<String>{resolver.get("selected")}.get(2,TimeUnit.SECONDS));assertFalse(background.isDone)
            release.countDown();assertEquals("background",background.get(2,TimeUnit.SECONDS))
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun selectingThePreloadingTrackJoinsOneRequest(){
        val calls=AtomicInteger();val started=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newFixedThreadPool(2)
        val resolver=AudioSingleFlight<String,String>{id,_->calls.incrementAndGet();started.countDown();check(release.await(15,TimeUnit.SECONDS));id}
        try{val background=pool.submit<String>{resolver.get("next",true)};assertTrue(started.await(3,TimeUnit.SECONDS));val selected=pool.submit<String>{resolver.get("next")}
            await{resolver.joined.get()==1L};release.countDown();assertEquals("next",selected.get(2,TimeUnit.SECONDS));assertEquals("next",background.get(2,TimeUnit.SECONDS));assertEquals(1,calls.get())
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun aQueuedBackgroundRequestCanBePromotedWithoutWaitingForAnotherBackgroundRequest(){
        val started=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newFixedThreadPool(3)
        val resolver=AudioSingleFlight<String,String>{id,background->if(id=="old"){started.countDown();check(release.await(15,TimeUnit.SECONDS))}else assertFalse(background);id}
        try{val old=pool.submit<String>{resolver.get("old",true)};assertTrue(started.await(3,TimeUnit.SECONDS));val next=pool.submit<String>{resolver.get("next",true)};await{resolver.pending()==2}
            assertEquals("next",pool.submit<String>{resolver.get("next")}.get(2,TimeUnit.SECONDS));assertFalse(old.isDone);assertEquals("next",next.get(2,TimeUnit.SECONDS));release.countDown();old.get(2,TimeUnit.SECONDS)
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun failuresDoNotLeaveAnInflightRequestThatPoisonsRetry(){
        var count=0;val resolver=AudioSingleFlight<String,String>{id,_->if(count++==0)throw java.io.IOException("offline");id}
        assertThrows(java.io.IOException::class.java){resolver.get("track")};assertEquals(0,resolver.pending());assertEquals("track",resolver.get("track"))
    }
    @Test fun anInterruptedOwnerReleasesItsLaneAndAllowsImmediateRetry(){
        val entered=CountDownLatch(1);var interrupted=false
        val resolver=AudioSingleFlight<String,String>{id,_->if(id=="cancel"){entered.countDown();CountDownLatch(1).await()};id}
        val owner=Thread{try{resolver.get("cancel")}catch(_:InterruptedException){interrupted=Thread.currentThread().isInterrupted}}
        try{owner.start();assertTrue(entered.await(3,TimeUnit.SECONDS));owner.interrupt();owner.join(2000)
            assertFalse(owner.isAlive);assertTrue(interrupted);assertEquals(0,resolver.pending());assertEquals("next",resolver.get("next"))
        }finally{owner.interrupt();owner.join(2000)}
    }
    @Test fun cancellingAJoinedConsumerDoesNotCancelTheSharedOwner(){
        val started=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newSingleThreadExecutor()
        val resolver=AudioSingleFlight<String,String>{id,_->started.countDown();check(release.await(15,TimeUnit.SECONDS));id}
        var interrupted=false
        try{val owner=pool.submit<String>{resolver.get("next",true)};assertTrue(started.await(3,TimeUnit.SECONDS))
            val waiter=Thread{try{resolver.get("next")}catch(_:InterruptedException){interrupted=Thread.currentThread().isInterrupted}};waiter.start();await{resolver.joined.get()==1L};waiter.interrupt();waiter.join(2000);assertFalse(waiter.isAlive);assertTrue(interrupted)
            release.countDown();assertEquals("next",owner.get(2,TimeUnit.SECONDS))
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun selectingAPreloadWhoseOwnerIsCancelledTakesOverWithoutInterruptingTheSelectedConsumer(){
        val started=CountDownLatch(1);val calls=AtomicInteger();val pool=Executors.newSingleThreadExecutor()
        val resolver=AudioSingleFlight<String,String>{id,background->
            if(calls.incrementAndGet()==1){assertTrue(background);started.countDown();CountDownLatch(1).await()}
            else assertFalse(background)
            id
        }
        val owner=Thread{try{resolver.get("next",true)}catch(_:InterruptedException){}}
        try{
            owner.start();assertTrue(started.await(3,TimeUnit.SECONDS))
            val selected=pool.submit<String>{val result=resolver.get("next");assertFalse(Thread.currentThread().isInterrupted);result}
            await{resolver.joined.get()==1L};owner.interrupt();owner.join(2000)
            assertFalse(owner.isAlive);assertEquals("next",selected.get(2,TimeUnit.SECONDS))
            assertEquals(2,calls.get());assertEquals(0,resolver.pending())
        }finally{owner.interrupt();owner.join(2000);pool.shutdownNow()}
    }
    @Test fun foregroundConsumersShareTheReplacementAfterAnInterruptedResolverIOException(){
        val started=CountDownLatch(1);val replacement=CountDownLatch(1);val release=CountDownLatch(1)
        val calls=AtomicInteger();val pool=Executors.newFixedThreadPool(2)
        val resolver=AudioSingleFlight<String,String>{id,background->
            if(calls.incrementAndGet()==1){
                assertTrue(background);started.countDown()
                try{CountDownLatch(1).await()}catch(error:InterruptedException){Thread.currentThread().interrupt();throw java.io.IOException("cancelled",error)}
            }else{assertFalse(background);replacement.countDown();check(release.await(5,TimeUnit.SECONDS))}
            id
        }
        val owner=Thread{try{resolver.get("next",true)}catch(_:Exception){}}
        try{
            owner.start();assertTrue(started.await(3,TimeUnit.SECONDS))
            val selected=List(2){pool.submit<String>{val value=resolver.get("next");assertFalse(Thread.currentThread().isInterrupted);value}}
            await{resolver.joined.get()==2L};owner.interrupt();assertTrue(replacement.await(3,TimeUnit.SECONDS));await{resolver.joined.get()>=3L}
            release.countDown();selected.forEach{assertEquals("next",it.get(2,TimeUnit.SECONDS))};assertEquals(2,calls.get())
        }finally{release.countDown();owner.interrupt();owner.join(2000);pool.shutdownNow()}
    }
    @Test fun aSharedProviderFailureDoesNotTriggerAnAutomaticReplacement(){
        val started=CountDownLatch(1);val release=CountDownLatch(1);val calls=AtomicInteger();val pool=Executors.newFixedThreadPool(2)
        val resolver=AudioSingleFlight<String,String>{_,_->calls.incrementAndGet();started.countDown();check(release.await(5,TimeUnit.SECONDS));throw java.io.IOException("429 provider limit")}
        try{
            val owner=pool.submit<String>{resolver.get("next",true)};assertTrue(started.await(3,TimeUnit.SECONDS))
            val selected=pool.submit<String>{resolver.get("next")};await{resolver.joined.get()==1L};release.countDown()
            for(result in listOf(owner,selected))assertThrows(java.util.concurrent.ExecutionException::class.java){result.get(2,TimeUnit.SECONDS)}
            assertEquals(1,calls.get());assertEquals(0,resolver.pending())
        }finally{release.countDown();pool.shutdownNow()}
    }
}
