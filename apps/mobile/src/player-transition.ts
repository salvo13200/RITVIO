/** Animate the React-owned artwork. Never add a second image to the dialog. */
export function animatePlayerArtwork(root:HTMLElement|null,origin:DOMRect|null):()=>void{
 const target=root?.querySelector<HTMLElement>('.player-cover>.artwork');
 if(!root||!target||!origin||origin.width<=0||document.documentElement.dataset.reduceMotion==='true'||matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 const destination=target.getBoundingClientRect();
 if(destination.width<=0||destination.height<=0||typeof target.animate!=='function')return()=>{};
 const animations:Animation[]=[];
 let done=false,timer:ReturnType<typeof setTimeout>|undefined;
 const cleanup=()=>{if(done)return;done=true;clearTimeout(timer);animations.forEach(animation=>animation.cancel());};
 try{
  const artwork=target.animate([
   {transformOrigin:'top left',transform:`translate(${origin.left-destination.left}px,${origin.top-destination.top}px) scale(${origin.width/destination.width},${origin.height/destination.height})`,borderRadius:'8px'},
   {transformOrigin:'top left',transform:'translate(0,0) scale(1)',borderRadius:'14px'}
  ],{duration:300,easing:'cubic-bezier(.16,1,.3,1)'});
  animations.push(artwork);
  root.querySelectorAll('.track-identity,.seek-area,.transport,.player-utilities').forEach((node,index)=>{
   animations.push(node.animate([{opacity:.8,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,delay:index*15,easing:'cubic-bezier(.16,1,.3,1)'}));
  });
  // WebView can interrupt or suspend WAAPI without resolving finished.
  void artwork.finished.then(cleanup,cleanup);
  timer=setTimeout(cleanup,420);
 }catch{cleanup();}
 return cleanup;
}
