import { RadiatorFailure } from '../../../core/presentation/radiator';
import { translate } from '../../i18n';

export function failureFacts(failure: RadiatorFailure): Array<{ label: string; value: string }> {
  const evidence = failure.validEvidence;
  if (!evidence) return [];
  const job = evidence.items.find((item) => item.category === 'job');
  const step = evidence.items.find((item) => item.category === 'step');
  const facts: Array<{ label: string; value: string }> = [];
  if (job) facts.push({ label: translate('Failed job'), value: job.title.replace(/^Job:\s*/, '') });
  if (step) facts.push({ label: translate('Failed step'), value: step.title.replace(/^Step:\s*/, '') });
  if (failure.runStartedAt) facts.push({ label: translate('Run started'), value: failure.runStartedAt });
  if (failure.evidenceCollectedAt) {
    facts.push({ label: translate('Evidence collected'), value: failure.evidenceCollectedAt });
  }
  return facts;
}
