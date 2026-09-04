import * as React from 'react';
import { Observers } from './pages/Observers';
import { General } from './pages/General';
import { Routes, Route, Navigate } from 'react-router-dom';
import Drawer from './components/Drawer';
import ApiIcon from '@mui/icons-material/Api';
import SettingsIcon from '@mui/icons-material/Settings';

const menuRoutes: any = [
  {
    name: 'Observers',
    path: '/observers',
    element: <Observers />,
    icon: <ApiIcon />,
  },
  {
    name: 'General',
    path: '/general',
    element: <General />,
    icon: <SettingsIcon />,
  },
];

export const App = () => {
  return (
    <>
      <Drawer routes={menuRoutes}>
        <Routes>
          {menuRoutes.map((route: any) => (
            <Route {...route} />
          ))}
          <Route path="*" element={<Navigate to="/observers" replace />} />
        </Routes>
      </Drawer>
    </>
  );
};
