import {Component,Suspense,type ReactNode} from 'react';
import {AlertCircle,LoaderCircle} from 'lucide-react';
import {t} from './i18n';
/** A route may fail to load while the transport outside this boundary keeps playing. */
export class DeferredContent extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <div className="notice" role="alert"><AlertCircle size={18}/><span>{t('deferred.failed')}</span><button type="button" onClick={()=>window.location.reload()}>{t('deferred.reload')}</button></div>;
    return <Suspense fallback={<div className="large-empty" role="status"><LoaderCircle className="spin" size={26} aria-hidden="true"/><p>{t('deferred.loading')}</p></div>}>{this.props.children}</Suspense>;
  }
}
