import { Tray } from 'electrobun/main';
import { join } from 'path';
import { State } from '../types/State';
import { Status } from '../types/Status';
import { translate } from './i18n';

const ASSETS_DIR = join(__dirname, '..', 'assets');

const STATUS_ICON_MAP: Record<Status, string> = {
  [Status.SUCCESS]: join(ASSETS_DIR, 'ok_icon.png'),
  [Status.FAILURE]: join(ASSETS_DIR, 'fail_icon.png'),
  [Status.CHECKING]: join(ASSETS_DIR, 'running_icon.png'),
  [Status.NA]: join(ASSETS_DIR, 'na_icon.png'),
};

let configureWindowFn: (() => void) | null = null;
let currentObservers: State[] = [];
let issueGlobalEndpoint = '';

export function setConfigureWindowFn(fn: () => void): void {
  configureWindowFn = fn;
}

function openExternal(url: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('child_process');
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'win32') execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch (err) {
    console.error('Failed to open URL:', err);
  }
}

function buildMenu(observers: State[]): any[] {
  const observerItems = observers.map((obs, index) => {
    const submenu: any[] = [
      {
        type: 'normal' as const,
        label: translate('Link'),
        action: `link-${index}`,
      },
    ];

    const endpoint = obs.issueEndpoint || issueGlobalEndpoint;
    if (obs.status === Status.FAILURE && endpoint) {
      submenu.push({
        type: 'normal' as const,
        label: translate('Open Issue'),
        action: `issue-${index}`,
      });
    }

    return {
      type: 'normal' as const,
      label: obs.name,
      submenu,
    };
  });

  return [
    ...observerItems,
    { type: 'separator' as const },
    {
      type: 'normal' as const,
      label: translate('Configure'),
      action: 'configure',
    },
    {
      type: 'normal' as const,
      label: translate('Quit'),
      action: 'quit',
    },
  ];
}

type TrayClickEvent = {
  data: { id: number; action: string; data?: unknown };
};

export class TrayManager {
  private tray: Tray | null = null;

  constructor(endpoint?: string) {
    issueGlobalEndpoint = endpoint || '';
    this.initTray();
  }

  private initTray(): void {
    try {
      this.tray = new Tray({
        image: STATUS_ICON_MAP[Status.NA],
      });
      this.tray.setMenu(buildMenu([]));

      this.tray.on('tray-clicked', (event: unknown) => {
        const { action } = (event as TrayClickEvent).data;
        this.handleAction(action);
      });
    } catch (err) {
      console.error('Failed to create tray:', err);
      this.tray = null;
    }
  }

  private handleAction(action: string): void {
    console.log('[Barklarm tray] action:', action);
    if (action === 'configure') {
      configureWindowFn?.();
    } else if (action === 'quit') {
      console.log('[Barklarm tray] invoking quit handler');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { quitFn } = require('./rpc');
      quitFn?.();
    } else if (action.startsWith('link-')) {
      const index = parseInt(action.split('-')[1]);
      if (currentObservers[index]) {
        openExternal(currentObservers[index].link);
      }
    } else if (action.startsWith('issue-')) {
      const index = parseInt(action.split('-')[1]);
      const obs = currentObservers[index];
      if (obs) {
        const endpoint = obs.issueEndpoint || issueGlobalEndpoint;
        fetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(obs),
          headers: { 'Content-Type': 'application/json' },
        }).catch((err) => console.error('Failed to open issue:', err));
      }
    }
  }

  updateImage(state: State): void {
    if (!this.tray) return;
    try {
      this.tray.setImage(STATUS_ICON_MAP[state.status]);
    } catch {
      // fallback silently
    }
  }

  updateMenu(observersState: State[]): void {
    if (!this.tray) return;
    currentObservers = observersState;
    try {
      this.tray.setMenu(buildMenu(observersState));
    } catch {
      // fallback silently
    }
  }

  destroy(): void {
    this.tray?.remove();
    this.tray = null;
  }
}
