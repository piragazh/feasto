import { createContext, useContext } from 'react';

/**
 * When a screen runs in paired-device mode, all of its data comes from the
 * manifest delivered by the screenDevice heartbeat. Components read it from
 * here and skip their own entity queries. Null = legacy URL mode.
 */
export const ScreenManifestContext = createContext(null);

export const useScreenManifest = () => useContext(ScreenManifestContext);
