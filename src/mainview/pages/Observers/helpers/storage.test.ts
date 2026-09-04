import { faker } from '@faker-js/faker';
import { storage } from './storage';
import { expect, describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../../rpc-client', () => ({
  client: {
    setStore: vi.fn().mockResolvedValue(undefined),
    getStore: vi.fn().mockResolvedValue(undefined),
    refreshObservers: vi.fn().mockResolvedValue(undefined),
  },
}));

import { client } from '../../../rpc-client';

describe('storage', () => {
  let storageFunctions: ReturnType<typeof storage>;

  beforeEach(() => {
    vi.clearAllMocks();
    storageFunctions = storage();
  });

  describe('saveObservers', () => {
    it('should set observers and refresh', async () => {
      const newObservable = [{ some: faker.string.uuid() }];
      await storageFunctions.saveObservers(newObservable);
      expect(client.setStore).toBeCalledWith('observables', newObservable);
      expect(client.refreshObservers).toBeCalled();
    });
  });

  describe('getObservers', () => {
    it('should retrieve the list of observables', async () => {
      const observables = [{ some: faker.string.uuid() }];
      (client.getStore as any).mockResolvedValue(observables);
      const result = await storageFunctions.getObservers();
      expect(client.getStore).toBeCalledWith('observables');
      expect(result).toEqual(observables);
    });

    it('should retrieve empty list if observables is empty', async () => {
      (client.getStore as any).mockResolvedValue(undefined);
      const result = await storageFunctions.getObservers();
      expect(client.getStore).toBeCalledWith('observables');
      expect(result).toEqual([]);
    });
  });
});
