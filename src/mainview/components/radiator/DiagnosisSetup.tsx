import React from 'react';
import { RadiatorFailure } from '../../../core/presentation/radiator';
import { translate } from '../../i18n';

type DiagnosisSetupProps = {
  failure: RadiatorFailure;
  onEnableDiagnostics: () => void;
  onOpenSettings: () => void;
};

export const DiagnosisSetup = ({ failure, onEnableDiagnostics, onOpenSettings }: DiagnosisSetupProps) => {
  if (failure.evidenceStatus === 'disabled') {
    return (
      <div className="radiator-setup-note">
        <div>
          <strong>{translate('Turn on diagnostic evidence')}</strong>
          <p>
            {translate(
              'Barklarm can retrieve the failed job, steps and bounded log excerpts for supported sources. Data stays on this device.'
            )}
          </p>
        </div>
        <button type="button" className="button primary" onClick={onEnableDiagnostics}>
          {translate('Turn on diagnostic evidence')}
        </button>
      </div>
    );
  }

  if (failure.evidenceStatus === 'unsupported') {
    return (
      <div className="radiator-setup-note">
        <div>
          <strong>{translate('No detailed evidence for this source')}</strong>
          <p>{translate('This integration reports operational status but does not provide diagnostic evidence.')}</p>
        </div>
      </div>
    );
  }

  if (failure.analysisStatus === 'disabled') {
    return (
      <div className="radiator-setup-note">
        <div>
          <strong>{translate('AI interpretation is off')}</strong>
          <p>
            {translate(
              'Barklarm can explain this failure with a local model. Built-in intelligence runs on this device and is optional.'
            )}
          </p>
        </div>
        <button type="button" className="button" onClick={onOpenSettings}>
          {translate('Set up built-in AI')}
        </button>
      </div>
    );
  }

  if (failure.analysisStatus === 'runtime_unavailable') {
    const modelMissing = failure.analysisReason === 'model_missing';
    const consent = failure.analysisReason === 'consent_required';
    const unsupported = failure.analysisReason === 'unsupported_hardware';
    return (
      <div className="radiator-setup-note">
        <div>
          <strong>
            {modelMissing
              ? translate('The local model is not installed')
              : consent
                ? translate('Review the inference destination')
                : unsupported
                  ? translate('Built-in AI is not supported on this computer')
                  : translate('AI is not available right now')}
          </strong>
          <p>
            {modelMissing
              ? translate('Install the verified local model in Settings to get automatic diagnoses.')
              : consent
                ? translate('Barklarm requires explicit approval before sending evidence to this destination.')
                : unsupported
                  ? translate('You can still use Barklarm without AI or configure a compatible provider.')
                  : translate('Check the local runtime or provider configuration in Settings, then try again.')}
          </p>
        </div>
        <button type="button" className="button" onClick={onOpenSettings}>
          {translate('Open settings')}
        </button>
      </div>
    );
  }

  if (failure.analysisStatus === 'insufficient_evidence') {
    return (
      <div className="radiator-setup-note">
        <div>
          <strong>{translate('Not enough evidence for a diagnosis')}</strong>
          <p>{translate('Collected facts are shown below. Collecting more logs or step details may help.')}</p>
        </div>
      </div>
    );
  }

  return null;
};
