import type {UpdateHost} from '../../../packages/domain/updates';
import {UpdateController} from '../../../packages/domain/updates';
import {browserUpdateHost} from '../../../packages/updates/browser-host';
import {version} from '../../../package.json';
export interface UpdateBridge {
  updatesRead(): ReturnType<UpdateHost['read']>;
  updatesWrite(value: string): Promise<void>;
  updatesFetch(etag?: string): ReturnType<UpdateHost['fetch']>;
  updatesOpen(url: string): Promise<void>;
}
const bridge = window.ritvio;
export const updates = new UpdateController('windows', bridge?.updatesRead ? {
  read: () => bridge.updatesRead!(), write: value => bridge.updatesWrite!(value),
  fetch: etag => bridge.updatesFetch!(etag), open: url => bridge.updatesOpen!(url),
} : browserUpdateHost('windows', version));
void updates.initialize();
