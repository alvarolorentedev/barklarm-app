import { client } from '../../../rpc-client';

export const storage = () => ({
  saveObservers: async (observables: any[]): Promise<void> => {
    await client.setStore('observables', observables);
    await client.refreshObservers();
  },
  getObservers: async (): Promise<any[]> => {
    return (await client.getStore('observables')) || [];
  },
});
