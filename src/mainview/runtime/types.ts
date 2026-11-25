import { State } from '../../types/State';

export type AppRPCClient = {
  getStore(key: string): Promise<any>;
  setStore(key: string, value: any): Promise<void>;
  refreshObservers(): Promise<void>;
  getObserverStates(): Promise<State[]>;
  importConfig(): Promise<boolean>;
  exportConfig(): Promise<boolean>;
  quit(): Promise<boolean>;
  logError(message: string): void;
};
