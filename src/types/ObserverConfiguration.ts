export type ObserverConfiguration = {
  /** Persistent identity assigned by core normalization. Legacy configs are migrated on load. */
  id?: string;
  type: string;
  alias?: string;
  issueEndpoint?: string;
  muted?: boolean;
};
