import React from 'react';
import { Input, Label, TextField as AriaTextField } from 'react-aria-components';

type TextFieldProps = {
  label: string;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  variant?: string;
  placeholder?: string;
  isDisabled?: boolean;
  className?: string;
};

export default function TextField({
  label,
  value,
  onChange,
  type = 'text',
  variant,
  placeholder,
  isDisabled,
  className = '',
}: TextFieldProps) {
  return (
    <AriaTextField
      className={['field', variant ? `field-${variant}` : '', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(next) => onChange?.({ target: { value: next } } as React.ChangeEvent<HTMLInputElement>)}
      isDisabled={isDisabled}
    >
      <Label className="field-label">{label}</Label>
      <Input className="field-input" type={type} placeholder={placeholder} />
    </AriaTextField>
  );
}
