import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Status } from '../../types/Status';
import { State } from '../../types/State';
import { translate } from '../../core/i18n';
import { fetchWrapper } from '../../extensions/fetch-adapter';
import { ObserverPresenter } from '../../core/observer-manager';
import { buildIssuePayload, isHttpUrl } from '../../core/issue';

import okIconUrl from '../../assets/ok_icon_big.png';
import failIconUrl from '../../assets/fail_icon_big.png';
import runningIconUrl from '../../assets/running_icon_big.png';
import naIconUrl from '../../assets/na_icon_big.png';

type IconBytes = Record<Status, Uint8Array>;

// Used only when AppKit is known not to draw menu item images.
const STATUS_PREFIX: Record<Status, string> = {
  [Status.SUCCESS]: '✓',
  [Status.FAILURE]: '✕',
  [Status.CHECKING]: '⟳',
  [Status.NA]: '?',
};

async function loadIcon(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
}

function showConfigureWindow(): void {
  void invoke('show_window');
}

export function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    void openUrl(parsed.href);
  } catch (error) {
    console.error('Failed to open URL:', error);
  }
}

function openIssue(state: State, endpoint: string): void {
  if (!isHttpUrl(endpoint)) return;
  void fetchWrapper(endpoint, {
    method: 'POST',
    body: JSON.stringify(buildIssuePayload(state)),
    headers: { 'Content-Type': 'application/json' },
  }).catch((error) => console.error('Failed to open issue:', error));
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
  private icons: IconBytes;
  private readonly fallback: boolean;
  private queue: Promise<void> = Promise.resolve();

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

    try {
      const menu = await presenter.buildMenu(initialStates);
      presenter.tray = await TrayIcon.new({
        icon: presenter.icons[Status.NA],
        iconAsTemplate: false,
        showMenuOnLeftClick: true,
        menu,
        tooltip: 'Barklarm',
      });
      presenter.menu = menu;
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
      const menu = await this.buildMenu(states);
      const previous = this.menu;
      this.menu = menu;
      await this.tray.setMenu(menu);
      if (previous) await previous.close();
    });
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error) => console.error('Tray update failed:', error));
  }

  private async buildMenu(states: State[]): Promise<Menu> {
    const items: Array<Submenu | PredefinedMenuItem | { text: string; action: () => void }> = [];

    for (const state of states) {
      const submenuItems: Array<{ text: string; action: () => void }> = [
        { text: translate('Link'), action: () => openExternal(state.link) },
      ];
      const endpoint = state.issueEndpoint || this.endpoint;
      if (state.status === Status.FAILURE && endpoint) {
        submenuItems.push({
          text: translate('Open Issue'),
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
    items.push({ text: translate('Configure'), action: showConfigureWindow });
    items.push({ text: translate('Quit'), action: () => void invoke('quit_app') });

    return Menu.new({ items });
  }
}
