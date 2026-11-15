import React from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
};

export const PageHeader = ({ title, description }: PageHeaderProps) => (
  <header className="page-header">
    <h1 className="page-title">{title}</h1>
    {description ? <p className="page-description">{description}</p> : null}
  </header>
);
