import {UpdateController} from '../../../packages/domain/updates';
import {browserUpdateHost} from '../../../packages/updates/browser-host';
import {isAndroid, nativePlayback} from './native';
import {version} from '../package.json';
export const updates = new UpdateController('android', isAndroid ? {
  read: () => nativePlayback.updatesRead(), write: value => nativePlayback.updatesWrite({value}),
  fetch: etag => nativePlayback.updatesFetch({etag}), open: url => nativePlayback.updatesOpen({url}),
} : browserUpdateHost('android', version));
void updates.initialize();
