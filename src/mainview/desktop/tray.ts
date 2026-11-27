import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { Status } from '../../types/Status';
import { State } from '../../types/State';
import { translate } from '../../core/i18n';
import { fetchWrapper } from '../../extensions/fetch-adapter';
import { ObserverPresenter } from '../../core/observer-manager';
import { buildIssuePayload, isHttpUrl } from '../../core/issue';
import { trayTooltip } from '../../core/presentation/tray';

import okIconUrl from '../../assets/ok_icon_big.png';
import failIconUrl from '../../assets/fail_icon_big.png';
import runningIconUrl from '../../assets/running_icon_big.png';
import naIconUrl from '../../assets/na_icon_big.png';

type IconBytes = Record<Status, TauriImage>;

// Used only when AppKit is known not to draw menu item images.
const STATUS_PREFIX: Record<Status, string> = {
  [Status.SUCCESS]: '✓',
  [Status.FAILURE]: '✕',
  [Status.CHECKING]: '⟳',
  [Status.NA]: '?',
};

const linux = typeof navigator !== 'undefined' && navigator.userAgent.includes('Linux');

async function loadIcon(url: string): Promise<TauriImage> {
  // Decode through the image pipeline instead of fetch: small icons are inlined
  // as data URLs, and the production CSP intentionally does not allow connect-src data:.
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('tray icon could not be decoded'));
    image.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('tray icon canvas is unavailable');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return TauriImage.new(new Uint8Array(data.data), canvas.width, canvas.height);
}

export function openRoute(route: string): void {
  window.location.hash = `#${route}`;
  void invoke('show_window');
}

function showConfigureWindow(): void {
  openRoute('/radiator');
}

export async function openExternal(url: string, browser = ''): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (browser) {
      try {
        await invoke('open_with_browser', { url: parsed.href, browser });
        return true;
      } catch (error) {
        // A stale setting must not turn Link into a dead button.
        console.error('Configured browser failed, opening the default browser:', error);
      }
    }
    await openUrl(parsed.href);
    return true;
  } catch (error) {
    console.error('Failed to open URL:', error);
    return false;
  }
}

export function openIssue(state: State, endpoint: string): void {
  if (!isHttpUrl(endpoint)) return;
  void fetchWrapper(endpoint, {
    method: 'POST',
    body: JSON.stringify(buildIssuePayload(state)),
    headers: { 'Content-Type': 'application/json' },
  }).catch((error) => console.error('Failed to open issue:', error));
}

function openFailure(state: State): void {
  if (!state.id) return;
  openRoute(`/radiator/observer/${encodeURIComponent(state.id)}`);
}

async function toggleTrayPanel(event: {
  rect?: { position: { x: number; y: number }; size: { width: number; height: number } };
}): Promise<void> {
  try {
    if (!event.rect) return;
    await invoke('toggle_tray_window', {
      x: event.rect.position.x,
      y: event.rect.position.y,
      width: event.rect.size.width,
      height: event.rect.size.height,
    });
  } catch (error) {
    // A window-position failure must never leave the user without a surface.
    console.error('Tray panel failed, opening the main window:', error);
    void invoke('log_frontend', { message: `[tray] panel failed: ${String(error)}` }).catch(() => undefined);
    window.location.hash = '#/radiator';
    await invoke('show_window').catch(() => undefined);
  }
}

export async function setupAppMenu(): Promise<void> {
  const menu = await Menu.new({
    items: [
      await Submenu.new({
        text: 'Barklarm',
        items: [
          await PredefinedMenuItem.new({ item: 'Hide' }),
          await PredefinedMenuItem.new({ item: 'HideOthers' }),
          await PredefinedMenuItem.new({ item: 'ShowAll' }),
          await PredefinedMenuItem.new({ item: 'Separator' }),
          await PredefinedMenuItem.new({ item: 'Quit' }),
        ],
      }),
      await Submenu.new({
        text: 'Edit',
        items: [
          await PredefinedMenuItem.new({ item: 'Undo' }),
          await PredefinedMenuItem.new({ item: 'Redo' }),
          await PredefinedMenuItem.new({ item: 'Separator' }),
          await PredefinedMenuItem.new({ item: 'Cut' }),
          await PredefinedMenuItem.new({ item: 'Copy' }),
          await PredefinedMenuItem.new({ item: 'Paste' }),
          await PredefinedMenuItem.new({ item: 'SelectAll' }),
        ],
      }),
      await Submenu.new({
        text: 'Window',
        items: [
          await PredefinedMenuItem.new({ item: 'Minimize' }),
          await PredefinedMenuItem.new({ item: 'CloseWindow' }),
        ],
      }),
    ],
  });
  await menu.setAsAppMenu();
}

