import React from 'react';

type SettingsGroupProps = {
  title?: string;
  id?: string;
  children: React.ReactNode;
};

export const SettingsGroup = ({ title, id, children }: SettingsGroupProps) => (
  <section className="settings-group" id={id}>
    {title ? <h2 className="settings-group-title">{title}</h2> : null}
    <div className="settings-group-body">{children}</div>
  </section>
);

type SettingsRowProps = {
  label: string;
  description?: string;
  children: React.ReactNode;
};

export const SettingsRow = ({ label, description, children }: SettingsRowProps) => (
  <div className="settings-row">
    <div className="settings-row-text">
      <span className="settings-row-label">{label}</span>
      {description ? <span className="settings-row-description">{description}</span> : null}
    </div>
    <div className="settings-row-control">{children}</div>
  </div>
);
