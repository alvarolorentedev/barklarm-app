import React, { useCallback, useEffect, useRef } from 'react';
import { Settings, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Status } from '../../../types/Status';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { useStatus } from '../../status-context';

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

function headerState(states: ReturnType<typeof useStatus>['states'], loading: boolean) {
  if (loading && states.length === 0) return { dot: 'idle', text: translate('Loading…') };
  if (states.length === 0) return { dot: 'idle', text: translate('No observers') };
  const failed = states.filter((state) => state.status === Status.FAILURE).length;
  if (failed > 0) {
    return { dot: 'failure', text: `${failed} ${translate(failed === 1 ? 'needs attention' : 'need attention')}` };
  }
  if (states.some((state) => state.status === Status.CHECKING)) return { dot: 'checking', text: translate('Checking') };
  if (states.some((state) => state.status === Status.NA)) return { dot: 'idle', text: translate('No active failures') };
  return { dot: 'success', text: translate('All healthy') };
}

export const TrayShell = ({ children }: { children: React.ReactNode }) => {
  const { states, loading } = useStatus();
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
    return () => {
      // Leaving the tray route through history or a fallback must restore the main-window mode.
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

  const header = headerState(states, loading);

  return (
    <div className="tray-shell">
      <header className="tray-head">
        <span className={`status-dot ${header.dot}`} aria-hidden="true" />
        <span className="tray-brand">Barklarm</span>
        <span className="tray-head-status">{header.text}</span>
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
          onClick={() => void actions.hide()}
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
