import React, { useId } from 'react';

type SwitchProps = {
  label?: string;
  ariaLabel?: string;
  checked?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isDisabled?: boolean;
  className?: string;
};

export default function Switch({ label, ariaLabel, checked, onChange, isDisabled, className = '' }: SwitchProps) {
  const id = useId();

  return (
    <label className={['switch', className].filter(Boolean).join(' ')} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={!!checked}
        onChange={onChange}
        disabled={isDisabled}
        aria-label={ariaLabel}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      {label ? <span className="switch-label">{label}</span> : null}
    </label>
  );
}
