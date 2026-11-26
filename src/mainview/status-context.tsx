import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { client } from './rpc-client';
import { State } from '../types/State';
import { Status } from '../types/Status';
import { calculateGlobalStatus } from '../core/presentation/radiator';

type StatusContextValue = {
  states: State[];
  globalStatus: Status;
  loading: boolean;
  refresh: () => Promise<void>;
};

const defaultValue: StatusContextValue = {
  states: [],
  globalStatus: Status.NA,
  loading: true,
  refresh: async () => undefined,
};

const StatusContext = createContext<StatusContextValue>(defaultValue);

export const StatusProvider = ({ children }: { children: React.ReactNode }) => {
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setStates(await client.getObserverStates());
    } catch (error) {
      console.error('[Barklarm] could not read observer states:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(
    () => ({ states, globalStatus: calculateGlobalStatus(states), loading, refresh }),
    [states, loading, refresh]
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatus = () => useContext(StatusContext);
