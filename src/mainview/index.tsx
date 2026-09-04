import * as React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { createRoot } from 'react-dom/client';
import theme from './themes';
import { App } from './app';
import { HashRouter } from 'react-router-dom';
import './app.css';
import './rpc-client';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';

const container = document.getElementById('root');
if (!container) {
  console.error('Root container not found');
} else {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterLuxon}>
          <HashRouter>
            <App />
          </HashRouter>
        </LocalizationProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
