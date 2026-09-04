import React from 'react';
import Box from '@mui/material/Box';
import Backdrop from '@mui/material/Backdrop';
import { DropZoneParams } from '../../../types/DropZoneParams';

export const DropZone = ({ open, onDragOver, onDrop, onDragLeave, children }: DropZoneParams) => {
  return (
    <Backdrop
      sx={(theme) => ({
        zIndex: theme.zIndex.drawer + 1,
        bgColor: theme.palette.primary.dark,
        color: theme.palette.primary.light,
      })}
      open={open}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      <Box
        sx={{
          height: '100vh',
          width: '100vw',
          display: 'flex',
          flexFlow: 'column',
        }}
      >
        <div
          style={{
            flex: '1',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderStyle: 'dashed',
            margin: 10,
            borderRadius: 10,
          }}
        >
          {children}
        </div>
      </Box>
    </Backdrop>
  );
};
