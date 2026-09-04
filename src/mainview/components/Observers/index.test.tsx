// @vitest-environment jsdom

import React from 'react';
import { render, fireEvent, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Observers } from './index';
import { faker } from '@faker-js/faker';
import { observersComponentBuilderMap } from '../../../extensions/observersComponentBuilderMap';
import { observersTitleBuilderMap } from '../../../extensions/observersTitleBuilderMap';
import { expect, describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../../extensions/observersComponentBuilderMap', () => ({
  __esModule: true,
  observersComponentBuilderMap: {
    githubAction: vi.fn(),
    ccTray: vi.fn(),
    datadogMonitor: vi.fn(),
    sentry: vi.fn(),
    newRelic: vi.fn(),
    azureDevOps: vi.fn(),
    graylog: vi.fn(),
  },
}));
vi.mock('../../../extensions/observersTitleBuilderMap', () => ({
  __esModule: true,
  observersTitleBuilderMap: {
    githubAction: vi.fn(),
    ccTray: vi.fn(),
    datadogMonitor: vi.fn(),
    sentry: vi.fn(),
    newRelic: vi.fn(),
    azureDevOps: vi.fn(),
    graylog: vi.fn(),
  },
}));
vi.mock('@mui/material/Stack', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`stack`} {...props} />,
}));
vi.mock('@mui/material/Button', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`button`} {...props} />,
}));
vi.mock('@mui/material/Accordion', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`accordion`} {...props} />,
}));
vi.mock('@mui/material/AccordionSummary', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`accordion-summary`} {...props} />,
}));
vi.mock('@mui/material/AccordionDetails', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`accordion-details`} {...props} />,
}));
vi.mock('@mui/material/Typography', () => ({
  __esModule: true,
  default: (props: any) => <div data-testid={`typography`} {...props} />,
}));
vi.mock('@mui/material/Select', () => ({
  __esModule: true,
  default: (props: any) => <select data-testid={`select`} {...props} />,
}));
vi.mock('@mui/material/MenuItem', () => ({
  __esModule: true,
  default: (props: any) => <option data-testid={`menu-item`} {...props} />,
}));
vi.mock('@mui/material/TextField', () => ({
  __esModule: true,
  default: (props: any) => <input data-testid={`text-field`} {...props} />,
}));

