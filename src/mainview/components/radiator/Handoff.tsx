import React, { useMemo, useState } from 'react';
import { Clipboard, Eye, EyeOff } from 'lucide-react';
import { buildAgentHandoff } from '../../../core/handoff';
import { AnalysisSnapshot } from '../../../types/Intelligence';
import { DiagnosticSnapshot } from '../../../types/Diagnostics';
import { State } from '../../../types/State';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';

type HandoffInput = {
  state: State;
  sourceLabel: string;
  evidence?: DiagnosticSnapshot;
  analysis?: AnalysisSnapshot;
};

type CopyState = 'idle' | 'copying' | 'success' | 'error';

function useHandoff({ state, sourceLabel, evidence, analysis }: HandoffInput, buildImmediately = false) {
  const handoff = useMemo(
    () => (buildImmediately ? buildAgentHandoff({ state, sourceLabel, evidence, analysis }) : null),
    [state, sourceLabel, evidence, analysis, buildImmediately]
  );
  return handoff;
}

export const HandoffCopyButton = ({
  state,
  sourceLabel,
  evidence,
  analysis,
  label,
  className = 'button',
}: HandoffInput & { label?: string; className?: string }) => {
  const [status, setStatus] = useState<CopyState>('idle');
  const evidenceReady = Boolean(evidence?.evidence?.items.length);

  const copy = async () => {
    if (!evidenceReady) return;
    setStatus('copying');
    const handoff = buildAgentHandoff({ state, sourceLabel, evidence, analysis });
    if (!handoff) {
      setStatus('error');
      return;
    }
    try {
      const copied = await client.writeClipboard(handoff.text);
      setStatus(copied ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <span className="handoff-copy-wrap">
      <button
        type="button"
        className={className}
        onClick={() => void copy()}
        disabled={!evidenceReady || status === 'copying'}
        aria-label={
          evidenceReady
            ? `${label || translate('Copy agent prompt')}${analysis?.status === 'available' ? ` (${translate('includes AI interpretation')})` : ''}`
            : `${label || translate('Copy agent prompt')} (${translate('waiting for evidence')})`
        }
      >
        <Clipboard size={11} aria-hidden="true" />
        {status === 'success' ? translate('Copied') : label || translate('Copy agent prompt')}
      </button>
      <span className="handoff-copy-status" role="status">
        {status === 'error'
          ? translate('Clipboard unavailable. Open details to copy manually.')
          : status === 'success'
            ? translate('Prompt copied. Pasting elsewhere may transmit it.')
            : ''}
      </span>
    </span>
  );
};

export const HandoffSection = ({
  state,
  sourceLabel,
  evidence,
  analysis,
  defaultOpen = false,
}: HandoffInput & { defaultOpen?: boolean }) => {
  const handoff = useHandoff({ state, sourceLabel, evidence, analysis }, true);
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<CopyState>('idle');

  const copy = async () => {
    if (!handoff) return;
    setStatus('copying');
    try {
      const copied = await client.writeClipboard(handoff.text);
      setStatus(copied ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="radiator-handoff" aria-label={translate('Agent handoff')}>
      <div className="radiator-handoff-head">
        <div>
          <h2>{translate('Hand off to a coding agent')}</h2>
          <p>{translate('A deterministic prompt built from this failure. Nothing is sent automatically.')}</p>
        </div>
        <span className={`radiator-ai-badge${handoff?.includesAnalysis ? ' is-on' : ''}`}>
          {handoff?.includesAnalysis ? translate('Includes AI interpretation') : translate('Evidence only')}
        </span>
      </div>

      {handoff ? (
        <>
          <div className="radiator-handoff-actions">
            <button type="button" className="button primary" onClick={() => void copy()}>
              <Clipboard size={11} aria-hidden="true" />
              {status === 'success' ? translate('Copied') : translate('Copy prompt')}
            </button>
            <button
              type="button"
              className="button"
              aria-expanded={open}
              aria-controls="handoff-preview"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <EyeOff size={11} aria-hidden="true" /> : <Eye size={11} aria-hidden="true" />}
              {open ? translate('Hide preview') : translate('Preview prompt')}
            </button>
            <span className="radiator-handoff-meta">
              {handoff.characters.toLocaleString('en-US')} {translate('characters')} · {handoff.evidenceIds.length}{' '}
              {translate('evidence items')}
              {handoff.truncated ? ` · ${translate('truncated')}` : ''}
            </span>
          </div>
          <span className="handoff-copy-status" role="status">
            {status === 'error'
              ? translate('Clipboard unavailable. Select the prompt and copy it manually.')
              : status === 'success'
                ? translate('Prompt copied to clipboard.')
                : ''}
          </span>
          {open ? (
            <pre className="radiator-handoff-preview" id="handoff-preview" tabIndex={0}>
              {handoff.text}
            </pre>
          ) : null}
          <p className="radiator-handoff-disclosure">
            {translate(
              'Pasting into another tool may send this content to that tool or its provider. Pattern-based redaction is a safety net, not a guarantee.'
            )}
          </p>
        </>
      ) : (
        <p className="radiator-handoff-empty">
          {translate('Evidence is not available yet. The prompt can be copied once source evidence is collected.')}
        </p>
      )}
    </section>
  );
};
