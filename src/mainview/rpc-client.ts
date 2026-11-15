import { invoke } from '@tauri-apps/api/core';
import { client, initialize } from './desktop/client';

initialize().catch((error) => {
  console.error(error);
  void invoke('log_frontend', { message: `init failed: ${String(error)}` }).catch(() => undefined);
});

export { client };
