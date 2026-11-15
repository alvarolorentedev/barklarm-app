import React from 'react';
import TextField from '../../../mainview/components/fields/TextField';

export const Sentry = ({ observable, index, updateFieldWithValue, translate }: any) => (
  <>
    <TextField
      label={translate('Organization')}
      variant="standard"
      value={observable.organization}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('organization', index, event.target.value)
      }
    />
    <TextField
      label={translate('Project')}
      variant="standard"
      value={observable.project}
      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
        updateFieldWithValue('project', index, event.target.value)
      }
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
