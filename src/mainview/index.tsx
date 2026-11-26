import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app';
import './app.css';
import { client } from './rpc-client';

const logFrontend = (message: string) => {
  client.logError(message);
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
document.documentElement.dataset.runtime = import.meta.env.MODE === 'mock' ? 'mock' : 'desktop';

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
