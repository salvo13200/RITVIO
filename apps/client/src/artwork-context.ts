import {createContext} from 'react';
/** Optional authored artwork for offline design review; live screens use catalog covers. */
export const ArtworkContext=createContext<Readonly<Record<string,string>>>({});
