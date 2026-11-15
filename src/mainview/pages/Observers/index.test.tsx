/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Observers } from './';
import { faker } from '@faker-js/faker';
import { expect, describe, it, vi, beforeEach } from 'vitest';

const mutationsMock = {
  addObserver: vi.fn(),
  removeObserver: vi.fn(),
  updateObserver: vi.fn(),
  parseDataransfer: vi.fn(),
};

vi.mock('./helpers/mutations', () => ({
  __esModule: true,
  mutations: vi.fn().mockImplementation(() => mutationsMock),
}));
vi.mock('../../components/Observers', () => ({
  __esModule: true,
  Observers: () => <div data-testid="observers" />,
}));
vi.mock('../../components/Dropzone', () => ({
  __esModule: true,
  DropZone: ({ open, children }: any) => (
    <div data-testid="dropzone" data-open={open}>
      {children}
    </div>
  ),
}));
vi.mock('../../rpc-client', () => ({
  client: {
    getStore: vi.fn().mockResolvedValue([]),
    setStore: vi.fn().mockResolvedValue(undefined),
    refreshObservers: vi.fn().mockResolvedValue(undefined),
    getObserverStates: vi.fn().mockResolvedValue([]),
  },
}));

describe('Observers', () => {
  beforeEach(() => {
    mutationsMock.addObserver.mockClear();
    mutationsMock.removeObserver.mockClear();
    mutationsMock.updateObserver.mockClear();
    mutationsMock.parseDataransfer.mockClear();
  });

  it('should have box with ObserverComponent', async () => {
    render(<Observers />);
    await waitFor(() => screen.getByTestId('box'));
    const box = screen.getByTestId('box');
    expect(within(box).getByTestId('observers')).toBeInTheDocument();
  });

  it('should show drop zone on drag and hide it on leave', async () => {
    render(<Observers />);
    await waitFor(() => screen.getByTestId('box'));
    const box = screen.getByTestId('box');

    fireEvent.dragEnter(box, {});
    await waitFor(() => screen.getByTestId('dropzone'));
    expect(screen.getByTestId('dropzone')).toHaveAttribute('data-open', 'true');
    expect(screen.getByText('Drop Link Here')).toBeInTheDocument();

    fireEvent.dragLeave(screen.getByTestId('dropzone'));
    await waitFor(() => expect(screen.queryByTestId('dropzone')).not.toBeInTheDocument());
  });

  it('should hide DropZone on drop and parse the link', async () => {
    const expectedDataTransferText = faker.string.uuid();
    render(<Observers />);
    await waitFor(() => screen.getByTestId('box'));
    const box = screen.getByTestId('box');

    fireEvent.dragEnter(box);
    await waitFor(() => screen.getByTestId('dropzone'));
    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: {
        text: expectedDataTransferText,
      },
    });

    await waitFor(() => expect(screen.queryByTestId('dropzone')).not.toBeInTheDocument());
    expect(mutationsMock.parseDataransfer).toBeCalledWith({
      text: expectedDataTransferText,
    });
  });
});
