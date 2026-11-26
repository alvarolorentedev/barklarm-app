import { useEffect, useState } from 'react';
import { client } from '../../rpc-client';
import { isHttpUrl } from '../../../core/issue';

export function useIssueEndpoint(): string {
  const [endpoint, setEndpoint] = useState('');

  useEffect(() => {
    let active = true;
    client
      .getStore('issueGlobalEndpoint')
      .then((value) => {
        if (active && typeof value === 'string' && isHttpUrl(value)) setEndpoint(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return endpoint;
}
