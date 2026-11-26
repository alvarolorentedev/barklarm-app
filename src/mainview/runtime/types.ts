import { DiagnosticSnapshot } from '../../types/Diagnostics';
import {
  AnalysisSnapshot,
  IntelligenceStatus,
  ManagedRuntimeEndpoint,
  ProviderTestInput,
  ProviderTestResult,
} from '../../types/Intelligence';
import { State } from '../../types/State';

export type AppRPCClient = {
  getStore(key: string): Promise<any>;
  setStore(key: string, value: any): Promise<void>;
  refreshObservers(): Promise<void>;
  getObserverStates(): Promise<State[]>;
  getDiagnosticEvidence(observerId: string): Promise<DiagnosticSnapshot>;
  recollectDiagnosticEvidence(observerId: string): Promise<void>;
  getAnalysis(observerId: string): Promise<AnalysisSnapshot>;
  reanalyze(observerId: string): Promise<void>;
  getIntelligenceStatus(): Promise<IntelligenceStatus>;
  startModelDownload(): Promise<void>;
  cancelModelDownload(): Promise<void>;
  removeModel(): Promise<void>;
  ensureManagedRuntime(): Promise<ManagedRuntimeEndpoint>;
  stopManagedRuntime(): Promise<void>;
  getProviderKey(fingerprint?: string): Promise<string | undefined>;
  setProviderKey(key: string, fingerprint?: string): Promise<void>;
  deleteProviderKey(fingerprint?: string): Promise<void>;
  isDestinationApproved(fingerprint: string): Promise<boolean>;
  approveDestination(fingerprint: string): Promise<void>;
  revokeDestination(fingerprint: string): Promise<void>;
  testInferenceProvider(input: ProviderTestInput): Promise<ProviderTestResult>;
  writeClipboard(text: string): Promise<boolean>;
  openIssue(observerId: string): Promise<boolean>;
  openMainWindow(): Promise<void>;
  hideWindow(): Promise<void>;
  setTrayPanelHeight(height: number): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  importConfig(): Promise<boolean>;
  exportConfig(): Promise<boolean>;
  quit(): Promise<boolean>;
  logError(message: string): void;
};
