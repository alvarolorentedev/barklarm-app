import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { client } from './rpc-client';
import { State } from '../types/State';
import { Status } from '../types/Status';

type StatusContextValue = {
  states: State[];
  globalStatus: Status;
  refresh: () => Promise<void>;
};

const defaultValue: StatusContextValue = {
  states: [],
  globalStatus: Status.NA,
  refresh: async () => undefined,
};

const StatusContext = createContext<StatusContextValue>(defaultValue);

function calculateGlobalStatus(states: State[]): Status {
  if (states.length === 0) return Status.NA;
  if (states.some((state) => state.status === Status.FAILURE)) return Status.FAILURE;
  if (states.some((state) => state.status === Status.NA)) return Status.NA;
  if (states.some((state) => state.status === Status.CHECKING)) return Status.CHECKING;
  return Status.SUCCESS;
}

export const StatusProvider = ({ children }: { children: React.ReactNode }) => {
  const [states, setStates] = useState<State[]>([]);

  const refresh = useCallback(async () => {
    try {
      setStates(await client.getObserverStates());
    } catch (error) {
      console.error('[Barklarm] could not read observer states:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(() => ({ states, globalStatus: calculateGlobalStatus(states), refresh }), [states, refresh]);

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
};

export const useStatus = () => useContext(StatusContext);
