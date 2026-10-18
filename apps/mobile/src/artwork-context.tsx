import {createContext, useContext} from 'react';
export const ArtworkContext = createContext<Record<string, string>>({});
export function useTrackArtwork(id?: string) { const images = useContext(ArtworkContext); return id ? images[id] : undefined; }
