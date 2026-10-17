import {audioBands,cleanAudio,type AudioPreferences} from '../../../packages/domain/audio';

export function createAudioGraph(context:BaseAudioContext){
  const filters=audioBands.map((frequency,i)=>{
    const node=context.createBiquadFilter();node.type=i===0?'lowshelf':i===4?'highshelf':'peaking';
    node.frequency.value=Math.min(frequency,context.sampleRate*.45);node.Q.value=.8;return node;
  });
  const preamp=context.createGain(),pan=context.createStereoPanner(),output=context.createGain();
  // Explicit stereo upmix keeps a mono track's original centre level. The
  // panner's default mono equal-power centre would otherwise attenuate it 3 dB.
  pan.channelCountMode='explicit';pan.channelCount=2;
  filters.reduce((previous,next)=>{previous.connect(next);return next;}).connect(preamp);
  preamp.connect(pan);pan.connect(output);
  const frequencies=Float32Array.from({length:512},(_,i)=>20*Math.pow(Math.min(20000,context.sampleRate*.45)/20,i/511));
  const response=new Float32Array(512),phase=new Float32Array(512);
  const probes=filters.map(node=>{const probe=context.createBiquadFilter();probe.type=node.type;probe.frequency.value=node.frequency.value;probe.Q.value=node.Q.value;return probe;});
  const set=(parameter:AudioParam,value:number,smooth:boolean)=>{
    parameter.cancelScheduledValues(context.currentTime);
    if(smooth)parameter.setTargetAtTime(value,context.currentTime,.02);else parameter.setValueAtTime(value,context.currentTime);
  };
  let reduction=0;
  const configure=(value:AudioPreferences,smooth=true)=>{
    const prefs=cleanAudio(value);
    // Estimate the combined static response without touching the live nodes.
    const product=new Float64Array(512).fill(1);
    filters.forEach((node,i)=>{
      const probe=probes[i];probe.gain.value=prefs.enabled?prefs.bands[i]:0;
      probe.getFrequencyResponse(frequencies,response,phase);
      product.forEach((_,j)=>{product[j]*=response[j];});
    });
    const peak=20*Math.log10(Math.max(1,...product));
    // A stereo pan may add coherent channels. Reserve its maximum 3 dB gain.
    // Compensate the EQ, then apply the user's preamp independently. Otherwise
    // every positive preamp value would be silently cancelled by auto gain.
    reduction=prefs.enabled?Math.max(0,peak+(prefs.pan!==0?3:0)):0;
    // Attenuate before ramping boosts; release more slowly to avoid a boost spike.
    const target=Math.pow(10,((prefs.enabled?prefs.preamp:0)-reduction)/20);
    set(preamp.gain,target,smooth&&target>preamp.gain.value);
    filters.forEach((node,i)=>set(node.gain,prefs.enabled?prefs.bands[i]:0,smooth));
    set(pan.pan,prefs.enabled?prefs.pan:0,smooth);
    return reduction;
  };
  return {input:filters[0],output,filters,preamp,pan,configure,get reduction(){return reduction;}};
}
let engine:{context:AudioContext;graph:ReturnType<typeof createAudioGraph>;source:MediaElementAudioSourceNode}|undefined;
export function configureAudio(preferences:AudioPreferences){return engine?.graph.configure(preferences)??0;}
export async function prepareAudio(element:HTMLAudioElement,preferences:AudioPreferences){
  if(typeof AudioContext==='undefined')return;
  if(!engine){
    const context=new AudioContext();const graph=createAudioGraph(context);
    graph.configure(preferences,false);graph.output.connect(context.destination);
    const source=context.createMediaElementSource(element);source.connect(graph.input);
    engine={context,graph,source};
  }
  engine.graph.configure(preferences);
  if(engine.context.state==='suspended')await engine.context.resume();
}
export function audioEngine(){return engine;}
