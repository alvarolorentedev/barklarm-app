/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Sentry } from './';
import { faker } from '@faker-js/faker';
import { expect, describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../../mainview/components/fields/TextField', () => ({
  __esModule: true,
  default: (props: any) => <input data-testid={`textField-${props.label}`} {...props} />,
}));

describe('Sentry', () => {
  const expectedObservable = {
    organization: faker.lorem.word(),
    project: faker.lorem.word(),
    authToken: faker.lorem.word(),
  };
  const expectedIndex = faker.number.int();
  const updateFieldMock = vi.fn();
  const translateMock = (val: string): string => val;
  beforeEach(() => {
    updateFieldMock.mockClear();
    render(
      <Sentry
        observable={expectedObservable}
        index={expectedIndex}
        updateFieldWithValue={updateFieldMock}
        translate={translateMock}
      />
    );
  });
  describe('organization', () => {
    it('should have correct textfield attributes', () => {
      const textfield = screen.getByTestId('textField-Organization');
      expect(textfield).toHaveAttribute('label', 'Organization');
      expect(textfield).toHaveAttribute('variant', 'standard');
      expect(textfield).toHaveAttribute('value', expectedObservable.organization);
    });

    it('should call update field on change event', () => {
      const expectedValue = faker.lorem.word();
      const textfield = screen.getByTestId('textField-Organization');
      fireEvent.change(textfield, { target: { value: expectedValue } });
      expect(updateFieldMock).toBeCalledWith('organization', expectedIndex, expectedValue);
    });
  });
  describe('Project', () => {
    it('should have correct textfield attributes', () => {
      const textfield = screen.getByTestId('textField-Project');
      expect(textfield).toHaveAttribute('label', 'Project');
      expect(textfield).toHaveAttribute('variant', 'standard');
      expect(textfield).toHaveAttribute('value', expectedObservable.project);
    });

    it('should call update field on change event', () => {
      const expectedValue = faker.lorem.word();
      const textfield = screen.getByTestId('textField-Project');
      fireEvent.change(textfield, { target: { value: expectedValue } });
      expect(updateFieldMock).toBeCalledWith('project', expectedIndex, expectedValue);
    });
  });
  describe('authorization Token', () => {
    it('should have correct textfield attributes', () => {
      const textfield = screen.getByTestId('textField-Authorization Token');
      expect(textfield).toHaveAttribute('label', 'Authorization Token');
      expect(textfield).toHaveAttribute('variant', 'standard');
      expect(textfield).toHaveAttribute('value', expectedObservable.authToken);
    });

    it('should call update field on change event', () => {
      const expectedValue = faker.lorem.word();
      const textfield = screen.getByTestId('textField-Authorization Token');
      fireEvent.change(textfield, { target: { value: expectedValue } });
      expect(updateFieldMock).toBeCalledWith('authToken', expectedIndex, expectedValue);
    });
  });
});
