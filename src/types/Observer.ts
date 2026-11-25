import { DiagnosticProvider } from './Diagnostics';
import { State } from './State';

export abstract class Observer {
  protected alias: string;
  protected issueEndpoint: string;
  protected muted: boolean;

  /** Optional capability. Integrations without it report diagnostics as unsupported. */
  getDiagnosticProvider?(): DiagnosticProvider | undefined;

  /** Stable source identity used to invalidate evidence after configuration changes. */
  getDiagnosticScope?(): string;

  constructor(alias: string, issueEndpoint: string, muted: boolean) {
    this.alias = alias;
    this.issueEndpoint = issueEndpoint;
    this.muted = muted;
  }

  abstract getState(): Promise<State>;
}
