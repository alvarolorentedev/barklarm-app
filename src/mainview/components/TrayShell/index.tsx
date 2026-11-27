import React, { useCallback, useEffect, useRef } from 'react';
import { Settings, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';

export function useTrayActions() {
  const navigate = useNavigate();
  return {
    openMain: async (route: string) => {
      navigate('/tray', { replace: true });
      try {
        await client.openMainWindow(route);
      } catch (error) {
        console.error('Could not open the main window:', error);
      }
    },
    hide: () => {
      void client.hideWindow().catch((error) => console.error('Could not hide the window:', error));
    },
    quit: () => {
      void client.quit().catch((error) => console.error('Could not quit:', error));
    },
  };
}

export const TrayShell = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const main = useRef<HTMLElement | null>(null);
  const actions = useTrayActions();

  const measure = useCallback(() => {
    const content = main.current?.querySelector<HTMLElement>('.tray-content');
    if (!content) return;
    const height = Math.min(520, Math.max(200, 86 + content.scrollHeight));
    void client.setTrayPanelHeight(height).catch(() => undefined);
  }, []);

  useEffect(() => {
    measure();
    const content = main.current?.querySelector<HTMLElement>('.tray-content');
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [location.pathname, measure]);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void actions.hide();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  return (
    <div className="tray-shell">
      <header className="tray-head">
        <span className="tray-brand">Barklarm</span>
        <span className="tray-head-spacer" />
        <button
          type="button"
          className="tray-icon-button"
          aria-label={translate('Settings')}
          title={translate('Settings')}
          onClick={() => void actions.openMain('/settings')}
        >
          <Settings size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tray-icon-button"
          aria-label={translate('Close')}
          title={translate('Close')}
          onClick={actions.hide}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>
      <main className="tray-main" tabIndex={-1} ref={main}>
        {children}
      </main>
    </div>
  );
};
