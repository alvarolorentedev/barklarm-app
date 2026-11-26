import { faker } from '@faker-js/faker';
import { mutations } from './mutations';
import { expect, describe, it, vi, beforeEach } from 'vitest';

describe('mutations', () => {
  const initialObservables = [
    { some: faker.string.uuid() },
    { some: faker.string.uuid() },
    { some: faker.string.uuid() },
  ];
  const setObservablesMock = vi.fn();
  let mutationFunctions: any;

  beforeEach(() => {
    setObservablesMock.mockReset();
    mutationFunctions = mutations(initialObservables, setObservablesMock);
  });
  describe('addObserver', () => {
    it('should add the new value to the existing collection with a stable ID', () => {
      const newObservable = { some: faker.string.uuid() };
      mutationFunctions.addObserver(newObservable);
      expect(setObservablesMock).toBeCalledWith([
        ...initialObservables,
        expect.objectContaining({ ...newObservable, id: expect.any(String) }),
      ]);
    });
  });
  describe('removeObserver', () => {
    it('should remove the value at the index', () => {
      mutationFunctions.removeObserver(1);
      expect(setObservablesMock).toBeCalledWith([initialObservables[0], initialObservables[2]]);
    });
  });
  describe('updateObserver', () => {
    it('should update the value of the field at the index', () => {
      const expectNewValue = faker.string.uuid();
      mutationFunctions.updateObserver(`some`, 1, expectNewValue);
      expect(setObservablesMock).toBeCalledWith([
        initialObservables[0],
        { some: expectNewValue },
        initialObservables[2],
      ]);
    });
  });
  describe('parseDataransfer', () => {
    it('should not call set observable if no text data type', () => {
      const dataTransfer = {
        types: [faker.string.uuid()],
      };
      mutationFunctions.parseDataransfer(dataTransfer);
      expect(setObservablesMock).not.toBeCalled();
    });
    it('should not call set observable if text data type but not recognizable url', () => {
      const dataTransfer = {
        types: ['text'],
        getData: () => faker.internet.url(),
      };
      mutationFunctions.parseDataransfer(dataTransfer);
      expect(setObservablesMock).not.toBeCalled();
    });
    it('should call set observable if text data type and recognizable url', () => {
      const dataTransfer = {
        types: ['text'],
        getData: () => 'https://app.datadoghq.eu/monitors/4005341',
      };
      mutationFunctions.parseDataransfer(dataTransfer);
      expect(setObservablesMock).toBeCalledWith([
        ...initialObservables,
        expect.objectContaining({
          monitorId: '4005341',
          site: 'datadoghq.eu',
          type: 'datadogMonitor',
          id: expect.any(String),
        }),
      ]);
    });

    it('reads a standard uri-list and adds the workflow observer', () => {
      const url = 'https://github.com/alvarolorentedev/opencode-mobile/actions/workflows/release.yml';
      const dataTransfer = {
        types: ['text/uri-list'],
        getData: (format: string) => (format === 'text/uri-list' ? `  ${url}  ` : ''),
      };
      mutationFunctions.parseDataransfer(dataTransfer);
      expect(setObservablesMock).toBeCalledWith([
        ...initialObservables,
        expect.objectContaining({
          type: 'githubAction',
          owner: 'alvarolorentedev',
          repo: 'opencode-mobile',
          workflowId: 'release.yml',
          id: expect.any(String),
        }),
      ]);
    });

    it('adds only one observer when more than one parser matches', () => {
      const dataTransfer = {
        types: ['text/plain'],
        getData: () => 'https://sentry.io/organizations/acme/projects/web/',
      };
      mutationFunctions.parseDataransfer(dataTransfer);
      expect(setObservablesMock).toHaveBeenCalledTimes(1);
      expect(setObservablesMock.mock.calls[0][0]).toHaveLength(initialObservables.length + 1);
    });
  });
});
