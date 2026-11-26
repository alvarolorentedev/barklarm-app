import { createObserverId } from '../../../../core/config';
import { observersfromLinkParser } from '../../../../extensions/observersfromLinkParser';

export const mutations = (observables: any[], setObservables: any) => ({
  addObserver: (observer: any): void => {
    setObservables([...observables, { ...observer, id: observer.id || createObserverId() }]);
  },
  removeObserver: (index: number): void => {
    setObservables(observables.filter((_: any, currentIndex: number) => currentIndex != index));
  },
  updateObserver: (fieldName: string, index: number, value: any): void => {
    setObservables(
      observables.map((observable: any, currentIndex: number) =>
        currentIndex != index ? observable : { ...observable, [fieldName]: value }
      )
    );
  },
  parseDataransfer: (dataTrasfer: DataTransfer) => {
    if (!dataTrasfer.types.some((type: string) => type.toLowerCase().includes('text'))) return;
    const text = ['text/uri-list', 'text/plain', 'Text']
      .map((format) => dataTrasfer.getData(format).trim())
      .find(Boolean);
    if (!text) return;

    const parser = observersfromLinkParser.find((candidate) => candidate.canApply(text));
    if (!parser) return;
    setObservables([...observables, { ...parser.apply(text), id: createObserverId() }]);
  },
});
