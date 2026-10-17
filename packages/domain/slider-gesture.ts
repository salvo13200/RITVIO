/** Keeps an aborted native drag guarded until release or an explicit new gesture. */
export class SliderGesture {
  private pending: {value:number;key?:string;cancelled:boolean}|null=null;
  get active(){return this.pending!==null;}
  begin(value:number,key?:string){this.pending={value,key,cancelled:false};}
  cancel(){if(this.pending)this.pending.cancelled=true;}
  update(value:number,key?:string,disabled=false):'preview'|'immediate'|'cancelled'{
    if(!this.pending)return disabled?'cancelled':'immediate';
    if(disabled||this.pending.key!==key)this.cancel();
    if(this.pending.cancelled)return 'cancelled';
    this.pending.value=value;return 'preview';
  }
  release(key?:string,disabled=false):number|null{
    const pending=this.pending;this.pending=null;
    return pending&&!pending.cancelled&&!disabled&&pending.key===key?pending.value:null;
  }
}
