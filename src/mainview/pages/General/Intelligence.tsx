import React, { useCallback, useEffect, useState } from 'react';
import { Download, HardDrive, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { normalizeIntelligenceProvider } from '../../../core/config';
import { destinationFingerprint, validateEndpoint } from '../../../core/intelligence/endpoint-policy';
import {
  CustomProviderConfig,
  IntelligenceMode,
  IntelligenceStatus,
  ProviderTestResult,
} from '../../../types/Intelligence';

const MODE_LABEL: Record<IntelligenceMode, string> = {
  disabled: 'Disabled',
  managed: 'Built-in local AI',
  custom: 'Custom provider',
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.ceil(value / (1024 * 1024))} MB`;
}

function testMessage(result: ProviderTestResult | null): string {
  if (!result) return '';
  if (result.ok) return translate('Connection successful.');
  const messages: Record<string, string> = {
    consent_required: 'Approve this destination before testing with model requests.',
    configuration: 'Enter a valid HTTPS endpoint and model.',
    unauthorized: 'The provider rejected the API key.',
    rate_limited: 'The provider rate limited the request.',
    timeout: 'The provider did not respond in time.',
    unavailable: 'The provider is unavailable.',
    redirect_rejected: 'The provider attempted a redirect, which Barklarm rejects.',
    invalid_response: 'The provider returned an unexpected response.',
    too_large: 'The provider response was too large.',
    cancelled: 'The test was cancelled.',
    unsupported: 'The provider does not support this operation.',
  };
  return translate(messages[result.error || 'unavailable'] || 'Connection failed.');
}

export const IntelligenceSettings = () => {
  const [mode, setMode] = useState<IntelligenceMode>('disabled');
  const [provider, setProvider] = useState<CustomProviderConfig>(normalizeIntelligenceProvider(undefined));
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(false);
  const [status, setStatus] = useState<IntelligenceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  const refreshStatus = useCallback(async () => {
    try {
      const next = await client.getIntelligenceStatus();
      setStatus(next);
      setKeySaved(next.providerKeyPresent);
    } catch {
      setMessage(translate('Intelligence status could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      client.getStore('intelligenceMode'),
      client.getStore('intelligenceProvider'),
      client.getStore('diagnosticsEnabled'),
    ])
      .then(([storedMode, storedProvider, storedDiagnostics]) => {
        setMode(storedMode === 'managed' || storedMode === 'custom' ? storedMode : 'disabled');
        setProvider(normalizeIntelligenceProvider(storedProvider));
        setDiagnosticsEnabled(Boolean(storedDiagnostics));
      })
      .finally(() => void refreshStatus());
  }, [refreshStatus]);

  useEffect(() => {
    const busy =
      status?.download.status === 'downloading' ||
      status?.download.status === 'verifying' ||
      status?.runtime.state === 'starting';
    if (!busy) return;
    const timer = setInterval(() => void refreshStatus(), 1000);
    return () => clearInterval(timer);
  }, [status?.download.status, status?.runtime.state, refreshStatus]);

  const saveMode = async (next: IntelligenceMode) => {
    setMode(next);
    setMessage('');
    try {
      await client.setStore('intelligenceMode', next);
      await refreshStatus();
    } catch {
      setMessage(translate('Intelligence settings could not be saved.'));
    }
  };

  const saveProvider = async (next: CustomProviderConfig) => {
    const normalized = normalizeIntelligenceProvider(next);
    setProvider(normalized);
    try {
      await client.setStore('intelligenceProvider', normalized);
      await refreshStatus();
    } catch {
      setMessage(translate('Intelligence settings could not be saved.'));
    }
  };

  const updateProvider = (patch: Partial<CustomProviderConfig>) => {
    setProvider((current) => ({ ...current, ...patch }));
  };

  const startDownload = async () => {
    setMessage('');
    try {
      await client.startModelDownload();
      await refreshStatus();
    } catch {
      setMessage(translate('The model download could not be started.'));
    }
  };

  const cancelDownload = async () => {
    try {
      await client.cancelModelDownload();
      await refreshStatus();
    } catch {
      setMessage(translate('The model download could not be cancelled.'));
    }
  };

  const removeModel = async () => {
    try {
      await client.removeModel();
      await refreshStatus();
    } catch {
      setMessage(translate('The model could not be removed.'));
    }
  };

  const keyFingerprint = () => {
    const validation = validateEndpoint(provider.endpoint);
    return validation.ok ? destinationFingerprint(validation.baseUrl, provider.model || '') : '';
  };

  const saveKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await client.setProviderKey(apiKey.trim(), keyFingerprint());
      setApiKey('');
      setKeySaved(true);
      setMessage(translate('API key stored in the operating system credential store.'));
    } catch {
      setMessage(translate('The API key could not be stored in the OS credential store.'));
    }
  };

  const forgetKey = async () => {
    try {
      await client.deleteProviderKey(keyFingerprint());
      setKeySaved(false);
      setApiKey('');
      setMessage(translate('API key removed.'));
    } catch {
      setMessage(translate('The API key could not be removed.'));
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await client.testInferenceProvider({
          endpoint: provider.endpoint || '',
          model: provider.model || '',
          timeoutMs: provider.timeoutMs,
        })
      );
    } catch {
      setTestResult({ ok: false, error: 'unavailable' });
    } finally {
      setTesting(false);
    }
  };

  const approveDestination = async () => {
    const validation = validateEndpoint(provider.endpoint);
    if (validation.ok === false) return;
    try {
      await client.approveDestination(destinationFingerprint(validation.baseUrl, provider.model || ''));
      await refreshStatus();
    } catch {
      setMessage(translate('The destination could not be approved.'));
    }
  };

  const enableDiagnostics = async () => {
    await client.setStore('diagnosticsEnabled', true);
    setDiagnosticsEnabled(true);
  };

  const model = status?.model;
  const download = status?.download;
  const runtime = status?.runtime;
  const hardware = status?.hardware;
  const progress =
    download && download.totalBytes > 0
      ? Math.min(100, Math.round((download.receivedBytes / download.totalBytes) * 100))
      : 0;
  const memoryGb = hardware ? Math.round(hardware.totalMemoryBytes / (1024 * 1024 * 1024)) : 0;
  const insufficientMemory = Boolean(model && memoryGb > 0 && memoryGb < model.minRamGb);
  const endpointValidation = validateEndpoint(provider.endpoint);
  const destinationPending =
    mode === 'custom' && endpointValidation.ok && endpointValidation.requiresConsent && !status?.destinationApproved;

  return (
    <section className="intelligence-settings" aria-label={translate('Intelligence')}>
      <div className="intelligence-modes" role="radiogroup" aria-label={translate('Intelligence')}>
        {(['disabled', 'managed', 'custom'] as IntelligenceMode[]).map((value) => (
          <label className={`intelligence-mode ${mode === value ? 'selected' : ''}`} key={value}>
            <input
              type="radio"
              name="intelligence-mode"
              value={value}
              checked={mode === value}
              onChange={() => void saveMode(value)}
            />
            <span className="intelligence-mode-title">
              {translate(MODE_LABEL[value])}
              {value === 'managed' ? (
                <span className="intelligence-recommended">{translate('Recommended')}</span>
              ) : null}
            </span>
            <span className="intelligence-mode-description">
              {value === 'disabled'
                ? translate('Keep the traditional radiator. No model, downloads or inference.')
                : value === 'managed'
                  ? translate('Barklarm manages a local llama.cpp runtime and verified GGUF model.')
                  : translate('Connect an OpenAI-compatible provider, local or remote.')}
            </span>
          </label>
        ))}
      </div>

      {mode !== 'disabled' && !diagnosticsEnabled ? (
        <div className="intelligence-warning">
          <p>{translate('Intelligence needs diagnostic evidence. Diagnostic collection remains opt-in.')}</p>
          <button type="button" className="button" onClick={() => void enableDiagnostics()}>
            {translate('Enable diagnostic evidence')}
          </button>
        </div>
      ) : null}

      {mode === 'managed' ? (
        <div className="intelligence-card">
          <div className="intelligence-card-header">
            <h4>
              <HardDrive size={14} aria-hidden="true" />
              {translate('Managed model')}
            </h4>
            {runtime ? (
              <span className="analysis-note">
                {translate('Runtime')}: {translate(runtime.state)}
              </span>
            ) : null}
          </div>

          {model ? (
            <>
              <p className="intelligence-model-name">{model.displayName}</p>
              <dl className="intelligence-facts">
                <div>
                  <dt>{translate('Size')}</dt>
                  <dd>{formatBytes(model.sizeBytes)}</dd>
                </div>
                <div>
                  <dt>{translate('License')}</dt>
                  <dd>{model.license || translate('Unknown')}</dd>
                </div>
                <div>
                  <dt>{translate('Memory')}</dt>
                  <dd>
                    {translate('At least')} {model.minRamGb} GB
                  </dd>
                </div>
                <div>
                  <dt>{translate('Status')}</dt>
                  <dd>{translate(model.status)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="analysis-message">{translate('Managed model metadata is unavailable.')}</p>
          )}

          {download?.status === 'downloading' || download?.status === 'verifying' ? (
            <div className="intelligence-download" aria-live="polite">
              <div className="intelligence-progress" aria-label={translate('Download progress')}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <p className="analysis-note">
                {download.status === 'verifying'
                  ? translate('Verifying model integrity…')
                  : `${translate('Downloading model…')} ${formatBytes(download.receivedBytes)} / ${formatBytes(
                      download.totalBytes
                    )}`}
              </p>
              <button type="button" className="button" onClick={() => void cancelDownload()}>
                {translate('Cancel download')}
              </button>
            </div>
          ) : model?.status === 'installed' ? (
            <div className="button-row">
              <span className="intelligence-installed">
                <ShieldCheck size={14} aria-hidden="true" />
                {translate('Model installed and verified.')}
              </span>
              <button type="button" className="button danger" onClick={() => void removeModel()}>
                <Trash2 size={12} aria-hidden="true" />
                {translate('Remove model')}
              </button>
            </div>
          ) : (
            <div className="button-row">
              <button type="button" className="button primary" onClick={() => void startDownload()}>
                <Download size={14} aria-hidden="true" />
                {translate('Download model')}
              </button>
              <span className="analysis-note">{translate('The model is downloaded only after you choose to.')}</span>
            </div>
          )}

          {download?.status === 'failed' ? (
            <p className="analysis-message">{translate('The model download failed. You can retry.')}</p>
          ) : null}

          {hardware ? (
            <p className={`analysis-note ${hardware.managedRuntimeSupported ? '' : 'intelligence-warning-text'}`}>
              {hardware.managedRuntimeSupported
                ? `${translate('Hardware')}: ${hardware.os} ${hardware.arch}, ${memoryGb} GB RAM, ${formatBytes(
                    hardware.freeDiskBytes
                  )} ${translate('free disk')}.`
                : `${translate('Managed inference is unavailable on this computer.')} ${
                    hardware.reason ? translate(hardware.reason) : ''
                  }`}
            </p>
          ) : null}

          {insufficientMemory ? (
            <p className="analysis-message">
              {translate('This model may exceed the available memory. You can still try it at your own risk.')}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'custom' ? (
        <div className="intelligence-card">
          <h4>
            <Wifi size={14} aria-hidden="true" />
            {translate('Custom provider')}
          </h4>
          <label className="intelligence-field">
            <span>{translate('Base URL')}</span>
            <input
              className="input input-wide"
              type="url"
              value={provider.endpoint || ''}
              placeholder="https://host/v1 or http://127.0.0.1:8080/v1"
              onChange={(event) => updateProvider({ endpoint: event.target.value })}
              onBlur={() => void saveProvider(provider)}
            />
          </label>
          <label className="intelligence-field">
            <span>{translate('Model')}</span>
            <input
              className="input input-wide"
              type="text"
              value={provider.model || ''}
              placeholder="model identifier"
              onChange={(event) => updateProvider({ model: event.target.value })}
              onBlur={() => void saveProvider(provider)}
            />
          </label>
          <label className="intelligence-field">
            <span>{translate('API key (optional)')}</span>
            <div className="button-row">
              <input
                className="input input-wide"
                type="password"
                value={apiKey}
                placeholder={keySaved ? translate('Stored in OS credential store') : translate('Not stored')}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
              />
              <button type="button" className="button" onClick={() => void saveKey()}>
                {translate('Save key')}
              </button>
              {keySaved ? (
                <button type="button" className="button" onClick={() => void forgetKey()}>
                  {translate('Forget key')}
                </button>
              ) : null}
            </div>
          </label>

          <div className="intelligence-advanced">
            <label className="intelligence-field">
              <span>{translate('Context window (tokens)')}</span>
              <input
                className="input"
                type="number"
                min={2048}
                max={32768}
                step={1024}
                value={provider.contextWindow || 8192}
                onChange={(event) => updateProvider({ contextWindow: Number(event.target.value) })}
                onBlur={() => void saveProvider(provider)}
              />
            </label>
            <label className="intelligence-field">
              <span>{translate('Max output tokens')}</span>
              <input
                className="input"
                type="number"
                min={256}
                max={4096}
                step={128}
                value={provider.maxOutputTokens || 1536}
                onChange={(event) => updateProvider({ maxOutputTokens: Number(event.target.value) })}
                onBlur={() => void saveProvider(provider)}
              />
            </label>
            <label className="intelligence-field">
              <span>{translate('Request timeout (ms)')}</span>
              <input
                className="input"
                type="number"
                min={10000}
                max={300000}
                step={5000}
                value={provider.timeoutMs || 120000}
                onChange={(event) => updateProvider({ timeoutMs: Number(event.target.value) })}
                onBlur={() => void saveProvider(provider)}
              />
            </label>
          </div>

          <div className="button-row">
            <button type="button" className="button" onClick={() => void testConnection()} disabled={testing}>
              {testing ? translate('Testing…') : translate('Test connection')}
            </button>
            {testResult ? <span className="analysis-note">{testMessage(testResult)}</span> : null}
          </div>

          {status?.destination ? (
            <div className="intelligence-destination">
              <p>
                {translate('Evidence will be sent to')}: <strong>{status.destination}</strong>
              </p>
              {status.consentRequired ? (
                status.destinationApproved ? (
                  <p className="intelligence-approved">
                    <ShieldCheck size={14} aria-hidden="true" />
                    {translate('Destination approved for this model.')}
                  </p>
                ) : (
                  <div className="intelligence-warning">
                    <p>
                      {translate(
                        'This destination is not loopback. Barklarm requires explicit consent before sending diagnostic evidence.'
                      )}
                    </p>
                    <button type="button" className="button primary" onClick={() => void approveDestination()}>
                      {translate('Approve destination')}
                    </button>
                  </div>
                )
              ) : (
                <p className="analysis-note">
                  {translate(
                    'This is a loopback endpoint. An external localhost runtime could still forward data; Barklarm cannot verify it.'
                  )}
                </p>
              )}
            </div>
          ) : provider.endpoint ? (
            <p className="analysis-message">
              {translate('The endpoint is invalid. Use HTTPS for non-loopback hosts.')}
            </p>
          ) : null}

          {destinationPending ? (
            <p className="analysis-note">{translate('Approval is required before analysis can run.')}</p>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="analysis-note">{message}</p> : null}
      {loading ? <p className="analysis-note">{translate('Loading intelligence status…')}</p> : null}
    </section>
  );
};
