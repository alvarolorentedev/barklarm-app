import { Error } from './Error';
import { Status } from './Status';

export type State = {
  /** ID of the source observer. Stamped by the observer manager. */
  id?: string;
  name: string;
  status: Status;
  link: string;
  muted?: boolean;
  issueEndpoint?: string;
  error?: Error;
};