export class TrayPresenter implements ObserverPresenter {
  private tray: TrayIcon | null = null;
  private menu: Menu | null = null;
  private states: State[] = [];
  private endpoint = '';
  private browser = '';
  private icons: IconBytes;
  private readonly fallback: boolean;
  private queue: Promise<void> = Promise.resolve();
  private tooltip = 'Barklarm';

  private constructor(icons: IconBytes, fallback: boolean) {
    this.icons = icons;
    this.fallback = fallback;
  }

  static async create(initialStates: State[], endpoint: string, fallback: boolean): Promise<TrayPresenter | null> {
    const presenter = new TrayPresenter(
      {
        [Status.SUCCESS]: await loadIcon(okIconUrl),
        [Status.FAILURE]: await loadIcon(failIconUrl),
        [Status.CHECKING]: await loadIcon(runningIconUrl),
        [Status.NA]: await loadIcon(naIconUrl),
      },
      fallback
    );
    presenter.states = initialStates;
    presenter.endpoint = endpoint;
    presenter.tooltip = trayTooltip(initialStates);

    try {
      const menu = linux ? await presenter.buildMenu(initialStates) : undefined;
      // A dev page reload creates a new JS context; replace the old native icon instead of stacking a duplicate.
      await TrayIcon.removeById('barklarm-tray').catch(() => undefined);
      presenter.tray = await TrayIcon.new({
        id: 'barklarm-tray',
        icon: presenter.icons[Status.NA],
        iconAsTemplate: false,
        showMenuOnLeftClick: linux,
        menu,
        tooltip: presenter.tooltip,
        action: (event) => {
          if (event.type !== 'Click') return;
          if ('buttonState' in event && event.buttonState !== 'Up') return;
          void toggleTrayPanel(event).catch((error) => console.error('Tray toggle failed:', error));
        },
      });
      presenter.menu = menu ?? null;
      return presenter;
    } catch (error) {
      console.error('Failed to create tray:', error);
      return null;
    }
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
    this.updateMenu(this.states);
  }

  setBrowser(browser: string): void {
    this.browser = browser;
  }

  updateImage(state: State): void {
    this.enqueue(async () => {
      if (!this.tray) return;
      await this.tray.setIconWithAsTemplate(this.icons[state.status], false);
    });
  }

  updateMenu(states: State[]): void {
    this.states = states;
    this.enqueue(async () => {
      if (!this.tray) return;
      if (linux) {
        const menu = await this.buildMenu(states);
        const previous = this.menu;
        this.menu = menu;
        await this.tray.setMenu(menu);
        if (previous) await previous.close();
      }
      const tooltip = trayTooltip(states);
      if (tooltip === this.tooltip) return;
      this.tooltip = tooltip;
      await this.tray.setTooltip(tooltip);
    });
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error) => console.error('Tray update failed:', error));
  }

  private async buildMenu(states: State[]): Promise<Menu> {
    const items: Array<Submenu | PredefinedMenuItem | { text: string; action: () => void }> = [
      { text: translate('Open Radiator'), action: showConfigureWindow },
      await PredefinedMenuItem.new({ item: 'Separator' }),
    ];

    for (const state of states) {
      const submenuItems: Array<{ text: string; action: () => void }> = [];
      if (state.status === Status.FAILURE && state.id) {
        submenuItems.push({ text: translate('Investigate failure'), action: () => openFailure(state) });
      }
      submenuItems.push({ text: translate('Link'), action: () => void openExternal(state.link, this.browser) });
      const endpoint = state.issueEndpoint || this.endpoint;
      if (state.status === Status.FAILURE && endpoint) {
        submenuItems.push({
          text: translate('Open issue'),
          action: () => openIssue(state, endpoint),
        });
      }
      items.push(
        await Submenu.new({
          text: this.fallback ? `${STATUS_PREFIX[state.status]} ${state.name}` : state.name,
          icon: this.icons[state.status],
          items: submenuItems,
        })
      );
    }

    items.push(await PredefinedMenuItem.new({ item: 'Separator' }));
    items.push({ text: translate('Open Barklarm'), action: showConfigureWindow });
    items.push({ text: translate('Quit'), action: () => void invoke('quit_app') });

    return Menu.new({ items });
  }
}
