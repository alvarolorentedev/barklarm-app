import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Status } from '../../../types/Status';
import { translate } from '../../i18n';
import { useSearch } from '../../search-context';
import { useStatus } from '../../status-context';

const STATUS_LABEL: Record<Status, string> = {
  [Status.SUCCESS]: 'Healthy',
  [Status.FAILURE]: 'Failed',
  [Status.CHECKING]: 'Checking',
  [Status.NA]: 'Unavailable',
};

const STATUS_CLASS: Record<Status, string> = {
  [Status.SUCCESS]: 'success',
  [Status.FAILURE]: 'failure',
  [Status.CHECKING]: 'checking',
  [Status.NA]: 'idle',
};

type RouteItem = {
  name: string;
  path: string;
  icon: React.ComponentType<any>;
};

type AppShellProps = {
  routes: RouteItem[];
  children: React.ReactNode;
};

export const AppShell = ({ routes, children }: AppShellProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { states, globalStatus } = useStatus();
  const { search, setSearch } = useSearch();
  const showSearch = location.pathname.startsWith('/observers');

  return (
    <div className="app-shell">
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar-title">Barklarm</span>
      </div>
      <div className="shell-body">
        <aside className="sidebar">
          {showSearch ? (
            <label className="sidebar-search">
              <Search size={12} className="search-icon" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={translate('Search observers')}
                aria-label={translate('Search observers')}
              />
            </label>
          ) : null}
          <nav className="nav">
            {routes.map((route) => {
              const Icon = route.icon;
              const isActive = location.pathname === route.path || location.pathname.startsWith(`${route.path}/`);
              return (
                <button
                  key={route.path}
                  type="button"
                  className={`nav-item${isActive ? ' is-active' : ''}`}
                  onClick={() => navigate(route.path)}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{route.name}</span>
                </button>
              );
            })}
          </nav>
          <div className="sidebar-status">
            <div className="status-title">{translate('Status')}</div>
            <div className="status-row">
              <span className={`status-dot ${STATUS_CLASS[globalStatus]}`} />
              <span>{translate('Global')}</span>
              <span className="status-value">{translate(STATUS_LABEL[globalStatus])}</span>
            </div>
            <div className="status-row">
              <span className={`status-dot ${states.length > 0 ? 'success' : 'idle'}`} />
              <span>{translate('Observers')}</span>
              <span className="status-value">{states.length}</span>
            </div>
            <div className="status-row">
              <span className="status-dot success" />
              <span>{translate('Tray')}</span>
              <span className="status-value">{translate('Active')}</span>
            </div>
          </div>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
};
