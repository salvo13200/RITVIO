package it.ritvio.android

import org.junit.Assert.*
import org.junit.Test

class QueueRulesTest {
    @Test fun explicitNextWinsOverTheShuffledSuccessor(){
        assertEquals(listOf(3,0,1,4,2),QueueRules.insertedNext(listOf(2,0,3,1),0,1))
    }
    @Test fun nextAtTheEndAndInAnEmptyQueue(){
        assertEquals(listOf(1,2,0),QueueRules.insertedNext(listOf(1,0),1,2))
        assertEquals(listOf(0),QueueRules.insertedNext(emptyList(),-1,0))
    }
    @Test fun movingDoesNotDropOrDuplicateAnOccurrence(){
        for(size in 1..8){
            val order=(0 until size).reversed().toList()
            for(from in 0 until size)for(to in 0 until size){
                val result=QueueRules.moved(order,from,to)
                assertEquals(order.sorted(),result.sorted())
                val physical=(0 until size).toMutableList();physical.add(to,physical.removeAt(from))
                val expected=order.toMutableList();val target=expected.indexOf(to);expected.remove(from);expected.add(target,from)
                assertEquals(expected,result.map{physical[it]})
            }
        }
    }
    @Test fun sequentialMovePreservesSequentialOrder(){
        assertEquals(listOf(0,1,2,3),QueueRules.moved(listOf(0,1,2,3),1,3))
        assertEquals(listOf(0,1,2,3),QueueRules.moved(listOf(0,1,2,3),3,0))
    }
    @Test fun insertedNextIsAdjacentToCurrentForEveryPosition(){
        for(size in 1..10){val order=(0 until size).reversed().toList();for(current in order){
            val insert=current+1;val result=QueueRules.insertedNext(order,current,insert)
            assertEquals((0..size).toList(),result.sorted())
            val shiftedCurrent=if(current>=insert)current+1 else current
            assertEquals(insert,result[result.indexOf(shiftedCurrent)+1])
        }}
    }
    @Test fun rejectsCorruptOrdersAndPositions(){
        assertThrows(IllegalArgumentException::class.java){QueueRules.moved(listOf(0,0),0,1)}
        assertThrows(IllegalArgumentException::class.java){QueueRules.moved(listOf(0,1),0,3)}
        assertThrows(IllegalArgumentException::class.java){QueueRules.insertedNext(listOf(0,1),-1,0)}
        assertThrows(IllegalArgumentException::class.java){QueueRules.insertedNext(listOf(0,1),0,3)}
    }
}
