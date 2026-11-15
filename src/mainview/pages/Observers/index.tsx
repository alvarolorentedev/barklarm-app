import React, { useEffect, useState } from 'react';
import { Link } from 'lucide-react';
import { DropZone } from '../../components/Dropzone';
import { Observers as ObserversComponent } from '../../components/Observers';
import { PageHeader } from '../../components/PageHeader';
import { translate } from '../../i18n';
import { useSearch } from '../../search-context';
import { useStatus } from '../../status-context';
import { dragdrop } from './helpers/dragdrop';
import { mutations } from './helpers/mutations';
import { storage } from './helpers/storage';

export const Observers = () => {
  const [observables, setObservables] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isDrag, setIsDrag] = useState(false);
  const { states, refresh } = useStatus();
  const { search } = useSearch();
  const { getObservers, saveObservers } = storage();

  useEffect(() => {
    getObservers().then((observers) => {
      setObservables(observers);
      setLoaded(true);
    });
  }, []);

  const { addObserver, removeObserver, updateObserver, parseDataransfer } = mutations(observables, setObservables);
  const { onDragEnter, onDragLeave, onDragOver, onDrop } = dragdrop(setIsDrag, parseDataransfer);

  useEffect(() => {
    if (loaded) {
      saveObservers(observables).then(() => refresh());
    }
  }, [observables, loaded]);

  return (
    <div
      className="page"
      data-testid="box"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <PageHeader
        title={translate('Observers')}
        description="Observers watch builds and services. Add a source, set an alias, and Barklarm keeps the tray icon in sync."
      />
      <ObserversComponent
        observables={observables}
        add={addObserver}
        update={updateObserver}
        remove={removeObserver}
        save={saveObservers}
        translate={translate}
        states={states}
        search={search}
      />
      {isDrag ? (
        <DropZone open={isDrag} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}>
          <div className="dropzone-content">
            <Link size={28} aria-hidden="true" />
            <span>{translate('Drop Link Here')}</span>
          </div>
        </DropZone>
      ) : null}
    </div>
  );
};
