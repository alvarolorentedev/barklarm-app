/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CCTray } from './';
import { faker } from '@faker-js/faker';
import { expect, describe, it, vi, beforeEach } from 'vitest';

vi.mock('../../../mainview/components/fields/TextField', () => ({
  __esModule: true,
  default: (props: any) => <input data-testid={`textField-${props.label}`} {...props} />,
}));

describe('cctray', () => {
  const expectedObservable = {
    url: faker.internet.url(),
    name: faker.lorem.word(),
  };
  const expectedIndex = faker.number.int();
  const updateFieldMock = vi.fn();
  const translateMock = (val: string): string => val;

  beforeEach(() => {
    updateFieldMock.mockClear();
    render(
      <CCTray
        observable={expectedObservable}
        index={expectedIndex}
        updateFieldWithValue={updateFieldMock}
        translate={translateMock}
      />
    );
  });
  describe('url', () => {
    it('should have correct textfield attributes', () => {
      const textfield = screen.getByTestId('textField-URL');
      expect(textfield).toHaveAttribute('label', 'URL');
      expect(textfield).toHaveAttribute('variant', 'standard');
      expect(textfield).toHaveAttribute('value', expectedObservable.url);
    });

    it('should call update field on change event', () => {
      const expectedValue = faker.lorem.word();
      const textfield = screen.getByTestId('textField-URL');
      fireEvent.change(textfield, { target: { value: expectedValue } });
      expect(updateFieldMock).toBeCalledWith('url', expectedIndex, expectedValue);
    });
  });
  describe('Project Name', () => {
    it('should have correct textfield attributes', () => {
      const textfield = screen.getByTestId('textField-Project');
      expect(textfield).toHaveAttribute('label', 'Project');
      expect(textfield).toHaveAttribute('variant', 'standard');
      expect(textfield).toHaveAttribute('value', expectedObservable.name);
    });

    it('should call update field on change event', () => {
      const expectedValue = faker.lorem.word();
      const textfield = screen.getByTestId('textField-Project');
      fireEvent.change(textfield, { target: { value: expectedValue } });
      expect(updateFieldMock).toBeCalledWith('name', expectedIndex, expectedValue);
    });
  });
});
