import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { client } from '../../rpc-client';

export function useTrayActions() {
  const navigate = useNavigate();
  return {
    openMain: async (route: string) => {
      navigate(route, { replace: true });
      try {
        await client.openMainWindow();
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
    const footer = main.current?.querySelector<HTMLElement>('.tray-footer');
    const height = Math.min(520, Math.max(200, 20 + content.scrollHeight + (footer?.offsetHeight ?? 0)));
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
    return () => {
      // StrictMode remounts effects, so only restore when the route actually left /tray.
      if (window.location.hash.startsWith('#/tray')) return;
      void client.openMainWindow().catch((error) => console.error('Could not restore the main window:', error));
    };
  }, []);

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
      <main className="tray-main" tabIndex={-1} ref={main}>
        {children}
      </main>
    </div>
  );
};
