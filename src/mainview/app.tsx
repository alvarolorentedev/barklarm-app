import * as React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, List, Settings as SettingsIcon } from 'lucide-react';
import { AppShell } from './components/AppShell';
import { TrayShell } from './components/TrayShell';
import { Observers } from './pages/Observers';
import { Radiator } from './pages/Radiator';
import { FailureDetail } from './pages/Radiator/FailureDetail';
import { Settings } from './pages/Settings';
import { TrayFailureDetail, TrayHandoff, TrayRadiator } from './pages/Tray';
import { SearchProvider } from './search-context';
import { StatusProvider } from './status-context';
import { translate } from './i18n';

const menuRoutes = [
  {
    name: translate('Radiator'),
    path: '/radiator',
    element: <Radiator />,
    icon: Activity,
  },
  {
    name: translate('Observers'),
    path: '/observers',
    element: <Observers />,
    icon: List,
  },
  {
    name: translate('Settings'),
    path: '/settings',
    element: <Settings />,
    icon: SettingsIcon,
  },
];

const fullRoutes = (
  <Routes>
    {menuRoutes.map((route) => (
      <Route key={route.path} path={route.path} element={route.element} />
    ))}
    <Route path="/radiator/observer/:observerId" element={<FailureDetail />} />
    <Route path="/general" element={<Navigate to="/settings" replace />} />
    <Route path="/" element={<Navigate to="/radiator" replace />} />
    <Route path="*" element={<Navigate to="/radiator" replace />} />
  </Routes>
);

const trayRoutes = (
  <Routes>
    <Route path="/tray" element={<TrayRadiator />} />
    <Route path="/tray/observer/:observerId" element={<TrayFailureDetail />} />
    <Route path="/tray/handoff/:observerId" element={<TrayHandoff />} />
    <Route path="*" element={<Navigate to="/tray" replace />} />
  </Routes>
);

const AppContent = () => {
  const location = useLocation();
  const tray = location.pathname.startsWith('/tray');
  if (tray) return <TrayShell>{trayRoutes}</TrayShell>;
  return (
    <SearchProvider>
      <AppShell routes={menuRoutes}>{fullRoutes}</AppShell>
    </SearchProvider>
  );
};

export const App = () => (
  <StatusProvider>
    <AppContent />
  </StatusProvider>
);
