import { ApplicationMenu } from 'electrobun/main';

let quitFn: (() => void) | null = null;

export function setApplicationMenu(quit: () => void): void {
  quitFn = quit;

  const menu: any[] = [
    {
      label: 'Barklarm',
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    },
  ];

  ApplicationMenu.setApplicationMenu(menu);

  ApplicationMenu.on('application-menu-clicked', (event: unknown) => {
    const { action } = (event as { data?: { action?: string } }).data || {};
    if (action === 'quit') {
      quitFn?.();
    }
  });
}