describe('dropzone', () => {
  const addMock = vi.fn();
  const removeMock = vi.fn();
  const updateMock = vi.fn();
  const saveMock = vi.fn();
  const translateMock = (val: string): string => val;
  const observersComponentBuilderMapMock = observersComponentBuilderMap as any;
  const observersTitleBuilderMapMock = observersTitleBuilderMap as any;

  beforeEach(() => {
    addMock.mockClear();
    removeMock.mockClear();
    updateMock.mockClear();
    saveMock.mockClear();
  });
  it.skip('should render only buttons on empty observers', () => {
    const observables: any[] = [];
    render(
      <Observers
        observables={observables}
        add={addMock}
        remove={removeMock}
        update={updateMock}
        save={saveMock}
        translate={translateMock}
      />
    );
    const stack = screen.getAllByTestId('stack');
    expect(stack).toHaveLength(1);
    const buttonsStack = stack[0];
    expect(buttonsStack).toHaveAttribute('spacing', '2');
    expect(buttonsStack).toHaveAttribute('direction', 'row');
    expect(buttonsStack).toHaveAttribute('justifyContent', 'flex-end');
    const buttons = within(buttonsStack).getAllByTestId('button');
    expect(buttons).toHaveLength(2);
    const buttonSave = buttons[0];
    const buttonAdd = buttons[1];
    expect(buttonSave).toHaveAttribute('variant', 'contained');
    expect(buttonAdd).toHaveAttribute('variant', 'contained');
  });

  it.skip('should call save when save button click', () => {
    const observables: any[] = [];
    render(
      <Observers
        observables={observables}
        add={addMock}
        remove={removeMock}
        update={updateMock}
        save={saveMock}
        translate={translateMock}
      />
    );
    const buttons = screen.getAllByTestId('button');
    expect(buttons).toHaveLength(2);
    const buttonSave = buttons[0];
    fireEvent.click(buttonSave);
    expect(saveMock).toBeCalledWith(observables);
    expect(buttonSave).toHaveTextContent('Save');
  });

  it.skip('should call add when add button click', () => {
    const observables: any[] = [];
    render(
      <Observers
        observables={observables}
        add={addMock}
        remove={removeMock}
        update={updateMock}
        save={saveMock}
        translate={translateMock}
      />
    );
    const buttons = screen.getAllByTestId('button');
    expect(buttons).toHaveLength(2);
    const buttonAdd = buttons[1];
    fireEvent.click(buttonAdd);
    expect(addMock).toBeCalledWith({ type: '' });
    expect(buttonAdd).toHaveTextContent('Add');
  });

  it('renders know type observables correctly', () => {
    const expectedComponent = <div data-testid={'githubAction'} />;
    const expectedTitle = faker.string.uuid();
    const expectedAlias = faker.string.uuid();
    const expectedissueEndpoint = faker.string.uuid();
    const observables: any[] = [
      {
        type: 'githubAction',
        alias: expectedAlias,
        issueEndpoint: expectedissueEndpoint,
      },
    ];
    observersComponentBuilderMapMock['githubAction'].mockReturnValue(expectedComponent);
    observersTitleBuilderMapMock['githubAction'].mockReturnValue(expectedTitle);
    render(
      <Observers
        observables={observables}
        add={addMock}
        remove={removeMock}
        update={updateMock}
        save={saveMock}
        translate={translateMock}
      />
    );
    const accordion = screen.getByTestId('accordion');
    const accordionSummary = within(accordion).getByTestId('accordion-summary');
    const accordionDetails = within(accordion).getByTestId('accordion-details');
    const stacks = within(accordionDetails).getAllByTestId('stack');
    const detailsStack = stacks[0];
    const typography = within(accordionSummary).getByTestId('typography');
    expect(within(typography).getByText(expectedTitle)).toBeInTheDocument();
    const select = within(detailsStack).getByTestId('select');
    expect(select).toHaveAttribute('label', 'Observer Type');
    const menuItems = within(select).getAllByTestId('menu-item');
    expect(menuItems).toHaveLength(10);
    expect(menuItems[0]).toHaveAttribute('value', 'githubAction');
    expect(menuItems[1]).toHaveAttribute('value', 'azureDevOps');
    expect(menuItems[2]).toHaveAttribute('value', 'bitbucket');
    expect(menuItems[3]).toHaveAttribute('value', 'ccTray');
    expect(menuItems[4]).toHaveAttribute('value', 'datadogMonitor');
    expect(menuItems[5]).toHaveAttribute('value', 'sentry');
    expect(menuItems[6]).toHaveAttribute('value', 'newRelic');
    expect(menuItems[7]).toHaveAttribute('value', 'opsgenie');
    expect(menuItems[8]).toHaveAttribute('value', 'graylog');
    expect(menuItems[9]).toHaveAttribute('value', 'grafana');
    expect(within(detailsStack).getByTestId('githubAction')).toBeInTheDocument();
    const textField = within(detailsStack).getAllByTestId('text-field');
    const alias = textField[0];
    expect(alias).toHaveAttribute('label', 'Alias');
    expect(alias).toHaveAttribute('variant', 'standard');
    expect(alias).toHaveAttribute('value', expectedAlias);
    const issueEndpoint = textField[1];
    expect(issueEndpoint).toHaveAttribute('label', 'Issue Creation Endpoint');
    expect(issueEndpoint).toHaveAttribute('variant', 'standard');
    expect(issueEndpoint).toHaveAttribute('value', expectedissueEndpoint);
  });
  it('renders empty type observables correctly', () => {
    const expectedAlias = faker.string.uuid();
    const expectedissueEndpoint = faker.string.uuid();
    const observables: any[] = [
      {
        type: 'githubAction',
        alias: expectedAlias,
        issueEndpoint: expectedissueEndpoint,
      },
    ];
    observersComponentBuilderMapMock['githubAction'].mockImplementation(() => {
      throw new Error();
    });
    observersTitleBuilderMapMock['githubAction'].mockImplementation(() => {
      throw new Error();
    });
    render(
      <Observers
        observables={observables}
        add={addMock}
        remove={removeMock}
        update={updateMock}
        save={saveMock}
        translate={translateMock}
      />
    );
    const accordion = screen.getByTestId('accordion');
    const accordionSummary = within(accordion).getByTestId('accordion-summary');
    const accordionDetails = within(accordion).getByTestId('accordion-details');
    const stacks = within(accordionDetails).getAllByTestId('stack');
    const detailsStack = stacks[0];
    const typography = within(accordionSummary).getByTestId('typography');
    expect(within(typography).getByText('Unkown')).toBeInTheDocument();
    const select = within(detailsStack).getByTestId('select');
    expect(select).toHaveAttribute('label', 'Observer Type');
    const menuItems = within(select).getAllByTestId('menu-item');
    expect(menuItems).toHaveLength(10);
    expect(menuItems[0]).toHaveAttribute('value', 'githubAction');
    expect(menuItems[1]).toHaveAttribute('value', 'azureDevOps');
    expect(menuItems[2]).toHaveAttribute('value', 'bitbucket');
    expect(menuItems[3]).toHaveAttribute('value', 'ccTray');
    expect(menuItems[4]).toHaveAttribute('value', 'datadogMonitor');
    expect(menuItems[5]).toHaveAttribute('value', 'sentry');
    expect(menuItems[6]).toHaveAttribute('value', 'newRelic');
    expect(menuItems[7]).toHaveAttribute('value', 'opsgenie');
    expect(menuItems[8]).toHaveAttribute('value', 'graylog');
    expect(menuItems[9]).toHaveAttribute('value', 'grafana');
    const textField = within(detailsStack).getAllByTestId('text-field');
    const alias = textField[0];
    expect(alias).toHaveAttribute('label', 'Alias');
    expect(alias).toHaveAttribute('variant', 'standard');
    expect(alias).toHaveAttribute('value', expectedAlias);
    const issueEndpoint = textField[1];
    expect(issueEndpoint).toHaveAttribute('label', 'Issue Creation Endpoint');
    expect(issueEndpoint).toHaveAttribute('variant', 'standard');
    expect(issueEndpoint).toHaveAttribute('value', expectedissueEndpoint);
  });
});
