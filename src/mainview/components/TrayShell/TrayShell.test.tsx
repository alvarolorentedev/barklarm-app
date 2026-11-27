/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../rpc-client';
import { TrayShell } from './index';

vi.mock('../../rpc-client', () => ({
  client: {
    setTrayPanelHeight: vi.fn(),
    openMainWindow: vi.fn(),
    hideWindow: vi.fn(),
    quit: vi.fn(),
  },
}));

const mockClient = client as any;

describe('TrayShell', () => {
  const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.setTrayPanelHeight.mockResolvedValue(undefined);
    mockClient.openMainWindow.mockResolvedValue(undefined);
    mockClient.hideWindow.mockResolvedValue(undefined);
    mockClient.quit.mockResolvedValue(true);
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('tray-content') ? 300 : 0;
      },
    });
  });

  afterEach(() => {
    if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
  });

  it('reports the measured content height to the native window', async () => {
    render(
      <MemoryRouter initialEntries={['/tray']}>
        <TrayShell>
          <div className="tray-page">
            <div className="tray-content" />
          </div>
        </TrayShell>
      </MemoryRouter>
    );

    await waitFor(() => expect(mockClient.setTrayPanelHeight).toHaveBeenCalledWith(320));
  });

  it('hides the overlay on Escape without a custom close button', async () => {
    render(
      <MemoryRouter initialEntries={['/tray']}>
        <TrayShell>
          <div className="tray-page">
            <div className="tray-content" />
          </div>
        </TrayShell>
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockClient.hideWindow).toHaveBeenCalledTimes(1);
  });

  it('does not restore the main window on a StrictMode remount', async () => {
    window.location.hash = '#/tray';
    render(
      <React.StrictMode>
        <HashRouter>
          <TrayShell>
            <div className="tray-page">
              <div className="tray-content" />
            </div>
          </TrayShell>
        </HashRouter>
      </React.StrictMode>
    );

    await waitFor(() => expect(mockClient.setTrayPanelHeight).toHaveBeenCalled());
    expect(mockClient.openMainWindow).not.toHaveBeenCalled();
    window.history.replaceState(null, '', window.location.pathname);
  });
});
