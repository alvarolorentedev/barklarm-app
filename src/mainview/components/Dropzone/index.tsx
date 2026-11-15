import React from 'react';
import { DropZoneParams } from '../../../types/DropZoneParams';

export const DropZone = ({ open, onDragOver, onDrop, onDragLeave, children }: DropZoneParams) => {
  if (!open) return null;

  return (
    <div
      className="dropzone"
      data-testid="backdrop"
      data-open={open}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      <div className="dropzone-inner" data-testid="box">
        {children}
      </div>
    </div>
  );
};
