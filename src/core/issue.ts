import { State } from '../types/State';
import { Status } from '../types/Status';

/**
 * Explicit allowlist for the issue-creation webhook. New fields on State
 * (diagnostic evidence, future analysis) must not be transmitted by accident.
 */
export type IssuePayload = {
  name: string;
  status: Status;
  link: string;
  error?: {
    id: string;
    description: string;
    actions?: unknown;
  };
};

export function buildIssuePayload(state: State): IssuePayload {
  return {
    name: state.name,
    status: state.status,
    link: state.link,
    ...(state.error
      ? {
          error: {
            id: state.error.id,
            description: state.error.description,
            ...(state.error.actions !== undefined ? { actions: state.error.actions } : {}),
          },
        }
      : {}),
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
