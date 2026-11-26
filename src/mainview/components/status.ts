import { Status } from '../../types/Status';

export const STATUS_LABEL: Record<Status, string> = {
  [Status.SUCCESS]: 'Healthy',
  [Status.FAILURE]: 'Failed',
  [Status.CHECKING]: 'Checking',
  [Status.NA]: 'Unavailable',
};

export const STATUS_CLASS: Record<Status, string> = {
  [Status.SUCCESS]: 'success',
  [Status.FAILURE]: 'failure',
  [Status.CHECKING]: 'checking',
  [Status.NA]: 'idle',
};
