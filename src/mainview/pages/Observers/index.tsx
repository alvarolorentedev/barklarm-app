import React, { useEffect, useState } from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import LinkIcon from '@mui/icons-material/Link';
import { Observers as ObserversComponent } from '../../components/Observers';
import { DropZone } from '../../components/Dropzone';
import { mutations } from './helpers/mutations';
import { storage } from './helpers/storage';
import { dragdrop } from './helpers/dragdrop';

export const Observers = () => {
  const [observables, setObservables] = useState<any[]>([]);
  const [isDrag, setIsDrag] = useState(false);
  const { getObservers, saveObservers } = storage();

  useEffect(() => {
    getObservers().then(setObservables);
  }, []);

  const { addObserver, removeObserver, updateObserver, parseDataransfer } = mutations(observables, setObservables);
  const { onDragEnter, onDragLeave, onDragOver, onDrop } = dragdrop(setIsDrag, parseDataransfer);

  useEffect(() => {
    if (observables.length > 0 || Array.isArray(observables)) {
      saveObservers(observables);
    }
  }, [observables]);

  const translate = (key: string) => key;

  return (
    <>
      {isDrag ? (
        <DropZone open={isDrag} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
          <Stack
            sx={{
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <LinkIcon fontSize="large" />
            <Typography>{translate('Drop Link Here')}</Typography>
          </Stack>
        </DropZone>
      ) : (
        <Box
          onDragEnter={onDragEnter}
          sx={{
            minHeight: '100%',
            height: '95vh',
          }}
        >
          <ObserversComponent
            observables={observables}
            add={addObserver}
            update={updateObserver}
            remove={removeObserver}
            save={saveObservers}
            translate={translate}
          />
        </Box>
      )}
    </>
  );
};
