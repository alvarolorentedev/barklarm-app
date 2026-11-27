import type { AppRPCClient } from '../runtime/types';

export const MAIN_WINDOW = 'main';
export const TRAY_WINDOW = 'tray';
export const TRAY_RPC_REQUEST = 'barklarm-tray-request';
export const TRAY_RPC_RESPONSE = 'barklarm-tray-response';
export const TRAY_HELLO = 'barklarm-tray-hello';
export const TRAY_READY = 'barklarm-main-ready';

export type TrayRpcRequest = {
  id: number;
  method: keyof AppRPCClient;
  args: unknown[];
};

export type TrayRpcResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};
