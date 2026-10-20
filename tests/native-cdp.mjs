import assert from 'node:assert/strict';

/** Minimal CDP client: never enables Network or preserves response payloads. */
export async function connectNativeCDP(endpoint,pageUrl){
  const version=await fetch(endpoint+'/json/version',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
  const targetUrl=new URL(version.webSocketDebuggerUrl);
  assert.equal(targetUrl.hostname,'127.0.0.1');
  const socket=new WebSocket(targetUrl),pending=new Map(),listeners=new Map();let sequence=0;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Native CDP connection timeout'));},5000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',error=>{clearTimeout(timer);reject(error);},{once:true});});
  const fail=error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();};
  socket.addEventListener('close',()=>fail(Error('Native CDP disconnected')));
  socket.addEventListener('error',()=>fail(Error('Native CDP transport error')));
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}
    else for(const listener of listeners.get(message.method)??[])listener(message.params,message.sessionId);
  });
  function send(method,params={},sessionId){
    assert(!method.startsWith('Network.'),'The native comparison must not enable network collection');
    return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Native CDP timeout: ${method}`));},10000);
      pending.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
    });
  }
  const targets=(await send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'&&t.url===pageUrl);
  if(targets.length!==1){socket.close();throw Error('Expected exactly one isolated app target');}
  const {sessionId}=await send('Target.attachToTarget',{targetId:targets[0].targetId,flatten:true});
  return {browser:{send},page:{send:(method,params)=>send(method,params,sessionId)},
    on(method,callback){const filtered=(params,session)=>{if(session===sessionId)callback(params);};const values=listeners.get(method)??[];values.push(filtered);listeners.set(method,values);},
    async evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error((result.exceptionDetails.exception?.description??result.exceptionDetails.text).slice(0,500));return result.result.value;},
    async close(){if(socket.readyState===WebSocket.CLOSED)return;await new Promise(resolve=>{const timer=setTimeout(()=>{fail(Error('Native CDP close timed out'));resolve();},3000);socket.addEventListener('close',()=>{clearTimeout(timer);resolve();},{once:true});socket.close();});}};
}
