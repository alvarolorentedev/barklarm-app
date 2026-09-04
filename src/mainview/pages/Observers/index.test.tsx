/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
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
  Observers: (props: any) => <div data-testid={`observers`} {...props} />,
}));
vi.mock('../../components/Dropzone', () => ({
  __esModule: true,
  DropZone: (props: any) => <div data-testid={`dropzone`} {...props} />,
}));
vi.mock('@mui/icons-material/Link', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`link`} {...props} />,
}));
vi.mock('@mui/material/Box', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`box`} {...props} />,
}));
vi.mock('@mui/material/Typography', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`typography`} {...props} />,
}));
vi.mock('@mui/material/Stack', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`stack`} {...props} />,
}));

vi.mock('../../rpc-client', () => ({
  client: {
    getStore: vi.fn().mockResolvedValue([]),
    setStore: vi.fn().mockResolvedValue(undefined),
    refreshObservers: vi.fn().mockResolvedValue(undefined),
    getTranslate: vi.fn().mockImplementation((key: string) => Promise.resolve(key)),
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
    const observersComponent = within(box).getByTestId('observers');
    expect(observersComponent).toBeInTheDocument();
  });

  it('should have DropZone on drag', async () => {
    render(<Observers />);
    await waitFor(() => screen.getByTestId('box'));
    const box = screen.getByTestId('box');
    fireEvent.dragEnter(box, {});
    await waitFor(() => screen.getByTestId('dropzone'));
    const dropzone = screen.getByTestId('dropzone');
    expect(dropzone).toHaveAttribute('open');
    const stack = within(dropzone).getByTestId('stack');
    const linkIcon = within(stack).getByTestId('link');
    expect(linkIcon).toHaveAttribute('font-size', 'large');
    const typography = within(stack).getByTestId('typography');
    const expectedText = within(typography).getByText('Drop Link Here');
    expect(linkIcon).toBeInTheDocument();
    expect(expectedText).toBeInTheDocument();
  });

  it('should hide DropZone on drop', async () => {
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
    await waitFor(() => screen.getByTestId('box'));
    expect(mutationsMock.parseDataransfer).toBeCalledWith({
      text: expectedDataTransferText,
    });
  });

  it('should hide DropZone on leave', async () => {
    render(<Observers />);
    await waitFor(() => screen.getByTestId('box'));
    const box = screen.getByTestId('box');
    fireEvent.dragEnter(box);
    await waitFor(() => screen.getByTestId('dropzone'));
    fireEvent.dragOver(screen.getByTestId('dropzone'));
    await waitFor(() => screen.getByTestId('dropzone'));
    fireEvent.dragLeave(screen.getByTestId('dropzone'));
    await waitFor(() => screen.getByTestId('box'));
    expect(screen.getByTestId('box')).toBeInTheDocument();
  });
});
