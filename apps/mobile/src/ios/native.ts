import {registerPlugin} from '@capacitor/core';
interface FoundationPlugin {
 foundationStatus():Promise<unknown>;
 foundationCheck(options:{nonce:string}):Promise<unknown>;
}
export const foundationBridge=registerPlugin<FoundationPlugin>('RitvioPlayback');
