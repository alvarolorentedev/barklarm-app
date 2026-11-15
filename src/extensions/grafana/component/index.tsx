import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const Grafana = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('URL')}
      variant="standard"
      value={observable.url}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateFieldWithValue('url', index, event.target.value)}
    />
    <TextField
      label={translate('Authorization Token')}
      variant="standard"
      type="password"
      value={observable.authToken}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('authToken', index, event.target.value)
      }
    />
  </>
);
