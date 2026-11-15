/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Observers } from './index';
import { observersTitleBuilderMap } from '../../../extensions/observersTitleBuilderMap';
import { Status } from '../../../types/Status';
import { expect, describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../../extensions/observersComponentBuilderMap', () => ({
  __esModule: true,
  observersComponentBuilderMap: {
    githubAction: vi.fn(() => <div data-testid="extension-form" />),
  },
}));

vi.mock('../../../extensions/observersTitleBuilderMap', () => ({
  __esModule: true,
  observersTitleBuilderMap: {
    githubAction: vi.fn((observable: any) => `Github: ${observable.alias}`),
  },
}));

const translate = (value: string) => value;

describe('Observers', () => {
  const add = vi.fn();
  const remove = vi.fn();
  const update = vi.fn();
  const save = vi.fn();

  const renderObservers = (observables: any[], states: any[] = [], search = '') =>
    render(
      <Observers
        observables={observables}
        add={add}
        remove={remove}
        update={update}
        save={save}
        translate={translate}
        states={states}
        search={search}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    (observersTitleBuilderMap as any).githubAction.mockImplementation(
      (observable: any) => `Github: ${observable.alias}`
    );
  });

  it('renders rows with type and live status', () => {
    renderObservers([{ type: 'githubAction', alias: 'build' }], [{ name: 'build', status: Status.SUCCESS, link: '' }]);

    expect(screen.getByText('Github: build')).toBeInTheDocument();
    expect(screen.getByText('Github Action')).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
  });

  it('renders the empty state and adds a new observer', () => {
    renderObservers([]);

    expect(screen.getByText('No observers yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New observer/i }));

    expect(add).toHaveBeenCalledWith({ type: '' });
  });

  it('expands a row and renders its editor', () => {
    renderObservers([{ type: 'githubAction', alias: 'build', issueEndpoint: 'https://example.com' }]);

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByLabelText('Type')).toHaveValue('githubAction');
    expect(screen.getByLabelText('Alias')).toHaveValue('build');
    expect(screen.getByLabelText('Issue Creation Endpoint')).toHaveValue('https://example.com');
    expect(screen.getByTestId('extension-form')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('removes an observer from its row', () => {
    renderObservers([{ type: 'githubAction', alias: 'build' }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(remove).toHaveBeenCalledWith(0);
  });

  it('filters rows by search', () => {
    renderObservers(
      [
        { type: 'githubAction', alias: 'alpha' },
        { type: 'githubAction', alias: 'beta' },
      ],
      [],
      'alpha'
    );

    expect(screen.getByText('Github: alpha')).toBeInTheDocument();
    expect(screen.queryByText('Github: beta')).not.toBeInTheDocument();
  });
});
