import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

type MenuItemProps = {
  value: string;
  children: React.ReactNode;
};

export const MenuItem = ({ value, children }: MenuItemProps) => <option value={value}>{children}</option>;

type SelectProps = {
  label: string;
  value?: string;
  onChange?: (event: any) => void;
  variant?: string;
  className?: string;
  placeholder?: string;
  children: React.ReactNode;
};

export default function Select({
  label,
  value,
  onChange,
  variant,
  className = '',
  placeholder,
  children,
}: SelectProps) {
  const id = useId();

  return (
    <div className={['field', variant ? `field-${variant}` : '', className].filter(Boolean).join(' ')}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="select-wrap">
        <select id={id} className="field-input select-input" value={value ?? ''} onChange={onChange}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {children}
        </select>
        <ChevronDown size={12} className="select-chevron" aria-hidden="true" />
      </div>
    </div>
  );
}
