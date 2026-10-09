import { useEffect, useState } from 'react';
import { getOfflineState, subscribeOfflineState } from '../data/offlineCache';

/**
 * Espone lo stato della cache offline ai componenti.
 * @returns {{ isOffline: boolean, lastSyncAt: number|null }}
 */
export const useOfflineState = () => {
  const [state, setState] = useState(getOfflineState);

  useEffect(() => subscribeOfflineState(setState), []);

  return state;
};

export default useOfflineState;
