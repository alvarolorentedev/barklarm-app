import { useEffect, useState } from 'react';
import { client } from '../../rpc-client';
import { ObserverConfiguration } from '../../../types/ObserverConfiguration';

export function useObservables(): ObserverConfiguration[] {
  const [observables, setObservables] = useState<ObserverConfiguration[]>([]);

  useEffect(() => {
    let active = true;
    client
      .getStore('observables')
      .then((value) => {
        if (active) setObservables(Array.isArray(value) ? value : []);
      })
      .catch(() => {
        if (active) setObservables([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return observables;
}
