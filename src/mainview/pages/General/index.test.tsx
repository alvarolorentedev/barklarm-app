/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { General } from './index';
import { expect, describe, it, vi } from 'vitest';

vi.mock('./helpers/storage', () => ({
  storage: () => ({
    getSslDisabled: vi.fn().mockResolvedValue(false),
    saveSslDisabled: vi.fn(),
    getRefreshInterval: vi.fn().mockResolvedValue(60000),
    saveRefreshInterval: vi.fn(),
    getissueGlobalEndpoint: vi.fn().mockResolvedValue(''),
    saveissueGlobalEndpoint: vi.fn(),
    getAutostart: vi.fn().mockResolvedValue(true),
    saveAutostart: vi.fn(),
    importConfig: vi.fn(),
    exportConfig: vi.fn(),
    quit: vi.fn(),
  }),
}));

describe('General', () => {
  it('renders the native settings groups', async () => {
    render(<General />);

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByLabelText('Refresh interval')).toHaveValue(1);
    expect(screen.getByText('Startup')).toBeInTheDocument();
    expect(screen.getByLabelText('Start at login')).toBeInTheDocument();
    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Quit Barklarm')).toBeInTheDocument();
  });
});
