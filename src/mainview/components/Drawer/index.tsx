import * as React from 'react';
import List from '@mui/material/List';
import CssBaseline from '@mui/material/CssBaseline';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useNavigate } from 'react-router-dom';
import { Container, Drawer } from '@mui/material';
import { drawerWidth } from '../../themes';

export default function MiniDrawer({ children, routes }: any) {
  const navigate = useNavigate();
  return (
    <Container disableGutters sx={{ display: 'flex' }}>
      <CssBaseline />
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
        variant="permanent"
        anchor="left"
      >
        <List>
          {routes.map((route: any) => (
            <ListItem key={route.name} disablePadding sx={{ display: 'block' }} onClick={() => navigate(route.path)}>
              <ListItemButton
                sx={{
                  minHeight: 48,
                  justifyContent: 'initial',
                  px: 2.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: 3,
                    justifyContent: 'center',
                  }}
                >
                  {route.icon}
                </ListItemIcon>
                <ListItemText primary={route.name} sx={{ opacity: 1 }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <List style={{ position: 'absolute', bottom: '0' }}></List>
      </Drawer>
      <Container component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', p: 3 }}>
        {children}
      </Container>
    </Container>
  );
}
