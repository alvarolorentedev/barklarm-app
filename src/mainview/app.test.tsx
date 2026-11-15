/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { App } from './app';
import { expect, describe, it, vi } from 'vitest';

vi.mock('./rpc-client', () => ({
  client: {
    getStore: vi.fn().mockResolvedValue([]),
    setStore: vi.fn().mockResolvedValue(undefined),
    refreshObservers: vi.fn().mockResolvedValue(undefined),
    getObserverStates: vi.fn().mockResolvedValue([]),
    importConfig: vi.fn().mockResolvedValue(false),
    exportConfig: vi.fn().mockResolvedValue(false),
    quit: vi.fn().mockResolvedValue(true),
  },
}));

describe('App', () => {
  it('renders the native shell and the observers page', async () => {
    render(
      <MemoryRouter initialEntries={['/observers']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Barklarm')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search observers')).toBeInTheDocument();
    expect(await screen.findByText('No observers yet')).toBeInTheDocument();
    expect(screen.getByText('Tray')).toBeInTheDocument();
  });
});
