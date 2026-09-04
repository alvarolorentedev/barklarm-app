import { BrowserWindow, Utils } from 'electrobun/main';
import { nodeExit } from './node-exit';
import { initialize, translate } from './i18n';
import { store } from './store';
import { TrayManager, setConfigureWindowFn } from './tray';
import { setApplicationMenu } from './application-menu';
import { NotificationManager } from './notification';
import { ObserverManager } from './observer-manager';
import { setObserverRefreshFn, setQuitFn, rpc } from './rpc';

console.log('Barklarm booting with Electrobun...');

// SSL configuration
if (store.get('sslDisabled')) {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
} else {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';
}

// Initialize i18n
const locale = Intl.DateTimeFormat().resolvedOptions().locale?.slice(0, 2) || 'en';
initialize(locale);

// Create managers
const tray = new TrayManager(store.get('issueGlobalEndpoint') as string);
const notification = new NotificationManager();
const observerManager = new ObserverManager(
  tray,
  notification,
  true,
  (store.get('refreshInterval') as number) || 60000
);

// Wire up RPC
setObserverRefreshFn(() => observerManager.refreshObservers());

// Window management
let mainWindow: BrowserWindow | null = null;

function createMainWindow(): void {
  try {
    mainWindow = new BrowserWindow({
      title: `Barklarm - ${translate('Configuration')}`,
      url: 'views://mainview/index.html',
      frame: { width: 800, height: 600 },
      rpc,
    });

    // Window close removes the window; tray stays because exitOnLastWindowClosed is false.
    mainWindow.on('close', () => {
      mainWindow = null;
    });
  } catch (err) {
    console.error('Electrobun BrowserWindow not available:', err);
  }
}

function showConfigureWindow(): void {
  if (mainWindow) {
    mainWindow.show?.();
  } else {
    createMainWindow();
  }
}

function quitApp(): void {
  console.log('[Barklarm main] quit requested');
  try {
    observerManager.destroy();
  } catch (err) {
    console.error('[Barklarm main] observerManager.destroy error:', err);
  }
  try {
    tray.destroy();
  } catch (err) {
    console.error('[Barklarm main] tray.destroy error:', err);
  }

  console.log('[Barklarm main] calling Utils.quit');
  try {
    Utils.quit();
  } catch (err) {
    console.error('[Barklarm main] Utils.quit error:', err);
  }

  // If graceful shutdown didn't terminate us (e.g. native event loop still
  // spinning), forcibly exit the process. On macOS the Electrobun/Cottontail
  // graceful path sometimes returns without stopping the native event loop when
  // triggered from the tray/app menu, leaving a headless process.
  console.log('[Barklarm main] graceful quit returned; forcing process exit');
  try {
    process.kill(process.pid, 'SIGTERM');
  } catch (err) {
    console.error('[Barklarm main] SIGTERM error:', err);
  }

  nodeExit(0);
}

setConfigureWindowFn(showConfigureWindow);
setQuitFn(quitApp);
setApplicationMenu(quitApp);

// Initial observer load
observerManager.refreshObservers();

console.log('Barklarm started successfully');
