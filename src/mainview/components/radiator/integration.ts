import { observersList } from '../../../extensions/observersList';

export function integrationLabel(type?: string): string {
  if (!type) return '';
  return observersList.find((item: { value: string }) => item.value === type)?.label || type;
}

export function supportsDiagnostics(type?: string): boolean {
  return type === 'githubAction';
}
