import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { List, Settings } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { Observers } from './pages/Observers';
import { General } from './pages/General';
import { SearchProvider } from './search-context';
import { StatusProvider } from './status-context';
import { translate } from './i18n';

const menuRoutes = [
  {
    name: translate('Observers'),
    path: '/observers',
    element: <Observers />,
    icon: List,
  },
  {
    name: translate('General'),
    path: '/general',
    element: <General />,
    icon: Settings,
  },
];

export const App = () => (
  <StatusProvider>
    <SearchProvider>
      <AppShell routes={menuRoutes}>
        <Routes>
          {menuRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to="/observers" replace />} />
        </Routes>
      </AppShell>
    </SearchProvider>
  </StatusProvider>
);
