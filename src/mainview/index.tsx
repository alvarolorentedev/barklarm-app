import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app';
import './app.css';
import './rpc-client';
import { invoke } from '@tauri-apps/api/core';

const logFrontend = (message: string) => {
  void invoke('log_frontend', { message }).catch(() => undefined);
};

window.addEventListener('error', (event) => {
  logFrontend(`error: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  logFrontend(`unhandled rejection: ${String(event.reason)}`);
});

if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')) {
  document.documentElement.classList.add('platform-darwin');
}

const container = document.getElementById('root');
if (!container) {
  console.error('Root container not found');
} else {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
}
